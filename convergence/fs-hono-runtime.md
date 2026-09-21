# fs-hono run-time commerce endpoints — implementation map

Purpose: for each run-time action the FleekSite kit (`fk.js`/`fk-cart.js`) calls,
record the fs-hono route's real contract and whether it is backed by the local
FleekSite Postgres DB (Drizzle) or by a call out to Inkress commerce-api, to
scope what the Inkress storefront SDK needs to cover for parity.

Spec read first: `/Users/romario/projects/fleeksite/theme-catalogue/STOREFRONT-SDK-REQUIREMENTS.md`

Repos: `/Users/romario/projects/fleeksite/fs-hono` (main) and
`/Users/romario/projects/fleeksite/fs-hono-discounts` (worktree, ahead — has
`discounts.ts`, `schedules.ts`, `sites-signup.ts`; also independently modified
`commerce.ts`, `payments/index.ts`, `auth/session.ts`, `compat.ts` vs `fs-hono`).
Using `fs-hono-discounts` as the primary citation source since it has
`discounts/quote` implemented; noting where it diverges from `fs-hono` itself.

Route mounting (fs-hono-discounts/src/app.ts:100-143): `/auth`→authRoutes,
`/api/v1`→apiV1 aggregator, `/payments`→paymentRoutes, `/`→compatRoutes (last,
catch-all-ish). apiV1 aggregator (api/v1/index.ts) mounts `/cart`→cartRoutes,
`/variants`→variantsRoutes, `/discounts`→discountsRoutes, `/leads`→leadsRoutes.

Status: COMPLETE — all 8 numbered actions plus the render-time collection tag
mapped, each with backing (local-DB | Inkress-call | mixed) and file:line
citations. Two UNCONFIRMED items noted inline (an unused-looking anonymous
cart-session pair, and the exact "post type 10" enum name for search.json).

---

## 1. Cart sync — `POST /api/v1/cart`

**Backed by: local-DB only.**

- Route: `fs-hono-discounts/src/routes/api/v1/cart.ts:31-80` (byte-identical in
  `fs-hono/src/routes/api/v1/cart.ts` — confirmed via `diff -q`, no divergence).
- `GET /api/v1/cart` (cart.ts:31-45): if no `user` on context, returns
  `apiOk(c, { item: null })` — i.e. 200 not 401 for guests on GET. If signed
  in, reads most recent `cartLines` row for `(site.id, user.id)` via Drizzle
  (`db.query.cartLines.findFirst`, cart.ts:39-42).
- `POST /api/v1/cart` and `POST /api/v1/cart/update` (both aliases, cart.ts:79-80
  → `upsertCartLine`, cart.ts:47-77): calls `requireAuth(c)`
  (`middleware/auth.ts:197-201`) which throws `HTTPException(401, 'Unauthorized')`
  for guests — matches spec's "Signed-in only; 401 for guests, so guests keep
  the bag locally". Body: `{ info: {...} }` (or the bare object as `info` —
  cart.ts:52 `const info = (body.info ?? body)`), opaque JSONB, no server-side
  item schema. Upserts one row per `(site_id, user_id)` in the `cart_lines`
  table (insert if none exists, else update `info` + `updatedAt`,
  cart.ts:54-73). Response: `apiOk(c, { item: <cartLines row> })` →
  `{ state: 'ok', data: { item: {...} } }` (envelope confirmed at
  `utils/api-response.ts:15-17`).
- Also present but NOT in the spec's action table: `GET /api/v1/cart/session/:id`
  and `POST /api/v1/cart/session` (cart.ts:86-108) — an anonymous-cart path
  using a separate `carts` table (visitor sessions, `items` jsonb + `price`).
  The kit does not appear to call this (see fk-cart.js review below) — looks
  like a legacy/unused server capability. UNCONFIRMED whether any theme path
  calls `/api/v1/cart/session`.
- Envelope helpers used throughout: `apiOk`/`apiError` at
  `fs-hono-discounts/src/utils/api-response.ts:15-32` — confirms
  `{ data, state: 'ok' }` / `{ data: { text }, state: 'error' }`, matching the
  spec's `{state, data}` envelope exactly (status 422 default for apiError).

## 2. Stock re-check — `POST /api/v1/variants/check_stock`

**Backed by: local-DB only.**

- Route: `fs-hono-discounts/src/routes/api/v1/commerce.ts:73-92`, mounted at
  `/variants` by `api/v1/index.ts:45` (`apiV1.route('/variants', variantsRoutes)`)
  → full path `/api/v1/variants/check_stock`. This file **differs** from
  `fs-hono/src/routes/api/v1/commerce.ts` (confirmed via `diff -q`) —
  fs-hono-discounts is the newer version; UNCONFIRMED exactly what changed
  since check_stock itself looks stable, not spending time diffing further as
  the task says prefer the repo with discounts/quote.
- No auth required — only `requireSite(c)` (commerce.ts:74), so this is a
  public endpoint (matches spec's re-check-before-checkout flow for guests too).
- Body: accepts either `{ variant_ids: [...] }` OR `{ items: [{variant_id}] }`
  (commerce.ts:77: `body.variant_ids || body.items?.map(i => i.variant_id)`) —
  slightly more lenient than the spec's documented `{ variant_ids: [] }` alone.
- Scoped to `site.id` (commerce.ts:82: `eq(variants.siteId, site.id)`) — "another
  shop's stock is not this shop's to tell" (commerce.ts:80 comment).
  Queries the local `variants` table directly via Drizzle.
- Response: `{ state: 'ok', data: { items: [{ id, stock, unlimited }] } }`
  (commerce.ts:86-91) — note this returns **`unlimited` in addition to
  `stock`** (spec's table only documents `[{ id, stock }]`, undersells the
  actual shape — the SDK should carry `unlimited` through, since spec §3
  non-negotiable #4 says `unlimited: true` means no ceiling and `stock` is
  only meaningful when false). Missing variant ids default to
  `{ stock: 0, unlimited: false }` (commerce.ts:87-88).
- Related, not in spec's table: `GET /api/v1/variants/stock/:uid`
  (commerce.ts:56-70) — looks up a *post* by uid then returns stock info for
  all its variants (`id, name, sku, stock, total, price, postId, quantitySold`).
  UNCONFIRMED whether the kit calls this; the spec's kit table only lists
  `check_stock`.

## 3. Discount quote — `POST /api/v1/discounts/quote`

**Backed by: local-DB only.**

- Route: `fs-hono-discounts/src/routes/api/v1/discounts.ts:24-63`. Only exists
  in the `fs-hono-discounts` worktree — **not present at all in `fs-hono`**
  (confirmed: `fs-hono/src/routes/api/v1/` has no `discounts.ts`, and
  `fs-hono/src/routes/api/v1/index.ts` does not mount a discounts route).
  Mounted at `/api/v1/discounts` via `api/v1/index.ts:44`
  (`apiV1.route('/discounts', discountsRoutes)`).
- `requireSite(c)` only — public, no auth (discounts.ts:28), rate-limited to
  20 req/min per key `discount:quote` (discounts.ts:26,
  `middleware/rate-limit.ts`).
- Body: `{ code, items: [{ variant_id, quantity }] }` — matches spec exactly.
  Code is read from `body.code` or legacy `body.discountCode`
  (discounts.ts:31). Empty/blank code → 400 `{state:'error', data:{message:'Enter a code.'}}`.
- Pricing pipeline, all local DB: `loadPricingRows(site.id, items)` then
  `priceLines(...)` (both from `services/checkout.service.ts`, imported at
  discounts.ts:17) look up `variants` table rows to price every line
  server-side from the DB — **never trusts a client-sent price**, matching
  spec §3 non-negotiable #1. Then `resolveDiscount(site.id, code, subtotal)`
  (`services/discount.service.ts:160`) looks up the local `discounts` table
  (Drizzle) and evaluates it.
  - Verified no Inkress/external calls in either service file: both
    `services/checkout.service.ts` and `services/discount.service.ts` import
    only `db` (Drizzle), `drizzle-orm` operators, `uid`/`notification`
    utilities — no `fetch`, no `@inkress/admin-sdk`, no HTTP client of any
    kind (grepped both files for `import|fetch|inkress` — zero external calls).
- Failure: `resolveDiscount` returning `!ok` → **422** with
  `{ state:'error', data:{ code, message, refusal } }` (discounts.ts:44-46) —
  matches spec's "422 with a readable refusal".
- Success shape (discounts.ts:49-61): `{ state:'ok', data:{ code, label, kind,
  subtotal, discount, total, currency } }` — matches the spec's documented
  `{code,label,kind,subtotal,discount,total}` plus an extra `currency` field
  the spec's summary table omits. `label` is server-composed human text
  (`"10% off"` or `"$5.00 off"`, discounts.ts:54), `kind` is the
  `DiscountKind` enum value (`percent`/etc from `discount.service.ts`).
  All amounts are **major units** (`subtotal`/`discount`/`total` come straight
  out of `priceLines`/`resolveDiscount`, which operate on `variants.price`
  major-unit values — no `*100`/`/100` anywhere in this file).

## 4. Place order — `POST /payments/checkout`

**Backed by: mixed — order creation is local-DB; the charge step calls one of
four external payment processors selected per-site, one of which is Inkress.**

- Route: `fs-hono-discounts/src/routes/payments/index.ts:36-153`, mounted at
  `/payments` (`app.ts:131`) → `/payments/checkout`. This file differs from
  `fs-hono/src/routes/payments/index.ts` (confirmed via `diff -q`); using the
  discounts worktree version as it is the newer/more complete one (has the
  `inkress` case and the discount-required flag).
- Allowed `paymentMethod` values: `stripe | paypal | wipay | inkress`
  (payments/index.ts:33, `PAYMENT_METHODS` set) — unknown method rejected
  400 before any order is created (payments/index.ts:42-44).
- **Order creation is 100% local DB**, via
  `CheckoutService.processCheckout` (`services/checkout.service.ts:254-364`):
  1. Resolves line items from request `items` or, if absent, the signed-in
     user's saved `cartLines` row (checkout.service.ts:259-271) — guest with
     no `items` and no session → `'Your bag is empty'`.
  2. Prices every line from the DB again (`loadPricingRows`/`priceLines`,
     same functions the discount quote uses) — the client can send variant
     ids/quantities only, never a price (spec §3.1 non-negotiable, verified
     true here).
  3. Resolves the discount code **again** against the freshly-computed
     subtotal (checkout.service.ts:291-301) — "what the storefront showed is
     a quote, this is the charge" (checkout.service.ts:285-286 comment).
     `requireDiscount: true` is passed from the route (payments/index.ts:61),
     so a code that fails at this stage fails the whole checkout rather than
     silently charging full price.
  4. Inserts one `orders` row and N `orderLines` rows (checkout.service.ts:306-352),
     status `pending`.
  5. Fires `NotificationService.orderComplete` fire-and-forget
     (checkout.service.ts:355-358).
  6. Returns `{ success:true, order:{ uid, total, currency } }`
     (checkout.service.ts:360-363) — **`total` is explicitly major units**,
     per the comment at checkout.service.ts:280 "Totals — major units, as
     orders.total has always held". (Note: a separate legacy `orders.price`
     column is stored at `total / 100`, checkout.service.ts:333 — a known,
     separate quirk, see money-units finding below; the API-facing field is
     `total`, not `price`.)
  - No Inkress/external call anywhere inside `processCheckout` — grepped
    `checkout.service.ts` for `fetch|inkress|Inkress`: zero matches. Order
    creation, pricing, stock and discount resolution never leave the local DB.
- **The charge step is a per-`paymentMethod` dispatch** (payments/index.ts:87-144),
  called only *after* the local order row exists, using `result.order!.total`
  (the major-units total above) as `amount`:
  - `stripe` → `StripeGateway.createPaymentIntent` (`lib/payments/stripe.ts`) —
    direct Stripe API call, not Inkress, not PowerTranz.
  - `paypal` → `PayPalGateway.createOrder` (`lib/payments/paypal.ts`) — direct
    PayPal API call.
  - `wipay` → `WiPayGateway.createPayment` (`lib/payments/wipay.ts`) — direct
    WiPay (Caribbean processor) API call.
  - `inkress` → `InkressGateway.createCheckoutSession`
    (`lib/payments/inkress.ts:100-149`) — **this is the one path that is
    Inkress-backed**: it builds a per-site `InkressSDK` instance
    (`@inkress/admin-sdk`, `lib/payments/inkress.ts:78-87`) from credentials on
    `site.payment_providers.inkress_*` (or legacy `site.data.inkress_*`,
    inkress.ts:36-63) and calls `sdk.checkoutSessions.create({ reference_id,
    total, kind:'cart', currency_code, customer, products, method_id,
    meta_data })` (inkress.ts:118-133) — this is an HTTP call out to Inkress
    commerce-api via the admin SDK, returning `frame_url`/`session_id`. **No
    PowerTranz integration exists anywhere in fs-hono** — grepped both
    `fs-hono` and `fs-hono-discounts` `src/` trees for `PowerTranz`/`powertranz`:
    zero matches in either repo. PowerTranz, if used at all, is invisible to
    fs-hono — presumably a processor Inkress itself uses downstream of the
    admin-sdk call, not something fs-hono talks to directly.
  - Response (payments/index.ts:146-152): `{ state:'ok', data:{ order:
    {uid,total,currency}, payment: <gateway-specific result> } }`, matching
    spec's `{order:{uid,total}, payment:{...}}` shape. `payment.frame_url` for
    Inkress (inkress.ts:140 → returned as `url` from the gateway, assigned into
    `paymentResult` and spread into `data.payment`), Stripe returns a
    `client_secret`-shaped result, PayPal/WiPay return `approve_url`-shaped
    redirects — matches spec's `frame_url | client_secret | approve_url` union.
- **CONFIRMED LIVE BUG — money units (spec §3.3), exact mechanism:**
  Written up already by this team in
  `/Users/romario/projects/fleeksite/theme-catalogue/PAYMENTS-BUG.md` and
  `/Users/romario/projects/fleeksite/theme-catalogue/CHECKOUT-TODO.md:10-14`.
  `orders.total` (and everything computed from `variants.price`) is major
  units end to end (PAYMENTS-BUG.md:8-18, with live examples: `orders.total =
  203` for a real $203 PayPal order on site 178). But every gateway adapter's
  own type signature declares the incoming `amount` is **cents**:
  - Stripe (`lib/payments/stripe.ts:21`): `amount: number // cents`, passed
    straight through to `paymentIntents.create` (stripe.ts:29) — a $203 order
    would be charged **$2.03**.
  - PayPal (`lib/payments/paypal.ts:39,61`): `amount: number // cents` →
    `value: (params.amount / 100).toFixed(2)` — same **$2.03** outcome.
  - WiPay (`lib/payments/wipay.ts:14,33`): `amount: number // cents` →
    `formData.append('total', (params.amount / 100).toFixed(2))` — same bug.
  - Inkress is the odd one out: `InkressGateway.createCheckoutSession` itself
    expects **major units** correctly (inkress.ts:102 comment: "Inkress uses
    major units, not cents" — the SDK call at inkress.ts:120 passes
    `total: params.amount` with no conversion). But the *route* pre-converts
    before calling it: `payments/index.ts:126-129`:
    ```
    amount: typeof amount === 'number' && amount > 100
      ? amount / 100   // legacy callers may pass cents; convert
      : amount,
    ```
    This is strictly worse than doing nothing: orders **under $100 charge
    correctly**, orders **at or above $100 are silently divided by 100**
    (PAYMENTS-BUG.md:27-31 calls this "worse than wrong, it is inconsistent
    ... the shape of bug that survives testing because the test order is cheap").
  - Team's own conclusion (PAYMENTS-BUG.md:48-54): flagged, not fixed, because
    it is "a live-money decision on a deployed service" with two non-equivalent
    fixes (make adapters expect major units, vs. make CheckoutService emit
    minor units). **For the Inkress SDK this means: do not port any of the
    four adapters' unit-handling as reference behaviour** — the SDK's own
    contract with Inkress commerce-api (which already takes major units, per
    Inkress's own convention elsewhere in this codebase) is the correct one;
    treat `orders.total`/quote `total`/`subtotal`/`discount` as major units
    throughout, unconditionally, with no `>100` heuristics.

## 5. Who am I — `GET /auth/me`

**Backed by: local-DB only.**

- Route: `fs-hono-discounts/src/routes/auth/session.ts:251-254`, mounted at
  `/auth` (`app.ts:121`, also duplicated at `/api/v1/auth` via `app.ts:125` —
  both `app.route('/auth', authRoutes)` and `app.route('/api/v1/auth',
  authRoutes)` mount the *same* `authRoutes` object, so `GET /api/v1/auth/me`
  also works; the kit only calls the bare `/auth/me` path, fk-cart.js:831).
- `requireAuth(c)` (session.ts:252) → 401 `HTTPException` for guests, matches
  spec.
- Response: `apiOk(c, { user: formatUserResponse(user) })` →
  `{ state:'ok', data:{ user: {...} } }`. `formatUserResponse`
  (session.ts:621-641) reads straight off the local `siteUsers` Drizzle row:
  `uid, email, name, firstName, lastName, phone, address, city, region,
  postalCode, country, photo, role, status, verifiedAt, createdAt` — a
  superset of the spec's documented field list (spec omits `uid`, `photo`,
  `role`, `status`, `verifiedAt`, `createdAt`, but they're all there and
  useful for the SDK's customer-profile type).

## 6. Login incl. email-code — `POST /auth/login`, `/auth/login/code` → `/auth/login/verify`

**Backed by: local-DB only** (password hashing/verification + JWT signing are
in-process; no Inkress or other external call in any of these three routes).

- All three routes live in `fs-hono-discounts/src/routes/auth/session.ts`,
  mounted the same way as `/auth/me` above. **`/auth/login/code` and
  `/auth/login/verify` exist ONLY in the `fs-hono-discounts` worktree** —
  confirmed absent from `fs-hono/src/routes/auth/session.ts` via `diff`
  (fs-hono-discounts adds an `otp.service.js` import and ~90 new lines vs.
  fs-hono's copy of the same file).
- `POST /auth/login` (session.ts:37-88): rate-limited 20/min per IP
  (`auth:login` key). Body `{ email, password }` (or nested `{ session: {
  email, password } }` — Elixir-compat shape, session.ts:44-46). Looks up
  `siteUsers` by `(email, site.id)` (Drizzle), verifies the password hash
  (`lib/auth/password.ts`), rejects disabled accounts (`status === 0` → 403).
  On success: signs a JWT (`generateToken`, `lib/auth/jwt.js`), sets an
  httpOnly `current_user` cookie (7-day maxAge, session.ts:77-83), and
  returns `{state:'ok', data:{text:'Welcome!', token}}` with **HTTP 201**
  (not 200 — session.ts:86).
- `POST /auth/login/code` (session.ts, ~161-193 in the discounts worktree):
  rate-limited 5/min (`auth:login-code`). Body `{ email }`. Looks up the user
  but **always returns the same 201 message regardless of whether the account
  exists** ("If there is an account for that address, a sign-in code is on
  its way.") — deliberately not confirming account existence (comment: "this
  route must not say who has an account here"). Only if a real, enabled user
  is found does it call `issueCode(site.id, email, {ip, userAgent})`
  (`services/otp.service.js`) and email it via `sendLoginEmail`
  (`lib/email/service.js`). Code generation/storage
  (`otp.service.js` — `issueCode`/`checkCode`/`markUsed`/`recordAttempt`) is
  local DB, consistent with spec's "six digits, ten minutes, one use, five
  guesses" (route wiring — `recordAttempt` on wrong guess, `markUsed` on
  success — matches; internals of `otp.service.js` not independently opened).
- `POST /auth/login/verify` (fs-hono-discounts session.ts, immediately after
  `/login/code`): rate-limited 10/min (`auth:login-verify`). Body `{ email,
  code }`. Loads the latest code row (`latestCode`), checks it
  (`checkCode`); a wrong guess costs one of the five attempts
  (`recordAttempt`, only on `OtpRefusal.Wrong`); expired/used/wrong → 401.
  On success: same JWT + cookie issuance as `/auth/login`, returns
  `{state:'ok', data:{text:'Welcome!', token}}`, **201**.
- **Client contract is generic, not per-endpoint** — worth carrying into the
  SDK design: `fk-cart.js`'s `auth(form)` function (fk-cart.js:695-763) does
  not hardcode any of these paths. It POSTs JSON-serialized `FormData` to
  whatever the `<form action="...">` HTML attribute says (fk-cart.js:720),
  and branches purely on the response envelope's `state`/`data.text`. A
  `data-fk-auth-stay` form (used for "email me a code" / "email me a reset
  link") stays on the same page and can hand off to a *second* panel via
  `data-fk-auth-then` (fk-cart.js:733-750) — this is how the code-request
  form flows into the code-verify form in the same theme markup. So
  `/auth/login`, `/auth/login/code`, `/auth/login/verify`, `/auth/signup`,
  `/auth/reset-password`, `/auth/reset-password/confirm` are all driven by
  ONE client function keyed off which URL the theme's `<form>` markup points
  at — the SDK does not strictly need distinct client methods per auth flow,
  just a consistent envelope contract across all of them (confirmed: every
  one of these routes in session.ts returns the same `{state,
  data:{text|message}}` shape).
- Not in the numbered scope but same file/pattern, confirmed present: `POST
  /auth/signup` (session.ts:90-149), `POST /auth/logout` (session.ts:244-248,
  clears both `current_user` and `fs_session` cookies), `POST /auth/verify`
  (session.ts:259-286, *sends* a verification email — distinct from
  `/auth/login/verify` which *checks* a code; naming collision risk worth
  flagging for the SDK's method names), reset-password pair (present per
  route list at session.ts:167-243 region, not individually re-read). All
  local-DB only.

## 7. Leads — `POST /api/v1/leads`

**Backed by: local-DB only.**

- Route: `fs-hono-discounts/src/routes/api/v1/leads.ts:111-249`, mounted at
  `/api/v1/leads` (`api/v1/index.ts:37`). Byte-identical file in `fs-hono`
  (confirmed via `diff -q`, no divergence).
- Public — no `requireAuth` on the POST path (only `requireSite`, plus an
  *optional* signed-in identity read off context, leads.ts:112-114). Supports
  both create and, when `body.uid` names an existing lead the caller owns, an
  update-in-place (leads.ts:117-136).
- Body fields actually read (leads.ts:139-225): `source` (or referer-header
  fallback), `user`/top-level `email|name|first_name|last_name|phone` (used
  to find-or-create a `siteUsers` row — this is how a guest's contact info
  becomes an account-less-but-identified lead), `title`, `body`, `tags`
  (CSV string or array), `data` (free-form, merged with `item_id`, `site_id`,
  `user_id`) — matches the spec's `{ name, email, phone, body, data }` though
  the identity fields (`name/email/phone`) go toward resolving/creating the
  `siteUsers` row rather than being stored as top-level lead columns.
  Also supports `post_create: true` + `post: {...}` to promote a lead
  submission into a content post in the same request (leads.ts:245,
  `maybeCreatePostFromLead`, leads.ts:259-292) — an extra capability beyond
  the spec's summary, used by UGC-style forms.
- Spam scoring is done locally (`evaluateLeadSpam`, `lib/leads/spam.ts`) and
  stored on the row (`data._spam`, leads.ts:211,218); a `label === 'spam'`
  lead skips webhook dispatch and notifications (leads.ts:228) but is still
  saved and still returns success — matches spec's "degrades to a normal
  form post" framing (the caller never sees a rejection). Post-creation:
  webhook dispatch (`dispatchLeadWebhook`), notification
  (`NotificationService.leadReceived`), and site-plugin hooks
  (`runLeadReceived`) all fire-and-forget (leads.ts:229-236) — none can fail
  the response.
- **Response state is `'success'`, not `'ok'`**: `apiSuccess(c, {item, text})`
  (leads.ts:248) → `{ state:'success', data:{ item, text:'Your lead has been
  submitted' } }`. This is a real discrepancy from the spec's stated envelope
  (`state: 'ok' | 'error' | 'info'`, STOREFRONT-SDK-REQUIREMENTS.md:110) — a
  fourth literal state value, `'success'`, is in active use here (the
  `apiSuccess` helper's own doc-comment at `utils/api-response.ts:24` says
  "used by lead, session"). **The SDK's envelope type should treat
  `'success'` as a fourth valid state**, at least for this endpoint, rather
  than assuming the spec's three-value union is exhaustive.

## 8. Live search — `GET /search.json?q=`

**Backed by: local-DB only. Confirmed: served as a Liquid template, not a
platform route.**

- File: `/Users/romario/projects/fleeksite/theme-catalogue/pipeline/kit/pages/search.json.liquid`
  (lines 1-46). Its own header comment (lines 1-13) states it is "a template
  served as an endpoint (post type 10)" and explains why products come from
  the `variants` collection rather than `posts`.
- Query: `{% collection variants, fk_pv, q: {{ fk_q }}, limit: 10, distinct:
  post_id %}` for products (search.json.liquid:20) and `{% collection
  blogs&questions&pictures, fk_pg, q: {{ fk_q }}, limit: 6 %}` for the
  `pages` array (search.json.liquid:36) — both go through the same
  `{% collection %}` tag used by render-time grids (see below), i.e. straight
  to the local FleekSite Postgres DB via Drizzle. There is no separate
  "search service" — `/search.json` is just another Liquid page whose output
  happens to be JSON.
- Response shape actually emitted (search.json.liquid:16-46): `{ query,
  products:[{title,url,image,price,label,available}],
  pages:[{title,url,kind}] }` — matches the spec's documented
  `{products:[{title,url,image,price,label,available}], pages:[...]}` almost
  exactly; spec omits the top-level `query` echo and doesn't spell out that
  `pages[]` items are `{title,url,kind}` (spec just says `pages: [...]`).
  `available` is computed inline as `v.unlimited or v.stock > 0`
  (search.json.liquid:29) — the unlimited/stock rule from spec §3
  non-negotiable #4 is applied here too.
- **"Post type 10" claim: partially confirmed, exact enum name
  UNCONFIRMED.** The general page-serving pipeline sets the HTTP
  `Content-Type` from `resolved.data.mimeType || 'text/html'`
  (`fs-hono-discounts/src/routes/site/pages.ts:460-461`) — i.e. any `.liquid`
  file can serve non-HTML content if its stored `mimeType` says so, which is
  the actual mechanism that lets `search.json.liquid` answer as JSON.
  However, cross-referencing "post type 10" against the content-type enum in
  `fs-hono-discounts/src/config/constants.ts:14` shows `LOCATION: 10` — a
  *content* post type (for location/store-listing posts), not an
  "endpoint/JSON" type. `/search.json` is registered as a **template** (a
  separate `templates` table with its own `type` integer column at
  `fs-hono-discounts/src/db/schema/cms.ts:229-239`, distinct from the
  content `posts.type` enum), so the comment's "post type 10" most likely
  refers to a template-type numbering the `templates` table uses — I did not
  find the specific named constant for template-type-10 in the time budgeted
  for this (grepped `lib/pipeline/*.ts` for a template-type-10 constant, no
  hits). UNCONFIRMED: exact numeric meaning of "10" in that comment.
  CONFIRMED: the serve-as-JSON-via-Liquid-template mechanism itself, which is
  what actually matters for SDK scope (no platform-level "search route"
  exists to port — it's theme content, and a theme could add more of these).
- Client call: `fk.js:462` — `fetch('/search.json?q=' + encodeURIComponent(q),
  {signal, headers:{Accept:'application/json'}})`, wired to `data-fk-search*`
  hooks (fk.js, search section, own comment at ~line 348: "the theme's own
  endpoint").

## Render-time `{% collection %}` tag (brief)

**Confirmed: queries the local FleekSite Postgres DB via Drizzle — no
external calls.**

- Implementation: `fs-hono-discounts/src/lib/liquid/tags/collection.ts` — a
  custom LiquidJS `Tag` (collection.ts:1-25) that imports `db` from
  `../../../db/connection.js` and the Drizzle table objects (`posts`,
  `variants`, `orders`, `leads`, `siteUsers`, etc., collection.ts:13-18)
  directly; `case 'variants': return queryVariants(...)`
  (collection.ts:334-335) dispatches into
  `fs-hono-discounts/src/lib/liquid/search/variants.ts`.
- `distinct: post_id` → one row per product, confirmed at
  `lib/liquid/search/variants.ts:144-183`: `distinctById` (true when
  `params.distinct` is `'id'` or `'post_id'`) drives a
  `db.selectDistinctOn([...])` query that **inner-joins `variants` to
  `posts`** (`.innerJoin(posts, eq(variants.postId, posts.id))`,
  variants.ts:169,177) and exposes the joined product as `row.p`, flattened
  onto the result as `.post` (variants.ts:183: `flat.post =
  snakeCaseKeys(row.p...)`) — this is the `v.post` templates read. The file's
  own header comment (variants.ts:11-12) states the intent directly:
  "Inner-joins variants → posts, so the variant's backing product is loaded
  alongside (templates bind `p = v.post`)."
- URL query params merge onto collection params with a denylist and a
  100-item page-size clamp: `mergeUrlQueryParams` (collection.ts:45-60,
  `MAX_URL_PAGE_SIZE = 100` at collection.ts:37), matching the spec's §1
  description exactly.

## DONE
