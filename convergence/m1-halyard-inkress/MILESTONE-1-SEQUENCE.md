# Milestone 1 — halyard-standard reads its catalogue from Inkress

**Goal:** the live storefront **halyard-standard.fleeksite.com** renders its catalogue (grid `/shop`,
product page `/{permalink}`, and `search.json`) from **Inkress products** instead of the local FleekSite
DB — end to end, against a demo Inkress merchant seeded with the Windward Leather catalogue. This proves
the whole "Inkress is the commerce engine, FleekSite is presentation" architecture on one real page.

Scope is **reads only** (grid + product page + search). Cart/checkout, category filter, and the admin are
explicitly deferred to later milestones.

## Grounding (from `ecommerce-map/5-halyard-standard-stack.md`)
- **Renderer = fs-hono.** Deploy branch `feature/hono-migration` (live @ `a32d9b5`). Work in a **fresh
  worktree off `origin/feature/hono-migration`** (not the stale local `fs-hono` @ eea2114, not another
  session's `fs-hono-otp`).
- **halyard-standard** is a clone of site 331 ("Windward Leather"), resolved by `cname` (its `domain` is
  NULL), `render_mode='standard'` — render_mode only affects Liquid/SEO, **catalogue data is identical in
  both modes**.
- **The Liquid contract is `v` / `v.post`** (variant + its post) and is PRESERVED → **no template edits.**
  We repoint the data source and adapt Inkress products into that row shape.
- **Site→merchant mapping already has a home:** `site.data` JSONB carries `inkress_*` today (payment
  integration: merchant username + access token + webhook secret, `payments/inkress.ts:31-62`).
  halyard-standard's `data` is null → nothing configured yet.

## The seed (DONE — `m1-halyard-inkress/`)
`products.seed.json` (8 products, exact permalinks/prices/sale/stock/images) + `seed.mjs` (idempotent,
dry-validated). Runs once a demo-merchant token exists.

## Sequence

### Step 0 — Demo merchant + seed *(blocked on a token from Romario)*
Create/point a demo Inkress merchant (prod) and issue a `token_api`. Then:
`INKRESS_TOKEN=… INKRESS_USERNAME=… node m1-halyard-inkress/seed.mjs`.
**Verify:** `GET https://api.inkress.com/api/v1/public/m/<username>/products` returns the 8 products with
`permalink`, `price`, `image`, `data.discounted_price`, `units_remaining`/`unlimited`.

### Step 1 — Site → merchant config (foundation)
Add to halyard-standard's clone `sites.data`:
`{ "inkress": { "merchant_username": "<demo>", "catalogue_source": "inkress" } }`
(SQL against the clone's `site_id`, in the `halyard-render-mode-smoke/clone-halyard-standard.sql` style;
the payment `inkress_*` keys stay as-is). Add a typed accessor `getSiteInkress(site)` in fs-hono.
**Reversible:** set `catalogue_source` back to `local` (or clear) to revert instantly.

### Step 2 — Inkress catalogue adapter (the core, additive)
New module `fs-hono/src/lib/inkress/catalogue.ts`:
- `fetchInkressProducts(merchant, { q?, permalink?, page?, sort? })` → `GET /public/m/:username/products`
  (+ `?permalink=`, `?q=`, pagination/sort). Optional short-TTL cache (V1 can skip; add invalidation later).
- `toVariantRows(products)` → adapt each Inkress product to the `{ v, v.post }` shape `searchVariants`
  returns. V1 is one variant per product (distinct-post is trivial):
  - `v`: `id`=product.id, `price`=`data.discounted_price ?? price`, `compare_at`=`data.discounted_price ? price : null`,
    `stock`=`units_remaining`, `unlimited`, `name`=title, `image`, `post_id`=product.id, `sku`=`data.sku`.
  - `v.post`: `id`=product.id, `title`, `permalink`, images from `image`/`data`, so the theme's `fk_shop`
    card + product template read the same fields they do now. **Confirm the exact field names the theme
    Liquid reads and match them.**

### Step 3 — Repoint the read swap points (per-site branch on `catalogue_source`)
All guarded by the Step-1 flag → every other site is untouched.
1. **`searchVariants()`** (`src/lib/liquid/search/variants.ts:43`) — primary; covers grid `/shop`,
   `search.json`, and `GET /api/v1/variants`. If `catalogue_source==='inkress'` → return adapter rows.
2. **`queryPosts` products branch** (`collection.ts:349/502`) — same branch where it feeds product lists.
3. **`page.variants` preload** (`pages.ts`) — product page → `fetchInkressProducts({permalink})`.
4. **`check_stock`** (`commerce.ts:72`) — map to Inkress per-product stock (bulk read is a later gap).

### Step 4 — Verify live (the proof)
Deploy the fs-hono worktree (or run it locally against the clone site + prod Inkress). Then:
- `/shop` renders the 8 Inkress products (titles, prices, `long-wallet`/`brogue-boot` on sale,
  `evening-bag` sold out).
- `/the-windward-holdall` (and the rest) render from Inkress.
- `/search.json?q=boot` returns Inkress-sourced data.
- Cross-check the grid against `GET /public/m/<username>/products`; screenshot.

## Deferred (next milestones)
- **M2:** cart + checkout through Inkress (swap point 5, `checkout.service.ts:161/209`); category filter
  `?c=` → Inkress categories.
- **M3:** admin via revamp markets, scoped per site→merchant.
- **Later:** caching hardening + SSR-for-bots split; retire local `posts`/`variants` for Inkress-backed sites.

## Open items
- Demo merchant `token_api` (Step 0) — Romario.
- Match the adapter's `v`/`v.post` field names to the theme Liquid (Step 2) — read `fk_shop` + the product
  template in `theme-catalogue`.
- Fresh worktree off `origin/feature/hono-migration`.

## DONE
