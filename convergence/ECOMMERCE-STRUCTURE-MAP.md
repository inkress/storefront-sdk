# Ecommerce structure map: Inkress ↔ FleekSite — and how to map them

How product authoring, catalogue reads, pricing, checkout and orders are structured across the Inkress
stack (commerce-api + commerce-web) and the FleekSite stack (fs-hono + fs-admin/revamp), then how to map
FleekSite onto Inkress. Grounded in the four investigations in `ecommerce-map/1..4-*.md` (file:line there).
Branches read: commerce-api LIVE = `version/4.1-beta`@`c3cf49de` (the main checkout is `feature/spi-3ds`,
so Agent 1's file carries a LIVE-BRANCH CORRECTIONS section); commerce-web = `version/4.1-beta`@`3339c41`;
fleeksite = fs-hono/fs-admin/revamp.

---

## 1. The two models at a glance

| Dimension | **Inkress (live)** | **FleekSite** |
|---|---|---|
| Buyable unit | **the product** | **the variant** (per-SKU) |
| Who owns price | product (`products.price`, float major-units) | **variant** (`variants.price`, double) — post carries only a denormalized min/max range |
| Who owns stock | product (`units_remaining` / `unlimited`) | **variant** (`stock` / `unlimited`) |
| "Options" | add-on inputs in `product.data.customer_inputs[]` (label→price delta) | real SKU rows + option axes (`attributes`→`options`→`variant_attributes` join) |
| Logical grouping | none native (each product is standalone) | `posts` (type=3) 1:N `variants`; grid does `distinct post_id` |
| Cart line identity | hashed `properties` map (pseudo-variant) | `variant_id` |
| Order line | freezes from the **product** (`variant_id = product.id`, name/total frozen) | one `order_lines` row per **variant** |
| Catalogue read | `GET /products` (marketplace) | `variants` collection `distinct post_id` (a posts-only card is unbuyable) |

**The single most important fact:** Inkress's *product* and FleekSite's *variant* are the **same kind of
object** — a standalone buyable unit that owns its own price + stock. FleekSite's `posts` layer (grouping)
has no Inkress equivalent, and Inkress's `data.customer_inputs` option-delta layer has no FleekSite
equivalent. That asymmetry is exactly what the mapping in §5 exploits.

---

## 2. Inkress stack

### 2a. Product authoring — commerce-web (`3-commerce-web-product-creator.md`)
`dashboard.store.products.$id.tsx` + `components/forms/product-form.tsx` → thin REST client
(`interfaces/client/product.ts`) → **POST `/products`** / **PATCH `/products/:id`**. Writes these keys under
`product.data`: `description, discounted_price, video_url, type, images` + conditionally **`attributes`** and
**`customer_inputs`**. Sets `unlimited`, `units_remaining`, `status` (Draft1/Pub2/Arch3); **hard-codes
`public = true`** (`.$id.tsx:407`). Writes **no** top-level `variants` (and the API changeset would drop it).

### 2b. The product `data` shape (live sample confirmed)
```
data.customer_inputs = [ { "name":"Wholesale Pricing", "type":"options", "price":2299.98,
                           "options":[ { "label":"Two Units (1 Pack)", "price":2299.98 } ] } ]   // option pickers, price = ADD-ON delta
data.attributes      = [ { "name":"Bait Station", "type":"number", "value":"1" } ]               // static specs
```
Empirically options are rare (~1/100 live products). The marketplace + storefront SDK read
`attributes`/`customer_inputs`; the newer revamp markets editor instead writes `data.variants.options`,
which the marketplace/SDK do **not** read (see `VARIANT-TRUTH.md`).

### 2c. Order pricing — order processor (LIVE, `1-order-processor-pricing.md` + its LIVE-BRANCH section)
Pipeline (`processor.ex:949-996`, both order-first and session paths converge on the same fee engine):
```
client line {id, quantity, properties}                → server loads the PRODUCT row
base_cost = data.discounted_price>0 ? discounted : products.price
property_costs = Σ client-sent product[:property_list].price          ← see BUG
catalog_unit_cost = base_cost + property_costs
unit_cost = resolve_unit_price(product[:unit_price], catalog_unit_cost, override_allowed?)  // secret-key override only, audit-stamped
total_cost = quantity × unit_cost
Σ total_cost = sub_total → TransactionCalculator layers fee groups → 3 totals
```
- **Server-authoritative:** base price + quantity come from the DB; a client `total` is trusted only for
  no-product raw-amount checkouts. A per-line price override exists but is **secret-key gated** + audited.
- **Fee groups (ordered):** `discount(1) → shipping(2) → before_tax(3) → tax(4) → after_tax(5) →
  platform_fee(6) → bank_fee(7)`; each has a payer (1=merchant absorbs / 2=customer grossed-up) and a
  `calculated_on` (base vs running total); money in **integer cents**; flat fees pre-converted by FX,
  percentages currency-agnostic. Discounts are a single "discount" group, before tax.
- **Discounts wired on live:** `Service.Discount.resolve` + `availability` (`:74-87`), product-scoped
  line items `%{id,cost}` (`:45`), order freezes `discount_code_frozen`/`discount_id` (`:302-303`).
- **⚠️ Option add-on BUG (confirmed live):** the server computes correct per-option prices into
  `property_list` (`:951-971`, from `customer_inputs`) but the charge sums **`product[:property_list]`**
  — the *client-sent* array (`:973`) — so add-ons are client-controlled and **$0 when the client omits it**
  (the checkout sends `{id,quantity}` and strips `properties`). The correct server prices only feed the
  frozen display. ⇒ Inkress option add-ons very likely **don't bill today**.
- **Order line freezes** `product_variant_name_frozen` (= product title), `product_variant_total_frozen`,
  `quantity`, `properties`, `meta_data`; `variant_id` is a **FK to `products.id`** (no variant table used).

### 2d. Checkout + payment pages — commerce-web (`2-commerce-web-checkout.md`)
- Uses **two vendored clients** (`interfaces/server/*`, `interfaces/client/*`), **not** the storefront SDK.
- Checkout: `checkouts.$id.tsx` (order-first; action builds the order via `buildOrderArgs` → `admin.order.create`
  with the merchant's `public_key`) + `.fees.tsx` (`/fees` recompute) + `.address.tsx` (Places proxy).
- Payment-link/3DS: `payments.link.$id.card._index/.embed` (tokenize→`checkoutIntent`/`chargeCard`/`complete3ds`
  PowerTranz), legacy `.fac`/`.hpp` redirect to `/card`, `payments_.3ds-callback` server-settles. **The 3DS/payment
  tail is entirely product-agnostic** (operates on the link token + `transactions[0]`).
- **Order-create line = `{id, quantity, properties?}` — no `variant_id`.** The `/checkouts/:id` action
  **strips `properties`** (`checkouts.$id.tsx:176`); the marketplace checkout + order page keep them.
- Client options: `getOptionPrice` + `addToCart` build `properties {value,price}` from `data.customer_inputs`;
  `useCart` line = base + Σ deltas; `generateCartItemId` hashes properties as the cart-line identity.

### 2e. The orphaned relational variant model (exists, unused)
commerce-api has a full per-SKU schema — `variants` table + `ProductVariant` (`name, price, quantity, sku,
image, product_id`) + variant groups/attributes/exclusions — with zero live readers/writers (no
`Product has_many :variants`, no cast, no routes, checkout ignores it). **Its row shape is essentially
FleekSite's `variants` shape.**

---

## 3. FleekSite stack (`4-fleeksite-product-creator.md`)

### 3a. posts + variants model
`fs-hono/src/db/schema/commerce.ts:19-45`: a product = `posts` row (`type=3`); a variant = `variants` row,
FK `postId`, **owning `price` (double), `stock` + `unlimited`, `sku`, `name`, `image`**. posts↔variants =
1:N. Option axes: `attributes` (axis, e.g. Size) → `options` (values) → `variant_attributes` (join to the
SKU). The post carries only denormalized `price`/`priceMin`/`priceMax`, synced by `updatePostPriceRange`.
A Postgres **AFTER INSERT trigger** (`post_variant_trigger`) creates one default variant per `type=3` post,
so **every product always has ≥1 variant**.

### 3b. Creator UIs — two, on two backends
- **Legacy (serves the current storefront):** fs-admin post-editor (`_product.html.eex` → `PostController.update`)
  writes MMS `posts` + option axes via AJAX (`/commerce/attributes/add`). Writes product-level price/stock;
  independent per-SKU `variants` come through the `/api/v1/variants` API.
- **New (convergence target):** revamp `/admin/markets/products/*` authors true per-SKU rows but sends them
  via **`@inkress/admin-sdk` to api.inkress.com** — i.e. already writing to **Inkress**, not the FleekSite DB.

### 3c. Storefront reads / pricing
Grids, search, related are built on the **`variants` collection with `distinct post_id`** (`search/variants.ts:144-179`,
`shop-grid.liquid`, `search.json.liquid`) — a posts-only card is unbuyable. Cart is client-owned; the server
stores an opaque `info` blob; **cart item = `{variant_id, post_id, price, quantity, total, title}`**
(`checkout.service.ts:32-40`). Bulk `POST /api/v1/variants/check_stock`. Checkout writes one `order_lines`
row per variant.

### 3d. Two hazards to pin before mapping
- **Money-unit bug (live, unresolved):** `variants.price` (a double) is read as **major units** by the
  storefront JS + Liquid `price` filter but as **cents** by the fs-hono API formatter + CheckoutService/order
  rows; the Inkress adapter guesses by magnitude. Pin the unit before syncing.
- **No server re-price on this fs-hono branch:** `/payments/checkout` trusts the stored cart's prices
  (doesn't re-price/re-stock from request `items`) — the "server prices every line" fix is in deployed
  fs-web, not this branch.

---

## 4. Side-by-side flow

| Stage | Inkress | FleekSite |
|---|---|---|
| Author a product | one product + `data.customer_inputs` option deltas | one post + N variant SKUs (each own price/stock) |
| Catalogue card | one product row (has price/stock) | `variants distinct post_id` (variant supplies price/stock) |
| Add to cart | line = product id + `properties {value,price}` (client-priced deltas) | line = `variant_id` (+post_id) |
| Price the line | product base + add-on delta (delta charge is buggy → often $0) | variant price (server should re-price; this branch doesn't) |
| Order line | 1 per product, `variant_id = product.id`, frozen name/total | 1 per variant |
| Money-path/3DS | order-first processor + PowerTranz (product-agnostic tail) | local fs-hono; optional Inkress gateway leg |

---

## 5. Mapping FleekSite → Inkress — **product-per-SKU** (your proposal, and it fits)

### 5a. The fit
A FleekSite **variant** and an Inkress **product** are the same object: a standalone buyable unit that owns
its price + stock (+ sku + image + name). So map **one FleekSite variant → one Inkress product**. The post
(grouping) stays FleekSite-side. This is the faithful, low-loss mapping — and because FleekSite auto-creates
a single default variant per product, the common single-variant case is just **1 product : 1 product** (no
explosion); only genuinely multi-SKU products fan out.

### 5b. Field mapping
| FleekSite `variants` field | → Inkress `products` field | Notes |
|---|---|---|
| `id` | (FleekSite keeps; store Inkress `product.id` back on the variant row) | idempotent re-sync key |
| `price` (double) | `products.price` (float, **major units**) | resolve the §3d unit bug HERE — pin to major units into Inkress |
| `stock` / `unlimited` | `units_remaining` / `unlimited` | per-SKU stock now native (product owns it) |
| `sku` | `products.data.sku` (or a dedicated field) | no first-class SKU column today |
| `name` (e.g. "Red / Small") | `products.title` (or keep post title + `properties`) | drives `product_variant_name_frozen` |
| `image` | `products.image` | |
| option axis values (Size=Small…) | order-line `properties` (display) | passed at checkout, frozen on the line |
| `postId` (grouping) | **stays FleekSite-side** | Inkress has no product-group; grid `distinct post_id` stays local |

### 5c. Frontend stays byte-compatible
The FleekSite kit keeps sending `{variant_id, properties, quantity, …}` unchanged:
- `variant_id` → resolves to an **Inkress product id** (Inkress already *calls* the order-line id
  `variant_id`, so no rename).
- `properties` → passed straight to Inkress order-create and **frozen on the order line** (already wired,
  `processor.ex:1007-1024`).
- The one code change on the Inkress-checkout side: stop stripping `properties` at `checkouts.$id.tsx:176`
  (only matters if that page serves these orders).

### 5d. Why this is *better*, not just possible
Product-per-SKU makes each line's price come from the **product row** — server-authoritative — which
**deletes the entire option-delta path** (`processor.ex:951-987`) and its client-controlled `property_costs`
bug (§2c). You stop relying on `data.customer_inputs` deltas (fragile + likely $0-billing today) and use
proven product pricing + the live discount/fee engine unchanged (the fee engine consumes only line `cost`,
so nothing downstream moves).

### 5e. What stays FleekSite-side (fits the A-sync plan)
The post→variants grouping, the grid `distinct post_id`, option-axis UI, images/galleries, and search.json
stay in FleekSite's local DB/render — render-time stays local Liquid; only runtime money/cart/stock go to
Inkress. So "show one card per shirt" needs **no** Inkress-side grouping.

### 5f. Concrete gaps / tasks (ordered, none touch the fee engine)
1. **Sync**: fan out each FleekSite `post → variants` into N Inkress products; store `product.id` back on the
   variant row (idempotent). Respect the sync gotchas (variant owns price; `unlimited`=no ceiling; images in
   `posts.meta`). **Set `public=false`** on SKU-products so a 4-colour shirt doesn't post 4 marketplace
   listings (note: the commerce-web creator hard-codes `public=true` — the sync must set it explicitly).
2. **Money unit**: pin FleekSite variant price → Inkress `products.price` in major units (resolves §3d).
3. **Stock read**: FleekSite bulk `POST /api/v1/variants/check_stock` → point it at an Inkress
   per-product stock read (Inkress has none today: `products.checkStock(id)` is one-at-a-time — either add a
   bulk product-stock endpoint or have FleekSite map variant_ids→product_ids and batch).
4. **Checkout line**: send `variant_id` (= Inkress product id) + `properties`; drop the `properties` strip
   on the invoice checkout page if it serves these orders.
5. **SKU field**: decide where `sku` lives on the Inkress product (`data.sku` is enough).

### 5g. What you give up + the alternative
You give up Inkress *natively* knowing "these 4 products are one shirt" (the grouping lives in FleekSite). If
that's ever needed in Inkress (grouped reporting, a native variant admin), drop a lightweight `group_id` into
`product.data` later — no rework. The only reason to instead pick **one-product-per-post + options-in-data**
is if a store genuinely has shared-pool inventory with pure add-ons (no per-SKU stock) — simpler, but it
inherits the buggy option-delta path and loses per-SKU stock/price/image. **Recommendation: product-per-SKU**
— it matches what FleekSite stores actually are and reuses Inkress's proven product money path.

## DONE
