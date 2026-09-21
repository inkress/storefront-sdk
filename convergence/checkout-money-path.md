# Checkout money-path contract: order-first processor vs session-based checkout

Status: DONE (read-only investigation, no code changed)
Scope: exact backend contract behind LIVE `/checkouts/:id` (commerce-web) vs `POST /checkout/sessions` (commerce-api), to inform storefront-sdk convergence.

Repos / commits used:
- commerce-web (order-first checkout UI): `/Users/romario/projects/inkress/_worktrees/cw-checkout-polish`
- commerce-api (Elixir backend), canonical checkout: `/Users/romario/projects/inkress/commerce-api` (branch `feature/spi-3ds`, with local uncommitted edits — NOT used as the source of truth below)
- commerce-api **discount stack tip used as source of truth**: commit `5f13913d` ("Merge pull request #210 from jamlance/feat/discount-product-scope", 2026-09-20), reached via `git show 5f13913d:<path>` from the same repo (all discount branches share this git history; no checkout/worktree needed). This is the newest commit that contains PRs #208 (discount codes), #209 (abuse-prevention), #210 (product scoping) merged together — see **Branch-hygiene caveat** below for why this, and not `version/4.1-beta`, is used.
- FleekSite renderer: `/Users/romario/projects/fleeksite/fs-hono`

## Branch-hygiene caveat (read this before trusting any route claim below)

`commerce-api`'s `origin` remote (`https://github.com/jamlance/commerce-api.git`) and `inkress` remote (`https://github.com/inkress/commerce-api.git`) both fail to fetch in this environment (`git fetch --all` → "Repository not found"), so all branches here are whatever was last fetched, possibly stale. Concretely:
- The local `version/4.1-beta` branch (which project memory calls "LIVE on prod") does **NOT** contain the discount routes/code at all (`git show version/4.1-beta:lib/api_web/router.ex` has no `/discount` route, no `/v1/checkout` scope). `git merge-base --is-ancestor feat/discount-codes version/4.1-beta` → **not an ancestor**. So the local `version/4.1-beta` ref is behind what's actually deployed; it is stale, not authoritative.
- The discount work exists as a stack of local branches: `feat/discount-codes` (PR #208) → `feat/discount-abuse-prevention` (PR #209) → `feat/discount-product-scope` (PR #210, tip `5f13913d`) → two further unmerged siblings off that tip: `feat/discount-scope-line-id` and `feat/discount-usage-count` → and, critically, **`feat/discount-session-checkout` (commit `2d66270e`, also off `5f13913d`)**, checked out in worktree `/Users/romario/projects/inkress/commerce-api/.claude/worktrees/discount-41beta`.
- `feat/discount-session-checkout`'s own commit message says exactly what this investigation independently found by reading code: *"The wired session-based checkout (SessionBasedCheckout) applied no discount codes — discount_total was hardcoded to 0 with no Service.Discount call... Only the order-first processor path honoured them."* — i.e. **someone (this same author, same day) already wrote the fix**, but it is not merged into `feat/discount-product-scope`, `version/4.1-beta`, or deployed. Treat it as a candidate patch, not shipped state. Diff reviewed below (section B, "Candidate fix").

All route/contract claims below are cited against `5f13913d` (current discount code, pre-session-checkout-fix) unless marked otherwise. I spot-checked router.ex identically across `5f13913d`, `HEAD` (`feature/spi-3ds`), and `version/4.1-beta` for the payment-link/orders/checkout-session routes that predate the discount work — those three agree, so the non-discount parts of the contract (order creation, PowerTranz/3DS routes) are stable across branches.

---

## A. The live `/checkouts/:id` order-first path (commerce-web → commerce-api)

### A1. commerce-web loader/action — endpoints called

Route files:
- `/Users/romario/projects/inkress/_worktrees/cw-checkout-polish/app/routes/checkouts.$id.tsx` (loader + action)
- `/Users/romario/projects/inkress/_worktrees/cw-checkout-polish/app/routes/checkouts.$id.fees.tsx` (fee re-quote loader)
- `/Users/romario/projects/inkress/_worktrees/cw-checkout-polish/app/routes/checkouts.$id.discount.tsx` (discount-code validate/quote loader)

These call a **locally-vendored SDK wrapper** at `app/interfaces/server/*.ts` (NOT the published `@inkress/admin-sdk` npm package — commerce-web pins `@inkress/admin-sdk@^1.1.46` in `package.json` but the checkout route imports `~/inkress.server` → `app/interfaces/server/index.ts`'s `InkressAPI` class, a hand-rolled client). Base URL = `process.env.API_BASE`; request building in `app/interfaces/server/base.ts:42-114` (`makeRequest`: `url = "${baseUrl}/${endpoint}?${query}"`, GET params in querystring, POST body as JSON, `Authorization: Bearer` or `x-bot-access-key`, `Client-Id` header).

commerce-api mounts everything under `scope "/api", ApiWeb do ... scope "/v1/..." end end` (`lib/api_web/router.ex:227,247,262-269,279`), so the true path is `/api/v1/...`; `API_BASE` is expected to already carry the `/api/v1` prefix (matches project memory: "note the `/api/v1` prefix on prod via centraprox; dev is api-dev" — not independently re-verified here since it's an env value, not code).

| # | commerce-web call | Local-SDK method | HTTP | Path (relative to API_BASE) | Request | Response envelope |
|---|---|---|---|---|---|---|
| 1 | Loader: load invoice/order | `admin.paymentLink.invoice(id)` — `app/interfaces/server/payment_link.ts:6-8` | POST | `payments/link/${uid}` → commerce-api `/api/v1/payments/link/:uid` | none (uid in path) | commerce-api: `ApiWeb.PaymentLinkController.invoice/2` (`lib/api_web/controllers/payment_link_controller.ex:12-26`) → `{state: :ok, data: payment_link, result: payment_link}` where `payment_link` = `Context.Purchase.PaymentLink.invoice_display(uid)` (`lib/api/context/purchase/payment_link.ex:104-119`), embedding `order` (fetched via `Service.Order.Processor.fetch_order/3`). commerce-web reads `response.data.order`, `.data.merchant`, `.data.id` (`checkouts.$id.tsx:89-90,103-105`). |
| 2 | Loader: base processing fee (display) | `admin.rest._get('/public/m/${username}/fees', {currency_code, total, fulfillment_total})` — `checkouts.$id.tsx:127` | GET | `public/m/${username}/fees` → `/api/v1/public/m/:merchant_username/fees` (`router.ex:210-211` at `5f13913d`; same at `HEAD`/`version/4.1-beta`) | query: `currency_code`, `total`, `fulfillment_total` | `MerchantController.get_fees/2` (`lib/api_web/controllers/merchant_controller.ex:274-285`) → `Service.Order.Processor.check_fees/1` → `{state: :ok, data: fees, result: fees}`, `fees` keys: `shipping_fee, sub_total, total, transaction_total, provider_fee, platform_fee, tax, discount, discount_total, discount_code, currency` plus the raw `TransactionCalculator` fields (`customer_total` etc.) (`lib/api/services/orders/processor.ex:28-67`). |
| 3 | `checkouts.$id.fees.tsx` loader: re-quote fee on shipping/discount change | `admin.rest._get(\`/public/m/${username}/fees\`, {currency_code, fulfillment_total, total, discount_code?})` — `checkouts.$id.fees.tsx:29-35` | GET | same `/api/v1/public/m/:username/fees`, optionally with `discount_code` | query as above + optional `discount_code` | same as row 2; `check_fees/1` resolves the code leniently via `resolve_fees_discount/2` (`processor.ex:69-96`) — an invalid code silently prices at 0 here (real rejection happens at `/discount` or at order-create). |
| 4 | `checkouts.$id.discount.tsx` loader: validate + quote a code | `admin.rest._get('/public/m/${username}/discount', {code, currency_code, total, fulfillment_total})` — `checkouts.$id.discount.tsx:25-30` | GET (also registered POST) | `public/m/${username}/discount` → `/api/v1/public/m/:merchant_username/discount` — **only exists from `5f13913d` onward; absent on `version/4.1-beta`'s local ref** (`router.ex:227-229` at `5f13913d`) | query: `code`, `currency_code`, `total`, `fulfillment_total` | `MerchantController.validate_discount/2` (`merchant_controller.ex:295-328`): rate-limits per (IP, merchant) (`@discount_rl_limit`, line 333+), calls `Service.Discount.resolve/availability/check_products`, then re-quotes via `Processor.check_fees/1` with `discount_code` injected. Success: `{state: :ok, data: {...fees, valid: true, discount_code}}`. Rejection is still HTTP 200: `{state: :ok, data: {valid: false, discount_code, reason, message}}`. Rate-limited: HTTP 429. |
| 5 | Action: create the order | `admin.order.create(args)` → `RestModule.create` (`app/interfaces/server/rest.ts:42-44`, `OrderModule` prefix `"orders"`) | POST | `orders` → `/api/v1/orders` — routed generically via `scope "/v1" do resources "/:resource_path", PageController end end` (`router.ex:392-394`) → `PageController` resolves `resource_path="orders"` to `Context.Purchase.Order` (resolution plug not traced further; out of scope) → `Context.Purchase.Order.create/1` (`lib/api/context/purchase/order.ex:11-21`) → `Service.Order.Processor.record/1` | Body: flat dot-keyed map built by `buildOrderArgs`/`ORDER_ALLOWED_ARGS` (`app/lib/checkout/order-args.ts:38-92`): `reference_id, kind:"online", currency_code, total?, discount_code?, customer.first_name/last_name/email/phone?, products:[{id,quantity}], payment_link_id, fulfillment_total, data.shipping_address.*, data.fulfillment_type, data.pickup_location, data.note`. | Success: `{state:"ok", result: {id, payment_urls:{short_link, payment_url}, ...}}` — commerce-web reads `orderResponse.result.payment_urls.short_link/payment_url` and `.id` (`checkouts.$id.tsx:245-252`). Failure: `{state:"error", data: "<human message>"}` (e.g. an expired/exhausted code caught server-side) surfaced verbatim (`checkouts.$id.tsx:254-260`). |
| 6 | Also fetched (auth) | `admin.merchant.getMerchantTokens(username)` (`app/interfaces/server/merchant.ts:17-19`) | GET | `public/m/${username}/tokens` → `/api/v1/public/m/:merchant_username/tokens` (`router.ex:212`) | none | `{state, data:[{public_key,...}]}`; commerce-web uses `.data[0].public_key` as the order-create bearer token (`checkouts.$id.tsx:240-243`). |

### A2. commerce-api processor / order creation — discount_code handling

Entry point: `Service.Order.Processor.record/1` (`lib/api/services/orders/processor.ex:172-198`) dispatches to `record_online/1` (card/online — discount-eligible) or `record_offline/1` (cash — no discount, hardcoded `discount_total_frozen: 0` at `processor.ex:434`, matches the fact cash sales have no online discount box).

Inside `record_online/1`'s `Repo.transaction`, in order:
1. `{:ok, discount} <- fetch_discount(params, total, currency, products)` — `processor.ex:250`. `fetch_discount/4` (`processor.ex:1406-1419`): when `params[:discount_code]` is a non-blank string, calls `Service.Discount.resolve/1` then `Service.Discount.check_products/2` (product-scope eligibility); on any rejection returns `{:error, <human message>}`, which rolls the whole order-create transaction back (`Repo.rollback`, via the `with/else` at `processor.ex:354-356`). No code → `{:ok, %{total: 0}}` (`processor.ex:1419`).
2. `{:ok, fees} <- calculate_fees(%{..., discount: discount, ...})` — `processor.ex:253-265`, bottoms out in the shared `TransactionCalculator.calculate_from_legacy/1` (`processor.ex:1276`), with `discount:` mapped in at `processor.ex:1267`: `%{type: discount[:type] || "flat", value: discount[:value] || discount[:total] || 0, total: discount[:total], applies_to: discount[:applies_to], product_ids: discount[:product_ids], currency: %{code: currency}}`.
3. `{:ok, _discount_limits} <- check_discount_limits(discount, customer[:id])` — `processor.ex:280-281`. `check_discount_limits/2` (`processor.ex:1428-1449`) **locks the discount-code row `FOR UPDATE`** (`Context.Purchase.DiscountCode.lock_for_update/1`) before checking `Service.Discount.availability/2` (global `usage_limit` + `per_customer_limit`, counted by counting live orders, not a counter column) — serializes concurrent redemptions of the same code against this order.
4. `create_order_detail(%{..., discount_total_frozen: fees[:discount_total], discount_code_frozen: discount[:code], discount_id: discount[:discount_id], ...})` — `processor.ex:295-303` — freezes the applied discount onto `order_details` so it survives re-pricing and is counted by `count_active_redemptions`.

`Service.Discount` (`lib/api/services/discount.ex`) is the shared resolver used by both the order-first path and the `/discount` endpoint: `resolve/1` (`discount.ex:48-60`) looks up the code, checks active/expiry/currency/min-spend, and returns a descriptor with a subtotal-clamped `value` for fixed discounts (`to_descriptor/2`, `discount.ex:200-221`); `availability/2` (`discount.ex:75-94`) checks usage caps; `check_products/2` (`discount.ex:104-115`) fails closed (`:not_valid_for_items`) for a product-scoped code with no eligible cart item.

**Confirmed: the order-first/processor path DOES call the discount service and DOES compute a real `discount_total`.**

### A3. PowerTranz 3DS initiation on the order-first path

Order-create's `payment_urls` field is built by `create_payment_urls/1` in `processor.ex:1550-1585`, which dispatches by the merchant's configured payment-provider adapter to `Service.Payment.Provider.<Adapter>.create_payment_link/2`. For the live flow this is `Service.Payment.Provider.Fac` (PowerTranz gateway; "FAC" = First Atlantic Commerce) — `lib/api/services/payments/providers/fac/fac.ex:142-156` → `process/2` (`fac.ex:194-209`) → `format_payment_link/1` (`fac.ex:184-192`): a one-time hosted-payment-page link is `"#{Constants.urls()[:web]}/payments/link/#{invoice_link.uid}/fac"` (a subscription link instead ends `/status`). commerce-web strips the `/fac` suffix to get a fresh **payment-link uid** for this specific new order (distinct from the route's original template-link `id`) and drives the embedded card flow against it (`checkouts.$id.tsx:444-451`).

From there, the forced-3DS card sequence (all under `/api/v1/payments/link/...`, all public/unauthenticated per `payment_link_controller.ex:4`):
1. `POST /:uid/checkout-intent` → `PaymentLinkController.checkout_intent/2` (`payment_link_controller.ex:174-192`) → `Fac.checkout_intent/3` (`fac.ex:1201-1233`): re-fetches the session, re-runs the fraud-risk gate (`gate_payment_link/3`) **before** issuing the amount, then returns a signed intent via `build_checkout_intent/5` (`fac.ex:1254-1277`): `%{amount, currency (numeric), exp, sig: HMAC-SHA256(...), ref: uid, mode, recurring}`. This is what the commerce-payments hosted card iframe ("the CDE") uses as the server-authoritative charge amount — the CDE rejects any client-tampered amount.
2. The CDE tokenizes the card client-side into a `card_ref`, and the client (or CDE) calls `POST /:uid/charge-card` with `card_ref` (+ optional `risk_ref`, `browser_info`) → `PaymentLinkController.charge_card/2` → `Fac.generate_charge/4` (`fac.ex:564-578`) → `charge_card_ref` + `finalize_charge`.
3. If PowerTranz issues a 3DS challenge, PowerTranz posts the authentication result to the merchant's `MerchantResponseUrl`; the storefront's 3ds-callback forwards it server-side to `POST /payments/link/3ds-result` → `Fac.store_3ds_result/2` (`fac.ex:623-638`), keyed by `spi_token`, stored in Redis (`fac3ds:<spi_token>`, 600s TTL).
4. `POST /:uid/complete-3ds` with `spi_token` (+`preprocessing_3ds`) → `PaymentLinkController.complete_3ds/2` → `Fac.complete_charge_3ds/5` (`fac.ex:586-614`): resolves the stored 3DS result, runs a **fail-closed strength gate** (must be authentication status Y **and** CAVV present — `gate_3ds_strength/1`) before calling `Service.Payment.Provider.CommercePayments.complete_3ds(spi_token)` to settle and mark the order paid.
5. A `SERVER_SIDE_SETTLE`-flagged hardening variant exists: `POST /payments/link/3ds-bind` (`Fac.bind_3ds/4`, `fac.ex:649-658`) lets the CDE bind `spi_token → {invoice_id, card_ref, mode}` server-side (Redis `ptzbind:<spi_token>`) so `complete_from_callback` (`fac.ex:660+`) can settle straight from the ACS callback — "the cardholder's browser never relays the spi_token."

None of this PowerTranz/3DS machinery reads or is affected by `discount_code` — discount only affects the **amount** signed into the checkout-intent (`fees[:customer_total]`, already net of discount from step A2). This matters for the verdict: a discount fix on the session-based path is purely a fee-calculation change and doesn't need to touch payment initiation at all (confirmed directly — see the candidate fix's diff in section B, which touches zero lines of FAC/PowerTranz code).

---

## B. The `POST /checkout/sessions` session path

Router (`router.ex:263-269` at `5f13913d`, identical at `HEAD`/`version/4.1-beta`):
```
scope "/v1/checkout" do
  post "/sessions", CheckoutSessionController, :create
  get "/sessions/:id", CheckoutSessionController, :show
  delete "/sessions/:id", CheckoutSessionController, :delete
  post "/sessions/:session_id/simulate_webhook", CheckoutSessionController, :simulate_webhook  # dev/test only
end
```
Full path: `/api/v1/checkout/sessions`.

**Controller** (`lib/api_web/controllers/checkout_session_controller.ex`): `create/2` (lines 62-96) adds `merchant_id` from tenant context and calls `Service.Order.SessionBasedCheckout.create_checkout_session/1`. Per its own moduledoc (lines 12-41) the request body is:
```json
{ "total": 100.00, "currency_code": "USD",
  "customer": {"email": "...", "first_name": "...", "last_name": "..."},
  "products": [{"id": 1, "quantity": 2}],
  "title": "My Store Order", "metadata": {"source": "web"} }
```
— **no `discount_code` field**, and I confirmed by grepping the whole implementation file that `discount_code`/`discount` is never read from params anywhere in `create_checkout_session/1` (`lib/api/services/orders/session_based_checkout.ex:107-162`) prior to the candidate fix.

Response envelope, `{state: :ok, result: {...}}` where `result` = `format_create_session_response/1` (`checkout_session_controller.ex:207-263`): `session_id, reference_id, status, order_id, currency, currency_code, created_at, payment_initiated_at, completed_at, expires, totals: {sub_total, customer_total, merchant_total, platform_total, provider_total, shipping_total, tax_total, discount_total, before_tax_fee_total, after_tax_fee_total}, fees (raw), customer, title, products, frame_url, redirect_data, spi_token, transaction_id, amount, transaction_type, three_d_secure, is_subscription`. `GET /sessions/:id` (`show/2`, lines 101-122) returns the same shape via `format_session_response/1` (lines 310-330), sourced from the persisted `Api.Purchase.Session.data` JSON blob. `DELETE /sessions/:id` → `cancel_session/1`.

### Fee computation — where discount is (not) applied

`create_checkout_session/1` → `calculate_checkout_fees/1` (`session_based_checkout.ex:632-720`). At `5f13913d` (current, pre-fix):
- `total == 0` short-circuit: `%{..., discount_total: 0, ...}` — `session_based_checkout.ex:651`.
- Every cart-item map built for the fee calculator carries `discount: %{type: "flat", value: 0, currency: currency_code}` **hardcoded**, regardless of any code — `session_based_checkout.ex:664` and `:673`.
- The top-level `calc_args` passed to the shared `TransactionCalculator.calculate_from_legacy/1` (the exact same fee engine the order-first processor uses) carries `discount: %{type: "flat", value: 0, total: 0, currency: %{code: currency_code}}` **hardcoded** — `session_based_checkout.ex:693`.
- Downstream, at order-materialization time (`create_order_detail_record/1`), `discount_total_frozen: fees["discount_total"] || 0` (`session_based_checkout.ex:1217`) and the webhook-result formatter's `"discount_total" => fees["discount_total"] || 0` (`session_based_checkout.ex:1286`) both just re-read the **same always-zero** value computed at session-create — there is no second chance for a discount to apply at settlement either.
- `discount_code` is never referenced anywhere in the file (confirmed by full-file grep) — the request body literally has nowhere to put one, and even if it did, nothing would consume it.

**Verdict on the peer's claim: CONFIRMED, precisely.** `POST /checkout/sessions` structurally cannot apply a discount code today: the endpoint doesn't accept `discount_code` as an input, and the fee calculation hardcodes the discount leg of the shared calculator's input to zero at three call sites, so `discount_total` in the response is always `0` — not just "usually 0", **always** 0, by construction. Order-first (`POST /orders`, section A2) and the two quote endpoints (`/fees`, `/discount`) are the only paths that call `Service.Discount` at all.

### Candidate fix (exists, NOT merged/deployed)

Branch `feat/discount-session-checkout`, commit `2d66270e` (worktree `/Users/romario/projects/inkress/commerce-api/.claude/worktrees/discount-41beta`), diffs only `lib/api/services/orders/session_based_checkout.ex` (+85/-11, one file). It mirrors the processor path almost exactly:
- Adds `resolve_session_discount/3` (calls `Service.Discount.resolve/availability/check_products`, same as processor's `fetch_discount/4`), run **before** fee calculation; an invalid/ineligible/exhausted code **rejects session creation** (stricter than the order-first `/fees` quote's lenient behavior, but matching order-first `/orders`' hard-fail behavior).
- Threads the resolved `discount` descriptor into `calculate_checkout_fees/1`'s `calc_args` with the same `type/value/applies_to/product_ids` shape the processor uses (`processor.ex:1267` shape, replicated).
- Persists the resolved discount on the session (`session_discount_data/1`) and stamps `discount_id` + `discount_code_frozen` onto `order_detail` at materialization (`put_discount_fields/2`), matching `processor.ex:302-303` — this is required for `count_active_redemptions` to count the redemption at all (a bare `discount_total_frozen` is not counted per project memory).
- Subscriptions are explicitly exempted (one-time codes don't combine with recurring billing).
- Zero changes to `CheckoutSessionController`, the router, or any FAC/PowerTranz code — confirming section A3's point that discount and payment-initiation are orthogonal.

This is a real, low-risk, narrowly-scoped patch sitting unmerged. It answers "what would it take to fix the backend" concretely, but until it is reviewed, merged past `feat/discount-product-scope`/`version/4.1-beta`, and deployed, `POST /checkout/sessions` in production drops discounts.

### Dead code found (as flagged by the task)

`lib/api/services/payments/providers/fac/fac.ex:1819-1841` (`create_order_from_session/2`, called only from `process_successful_payment/2` at line 1736, called only from **`def process_session_webhook/1`**, `fac.ex:1674-1698`) calls `Service.Order.MultiProcessor.create_order_after_payment(order_attrs)` at `fac.ex:1840`. **`Service.Order.MultiProcessor` does not exist** — its would-be source file, `lib/api/services/orders/mutli_processor.ex` (note the filename typo, "mutli"), is a **0-byte empty file** (git blob `e69de29b...`, the well-known empty blob, identical across `5f13913d`, `HEAD`, and `version/4.1-beta`). If ever called, this raises `UndefinedFunctionError`.

However, **`process_session_webhook/1` is never called from anywhere** (confirmed by grepping the whole tree at `5f13913d`: the only other hits are the `def` line itself and a stale comment in `examples/fac_checkout_session_example.exs:96`). The real, live FAC session-webhook path is: `Fac.process_webhook/1` → `detect_session_webhook/1` (matches `order_id` starting `sess_`/`fac_session_`) → `process_session_based_webhook/1` (`fac.ex:338-354`) → enqueues `Api.Workers.FacSessionWebhookWorker` (Oban) → `FacSessionWebhookWorker.perform/1` (`lib/api/workers/fac_session_webhook_worker.ex:35-77`) → **`Service.Order.SessionBasedCheckout.handle_payment_webhook/1`** (the correct, working module, already covered in section B above). So this is genuinely dead/orphaned code — an earlier implementation superseded by the Oban-worker + `SessionBasedCheckout` design, never deleted — not a live crash risk today, but worth removing so nobody re-wires something to call it.

---

## C. The verdict

**Answer: (c) — wrap the order-first processor path now; do not route the SDK's discount-carrying checkout through `/checkout/sessions` until the backend fix ships.**

Reasoning:
1. Section A2/A3 show the order-first path (`POST /orders` after loading a payment-link invoice) is the only path in production today that (a) calls `Service.Discount` and (b) has a fully-built, hardened PowerTranz/3DS sequence (`checkout-intent` → `charge-card`/CDE tokenize → `complete-3ds`, with `3ds-result`/`3ds-bind` server-side hardening). Both are mature and exercised by the live `/checkouts/:id` page today.
2. Section B shows `/checkout/sessions` is structurally incapable of discounts as deployed (hardcoded zero at 3 call sites, no `discount_code` input) — confirming the peer's claim exactly, with no ambiguity ("usually" vs "always": it's a hardcoded literal, not a bug that only sometimes fires).
3. A fix (`feat/discount-session-checkout`, `2d66270e`) already exists, is small (~85 lines, one file), demonstrably mirrors the processor's own discount logic, and touches zero payment-initiation code — so it's low-risk to land. But it is unmerged/undeployed, so it must not be assumed available.
4. The SDK's job is therefore: **today**, expose the order-first contract (invoice load, `/fees`, `/discount` quote, `POST /orders` with `discount_code`, then the PowerTranz `checkout-intent`/`charge-card`/`complete-3ds` sequence keyed by the order's own fresh payment-link uid) as the checkout primitive, so a refactored `/checkouts/:id` keeps discounts and 3DS working unchanged. **Once** `feat/discount-session-checkout` (or equivalent) is merged and deployed, and `POST /checkout/sessions`'s response is verified to carry a non-zero `discount_total` end-to-end (including at the Oban-worker order-materialization step, `session_based_checkout.ex:1217`), the SDK could add a `discount_code` param to its session-based checkout call as a second, lighter-weight primitive for callers (like FleekSite, see below) that don't need the full order-first shape — but that is a future migration, not a precondition for the commerce-web convergence work.
5. Minimum surface the SDK must expose to keep `/checkouts/:id` at parity: `invoice(uid)`, `fees(username, {currency_code, total, fulfillment_total, discount_code?, products?})`, `validateDiscount(username, {code, currency_code, total, fulfillment_total, products?})`, `createOrder({reference_id, kind, currency_code, customer, products, discount_code?, payment_link_id, fulfillment_total, data.*})`, then `checkoutIntent(uid, risk_ref?, mode?)`, `chargeCard(uid, card_ref, risk_ref?, browser_info?)`, `complete3ds(uid, spi_token, preprocessing_3ds?)`, plus the two server-to-server callbacks (`store3dsResult`, `bind3ds`) if the SDK is also meant to back the CDE/callback side and not just the browser side.

### On `POST /payments/checkout` (task question 6)

**commerce-api does NOT implement `/payments/checkout`.** That route is entirely internal to **fs-hono** (FleekSite's own backend): `paymentRoutes.post('/checkout', ...)` in `/Users/romario/projects/fleeksite/fs-hono/src/routes/payments/index.ts:33`, FleekSite's generic multi-gateway checkout dispatcher (Stripe / PayPal / WiPay / Inkress, chosen per-site by `body.paymentMethod`), backed by FleekSite's own `orders` table via `CheckoutService.processCheckout`. It is unrelated to commerce-api's own `/checkouts/:id`.

When a FleekSite site's payment method is Inkress, fs-hono's `InkressGateway` (`/Users/romario/projects/fleeksite/fs-hono/src/lib/payments/inkress.ts`) uses the **published `@inkress/admin-sdk`** (a different client than commerce-web's local vendored wrapper) against commerce-api:
- `InkressGateway.createCheckoutSession/1` (lines 100-149) calls `sdk.checkoutSessions.create({reference_id, total, kind:"cart", currency_code, title, customer, products, method_id, meta_data})` and reads back `data.frame_url`/`data.session_id`/`data.order_id` — these field names match `CheckoutSessionController`'s `format_create_session_response/1` exactly, confirming this hits commerce-api's **`POST /api/v1/checkout/sessions`** (the session-based, currently-no-discount path) for FleekSite's hosted-redirect checkout.
- `InkressGateway.createOrder/1` (lines 155-195) calls `sdk.orders.create({...})`, i.e. the **order-first `POST /api/v1/orders`** path, used for "create-then-charge-later" flows like invoices.

So FleekSite is a second, real production consumer straddling both paths — its primary redirect-checkout flow already depends on the session-based path that drops discounts. (Whether FleekSite's own storefront cart even forwards a discount/coupon code into `createCheckoutSession`'s params was not checked — its params list has no `discountCode` field today — so this may be latent rather than currently user-visible; not investigated further as it's outside this task's scope of commerce-web/`storefront-sdk`.)

## DONE
