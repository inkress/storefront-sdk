# fk.js / fk-cart.js → @inkress/storefront-sdk parity checklist

What the storefront SDK must cover to fully port the FleekSite kit (`pipeline/kit/core/fk.js`
+ `fk-cart.js`, 1,384 lines), item by item, with current SDK status. Grounded in the kit source
(read 2026-09-21) + STOREFRONT-SDK-REQUIREMENTS.md + the fs-hono runtime map.

Legend: ✅ SDK covers it · ⚠️ partial / different contract (needs rework) · ❌ not in the SDK

**Headline: the kit's run-time is essentially unported.** Phase ① built the *commerce-web checkout*
money-path (`/checkouts/:id` contract), which is a **different surface** from the kit's run-time. Almost
nothing below is reusable as-is. The port is Phase ③ (catalogue) + Phase ④ (kit), not started.

---

## 0. The gate — variant entity ❌
The **entire kit is variant-keyed**: every cart line, discount quote, stock check and checkout line is
`variant_id`. Inkress has no working variant entity (dead scaffold); "variant_id" == product id today.
Until the **variant-model fork** resolves (your call), §1–§2 below can't be built on a real SKU model.
Everything else is downstream of this.

## 1. Run-time endpoints (the kit's `fetch` surface)
The kit calls **fs-hono's own routes, same-origin, cookie-auth** — all local-DB today (not Inkress). Porting
= either the SDK covers these contracts *and* fs-hono delegates to Inkress server-side, or Inkress backs them.

| fk call | Method · path | Request | Response (`{state,data}`) | SDK today | Status |
|---|---|---|---|---|---|
| Cart sync / flush | POST `/api/v1/cart` | `{info:{items:[{variant_id,post_id,price,quantity,total,title}],currency}}` (401 for guests) | opaque store | SDK hits `/carts` (Inkress) with a different `{product_id,variant_id,unit_price}` shape | ❌ diff endpoint+shape |
| Discount quote | POST `/api/v1/discounts/quote` | `{code, items:[{variant_id,quantity}]}` | `{data:{code,label,kind,subtotal,discount,total}}` | `validateDiscount` → `/public/m/:username/discount`, `{code,currency_code,total,products:[{id,cost}]}` | ⚠️ diff contract (concept portable) |
| Bulk stock check | POST `/api/v1/variants/check_stock` | `{variant_ids:[]}` | `{data:{items:[{id,stock,unlimited}]}}` | `products.checkStock(productId)` re-fetches ONE product | ❌ no bulk/variant |
| Place order | POST `/payments/checkout` | `{email,phone,paymentMethod,notes,items:[{variant_id,quantity}],discountCode,shippingAddress,billingAddress}` | `{data:{order,payment:{frame_url\|redirect_url\|approve_url\|url,success}}}` | fs-hono's own multi-gateway dispatcher; SDK has `createOrder` (`/orders`) + `createSession` — different flow | ❌ diff contract |
| Prefill | GET `/auth/me` | — | `{data:{user:{firstName,lastName,email,mobile,address,city,region,postalCode,country}}}` | `getProfile(id)` + `validateToken()→bool`; no `/auth/me` | ❌ missing |
| Sign out | POST `/auth/logout` | — | — | `auth.logout()` → `/auth/logout` | ✅ path matches |
| Sign in / up / reset / **email-code** | POST `form.action` (generic) | form fields as JSON | `{state:'ok'\|'info'\|'error', data:{text\|message}}`, sets `current_user` cookie | `login`/`register`/`reset` (fixed paths); **no email-code**, not generic-form | ⚠️ partial |
| Leads | POST `/api/v1/leads` | `{name,email,phone,body,data}` | `{state,data}` (note: fs-hono returns `state:'success'`) | — | ❌ missing |
| Live search | GET `/search.json?q=` | — | `{products:[{title,url,image,price,label,available}],pages:[…]}` | `products.search` (diff shape); no `search.json` | ❌ missing |

## 2. `window.fkCart` — the global the themes script against
The SDK's `CartResource` has *some* analogues but is a **different model**: it keys by `product.id` (not
`variant_id`), has no discount/drawer/currency layer, and is an instance, not a `window` global.

| fk method | Purpose | SDK equivalent | Status |
|---|---|---|---|
| `read()` | current cart `{items[]}` | `cart.get()` (diff item shape) | ⚠️ |
| `add(item,qty)` | add by **fk item** (`variant_id,post_id,price,title,max…`) | `cart.addItem(product,qty)` (by Product) | ⚠️ diff shape |
| `setQty(variantId,qty)` | set line qty by variant | `updateItemQuantity(itemId,…)` (by item id) | ⚠️ |
| `remove(variantId)` | remove by variant | `removeProduct(productId)` | ⚠️ |
| `clear()` | empty bag (+ drop code) | `cart.clear()` | ✅ |
| `count()` | total qty | `getItemCount()` | ✅ |
| `subtotal()` | Σ price×qty (minor units) | `getSubtotal()` | ✅ (units differ) |
| `money(m,bare)` | format w/ display-currency + `#fk-rates` | — | ❌ |
| `open()`/`close()` | cart drawer | — | ❌ no UI |
| `flush()` | push local bag after sign-in | `syncToRemote()` (diff endpoint) | ⚠️ |
| `applyDiscount(code,status)` | quote + save code on the bag | — | ❌ |
| `removeDiscount()` | drop code | — | ❌ |
| `discount()` | current `{code,amount,label}` | — | ❌ |

## 3. Events + reactivity ❌
- `document.dispatchEvent(new CustomEvent('fk:cart',{detail:cart}))` on every bag change — the single event
  everything listens to. SDK has an internal `EventEmitter` (`cart:item:added`…) — **not** the DOM CustomEvent.
- `window.fkCart` global (above) — SDK exposes resources on an instance, not a global.

## 4. `data-fk-*` DOM hooks (79) — the declarative paint layer ❌
The SDK has **no DOM-hook layer at all**; this whole surface is Phase ④ (absorb the kit). Every hook below is ❌.
The behaviour suites test exactly these, so they're the regression gate.
- **Cart/bag:** `add · buy · buynow · buy-dec/inc/price/qty/stock · variant · cart-count · cart-count-plain · cart-empty · cart-filled · cart-grand · cart-lines(rows|summary) · cart-total · inc · dec · qty · remove · stepper · count · count-noun`
- **Drawer / cart-note:** `drawer · drawer-open/close/scrim · cnote · cnote-close · cnote-product`
- **Checkout:** `checkout · checkout-status`
- **Discount:** `discount-form · discount-input · discount-code · discount-amount · discount-line · discount-remove · discount-state · discount-status`
- **Auth:** `auth · auth-status · auth-carried/carry · auth-ok · auth-stay · auth-then · me · me-soft · logout`
- **Stock / price / currency:** `instock · price · price-bare · charged-in · currency`
- **Search (fk.js):** `search · search-all/close/empty/input/open/pages/products/state/suggest · echo-query · fill-from-query`
- **Leads:** `lead`
- **Collection / UI (fk.js):** `panel · show · reveal · burger · header · sticky · colbar · sort · lightbox · status`

## 5. Delivery constraints (kit-authoring session) — all ❌ today
- **Same-origin cookie transport.** Every call is `credentials:'same-origin'` + httpOnly `current_user` cookie. SDK only does Bearer→api.inkress.com. Needs a **second transport mode** (relative base, cookie, no Bearer).
- **Envelope, not exceptions.** Kit reads `{state,data}` (`data.text`/`data.message`); SDK's client **throws** on non-2xx (I had to catch it in the checkout refactor). Needs a return-envelope-on-4xx policy.
- **DOM config seam.** `<html data-site data-currency data-signed-in data-cart-style data-money-style data-currency-symbol>` + `#fk-rates` JSON. SDK is config-object-based; must read from the host document, no `init()` call.
- **Money = major units**, single `money()` conversion, integer-minor arithmetic, live display-currency from `#fk-rates`. SDK has no money/currency layer.
- **No-build IIFE** bundle for `<script defer>` (SDK ships ESM/CJS/browser-global; needs an IIFE kit artifact).
- **Service-worker cache-bust** — the SDK script URL must carry a version/hash (else a stale bundle serves for up to a week).

## 6. Non-negotiables (must hold in any port)
- Server prices every line (cart sends `variant_id`+`quantity` only, never a price).
- Guests can buy (bag is local when signed out; account required only at checkout in fs-hono today).
- Major units end-to-end (don't port fs-hono's cents-treating adapters — live bug).
- `unlimited:true` = no stock ceiling; `stock` meaningful only when false.
- Visitor values set via `textContent`/`.value` + runtime-assembled entities (renderer decodes entities → reflected-XSS risk).
- A service worker serves navigations (test harness blocks it).

---

## Scorecard
| Surface | Covered | Notes |
|---|---|---|
| Variant entity (the gate) | ❌ | fork decision blocks the SKU model |
| Run-time endpoints (9) | ~1 ✅ (logout), 2 ⚠️, 6 ❌ | all fs-hono/local-DB today |
| `window.fkCart` (13) | 3 ✅, 5 ⚠️, 5 ❌ | different cart model (product- not variant-keyed) |
| `data-fk-*` hooks (79) | 0 | no DOM layer in the SDK — Phase ④ |
| Transport / envelope / config / money / IIFE / SW (6) | 0 | all Phase ④ |

**Bottom line:** the SDK does **not** support what's needed to port `fk.js`/`fk-cart.js`. Phase ① matured a
parallel checkout surface; the kit port is Phase ③/④ and hasn't started. Order of work: **variant fork →
same-origin transport + envelope → the run-time endpoints in the fk contract → port the kit (hooks +
`window.fkCart` + `fk:cart` + money/currency) as a no-build IIFE, keeping the behaviour suites green.**
