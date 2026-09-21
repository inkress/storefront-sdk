# PARITY-money — Session-based vs Order-first checkout (money & pricing audit)

> READ-ONLY audit. Repo: /Users/romario/projects/inkress/commerce-api (canonical). Date: 2026-09-21.
> SESSION = lib/api/services/orders/session_based_checkout.ex; ORDER-FIRST = lib/api/services/orders/processor.ex + payments calculators.
> Dimensions: 1 Discount codes · 2 Tax · 3 Shipping · 4 Fees breakdown · 5 Multi-currency · 6 Subscriptions.

## BRANCH REALITY (read this first — it reframes the whole audit)

The canonical working tree is on branch **`feature/spi-3ds`**. On this branch **BOTH the
session path AND the order-first `Processor` hardcode discount = 0 and tax = 0** — the
order-first `Processor` is NOT a working discount reference on the checked-out branch:
- `processor.ex:1206` `fetch_discount/1` → `{:ok, %{total: 0}}` (real body commented out)
- `processor.ex:1197` `fetch_tax/1` → `{:ok, %{total: 0}}` (real body commented out)

The **real, LIVE discount machinery** (resolver service, schema, context, public endpoint,
calculator product-scoping, AND full session-path wiring) lives on **`origin/version/4.1-beta`**,
added by PRs #208/#209/#210/#212/#214. `feature/spi-3ds` has diverged from it
(`git rev-list --left-right --count feature/spi-3ds...origin/version/4.1-beta` = **1622  116**;
beta is NOT an ancestor). The work is **not on `origin/main`** either (discount_code.ex absent).

**Consequence for "completing the session path":** the session-path discount work is *already
written and tested* on `origin/version/4.1-beta` — commit `c3cf49de` / `a49938bd`
"apply discount codes in the session-based checkout (#214)", with
`test/api/services/orders/session_based_checkout_discount_test.exs`. So the "gap" is not a
green-field build; it is **porting the 116-commit beta discount stack onto the target branch.**
All `origin/version/4.1-beta:...` citations below are that reference implementation.

---

### 1. Discount codes
- **order-first (checked-out `feature/spi-3ds`):** NO discount. `processor.ex:1206` `fetch_discount/1` returns `%{total: 0}` (body commented out); threaded as `discount[:total]=0` into `calculate_fees` (`processor.ex:1072`). Also note the on-disk `TransactionCalculator` (`transaction.ex:373-399` `build_fee_groups`) builds NO discount fee-group, and `build_items` (`transaction.ex:324`) **ignores the global `discount` arg whenever products are present** — so even a non-zero global discount would be silently dropped for a product cart on this branch.
- **order-first (REFERENCE `origin/version/4.1-beta`):** full server-authoritative machinery — resolver `Service.Discount.resolve/1`, cap check `availability/2`, product scoping `check_products/2` (`origin/version/4.1-beta:lib/api/services/discount.ex`); order-create threading `processor.ex` `fetch_discount/4` + `check_discount_limits/2` (lock) + `discount_total_frozen`/`discount_code_frozen`/`discount_id` on order_detail; quote via `check_fees` `resolve_fees_discount/2`; calculator `build_discount_fee_group/2` + `scope_discount_to_products/2` (`origin/version/4.1-beta:lib/api/services/payments/calculators/transaction.ex`). Public endpoint `GET|POST /v1/public/m/:merchant_username/discount` → `MerchantController.validate_discount/2` (`origin/version/4.1-beta:lib/api_web/router.ex:230-231`).
- **session (`session_based_checkout.ex`):** CONFIRMED hardcodes 0. `calculate_checkout_fees:600` sets every item `discount: %{type: "flat", value: 0}` (`:632`, `:641`) and the global `discount: %{type: "flat", value: 0, total: 0}` (`:661`); no code is ever read (`create_checkout_session:108` never touches `discount_code`). (Beta already fixes this: `resolve_session_discount/3` + threading, `origin/version/4.1-beta:session_based_checkout.ex:646`.)
- **gap:** session applies no discount at all — a buyer's code is silently ignored and they are overcharged. Order total, `discount_total_frozen`, transaction `discount_total`, and redemption count are all wrong. No resolve, no caps, no product-scope, no redemption recording.
- **severity:** P0 (money wrong; buyer charged full price on a valid code; also no cap enforcement → over-redemption).
- **effort:** M (machinery exists; port + wire — see RECIPE below).
- **reuse:** `Service.Discount.{resolve,availability,check_products,message,reason_code}` + `Context.Purchase.DiscountCode.{get_by_code,count_active_redemptions,lock_for_update}` + `Api.Purchase.DiscountCode` schema + calculator `build_discount_fee_group`/`scope_discount_to_products` + the `#214` `resolve_session_discount/3`/`session_discount_data/1`/`put_discount_fields/2` session wiring — all from `origin/version/4.1-beta`.

### 2. Tax
- **order-first:** NO tax computed anywhere. `processor.ex:1197` `fetch_tax/1` → `%{total: 0}` (body commented out); passed as `tax: %{type:"flat", value: 0, total: 0}` (`processor.ex:1073`). Beta did NOT add tax either — tax is untouched by the discount work.
- **session:** identical — `calculate_checkout_fees` hardcodes item tax `%{type:"flat", value:0}` (`:633`,`:642`) and global tax `%{...value:0, total:0}` (`:662`); `create_order_detail_record:1180` writes `tax_total_frozen: fees["tax_total"] || 0`.
- **gap:** none. Tax is universally 0 / unused in Inkress on both paths. The `TransactionCalculator` *supports* tax (fee-set kind 4 → "tax" group, `transaction.ex:299`,`:357`; item `:tax` `AmountDetail`), and both paths forward the plan's `fee_sets` to the engine, so if a merchant plan ever carried a kind-4 tax fee both paths would apply it identically. No divergence.
- **severity:** P2 (parity holds; only relevant if tax is ever introduced).
- **effort:** S.
- **reuse:** n/a (both already 0; engine tax path shared).

### 3. Shipping / fulfillment
- **order-first:** takes the CLIENT `fulfillment_total` and only format-validates it — `record_online:193` `validate_shipping_total/1` (`processor.ex:624`) → `validate_money/1` (parseable money, else `{:error,"Invalid Total"}`). It does **NOT** re-price against shipping methods/rates/address: there is **no shipping resolver anywhere**, and `fetch_address/2` (`processor.ex:962`) is stubbed to `{:ok, nil}` (addresses are never persisted or validated). Shipping is then a flat customer-paid fee-group (`transaction.ex:452` `build_shipping_fee_group`, `fee_payer: "customer"`).
- **session:** takes the CLIENT `fulfillment_total` with even less checking — `create_checkout_session:125` `shipping_total: Utils.parse_float(params[:fulfillment_total], 0)` (coerces junk → 0.0, no error). Stored raw (`session_data["fulfillment_total"]`, `:737`), surfaced on order_detail (`:1185`).
- **gap:** small. Neither path server-validates shipping beyond format; both trust the client number (there is no rate/method engine to skip). Session lacks even the `validate_money` guard order-first runs, so a malformed shipping value silently becomes 0 instead of erroring.
- **severity:** P2 (client-trusted on both sides; session merely coerces instead of validating).
- **effort:** S (add a `validate_money` guard on `params[:fulfillment_total]` in the session `with`).
- **reuse:** `Service.Order.Processor.validate_money/1` (public) / the `validate_shipping_total/1` pattern.

### 4. Fees breakdown (platform/provider, fee-payer, offset)
- **order-first:** `calculate_fees` (`processor.ex:988`) → `TransactionCalculator.calculate_from_legacy` (`:1081`) with `fee_sets = billing_plan_fee_sets ++ provider_plan_fee_sets`, `offset_fees: true` (`:1078`); fee-payer resolved per fee-set kind (`6 → merchant.platform_fee_structure`, `7 → merchant.provider_fee_structure`, `processor.ex:1037-1043`). Billing plan = `merchant[:active_billing_plan]` (`:206`). Also computes `customer_total_jmd` via `Api.Currency.to_jmd` (`:1095`) and enforces `check_daily_transaction_limit` (`:217`).
- **session:** `calculate_checkout_fees` (`:600`) → same `TransactionCalculator.calculate_from_legacy` (`:670`) with `billing_fee_sets ++ provider_fee_sets`, `offset_fees: true` (`:667`); identical fee-payer mapping in `build_fee_sets/2` (`:689`, kinds 6/7). Same preload `[fee_sets: [fees: :currency]]` (`:650-651`). Transaction persists `provider_fee`/`platform_fee`/`platform_total`/`provider_total`/`merchant_total` (`:1240-1252`).
- **gap:** the fee ENGINE and its inputs are at parity → for an equal cart with the same plan, platform/provider/customer totals match. Two non-engine divergences: (a) session never computes `customer_total_jmd` and never calls `check_daily_transaction_limit`, so the daily/monthly/single transaction-limit ceiling is **not enforced** on the session path (it only *writes* the `dtu`/`mtu` Redis counters at `mark_order_as_paid:1309-1310`); (b) subscription fee basis differs — see dim 6.
- **severity:** P1 (fees themselves match; the missing daily/monthly limit ENFORCEMENT is a real risk/compliance gap, not a fee-math gap).
- **effort:** M (add `customer_total_jmd` + `check_daily_transaction_limit` gate before session creation).
- **reuse:** `Service.Order.Processor.check_daily_transaction_limit/1` (public), `Api.Currency.to_jmd/2`.

### 5. Multi-currency
- **order-first:** `fetch_currency/2` (`processor.ex:949`) = `params[:currency_code] || default (merchant.data.default_currency, else "JMD")`, upcased, `Repo.get_by(Currency, code:)`. Currency id↔code via `Constants.currencies()` (JMD=1, USD=2; used at `processor.ex:769`). Cross-currency handled inside the engine (`transaction.ex:947` `to_money` + `ExchangeRate.get_rate`, flat fees pre-converted `:658`). `customer_total_jmd` normalizes for limits (`:1095`).
- **session:** `fetch_currency/2` (`session_based_checkout.ex:400`) = `params[:currency_code] || merchant.data[:default_currency] || "JMD"`, upcased, `Repo.get_by(Currency, code:)` — **same resolution**; stores `%{id, code}` on the session (`:733`) and uses `currency.code` throughout the fee calc.
- **gap:** none material. Currency resolution + engine conversion are identical. Session omits only `customer_total_jmd`, which affects the (also-missing) limit check in dim 4, not the charged amount.
- **severity:** P2 (parity).
- **effort:** S.
- **reuse:** shared `Currency` schema + `TransactionCalculator.to_money`; add `Api.Currency.to_jmd` alongside the dim-4 limit fix.

### 6. Subscriptions / billing plans
- **order-first:** subscription PRODUCT plan resolved separately from the fee plan — `fetch_subscription_plan/1` (`processor.ex:870`, by `plan_id` → `Context.Billing.Plan.get_active_plan`) + `fetch_subscription_token/1` (`:879`, `subscription_token`/`subscription_token_id`). FEES always use `merchant[:active_billing_plan][:fee_sets]` (`:206`). Order carries `billing_plan_id: subscription_plan[:id]` (`:228`); subscription fee rule zeroes tax/shipping by forcing `total`+`customer_total = total` (`:1084-1090`). On payment, `update_order_status` enqueues `Workers.Subscriptions.Oban.BillingWorker` `create_from_order` when `kind == order_subscription` OR `billing_plan_id` present (`:1373-1384`).
- **session:** `is_subscription = !!billing_plan_id || !!subscription_token` (`:127`). `fetch_billing_plan/2` (`:352`) — when `billing_plan_id` is supplied it fetches THAT `Api.Billing.Plan` by `uid` and uses **its** `fee_sets` for the fee calc; otherwise the merchant's active plan. Subscription fee rule sets only `customer_total = final_total` (`:673-679`, note: no `:total` override like order-first). Order kind via `determine_order_kind/1` (`:1152`), `billing_plan_id` stored (`build_order_params:1145`). Subscription creation reuses `Service.Order.Processor.update_order_status/2` (`mark_order_as_paid:1316`) → **same** BillingWorker enqueue at parity.
- **gap:** two divergences. (a) **Fee basis:** for a subscription with `billing_plan_id`, session computes platform/provider fees from the *subscription product's* plan `fee_sets`, whereas order-first always uses the *merchant's processing* plan — a real risk the two produce different fees for the "same" subscription. (b) Session's subscription branch sets `customer_total` but not `total`, a minor shape mismatch vs order-first (`:1089`). Param contract also differs (session: `billing_plan_id`+`subscription_token`; order-first: `plan_id`+`subscription_token`/`subscription_token_id`). Post-payment subscription creation is at parity (shared `update_order_status`).
- **severity:** P1 (fee-basis divergence can misprice subscription fees; creation itself is fine).
- **effort:** M (align session fees to the merchant's active billing plan `fee_sets`, keep `billing_plan_id` only as the subscription product; mirror the `total`+`customer_total` override).
- **reuse:** order-first `record_online` subscription split (`fetch_subscription_plan` vs `active_billing_plan` for fees) as the template.

---

## RECIPE — reuse the order-first discount machinery in the session path

All references `origin/version/4.1-beta`. This is what `#214` already did; port it.

**Files to bring over (8 units + 3 migrations + rbac):**
- `lib/api/services/discount.ex` — `Service.Discount` (resolve / availability / check_products / message / reason_code)
- `lib/api/schema/purchase/discount_code.ex` — `Api.Purchase.DiscountCode`
- `lib/api/context/purchase/discount_code.ex` — `Context.Purchase.DiscountCode`
- `lib/api/queries/discount_code.ex` — `Query.DiscountCode`
- `lib/api/services/payments/calculators/transaction.ex` — adds `scope_discount_to_products/2`, `build_discount_fee_group/2`, `discount_unit/1`; moves the no-products discount from item-level into the "discount" fee-group; `build_transaction_input` calls `scope_discount_to_products` before `build_items`
- `lib/api_web/controllers/merchant_controller.ex` — `validate_discount/2` + `rate_limit_discount/1`; `get_fees/2`
- `lib/api_web/router.ex` — `GET|POST /v1/public/m/:merchant_username/{fees,discount}` (`:228-231`)
- `lib/api/services/orders/session_based_checkout.ex` — `resolve_session_discount/3`, discount threading in `calculate_checkout_fees`, `session_discount_data/1`, `put_discount_fields/2`
- migrations: `20260918175359_create_discount_codes`, `20260919040000_discount_per_customer_limits`, `20260920000000_discount_product_scope`; `priv/rbac.yaml` (+7 lines)

**Resolver contract (exact I/O):**
- `Service.Discount.resolve(%{code, currency_code, subtotal | total})` → `{:ok, descriptor}` | `{:error, reason}`. Merchant taken from tenant context (`Api.Org.Repo`), NOT a param. Pipeline: `get_by_code` (normalized trim+upcase, active-wins-over-stale) → active? → not expired? → currency matches (nil/"" = any) → min_spend met (vs subtotal). `descriptor = %{discount_id, code, type: "percentage"|"flat", value :: float, currency_code, usage_limit, per_customer_limit, applies_to (1 order|2 products), product_ids}`. Order-scoped FIXED codes are clamped to subtotal here; product-scoped fixed left unclamped (calculator clamps to eligible total).
- `Service.Discount.check_products(descriptor, products)` → `:ok` | `{:error, :not_valid_for_items}`. `products = [%{id: ...}]` (atom/string keys, id number-or-string; coerced). Order-wide always `:ok`; product-scoped needs ≥1 cart product in `product_ids`; empty `product_ids` fails closed.
- `Service.Discount.availability(descriptor, opts)` → `:ok` | `{:error, :usage_limit_reached | :per_customer_limit_reached}`. Counts live redemptions from orders (`count_active_redemptions/2`); `opts[:customer_id]` enables the per-customer cap. **Advisory** unless run right after `lock_for_update/1` inside a txn.

**Caps enforcement (order-first pattern, `processor.ex` `check_discount_limits/2`):** inside the order-create `Repo.transaction`, `Context.Purchase.DiscountCode.lock_for_update(discount_id)` (`FOR UPDATE`) → if `nil` reject → else `Service.Discount.availability(descriptor, customer_id: cid)`. The new order row IS the reservation.

**Redemption count model:** no counter column. `count_active_redemptions(discount_id, opts)` = `count(order_details)` join orders where `discount_id` matches AND `discount_code_frozen` is not nil AND `order.status NOT IN released` (`released = [order_error, order_cancelled, order_returned, order_refunded, order_stale]`). Pending counts (holds the slot); count-by-exclusion so a new status defaults to "counts". Therefore order-create MUST stamp BOTH `discount_id` AND `discount_code_frozen` on the order_detail (`processor.ex:301-303`; session `put_discount_fields/2`).

**Fee application (how the amount is actually taken):** thread the descriptor into `calculate_fees`/`calculate_checkout_fees` discount arg as `%{type: descriptor[:type], value: descriptor[:value], total: descriptor[:total], applies_to: descriptor[:applies_to], product_ids: descriptor[:product_ids], currency: %{code: currency}}`. The calculator's `scope_discount_to_products/2` reduces a product-scoped code to a flat amount over the eligible products' total, then `build_discount_fee_group/2` emits a `kind: "discount"` fee-group (`@kind_priority` 1 → applied before tax), `fee_payer: "merchant"` (kept out of `customer_fees_total`; reduces `customer_total`/`merchant_total` exactly once via `apply_discount`, `transaction.ex:1368`).

**Public quote:** `GET|POST /v1/public/m/:merchant_username/discount` → `validate_discount/2`: `rate_limit_discount` (per (IP, merchant), 30/60s fixed-window Redis `rl:discount:<mid>:<ip>:<bucket>`, **fails open**) → `resolve` → `availability` (global cap only; per-customer needs order-create) → `check_products` → `Processor.check_fees(%{... "discount_code" => code})`; rejection is a 200 `{valid:false, reason, message}`, rate-limit is 429. `/fees` → `get_fees/2` → `Processor.check_fees/1`.

**Session-specific note (`resolve_session_discount/3`, beta):** a session fixes the charged amount up front, so beta resolves + commits the discount at SESSION-CREATE (hard-fails session creation on an invalid/ineligible/exhausted code) and records the redemption at order-create; its cap check there is **advisory (no `lock_for_update`)** — unlike order-first which locks. If you want the session path to match order-first's over-redemption guarantee, add a `lock_for_update` + `availability` re-check inside `create_order_from_session`'s existing `Repo.transaction` (`session_based_checkout.ex:254`) before `create_order_detail_record`.

## DONE

**Top 3 money/pricing gaps (session vs order-first):**
1. **P0 — Discount codes ignored (session hardcodes 0).** No resolve, no caps, no product-scope, no redemption recording → buyer charged full price on a valid code and codes can over-redeem. The complete fix already exists and is tested on `origin/version/4.1-beta` (#214); it is a port, not a build. Reuse recipe above.
2. **P1 — Subscription fee basis divergence.** Session computes platform/provider fees from the subscription product's `billing_plan` `fee_sets`, while order-first always uses the merchant's active *processing* plan — same subscription can be mispriced. Also: session never enforces the daily/monthly/single transaction limit (`check_daily_transaction_limit`) that order-first runs.
3. **P2 — Shipping trusted, less strictly than order-first.** Both trust the client `fulfillment_total` (no rate/method resolver exists), but session coerces junk → 0 whereas order-first at least `validate_money`-guards it; tax and multi-currency are at full parity (both tax = 0; identical currency resolution + shared engine conversion).
