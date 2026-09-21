# FleekSite on Inkress — V1 spec

**Decision (Romario, 2026-09-21):** Inkress is the **single source of truth + commerce engine** for
FleekSite. FleekSite stores **no catalogue** — no local `posts`/`variants` product tables, no grouping,
no sync. FleekSite is pure presentation: both its **admin** and its **storefront** read/write Inkress
directly. This **supersedes** the sync-to-local direction (option A) and the "grouping stays on FleekSite"
section of `ECOMMERCE-STRUCTURE-MAP.md §5`.

## Scope
- **V1 = products-only.** A buyable unit is an Inkress **product** (owns price + stock). Options, if any,
  use the existing `product.data.customer_inputs` add-ons and the theme displays them however it likes
  ("as variants or whatever"). No per-SKU inventory in V1.
- **Later (V2) = full per-SKU variants, built inside Inkress** (finish the orphaned `variants` table:
  product `has_many` variants, each own price/stock/sku/image, grouped, server-authoritative) — "like
  FleekSite has now, but better" (server-priced/stocked, groups + axes, no client-trust). See
  `VARIANT-WIRING-PLAN.md`; V1's product read layer upgrades to it by gaining a variants dimension.

## Corrected assumptions (settled this session — do not re-raise as blockers)
1. **Option add-ons DO bill.** The order total flows through each line's `cost` (`processor.ex:641`
   `validate_total` sums `products |> .cost`), and the cart computes `cost = base + add-ons`; the server
   also re-derives option prices from the DB `customer_inputs` (`:951-971`). The one odd line (`:973`
   reads a client `property_list` key) feeds a secondary per-line figure, not the charged total. **Action:
   confirm the exact client-cost-vs-server-reprice authority with ONE real order trace** (there's an
   `IO.inspect "FINAL PRODUCT"` on that path) — a verification item, not a V1 blocker or a bug.
2. **Reading from Inkress is a normal 1-call API read, not a "render tax."** Local Postgres vs Inkress
   are both one round trip; the only real variable is **co-location** (keep the Inkress reads same-region
   as the renderer, as the fs-web latency fix already did) plus minor HTTP/serialize overhead. The
   `{% fetch %}` "5s" is a **timeout ceiling**, not latency.
3. **Render strategy = client-fetch for humans, SSR for bots.** The browser fetches catalogue/cart from
   Inkress directly (fast, cacheable); crawlers get server-rendered HTML for SEO. Caching (HTTP headers /
   CDN / edge) is an **optimization**, not a prerequisite.

## Architecture (V1 components)

### A. Site → Merchant mapping (foundation)
Each FleekSite site maps to exactly one Inkress merchant. Store on the site record: the Inkress merchant
`username` (→ `Client-Id: m-<username>`) + the merchant **public key** (the order-create bearer, already
fetched via `GET /public/m/:username/tokens`). Everything below is scoped by this.

### B. Admin — product management (mostly built)
The **revamp markets editor already CRUDs Inkress products** via `@inkress/admin-sdk` (`markets-client.ts`
→ api.inkress.com). V1 = make it the FleekSite product admin, scoped per site→merchant (the site owner's
session resolves to their Inkress merchant). No new authoring backend.

### C. Storefront reads (the real build)
Rewire the theme's catalogue data source from local Drizzle (`{% collection %}`, grid, product page,
`search.json`) to an **Inkress-backed data service** in fs-hono, with two render paths:
- **Humans:** browser → Inkress (same-origin through fs-hono so the session cookie travels for
  cart/checkout; public reads may also go direct/CDN with the merchant public token). Cache with HTTP
  headers / edge.
- **Bots:** fs-hono detects crawler UA → server-fetches from Inkress and renders HTML for SEO.
The theme's price filter reads Inkress's unit (float major-units) — **the FleekSite double-vs-cents money
bug disappears** because prices live only in Inkress now.

### D. Cart + checkout (via the order-first path)
- **Cart:** client-side (storefront SDK cart, keyed by product id + `properties`). No FleekSite cart table.
- **Checkout:** the proven order-first flow — `fees` → `validateDiscount` → `merchantTokens` →
  `createOrder` → PowerTranz 3DS card page. Line shape `{ id: <product id> (the kit's "variant_id"),
  quantity, properties }`. Options ride as `properties` and freeze onto the order line. (Decision open:
  embed the SDK checkout in-theme (same-origin) vs redirect to Inkress-hosted `/checkouts/:id` — recommend
  embed for a native feel; both reuse the same backend.)

### E. Transport (from the SDK's two modes)
- **Public catalogue reads:** direct browser→Inkress with the merchant public token (or CDN-cached), OR
  same-origin proxy.
- **Cart / checkout / auth (cookie-bound):** same-origin through fs-hono (fs-hono delegates to Inkress
  server-side so the httpOnly session cookie keeps working). This is the "same-origin is load-bearing"
  constraint from the kit.

## Inkress API surface V1 needs

| Need | Endpoint | Status | Note |
|---|---|---|---|
| Product grid (merchant-scoped) | `GET /public/m/:username/products` | **exists** | confirm pagination + sort + category filter return the grid fields (title, permalink, price, image, `units_remaining`/`unlimited`, `data`) |
| Product page (by permalink) | `GET /public/m/:username/products?permalink=X` | **works** | `permalink` is a real column; generic query filters by schema fields → returns the 1 row. No dedicated show route needed |
| Search (`search.json`) | `GET …/products?q=` | **partial** | `?q` searches **title only** today; widen to description/attributes and shape the `{products:[{title,url,image,price,label,available}], pages}` response (theme-side adapter or an Inkress search endpoint) |
| Stock | in the product read (`units_remaining`/`unlimited`) | **exists (per-product)** | **bulk** stock read is a **gap** — add a batch product-stock endpoint or have the storefront read per-product |
| Fees / discount / order-create / 3DS | order-first surface (`/fees`, `/discount`, `/orders`, `/payments/link/:uid/*`) | **exists** | proven live on `/checkouts/:id`; the SDK checkout resource wraps it |
| Cart | — | **n/a V1** | client-side cart; no server cart until order-create |
| Tokens (order bearer) | `GET /public/m/:username/tokens` | **exists** | `data[0].public_key` |

**Two small server gaps to close for V1:** (1) widen product search beyond title + shape a `search.json`
response; (2) a bulk product-stock read. Neither touches the money path.

## Rollout
- **New / opt-in sites:** Inkress-backed from creation.
- **Existing FleekSite stores:** one-time catalogue import (their `posts`+`variants` → Inkress products;
  each variant → a product, `public=false` unless it's the display product; pin price to major-units),
  then flip the storefront read source to Inkress and retire the local product tables. Can be per-site,
  behind a flag, so it's reversible.

## Deferred to V2 (the full-variant build)
Everything in `VARIANT-WIRING-PLAN.md` (V0 scaffold-fix → V1 dual-write persistence → V2 sanitized public
variant read + bulk `check_stock` → V3 checkout resolves off variants → V4 SDK/storefront), now with
FleekSite reading variants from Inkress the same way it reads products in this V1. This is where real
per-SKU stock/price/sku/image + option axes + groups land — "better than FleekSite's current."

## Open decisions / to confirm
1. **Checkout embed vs redirect** to Inkress-hosted `/checkouts/:id` (recommend embed via SDK, same-origin).
2. **Search**: widen Inkress `?q` server-side vs storefront-side filtering of a fuller list.
3. **Cache layer**: CDN + HTTP cache headers vs an fs-hono/edge cache with product-update invalidation.
4. **Billing-authority trace** (assumption 1) — confirm once with a real order.
5. **`sku` field** location on the Inkress product (`data.sku` is enough for V1).

## DONE
