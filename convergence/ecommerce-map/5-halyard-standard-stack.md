# halyard-standard.fleeksite.com — catalogue rendering & data-source map

READ-ONLY investigation, 2026-09-21. Goal: pin down exactly how the live site
renders its store catalogue and where product data comes from today, so the
data source can be sequenced onto Inkress.

**Live verified:** `https://halyard-standard.fleeksite.com/shop` → HTTP/2 200,
served by **fs-hono** (`x-fs-cache` header) behind Caddy (centraprox). `/shop`
renders **52 `fk-pcard` product cards** + `data-fk-add` buttons; JSON-LD carries
`"telephone":"+1 876 928 4416"` (Halyard's own number = the standard-mode A10
fix, so this site is genuinely rendering in `render_mode=standard`).
`/search.json?q=boot` returns the theme's own JSON catalogue (`{"query":"boot",
"products":[{"title":"Brogue boot","url":"/brogue-boot","price":260,...}]}`).

## Repos / branches (source of truth)

| Repo | Path | Branch (git) | Role |
|---|---|---|---|
| fs-hono | `/Users/romario/projects/fleeksite/fs-hono` | local `feature/hono-migration` @ `eea2114` — **STALE** | Hono renderer + API (the live engine) |
| fs-hono (deployed) | origin `feature/hono-migration` @ **`a32d9b5`** | = worktree `fs-hono-otp` (`claude/theme-signup`, a32d9b5) | **What is actually live** — has render_mode |
| fs-web | `/Users/romario/projects/fleeksite/fs-web` | `feature/upgrade-elixir-1.18.4` | LEGACY Remix/Elixir renderer — NOT serving these sites |
| theme-catalogue | `/Users/romario/projects/fleeksite/theme-catalogue` | `main` | Halyard theme source + deploy pipeline |

**Branch caveat (important for citing):** the local `fs-hono` checkout (eea2114)
is behind and does **not** contain render_mode. The deployed branch
`origin/feature/hono-migration` (a32d9b5) does — it merged `#36` (0458e48, render
mode), `#37` (1cac63b, DB-backed `{% include %}/{% render %}`), `#38` (a32d9b5,
passwordless signup). All file:line citations below were read in the
**`fs-hono-otp`** worktree (= a32d9b5 = deployed); the same paths exist on
`origin/feature/hono-migration`. Local `fs-hono` will match once fetched.
`git remote` note: the fs-hono repo's `origin` is `github.com/jamlance/fs-web.git`
(the Hono migration lives on branches of the fs-web repo).

Prior investigation artifacts corroborating this (already on disk):
`/Users/romario/projects/fleeksite/halyard-render-mode-smoke/REPORT.md` and
`.../theme-catalogue-standard-sweep/REPORT.md`.

---

## 1. Which renderer serves halyard-standard, and how the host resolves

**fs-hono serves it** (both compat and standard modes are fs-hono now; fs-web is
legacy and out of this path). Confirmed live by the `x-fs-cache` response header,
which is fs-hono's page cache.

**Host → site resolution:** `fs-hono/src/middleware/tenant.ts`
- `findSiteByHost(host)` (tenant.ts:88) queries `sites` by `domain`, `cname`,
  and `alt_domains`, with SQL-side priority: exact `domain` (rank 0) > `cname`
  (rank 1) > `alt_domains` entry (rank 2) > substring LIKE fallback (rank 3)
  (tenant.ts:104-115). halyard-standard has `domain=NULL`, so it resolves on
  **`cname='halyard-standard.fleeksite.com'`**.
- Module-level fast cache (L1) + Redis (L2), host-keyed, 60s TTL
  (tenant.ts:16-62). `purgeHostFastCache(host?)` busts it.
- A canonical-host redirect (`maybeCanonicalRedirect`, tenant.ts:66-81) only
  fires when the site has a non-null `domain`; halyard-standard's is null, so no
  redirect — the cname is served directly.

**render_mode handling:** `fs-hono/src/lib/render-mode.ts`
- `resolveRenderMode(site)` (render-mode.ts:~48) → `'compat' | 'standard'`;
  anything not exactly `'standard'` falls back to `compat` (safe default).
- Applied at render time in `fs-hono/src/routes/site/pages.ts`: it calls
  `resolveRenderMode(site)`, stashes it on `liquidContext.__render_mode`, builds
  the engine with `createLiquidEngine(mode)`, and runs the meta pipeline with the
  mode.
- **render_mode changes only Liquid semantics + SEO/JSON-LD metadata, NOT the
  catalogue data.** Per the two prior REPORT.md sweeps, compat↔standard diffs are
  metadata-only (contact phone, `og:image`, JSON-LD author/`@type`/dates); the
  product/variant queries are identical in both modes. So the catalogue seam is
  render-mode-independent.

## 2. The site record — and whether any Inkress/merchant link exists

**Schema:** `fs-hono/src/db/schema/cms.ts:13-88` — `sites` pgTable. Relevant
columns: `id` (bigserial), `name`, `domain` (unique, notNull in Drizzle but NULL
in practice for cname-only sites), `cname` (unique), `altDomains`, `currency`
(varchar(3)), `ownerId`, `origin`, `templateId` (varchar), `theme`, `themeId`,
`data` (json `Record<string,unknown>`), and:
```
renderMode: varchar('render_mode', { length: 16 }).default('compat')   // cms.ts:~79
```

**halyard-standard's record** = a **clone of site 331** ("Windward Leather",
cname `halyard.fleeksite.com`, USD, owner_id 1). Clone script:
`/Users/romario/projects/fleeksite/halyard-render-mode-smoke/clone-halyard-standard.sql`
copies the `sites` row with a fresh `id`/`uid`, sets `cname =
'halyard-standard.fleeksite.com'`, `domain = NULL`, `render_mode = 'standard'`,
and deep-copies `posts, templates, variants, attributes, variant_attributes,
files, bits, redirects, site_features` (users/categories kept by reference). So
halyard-standard is a dedicated site that is Halyard's exact catalogue + theme,
flipped to standard mode. (Site-331 row snapshot:
`theme-catalogue/pipeline/snapshots/331/site.json` — `data: null`, `origin: null`,
`template_id: null`.)

**Is there any field linking a site to an Inkress merchant? → NO dedicated
column.** Grepped the whole schema and codebase:
- The `sites` table has **no** `inkress_merchant_id`, `inkress_username`, commerce
  API key, or storefront-config column. The only generic escape hatches are the
  `data` JSONB, `origin`, and `templateId` — all null on Halyard.
- **The one existing site↔Inkress coupling is payment-only**, and it lives in
  JSONB, not a typed column: `fs-hono/src/lib/payments/inkress.ts:31-62` reads
  per-site Inkress creds from `site.payment_providers.inkress_*` (preferred) or
  `site.data.inkress_*` (legacy):
  - `inkress_access_token` / `inkress_api_token`
  - `inkress_merchant_username` / `inkress_username`
  - `inkress_mode` (`live`|`sandbox`)
  - `inkress_webhook_secret` (used to verify `/payments/webhooks/inkress`)
  Note: `payment_providers` is **not** a Drizzle column in `cms.ts` today (only
  `data` is), so in practice the working path is `site.data.inkress_*`.
- Uses `@inkress/admin-sdk` (`InkressSDK`) — see inkress.ts import.

**Consequence for the swap:** there is already a per-site *Inkress merchant
username* concept in the DB (for checkout), so the catalogue swap can reuse the
same handle rather than inventing a new one. But halyard-standard has `data=null`
→ **no Inkress merchant is configured on this site yet**; wiring the catalogue to
Inkress will require introducing/seeding a merchant identifier for it (a typed
column would be cleaner than the JSONB the payment path uses).

## 3. The catalogue data path (the seam we will swap)

Catalogue data is **100% local Postgres**, keyed by `site_id`. The domain model:
products are `posts` of `type = 3` (`postTypeEnum` = post|page|product|landing|
template, cms.ts:~10; product = the 3rd, numeric 3), each with rows in `variants`
(`variants.postId → posts.id`, `variants.siteId`, `variants.price`, `.stock`,
`.sku`, `.name`, …; `fs-hono/src/db/schema/commerce.ts:~19+`).

### (a) Store page / product grid — `/shop`
DB template body calls the `{% collection %}` Liquid tag:
```liquid
{% collection variants, fk_shop, limit: 24, order: id asc, exclude_params: true %}
```
(seen in the live template body; theme source `theme-catalogue/pipeline/specs/shop01-halyard.py` maps `/shop → [collection-head, shop-grid]`.)

Trace:
1. `fs-hono/src/lib/liquid/tags/collection.ts` — the `{% collection %}` tag.
   `executeCollection(type, params)` (collection.ts:319) dispatches:
   - `case 'variants'` → `queryVariants(...)` (collection.ts:337)
   - `case 'products' | 'shop_products'` → `queryPosts({...params, types:'3'})`
     (collection.ts:349-350) — products = posts type 3.
2. `queryVariants` (collection.ts:1064) delegates to **`searchVariants`**.
3. **`fs-hono/src/lib/liquid/search/variants.ts:43` `searchVariants(rawAttrs)` —
   THE seam.**
   - `db.selectDistinctOn([posts.id], { v: variants, p: posts })` when
     `distinct: 'id'|'post_id'` (variants.ts:150-164) → **one card per product**
     (this is the "variants distinct post_id" the brief referenced).
   - `.from(variants).innerJoin(posts, eq(variants.postId, posts.id))`
     (variants.ts:168-169).
   - `.where(and(...))` with `eq(variants.siteId, siteId)` (variants.ts:60) plus
     `posts.type=3`, `posts.status=1`, not deleted, not expired (variants.ts:62-87).
   - Returns each variant flattened + nested `post` (variants.ts:181-185); the
     template binds `v` (variant) and `p = v.post`.
4. Product images attached via `loadMediaForPosts` / `pickPrimaryMedia`
   (`fs-hono/src/lib/liquid/media.ts`, imported in collection.ts).

### (b) Single product page — `:product` (e.g. `/brogue-boot`)
Rendered by `fs-hono/src/routes/site/pages.ts`, which resolves the permalink to
its `posts` row and **preloads the post's `variants` relation** (`with: {
variants: true }`), exposed to Liquid as `page.variants` / `post.variants` (the
comment block in pages.ts notes `{{ post.variants }} → SKU/price/stock per
variant`). The Halyard product template iterates `{%- for v in page.variants -%}`
and emits `data-variant-id / data-post-id / data-price / data-stock /
data-variant-name` per variant (verified in the live-rendered
`halyard-render-mode-smoke/clone/brogue-boot.html`, e.g. variant 18179 / post
12606 / price 260 / stock 1). The `grid-related` section additionally calls
`{% collection variants, fk_pv, q: {{ fk_q }}, limit: 10, distinct: post_id %}`.

### (c) `search.json` (the theme's own endpoint)
Not a hardcoded route — it is a **DB template row with permalink `/search.json`**
that renders `{% collection variants %}` (products) + posts (pages) as JSON. The
theme's search JS (embedded in the template body) fetches
`/search.json?q=<query>` with `Accept: application/json` and paints the results.
Confirmed live (output above). Same `searchVariants` seam underneath.

### (d) REST equivalents (same seam, used by the kit JS)
`fs-hono/src/routes/api/v1/commerce.ts` (mounted as `/api/v1/variants`):
- `GET /api/v1/variants/` → `searchVariants({...query, site_id})` (commerce.ts:47-52).
- `POST /api/v1/variants/check_stock` → `db.query.variants.findMany({ where:
  inArray(variants.id, ids) AND eq(variants.siteId, site.id) })` (commerce.ts:72-94).
- `GET /api/v1/variants/stock/:uid`, `/api/v1/variants/:postUid` → `db.query.variants`.

## 4. Cart + checkout on this site (today)

All **local fs-hono**; Inkress already present as *one* checkout payment gateway
(not the catalogue). Client kit: `theme-catalogue/pipeline/kit/core/fk-cart.js`
and `fk.js` (also inlined into template bodies).

Flow (endpoints seen in the live template JS):
- **Add to cart / cart:** `POST|GET /api/v1/cart` →
  `fs-hono/src/routes/api/v1/cart.ts` — one `cart_lines` row per
  `(site_id, user_id)`, `items` jsonb (cart.ts:29-72).
- **Stock check:** `POST /api/v1/variants/check_stock` (local variants; see 3d).
- **Discount quote:** `POST /api/v1/discounts/quote` →
  `fs-hono/src/routes/api/v1/discounts.ts`.
- **Checkout:** `POST /payments/checkout` → `fs-hono/src/routes/payments/index.ts`.
  1. Builds/prices the order in `fs-hono/src/services/checkout.service.ts`:
     `priceLines` (checkout.service.ts:161) re-prices every line from
     **`variants.price`**, checks `variants.stock`, and enforces
     `variants.siteId === site.id` (fetch at checkout.service.ts:209-223) —
     **server-authoritative money path; client-sent prices are ignored**
     (checkout.service.ts:7-14). Writes local `orders` + `order_lines`.
  2. Dispatches to a `PAYMENT_METHODS` provider — `stripe | paypal | wipay |
     inkress` (payments/index.ts:33). The `inkress` branch (payments/index.ts:119)
     calls `InkressGateway.createCheckoutSession({ site, amount (major units),
     currency, orderId, customer, metadata })` → hosted-checkout `frame_url`
     redirect; Inkress calls back to `POST /payments/webhooks/inkress`
     (HMAC-SHA256, per-site `inkress_webhook_secret`; payments/index.ts:217+).

**Key distinction:** Inkress is already wired on the **payment** side. The
**catalogue/order** side (products, variants, prices, stock, orders) is entirely
local. The convergence swap is about the *read/catalogue* seam, not payments.

## 5. How the theme is deployed to the site (templates = DB rows)

**Templates are DB rows**, not files: table `templates`, scoped by `site_id`,
columns `title, type, permalink, identifier, layout_identifier, mime_type, body,
uid, render, deleted, private, source` (see clone SQL + build.py + pages.ts,
which renders the template `body`). Bits (`bits` table) hold theme tokens.

**Deploy tool:** `theme-catalogue/pipeline/work/build.py <site_id> <vertical>`
- Builds template rows from the spec (`pipeline/specs/shop01-halyard.py`) + shared
  kit (`pipeline/kit/layout.liquid`, `pipeline/kit/core/*.js`) (build.py:255-319).
- `write_rows(site_id, rows)` (build.py:324): **soft-deletes** the site's existing
  kit templates (`WHERE site_id=X AND deleted=false AND type<>7`, keeping
  transactional `KEEP_PREFIXES`) then **INSERTs** the new rows via **direct SQL to
  Postgres** (build.py:329-353). Also `seed_bits` (build.py:359), `author_for`
  (build.py:400), `retire_offbrand_posts` (build.py:411).
- `theme-catalogue/pipeline/work/restore.py <site_id>` reverts.
- Halyard section→permalink map (`specs/shop01-halyard.py`): `/shop → [collection-
  head, shop-grid]`; `:product → [product-stage, product-feature, product-
  policies, grid-related, shop-grid]`; `/cart → [cart-page]`; `/search`; plus
  `/lookbook`, `/journal`, etc.

**To change what halyard-standard renders:** update its `templates` rows for the
clone's `site_id` — either re-run `build.py <clone_site_id> shop-leather`, or
targeted SQL / the `/api/v1/templates` API. Per prior notes, platform template
changes are owned by a dedicated session; this documents the mechanism only — no
change made here.

(Storefront-theme picker metadata is exposed read-only at `GET /api/v1/themes` →
`fs-hono/src/routes/api/v1/themes.ts`, backed by `src/config/themes.ts`; that's
the catalogue list for the admin, not the per-site template store.)

---

## SWAP POINTS — to make this site read products from Inkress instead of local DB

The catalogue read is funnelled through a small number of functions. Repoint
these (behind the existing per-site Inkress merchant handle) and the whole
storefront — grid, product page, search.json, and the REST/kit endpoints —
follows, with **no template edits** required (the Liquid contract stays `v` +
`v.post`).

1. **`fs-hono/src/lib/liquid/search/variants.ts` → `searchVariants()` (line 43).**
   PRIMARY seam. Drives `/shop` grid, `grid-related`, `search.json`, `{% collection
   variants %}`, and `GET /api/v1/variants`. Replace the `variants⨝posts` Drizzle
   query with an Inkress product/variant fetch, mapping Inkress products →
   `{ ...variant, post: {...} }` and preserving `distinct post_id` = one card per
   product + the filter contract (`q`, `label`, `category`, `stock_*`, `order`,
   pagination).

2. **`fs-hono/src/lib/liquid/tags/collection.ts` → `queryPosts()` (line 502) for the
   `products`/`shop_products` branch (line 349).** Products = `posts type 3`;
   repoint this branch to Inkress so `{% collection products %}` and any
   posts-based product listing read Inkress.

3. **Single product page variant preload in `fs-hono/src/routes/site/pages.ts`**
   (the `with: { variants: true }` load that produces `page.variants`). Source the
   product's variants from Inkress for the product-detail page.

4. **`fs-hono/src/routes/api/v1/commerce.ts`** — `GET /api/v1/variants/*` (uses
   searchVariants, covered by #1) and **`POST /api/v1/variants/check_stock`
   (line 72)** which hits `db.query.variants` directly → repoint stock lookups to
   Inkress.

5. **`fs-hono/src/services/checkout.service.ts` → `priceLines` / the pricing fetch
   (lines 161, 209-223).** The order money path re-prices from local
   `variants.price`; to charge Inkress-authoritative prices it must fetch price
   (and stock) from Inkress instead of the `variants` table. (Payments dispatch in
   `routes/payments/index.ts` already supports `inkress`; leave as-is.)

6. **Site→merchant link.** No typed column exists. Introduce a first-class
   per-site Inkress merchant identifier (today only `site.data.inkress_*` /
   `site.payment_providers.inkress_*` exist, payment-only, and halyard-standard's
   `data` is null). Seed it for the clone's `site_id` so #1–#5 know which Inkress
   merchant to read. `fs-hono/src/db/schema/cms.ts` `sites` is where a typed column
   would go; `fs-hono/src/lib/payments/inkress.ts:31-62` is the existing
   credential-resolution convention to align with.

Non-swap (leave local): cart (`cart.ts`, `cart_lines`), orders/order_lines writes,
discounts, leads, all non-product `{% collection %}` branches, and render_mode
(metadata only).

## DONE
