# commerce-web — Checkout & Payment-Link Map

> READ-ONLY investigation for the SDK-convergence ecommerce structure map.
> Repo: `/Users/romario/projects/inkress/commerce-web` — branch `version/4.1-beta`
> (confirmed `git rev-parse`; HEAD `3339c41 Merge: checkout theme guard + amount-only support`).
> Framework: Remix (RR7/Vite), routes flat in `app/routes/`.
> Status: COMPLETE — checkout, payment-link, cart/options, order-create, and variant
> implications all mapped (see `## DONE` at end).

---

## 0. TL;DR / how this repo talks to the API

- **Vendored client, NOT the storefront SDK.** All API calls go through a hand-written
  client at `app/interfaces/server/*` (class `InkressAPI` / `InkressAdminAPI`), reached via
  `app/inkress.server.ts` (`inkress.unauthenticated(request, opts)` /
  `inkress.authenticate(request, opts)`). There is **no `@inkress/storefront-sdk` import
  anywhere in checkout/payment-link routes** (confirmed by grep — see §6).
- The admin client is a registry of REST modules (`app/interfaces/server/admin.ts:40`):
  `admin.order`, `admin.paymentLink`, `admin.merchant`, `admin.rest`, `admin.product`, etc.
  Each module extends `RestModule` → `BaseModule.makeRequest` (`app/interfaces/server/base.ts:42`),
  which does `fetch(`${API_BASE}/${endpoint}?${query}`)` with `Authorization: Bearer <token>`
  and (when set) `Client-Id: <clientId>` headers. `API_BASE` = `process.env.API_BASE`.
- **Two API identities used in checkout:**
  1. `inkress.unauthenticated(request)` — no client-id, uses the buyer's JWT if present
     (usually none). Used to read the payment-link invoice.
  2. `inkress.unauthenticated(request, { clientId: 'm-<username>', accessToken: INKRESS_MARKETPLACE_API_KEY })`
     — the marketplace service key, scoped to a merchant via `Client-Id: m-<username>`.
     Used to read the full merchant record, fees, and merchant tokens.
- **Order create uses the merchant's own public key**, not the marketplace key:
  `admin.order.setToken(token)` where `token = merchant.getMerchantTokens(username).data[0].public_key`
  (`checkouts.$id.tsx:231-234`).

---

## 1. Checkout pages — route-by-route

Three routes make up the Shopify-style hosted checkout. The path token `:id` is the
**payment-link UID** (same token used by `/payments/link/:id/...`).

### 1a. `GET/POST /checkouts/:id` — `app/routes/checkouts.$id.tsx` (647 lines)

The main Shopify-style checkout page. `:id` = payment-link token.

**loader** (`checkouts.$id.tsx:79-156`):
1. `admin.paymentLink.invoice(id)` (unauth) → `POST payments/link/:id`
   (`interfaces/server/payment_link.ts:6-8`). Returns `{ data: { id, order, customer, merchant } }`.
2. Guards: no `order.id` → error; `order.status == 3` → `redirect(/payments/link/:id/status)`
   (status 3 = paid/settled); `COMPLETED_STATUSES = [5,6,7,8,9,10,11,13,14]` → "already complete"
   (`checkouts.$id.tsx:41,87,94`).
3. `enforcePaymentRateLimit(request, 'merchant:<username>', {email,name})`
   (`lib/payment-rate-limit.server.ts`) — the checkout GET is rate-limited (memory note: 15/15min
   per IP+merchant).
4. Re-fetches the **full merchant record** with the marketplace key:
   `mk.merchant.list({ username }).then(r => r.result.entries[0])` (`checkouts.$id.tsx:105-109`) —
   for `data.shipping_locations`, `data.pickup_locations`, `data.checkout_fields`, brand, currency.
5. `currency` = `order.currency` (string or `{code}`) || `merchantData.default_currency` || `'JMD'`.
6. Line items via `toSummaryLines(order)` (`checkouts.$id.tsx:60-77`): reads
   `order.lines || order.items || order.line_items`; per line uses
   `product_variant_total_frozen` (frozen line total) else `price|amount * quantity`; name from
   `product_variant_name_frozen`; **`variant` display string = `Object.values(l.properties).join(' · ')`**.
7. `subtotal` = `order.transactions[0].sub_total ?? order.total` (`checkouts.$id.tsx:114-115`).
8. Display processing fee: `mk.rest._get('/public/m/:username/fees', {currency_code, total: subtotal, fulfillment_total: 0})`
   → `calculateFeesForDisplay(fees).processing` (`checkouts.$id.tsx:118-127`). Display-only.
9. Returns brand (name/logo/theme/id), currency, lines, subtotal, baseFee, shippingLocations,
   pickupLocations, checkoutFields, prefill (customer), and env config
   (`cardIframeOrigin` default `https://cards-staging.ixels.io`, `riskEdgeUrl`, `turnstileSiteKey`,
   `inkPayEnabled`, `walletsEnabled`) (`checkouts.$id.tsx:129-155`).

**action** (`checkouts.$id.tsx:158-249`) — creates the order:
1. Re-reads invoice (unauth) to get authoritative `order`, `username`, `paymentLinkId`
   (never trusts the client for these) (`checkouts.$id.tsx:163-168`).
2. Re-fetches merchant (marketplace key) for `merchantData` (shipping zones, checkout fields).
3. **Rebuilds `products` from the invoice, NOT from the client**:
   `rawLines.map(l => ({ id: Number(l.product_id ?? l.id), quantity: Number(l.quantity||1) }))`
   (`checkouts.$id.tsx:174-177`). Note: **`properties` are NOT carried into order-create here** —
   only `{id, quantity}`. (Contrast with `order-args.ts` `OrderProduct` which allows `properties?`.)
4. Reads buyer contact + fulfillment + address + pickup + note from `formData`
   (`checkouts.$id.tsx:183-201`). Apartment folded into street line (`street, apartment`).
5. `validateCheckout(...)` server-side (`lib/checkout/validation.ts`); 422 with `fieldErrors` on fail.
6. `buildOrderArgs({...}, shipping_locations)` (`lib/checkout/order-args.ts:36`) → flat dot-keyed args.
7. Allow-list filter: drops any key not in `ORDER_ALLOWED_ARGS` (`order-args.ts:80`), then adds
   `meta_data.order_source = 'checkouts'` (`checkouts.$id.tsx:228-229`).
8. `token = admin.merchant.getMerchantTokens(username).data[0].public_key`;
   `admin.order.setTimeout(30000); admin.order.setToken(token)` (`checkouts.$id.tsx:231-234`).
9. `admin.order.create(args)` → `POST orders` as the merchant (`interfaces/server/rest.ts:42` →
   `base.ts:42`). Returns `{ state, result: { id, payment_urls: { short_link, payment_url } } }`.
10. On `state=='ok'`: returns `{ link: short_link, payment_url, orderId }` (`checkouts.$id.tsx:238-244`).
    Else 422 with the error string.

**render** (`checkouts.$id.tsx:255-628`): Shopify-clone single-page checkout.
- Client state: contact, fulfillment (`'delivery'|'pickup'|''`), address, pickupLocation, note.
- **Amount-only support:** if merchant has no shipping zones AND no pickup locations,
  `requiresFulfillment=false` → Delivery/Shipping sections hidden, no address required
  (`checkouts.$id.tsx:303-304,504`).
- Live shipping via `resolveShipping(address, shippingLocations)` (`lib/checkout/shipping-zones.ts:85`)
  → cost/available/pending; total = `subtotal + shipping + fee` (`checkouts.$id.tsx:342`).
- Fee refresh: `feesFetcher.load('/checkouts/:id/fees?...')` whenever shipping changes
  (`checkouts.$id.tsx:345-356`).
- **Payment is a two-step "order-first" flow:** the Pay button calls `submit()` → `fetcher.submit(fd)`
  (the action above) to CREATE the order; on success the returned `payment_url`/`link` is inspected:
  if it ends with `/fac`, the token is extracted and `payToken` is set, which mounts
  `<PayWithCardElements>` **in-page** pointed at `/payments/link/:token/card/embed`
  (`checkouts.$id.tsx:359-390, 549-572`). Otherwise `window.location.href = redirectUrl` (hosted
  redirect). So the card is entered only AFTER the order exists.
- `<RiskCheckoutGate>` wraps the card form (commerce-risk edge decision + Turnstile) and passes a
  `riskRef` into `<PayWithCardElements>` (`checkouts.$id.tsx:551-572`).

### 1b. `GET /checkouts/:id/fees` — `app/routes/checkouts.$id.fees.tsx` (40 lines)

Display-fee recompute resource route (no UI). Query: `username, currency, total, fulfillment_total`.
- Marketplace-key client → `admin.rest._get('/public/m/:username/fees', {currency_code, fulfillment_total, total})`
  → `calculateFeesForDisplay(fees)` → returns `{processing, tax, shipping, discount, subtotal, total}`
  (`checkouts.$id.fees.tsx:14-39`). Comment: "Display only — the authoritative charge amount is the
  server-signed checkout-intent."

### 1c. `GET /checkouts/:id/address` — `app/routes/checkouts.$id.address.tsx` (83 lines)

Google Places autocomplete proxy (keeps `GOOGLE_API_KEY` server-side). Two modes:
- `?q=&countries=&session=` → predictions `[{placeId, main, secondary}]`.
- `?place_id=&session=` → `{ address: {street, apartment?, city, state, postalCode, country} }`.
Per-IP token bucket 40 req / 10s (`checkouts.$id.address.tsx:16-26`). No order/payment logic.

---

## 2. Client pricing (`app/lib/utils/product-pricing.ts`, 125 lines)

Shopify-style **compare-at** helper only — it does NOT compute option/variant deltas.
- `calculatePricing({regularPrice, salePrice})` → `{price, compareAtPrice?, isOnSale, discountPercentage?, savingsAmount?}`
  (`product-pricing.ts:53-83`). Sale price = `product.data.discounted_price`.
- `normalizeProductPricing(product)` maps `product.price` (regular) + `product.data.discounted_price`
  (sale) (`product-pricing.ts:117-125`).
- `formatPrice`, `getDiscountBadge` are display helpers.
- **There is NO `computeUnitPrice` / `getOptionPrice` / option-delta logic in this file.** Checkout
  itself does not compute unit price from options — it reads frozen line totals from the invoice
  (`product_variant_total_frozen`, `checkouts.$id.tsx:64`). Option-delta pricing (if any) is computed
  elsewhere (product/cart pages) — investigated in §4.

---

## 3. Order-create payload shape (the `/checkouts/:id` action)

Built by `buildOrderArgs` (`lib/checkout/order-args.ts:36-77`), a **flat dot-keyed object**
(NOT nested JSON) posted to `POST orders` as the merchant. Exact keys:

```
reference_id            : randomId()
kind                    : 'online'
currency_code           : 'JMD' | 'USD' | ...
customer.first_name     : string
customer.last_name      : string
customer.email          : string
customer.phone          : string        (only if provided)
products                : [{ id: number, quantity: number }]   // from INVOICE lines, no properties
total                   : number         (subtotal hint; server recomputes)
payment_link_id         : number|string  (reuses the /checkouts/:id token's link)
data.note               : string         (if provided)
// delivery only:
data.fulfillment_type   : 'delivery'
data.shipping_address.country / .state / .street
data.shipping_address.city   (non-JM)  OR  data.shipping_address.town   (JM: city→town remap)
data.shipping_address.postal_code   (if provided)
fulfillment_total       : number   (client recompute via calculateShippingCost)
data.fulfillment_total  : number
// pickup only:
data.fulfillment_type   : 'pickup'
data.pickup_location    : string
// added by route after allow-list filter:
meta_data.order_source  : 'checkouts'
```

Allow-list `ORDER_ALLOWED_ARGS` (`order-args.ts:80-89`) is applied before send; anything not listed
is deleted (`checkouts.$id.tsx:228`). Note `products` is the only structured (non-flattened) value.
`buildOrderArgs` recomputes `fulfillment_total` client-side via `calculateShippingCost`
(`shipping-zones.ts:58`) — but the comment and server both treat the server recompute as authoritative.

**`OrderProduct` interface (`order-args.ts:12-16`) DOES allow `properties?: Record<string,unknown>`**,
but the `/checkouts/:id` action only ever passes `{id, quantity}` (`checkouts.$id.tsx:176`). So on
this route, per-line `properties`/options are dropped at order-create — the order's line properties
come from whatever the payment-link invoice already froze.

---

## 4. Cart model + how options/`properties` are represented (client side)

There are **two cart surfaces** in this repo, both client-only (no server cart entity):

### 4a. Marketplace cart (`app/hooks/useCart.tsx`) — the one that carries options

- `CartItem` (`useCart.tsx:9-17`): `{ id, name, price, quantity, properties?, cartItemId?, [k]:any }`.
  `properties?: Record<string, string | File | CartPropertyValue>` where
  `CartPropertyValue = { value: string; price?: number }` (`useCart.tsx:3-6`).
- **Option add-on pricing lives here, not in `product-pricing.ts`:**
  `calculatePropertyAddOns(properties)` sums each property value's `.price`
  (`useCart.tsx:44-54`); `calculateTotal` = `Σ qty * (basePrice + addOnPrice)` (`useCart.tsx:56-62`).
- **A line's identity includes its options:** `generateCartItemId(id, properties)` =
  `${id}__${sortedProps}` (`useCart.tsx:65-83`) — the same product with different options is a
  distinct cart line. (This is the closest thing this repo has to a "variant".)
- Persisted to `localStorage` (CartProvider) — no server round-trip until checkout.

### 4b. Product page builds `properties` from `customer_inputs`
`app/routes/marketplace.$username.$permalink.tsx`

- A product's options are the **`customer_inputs`** array on `product.data`
  (`$permalink.tsx:181`, loaded via `productData?.customer_inputs`). Shape
  (`$permalink.tsx:75-79`): `{ name, type, price?, options?: { label: string; price: number }[] }`.
  `type === 'options'` renders a `<select>`; other types render inputs; an input/option can carry a
  `price` add-on (`$permalink.tsx:705-728`).
- `getOptionPrice(inputName, selectedValue)` (`$permalink.tsx:514-528`): looks up the chosen
  option's `price` (structured options) or the input's base `price`.
- `addToCart()` (`$permalink.tsx:532-565`) builds the `properties` object from the selected inputs:
  each key = input name; value = plain `string` when no add-on, or `{ value, price }` when
  `getOptionPrice > 0`. Then `addItem({ id, name, price: product.price, properties, ... })`.
- So on the client a "unit price" = `product.price + Σ selected option.price`. **`product.price`
  is the base; the per-option delta is `customer_inputs[].price` / `options[].price`.** There is no
  separate variant record or variant price — the option deltas are additive on top of the base
  product price.

### 4c. Legacy simple cart (`app/routes/merchants.$username.cart.tsx`, 341 lines)
- Uses `useCart` too, but its `submit()` maps items to **`{id, quantity}` only** — options/properties
  dropped (`merchants.$username.cart.tsx:106`). It calls a **client-side** SDK instance
  `inkressInstance.order.create({ title, kind, currency_code, reference_id, total, customer, products })`
  (`merchants.$username.cart.tsx:110-118`) via `useInkressInstance()` (client interface
  `app/interfaces/client/*`, not the server one, not the storefront SDK). This is an older path;
  the Size/Color `<dl>` in its markup is hard-coded placeholder text (`cart.tsx:208-218`).

---

## 5. Payment-link pages — route-by-route

Token `:id` = payment-link UID. All loaders start with `admin.paymentLink.invoice(id)`
(`POST payments/link/:id`) via the **unauth** client. Order `status==3` ⇒ paid.

| Route (`app/routes/`) | Role | Key server calls / redirects |
|---|---|---|
| `payments.link.$id._index.tsx` (244) | **Hub / router.** Invoice → if no order, redirect to `/merchants/:username/order?link_token=:id`; if paid → `/status`; if `provider_url` → external; if single "Inkress" method → `/hpp` (when `hpp_redirect`) else `/card`. Otherwise renders the method picker. | `paymentLink.invoice`, `paymentMethod.list`; **action**: `order.placeOrderMethod(orderId,{method_id})` as merchant token → returns `payment_urls.short_link` (`_index.tsx:110-134`) |
| `payments.link.$id.card._index.tsx` (245) | **Primary card flow** (standalone tokenize-then-charge). Renders order summary + `<PayWithCardElements>` inside `<RiskCheckoutGate>`. Money read from `transactions[0].customer_total`. | **action** branches on form: `intent_request`→`paymentLink.checkoutIntent(id,riskRef)`; `card_ref`→`paymentLink.chargeCard(id,cardRef,riskRef,browserInfo)`; `spi_token`→`paymentLink.complete3ds(id,spiToken,pre3ds)` (`card._index.tsx:63-98`) |
| `payments.link.$id.card.embed.tsx` (102) | **Iframe-embeddable** card form (same action contract as `/card`). Embedded by `/checkouts/:id` after order-create, and by the marketplace checkout. | same `checkoutIntent`/`chargeCard`/`complete3ds` branch (`card.embed.tsx:48-89`) |
| `payments.link.$id.fac._index.tsx` (234) | **Legacy FAC/PowerTranz HPP.** Loader now **hard-redirects to `/card`** (`fac._index.tsx:48`); the FAC-session code below the return is dead. Component (unreached) used `<FacRedirectLoader>` → `/fac/redirect-data`. | (dead) `paymentLink.session` |
| `payments.link.$id.fac.redirect-data.tsx` (43) | Resource route: creates FAC session **after** risk precheck so the risk `ref` threads in. | `paymentLink.session(id, riskRef)` → `{redirect_data, expires}` or `{declined}` |
| `payments.link.$id.fac.embed.tsx` (101) | Legacy FAC iframe variant. | `paymentLink.invoice` |
| `payments.link.$id.hpp._index.tsx` (86) | **FAC Hosted Payment Page entry** (opt-in `merchant.data.hpp_redirect`). Runs risk precheck then navigates top-level to `/hpp/start`. | `paymentLink.invoice` |
| `payments.link.$id.hpp.start.tsx` | Resource route: creates FAC session (+risk ref) and serves PowerTranz's auto-submit RedirectData form as the whole page. | `paymentLink.session(id, riskRef)` |
| `payments.link.$id.status.tsx` (291) | **Receipt / status poller.** Polls `POST /api/orders/status` every 5s (≤30×) until terminal; shows verifying/paid/failed; honors `redirect_url`/`meta_data.return_url` back to merchant. Amount = `transactions[0].customer_total`. | `paymentLink.invoice`, `paymentMethod.list`; client polls `/api/orders/status` |
| `payments.link.$id.track.tsx` | Post-purchase order tracking. | `paymentLink.invoice` |
| `payments.link.$id.lynk.tsx` (156) | Lynk (JM wallet) pay page. | `paymentLink.invoice` |
| `payments.link.$id.wipay.tsx` (48) | WiPay redirect: auto-POST form to `jm.wipayfinancial.com/plugins/payments/request`. | — |
| `payments.link.$id.ach._index.tsx` + `.ach.verification.tsx` | ACH bank flow. | `paymentLink.invoice` |
| `payments.link.$id.handover.tsx` (15) | Redirect shim: if `provider_url` → external, else `/payments/link/:id`. | `paymentLink.invoice` |
| `payments_.3ds-callback.tsx` (100) | **PowerTranz MerchantResponseUrl** (SPI 3DS). Parses PowerTranz's POST server-side, stores the auth result (`paymentLink.store3dsResult`, keyed by `spi_token`), then renders a tiny page that `postMessage`s the parent checkout to complete/redirect. Server-side settle (`SERVER_SIDE_SETTLE`) means the charge completes even if the tab closed. | `paymentLink.store3dsResult` |
| `payments.$slug.tsx` (76) | **Not a payment flow** — SEO marketing landing pages (`SEO_PAGES`), no order/API. | — |

**PowerTranz 3DS methods** (`app/interfaces/server/payment_link.ts`): `session` (FAC handoff),
`chargeCard` (tokenize-then-charge), `checkoutIntent` (server-signed amount), `complete3ds`
(settle after challenge), `store3dsResult` (persist SPI auth result). The client card component
that drives these is `app/components/payment/payWithCardElements.tsx` (posts `intent_request` →
`card_ref` → `spi_token` to the `/card` or `/card/embed` action; card PAN is captured in the CDE
iframe at `CARD_IFRAME_ORIGIN`, default `https://cards-staging.ixels.io`).

### The `/merchants/:username/order` order-create page — `merchants.$username.order.tsx` (429)
The **other** order-create entry (the payment-link hub falls back to it when a link has no order).
Loader dispatches on base64 query tokens (`decodeB64JSON`):
- `link_token` → `paymentLink.invoice` (existing link).
- `cart_token` → `fetchCartData`: decode `{products:[{id,quantity}], currency}`, fetch products by
  `id_in`, build display lines `product_variant_total_frozen = product.price * quantity`
  (`order.tsx:39-53`). **No option pricing** — plain `price * qty`.
- `order_token` → `fetchOrderData`: decode `{total, currency_code, title, reference_id, customer}`
  (an amount-only order, `order.tsx:68-97`).
- **action** (`order.tsx:180-282`): flattens form → `args`; splits `customer.name`; sets
  `reference_id/kind/currency_code`; if `cart_token`, `args.products = cart.products.map(p =>
  ({...p, quantity, id}))`; allow-list = `['reference_id','kind','total','currency_code',
  'customer.first_name','customer.last_name','customer.email','products','method_id']`
  (`order.tsx:244`); adds `payment_link_id`; `order.create(args)` as merchant token.

### Legacy `orders.payment.$token.tsx` (496) — status/poll page using the **client** SDK
(`inkressInstance.order.status`, `orders.payment.$token.tsx:106`). Older receipt page; not a
create path.

---

## 6. Vendored client vs storefront SDK (grep result)

- **No `@inkress/storefront-sdk` import in any route/lib/component.** The only occurrences are
  marketing/link text (`HyperFooter.tsx:38`, `SDKSection.tsx:24`) and a code-preview snippet
  (`CodePreview.tsx:26` shows `@inkress/admin-sdk` as a doc example). Confirmed via
  `grep -rn "@inkress|storefront-sdk"` (§0).
- **Server routes use the vendored `app/interfaces/server/*` client** (`InkressAdminAPI`) through
  `~/inkress.server`. **Client-only pages** (`merchants.$username.cart.tsx`, `orders.payment.$token`)
  use a second vendored client `app/interfaces/client/*` via `useInkressInstance()`
  (`app/hooks/useInkressInstance.tsx`).
- So this repo is the exact "vendored client" case the convergence plan wants to replace: two
  parallel hand-maintained clients, both hitting the same commerce-api REST surface
  (`orders`, `payments/link/:id`, `public/m/:username/...`).

---

## 7. End-to-end pipeline (cart/invoice → fees → discount → order-create → 3DS/payment)

Two live pipelines share the same tail (order-create → payment-link card flow):

### A. Hosted checkout `/checkouts/:id` (payment-link token already exists)
1. **Loader** reads the payment-link invoice (`paymentLink.invoice`) → order lines (frozen),
   subtotal (`transactions[0].sub_total`), merchant zones/fields
   (`checkouts.$id.tsx:79-156`).
2. **Fees (display)** `GET /checkouts/:id/fees` recomputes processing fee from
   `public/m/:username/fees` as shipping changes (`checkouts.$id.fees.tsx`).
3. **Discount:** none on this route (no discount box in `/checkouts/:id`; the discount resolver
   `/api/v1/public/m/:username/discount` referenced in memory is not wired into this page). Discount
   only surfaces downstream as `transactions[0].discount_total` on the card page's summary math
   (`card._index.tsx:123`).
4. **Order-create** (action): rebuild `products` from invoice `{id,quantity}`, `buildOrderArgs` →
   allow-list → `order.create` as merchant public_key (`checkouts.$id.tsx:214-236`). Returns
   `payment_urls.{short_link,payment_url}`.
5. **Payment (order-first):** if the returned URL ends `/fac`, extract the token and mount
   `<PayWithCardElements>` in-page → `/payments/link/:token/card/embed`; else `window.location` to
   the hosted URL (`checkouts.$id.tsx:359-390`).
6. **3DS:** card iframe (CDE) tokenizes PAN → `card_ref`; action `intent_request` →
   `checkoutIntent` (server-signed amount) → `chargeCard` (sale + forced 3DS) → challenge →
   `spi_token` → `complete3ds` settles; `payments_.3ds-callback` persists the SPI result
   server-side (`SERVER_SIDE_SETTLE`).
7. **Status:** poll `/api/orders/status` on `/payments/link/:token/status` until paid; redirect back
   to merchant `return_url` if set.

### B. Marketplace store `/marketplace/:username/...` (client cart → order)
1. Browse product (`$permalink`) → `addToCart` builds `properties` from `customer_inputs`
   (with `{value,price}` deltas) → `useCart` (localStorage), option-aware totals.
2. Checkout (`marketplace.$username.checkout._index.tsx`) collects contact + fulfillment; computes
   `fulfillment_total` via `calculateShipping` (JM city→town remap).
3. **Order-create** (action): `cart_items` JSON → `products:[{id,quantity,properties?}]`
   (`checkout._index.tsx:331-337`); allow-list (incl. analytics `meta_data.*`); `order.create` as
   merchant token; `meta_data.order_source='marketplace'`.
4. Tail identical to A.5–A.7 (payment-link card flow / 3DS / status).

---

## 8. Exact order-create payloads the client sends

Three creators post to `POST orders` (all flat dot-keyed; `products` is the only array):

**(i) `/checkouts/:id` action** (`buildOrderArgs`, §3) — `products:[{id,quantity}]` **without**
`properties`. Adds `meta_data.order_source='checkouts'`, `payment_link_id`.

**(ii) marketplace checkout** (`marketplace.$username.checkout._index.tsx:322-438`):
```
reference_id, kind:'online', total, currency_code,
customer.first_name/last_name/email/phone,
products: [{ id, quantity, properties? }],        // ← options carried as `properties`
method_id?, fulfillment_total,
data.fulfillment_type, data.fulfillment_total, data.pickup_location,
data.shipping_address.{street,town|city,postal_code,country,state}, data.note,
meta_data.analytics.*  (visitorId, browser, os, utm…),
payment_link_id?, meta_data.order_source:'marketplace'
```

**(iii) `/merchants/:username/order` action** (`merchants.$username.order.tsx:190-255`):
```
reference_id, kind:'online', total, currency_code,
customer.first_name/last_name/email, products:[{id,quantity,...spread}], method_id, payment_link_id?
```

The **`products` line shape** across the repo: `{ id: number, quantity: number, properties?:
Record<string, string | {value,price}> }`. `properties` is a free-form label→value map (option name →
chosen value, optionally with an add-on `price`), NOT a variant id. The **server freezes** the line
at create time into `product_variant_name_frozen` / `product_variant_total_frozen`, which is what
every summary reads back (`checkouts.$id.tsx:64`, `card._index.tsx:152`).

---

## 9. IMPLICATIONS FOR VARIANTS / FLEEKSITE

What the commerce-web frontend assumes today:

1. **No `variant_id` anywhere.** Grep finds zero `variant_id` in order-create. A product is
   identified purely by its **product `id`**; per-line differentiation is carried in the free-form
   **`properties`** map (option label → value / `{value, price}`). The only "variant" notion is
   `generateCartItemId` hashing properties to keep distinct cart lines (`useCart.tsx:65`).
2. **Pricing is base + additive option deltas, client-computed.** Unit price =
   `product.price + Σ customer_inputs[].(options[].price | price)` (`$permalink.tsx:514-565`,
   `useCart.tsx:44-62`). There is no variant price lookup; the server recomputes/freezes the line
   total (`product_variant_total_frozen`).
3. **The wire already speaks "variant" one-directionally.** The server returns frozen fields named
   `product_variant_name_frozen` / `product_variant_total_frozen`, but the client never *sends* a
   variant id — it sends `{id, quantity, properties}` and lets the server freeze.

If `variant_id` becomes a real Inkress product id (variant-as-product):
- **Minimal-change path (properties stay):** keep sending `{id, quantity, properties}` but set `id`
  to the resolved variant's product id and keep `properties` for display. `buildOrderArgs`
  (`order-args.ts`) and the marketplace action already accept `properties`; the **only gap on the
  `/checkouts/:id` action is that it strips `properties`** (rebuilds `products` as `{id,quantity}`
  from the invoice, `checkouts.$id.tsx:176`) — that line would need to pass variant id/properties
  through. `ORDER_ALLOWED_ARGS` (`order-args.ts:80`) has no `products.*` sub-keys to change since
  `products` is sent as a nested array, not flattened.
- **Client option→variant resolution is the real work.** Today `getOptionPrice` +
  `addToCart` compute an additive price and never resolve a variant. To map selected options to a
  variant id you'd add a resolver on `$permalink` (options → variant id + variant price) and change
  `addItem` to store `variantId` (and use it as the cart-line identity instead of the properties
  hash). `useCart.calculateTotal` would switch from `base+addOns` to the variant's own price.
- **What does NOT need to change:** the payment-link/3DS tail (`/payments/link/:id/card*`, FAC/HPP,
  status) is entirely product-agnostic — it operates on the created order's `transactions[0]`
  totals and the payment-link token, so variant support never touches the money path. The frozen
  summary fields (`product_variant_*_frozen`) are already variant-shaped for display.
- **FleekSite convergence note:** because this repo has **two vendored clients** and **no storefront
  SDK**, moving order-create onto `sdk.checkout` means the SDK's `products` line type must support
  BOTH the current `{id, quantity, properties?}` (option-map) shape AND a future
  `{variant_id, quantity}` shape, or a resolver that turns option selections into a variant id
  before the SDK call. The `/checkouts/:id` action's `properties`-stripping is the one concrete bug
  to fix if options must survive to the order on the hosted checkout.

---

## Sources (file:line anchors)
- Checkout: `app/routes/checkouts.$id.tsx`, `.fees.tsx`, `.address.tsx`
- Checkout lib: `app/lib/checkout/order-args.ts`, `types.ts`, `shipping-zones.ts`, `money.ts`, `validation.ts`
- Client pricing: `app/lib/utils/product-pricing.ts`; options: `app/routes/marketplace.$username.$permalink.tsx`, `app/hooks/useCart.tsx`
- Vendored client: `app/inkress.server.ts`, `app/interfaces/server/{index,admin,rest,base,order,payment_link,merchant}.ts`, `app/interfaces/client/order.ts`
- Payment-link: `app/routes/payments.link.$id.*.tsx`, `app/routes/payments_.3ds-callback.tsx`
- Order-create (marketplace): `app/routes/marketplace.$username.checkout._index.tsx`; (order page): `app/routes/merchants.$username.order.tsx`, `merchants.$username.cart.tsx`

## DONE

