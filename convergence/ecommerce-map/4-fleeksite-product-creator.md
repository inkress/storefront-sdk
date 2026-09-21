# FleekSite Product + Variant Model, Product Creator, and Storefront Read Path

READ-ONLY investigation. All cites are `file:line`. Repos under `/Users/romario/projects/fleeksite/`.

Run log / status at bottom. This file is written incrementally.

## Repos & branches (confirmed via git)

| Repo | Path | Branch | HEAD |
|---|---|---|---|
| fs-hono (model + runtime, TS/Hono/Drizzle) | `fleeksite/fs-hono` | `feature/hono-migration` | `eea2114` Enforce post publish/expiry dates |
| fs-web (legacy Elixir/Phoenix "mmsapi", the ORIGINAL runtime) | `fleeksite/fs-web` | `feature/upgrade-elixir-1.18.4` | `c6f837e` |
| fs-admin (old Phoenix "mms" admin) | `fleeksite/fs-admin` | `main` | `37d69fd5` patched docker |
| revamp (new admin, "markets" section, Remix) | `fleeksite/revamp` | `feature/ai-webpage-builder` | `56c24244` Unify the admin shell |

fs-hono is the current storefront runtime. fs-web is the Elixir source it was ported from (the TS files carry "ports X from fs-web" headers). The product CREATOR is a separate admin app — discovered below.

---

## 1. VARIANT DATA MODEL (fs-hono schema mirrors the live Postgres DB)

Schema files: `fs-hono/src/db/schema/commerce.ts`, `cms.ts`, `relations.ts`. These are Drizzle definitions that the file headers state "Mirror live DB columns" — i.e. the DB is shared with fs-web; fs-hono did not invent it.

### 1a. `posts` = the logical PRODUCT (and every other content type)

`fs-hono/src/db/schema/cms.ts:133-185`. One table for pages, posts, products, landing, template — discriminated by `type` (integer).

Post `type` values — note TWO conflicting sources:
- `postTypeEnum` at `cms.ts:9` = `['post','page','product','landing','template']` (a pgEnum, but `posts.type` is a plain `integer` at `cms.ts:151`, default 2, so the enum is decorative).
- The runtime query uses **`type = 3` = PRODUCT** (`fs-hono/src/lib/liquid/search/variants.ts:67`, comment "p.type = 3 (PRODUCT)"). So products are `posts.type = 3` in the real data.

Key product-bearing columns on `posts` (`cms.ts`):
- `id` bigserial PK (`:134`)
- `title` (`:135`), `body` (`:136`), `teaser` (`:150`), `permalink` (`:144`), `uid` unique notNull (`:168`)
- `price` doublePrecision (`:145`) — product-level price (denormalized; variant owns the real price)
- `priceMin` numeric (`:146`), `priceMax` numeric (`:147`) — the product's price RANGE across its variants
- `zeroPrice` integer default 100 (`:176`) — the price "scale"/divisor marker (see money units §5)
- `currencyId` (`:140`), `unit` (`:152`)
- `quantity` integer default 1 (`:159`), `sold` integer default 0 (`:160`) — product-level stock counters
- `coverImage` (`:139`), `fileId` (`:163`), `file` (`:157`), `url` (`:158`)
- `meta` json (`:156`) — holds images[]/video/compare_at etc. (see §1d)
- `variants` json (`:161`) — a JSON blob column ALSO named "variants" (legacy/denormalized copy; the real variants live in the `variants` TABLE). Do not confuse with the table.
- `data` json (`:162`), `tags` varchar[] (`:149`), `label` (`:164`), `categoryId` (`:138`)
- `status` integer default 2 (`:148`) — runtime treats **status=1 = published** (`variants.ts:74`)
- `siteId` notNull (`:154`), `userId` (`:175`), `authorId` (`:137`)
- `deleted` bool (`:165`), `expired` bool (`:171`), `expiresAt`/`publishedAt` (`:169-170`)

### 1b. `variants` TABLE = the per-SKU buyable unit

`fs-hono/src/db/schema/commerce.ts:19-45`. Header: "Mirrors live DB columns."

| Column | Type (line) | Role |
|---|---|---|
| `id` | bigserial PK (`:20`) | variant id — the buyable unit id used everywhere in cart/order |
| `sku` | varchar (`:21`) | stock keeping unit code |
| `mpn` | varchar (`:44`) | manufacturer part number |
| `name` | varchar (`:40`) | variant label (e.g. "8oz", "Large / Red") |
| `price` | **doublePrecision notNull default 0** (`:42`) | **the variant owns the price charged** |
| `stock` | integer default **1** (`:23`) | on-hand stock count |
| `unlimited` | boolean default false (`:24`) | if true, stock is not decremented / never out of stock |
| `total` | integer default 0 (`:22`) | (legacy counter) |
| `quantityTotal` | integer default 0 (`:37`) | |
| `quantitySold` | integer default 0 (`:38`) | units sold |
| `zeroTotal` | integer default 100 (`:41`) | price scale marker (cents divisor) |
| `unit` | varchar (`:39`) | unit label |
| `image` | varchar (`:43`) | per-variant image |
| `weight`/`length`/`height` | numeric (`:25-27`) | shipping dims |
| `subscription`/`period`/`periodUnit`/`periodLength` | (`:28-31`) | subscription products |
| `userId` | integer notNull (`:32`) | |
| `siteId` | integer notNull (`:33`) | tenant scope |
| `postId` | integer notNull (`:34`) | **FK → posts.id (the product this SKU belongs to)** |
| `insertedAt`/`updatedAt` | timestamp (`:35-36`) | |

**Price lives on the variant** (`variants.price`, `:42`). **Stock lives on the variant** (`variants.stock` + `variants.unlimited`, `:23-24`). `postId` (`:34`) groups SKUs under one product.

### 1c. Option axes: `attributes`, `options`, `variant_attributes` (join)

This is how "Size/Color → SKU rows" is modelled (classic axis→value→per-variant-assignment):
- `attributes` `commerce.ts:49-58` — an option AXIS on a product: `id`, `postId` (`:53`), `name` (`:54`, e.g. "Size"), `value` (`:55`). Related to post via `attributesRelations` (`relations.ts:180-186`).
- `options` `commerce.ts:62-72` — a VALUE on an axis: `id`, `attributeId` (`:64`, FK→attributes), `value` (`:65`, e.g. "Large"), `cost` int (`:66`), `price` doublePrecision (`:71`), `image` (`:67`), `zeroCost` default 100 (`:70`).
- `variant_attributes` `commerce.ts:75-84` — JOIN assigning a chosen option to a variant: `variantId` (`:77`), `attributeId` (`:78`), `optionId` (`:79`). So a variant = a combination of one option per axis.
- Relations: `variantAttributesRelations` `relations.ts:188-201` (variant ↔ attribute ↔ option). `postsRelations` preloads `variants`, `options`, `attributes` (`relations.ts:74-80`) — comment there explains attributes+options render the variant selector `<select>` on multi-variant products.

### 1d. posts.meta (images[]/video/compare_at)

`posts.meta` json (`cms.ts:156`). (Shape confirmed below in creator/read sections.)

### 1e. Variant relations summary

`fs-hono/src/db/schema/relations.ts`:
- `postsRelations`: post `many(variants)`, `many(options)`, `many(attributes)` (`:74-80`)
- `variantsRelations`: variant `one(posts)` via `variants.postId` (`:161-165`), `one(sites)`, `many(variantAttributes)`
- `cartLinesRelations`: cart line `one(variants)` via `variantId` (`:225-228`) + `one(posts)` via `postId`
- `orderLinesRelations`: order line `one(variants)` via `variantId` (`:253-256`) + `one(posts)`

**posts↔variants = 1:N.** A product (post, type=3) has N variants; each variant is one buyable SKU carrying its own price/stock/image, FK `postId`. Cart lines and order lines reference BOTH `variantId` and `postId`.

### 1f. The default-variant trigger (auto-create one SKU per product)

This is a **Postgres `AFTER INSERT` trigger on `posts`**, NOT app code. fs-hono and fs-web both rely on it (the DB is shared).

- Definition (fs-web): `fs-web/sql/site_domain_trigger.sql:79-92`
- Live prod schema dump: `revamp/mms-schema.sql:327-339` (function) + `revamp/mms-schema.sql:4096` (trigger binding)

```sql
CREATE FUNCTION post_variant_trigger() RETURNS trigger AS $$
  BEGIN
    IF NEW.type = 3 THEN
      INSERT INTO variants(name, price, image, user_id, site_id, post_id, stock)
      VALUES(NEW.title, NEW.price, NEW.cover_image, NEW.user_id, NEW.site_id, NEW.id, NEW.quantity);
    END IF;
    RETURN NEW;
  END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER post_variant_trigger AFTER INSERT ON posts FOR EACH ROW EXECUTE PROCEDURE post_variant_trigger();
```

Behaviour:
- Fires on EVERY posts insert; guarded by `IF NEW.type = 3` → **only products get a default variant.**
- Maps: variant.name ← post.title, variant.price ← post.price, variant.image ← post.cover_image, variant.stock ← **post.quantity**, plus user_id/site_id/post_id.
- Fields the trigger does NOT set fall to column defaults (`revamp/mms-schema.sql:2588-2614`): `sku` DEFAULT `concat('FS', round(random()*1e14))` (auto SKU), `unlimited` DEFAULT false, `total`/`quantity_sold` 0, `zero_total` 100.
- **Creating a product ALWAYS yields exactly one variant** — regardless of which app inserts the post (fs-web, fs-hono, fs-admin, raw SQL), because it is DB-level.
- Confirmed app code does NOT duplicate it: fs-web `content.ex:172-176` just inserts the post; fs-hono `src/routes/api/v1/posts.ts:266-298` inserts the post then only fires a webhook + cache purge — **no `insert(variants)`**.
- (Repair helper, not the create path: fs-web `lib/mmsapi/safe.ex:26-39` backfills a missing variant for site 203 products.)
- fs-hono comment even relies on this behaviour: fk-cart.js:232 "the DB trigger names a product's only variant after the product."

**Consequence for mapping:** a single-variant FleekSite product is a post + one auto-created variant whose name == the product title. Multi-variant products get additional variants inserted explicitly (via the commerce API / admin), and attributes/options/variant_attributes describe the axes.

---

## 2. THE PRODUCT CREATOR UI

There are **two real merchant product creators, on two different commerce backends**, plus the storefront runtime which has no creator UI:

| Repo/UI | Status | Writes to | Model |
|---|---|---|---|
| **fs-admin** post-type=product editor (Phoenix "mms") | LEGACY / operational — what the fs-hono/fs-web storefront actually reads today | MMS Postgres: `posts` + `attributes` + `options` | product-level price/stock; option axes; default variant via DB trigger |
| **revamp** `/admin/markets/products/*` (Remix) | NEW / actively developed, on `feature/ai-webpage-builder`; browser admin traffic now lands here (dashboard.fleeksite.com) | **Inkress API** via `@inkress/admin-sdk` (api-dev.inkress.com sandbox by default) — NOT the MMS DB | per-SKU rows (price/sku/stock/image) as JSON `data.variants.options` |
| fs-web (mmsapi) | storefront + REST API only | — | no authoring UI |

No `CLAUDE.local.md` in any of the three repos. Which one a given merchant hits in production depends on deploy/env (which host serves `/admin`, `INKRESS_API_MODE`), not visible in source — but all structural evidence points to **fs-admin's editor being the live creator for the current storefront, with revamp/Markets → Inkress as the migration in progress.**

### 2a. Legacy creator (fs-admin) — writes the model the storefront reads

Products are `posts` of `type="product"`. The form is `fs-admin/lib/mms_web/templates/post/types/_product.html.eex` (696 lines), rendered by `PostController.edit` → `render "edit.html"` → `types/_product.html`. The main `<form>` posts to `/content/:uid` (`_product.html.eex:6`) → `PostController.update` (`post_controller.ex:199`) → `Content.update_post` (`:297`) writing the **`posts`** table.

Form fields (`_product.html.eex`):
- Product: title (`:24`), teaser (`:32`), permalink (`:40`), status (`:47`), private (`:69`), body/Quill (`:79-82`), tags (`:103`), label (`:109`), primary/secondary color (`:118/:125`), published_at/expires_at (`:146/:155`), external_link/file (`:184/:188`), meta title/description/order_button (`:299/:303/:321`).
- **Pricing & Stock**: `post[price]` (`:207`), `post[currency_id]` (`:211`), `post[unit]` (`:223`), `post[data][discount]` (`:227`), **`post[quantity]` = stock** (`:233`), `post[sold]` (`:237`). So in the classic UI, **price and stock are entered at the PRODUCT level** and the DB trigger (§1f) mirrors them onto the auto default variant (price←post.price, stock←post.quantity).
- **Options (two mechanisms, both on this page):**
  - (a) Simple axes stored in post JSON: `post[data][options][names][]` (`:271`) + `post[data][options][values][]` tagsinput (`:278`); "Add A Variant" button clones a row via jQuery (`.add_variants`, `:260`, `:646`). No per-value price/stock/SKU. (Note the JS never posts to a `/variants/add` — that call is commented out, `:657`.)
  - (b) Richer **Attributes → Options** (the normalized axis model) via a separate AJAX form to `/commerce/attributes/add` (`:371`): `attribute[post_id]` (`:372`), `attribute[name]` e.g. "Color" (`:379`), `values` tagsinput (`:386`). Each option value row carries `options[{id}][value]`, `options[{id}][price]` ("Cost (optional)" — an EXTRA charge added to product price), `options[{id}][image]` (`:519-538`). Handler: `VariantController.add_attribute` (`variant_controller.ex:111`) → `Attributes.insert_or_update` → **`attributes`** table (`:128`), `process_options` → `Options.insert_or_update` → **`options`** table (`:161-183`). Guards: max 5 attributes/product (`:123`), max 5 options/attribute (`:174`).

**Key limitation of the legacy UI:** it writes `posts`, `attributes`, `options` — but **never writes independent `variants` / `variant_attributes` rows** with their own price/stock/SKU. In the classic model those true per-SKU rows are created only by (i) the DB trigger (one default variant), and (ii) the variants REST API (`/api/v1/variants` create/upload/update — fs-hono `commerce.ts:93-208`, fs-web `ApiController.Variant`). The `/variants` router scope in fs-admin (`router.ex:306-313`) references index/create/edit/update actions that **do not exist** in `variant_controller.ex` — a dead standalone variants screen. So multi-SKU-with-own-price authoring in the classic model happens through the API, not the fs-admin form.

### 2b. New creator (revamp "Markets") — writes to Inkress

Files: list `app/routes/admin.markets.products._index.tsx`; **new `app/routes/admin.markets.products.new.tsx`** (2978 lines); **edit `app/routes/admin.markets.products.$productId.edit.tsx`** (near-duplicate); detail `.$productId.tsx`; section shell `admin.markets.tsx`; nav registration `app/components/admin/shell/sections.ts:73-76`.

Form fields (parsed in `new.tsx` action `:183-223`): name(title), shortDescription(teaser), description(body), brand, category, sku, barcode, urlHandle(permalink), productType, price, compareAtPrice, stock, lowStockThreshold, trackQuantity, continueSellingWhenOutOfStock, weight, dimensions, shippingRequired, images(JSON), videoUrl, tags, metaTitle/metaDescription, status, visibility, password, downloadUrl, notes, customFields.

Variant authoring (INLINE on the same form, under a `hasVariants` toggle, `new.tsx:2068`):
- Option axes = free-text names defaulting to `['Size','Color','Material']` (`:901`), inputs `option1Name/2/3` → `variantOptions[0..2]` (`:2088-2138`).
- Variant rows added **manually** via "Add variant" (`:2147-2172`) — **no cartesian/matrix auto-generation**. Each row: `{option1, option2, option3, price, compareAtPrice, sku, barcode, stock, weight, image}` with rendered inputs price (`:2281`), SKU (`:2306`), stock (`:2328`), image (`:2351`).
- Submitted as hidden JSON `<input name="variants">` (`:2372`) + `hasVariants` (`:2373`). `unlimited` is not per-row; inferred product-wide from `trackQuantity` (`:303`).

Write path (`new.tsx` action `:294-405`): builds `productData` with top-level `title`, `teaser`, `price:Number(price)` (`:298`), `status`, `public`, `unlimited:!trackQuantity` (`:303`), `permalink`, `image`, `units_remaining:Number(stock)` (`:317`), and nests everything else under `data` — including **`data.variants = { hasVariants, options: variants }`** (`:364-368`, the SKU rows as a JSON blob). Then calls `marketsClient.createProduct(productData)` (`:404`) / `updateProduct` (`:400`).

`MarketsClient` (`app/lib/markets-client.ts`): `createProduct` (`:549`) → `this.sdk.products.create(payload)` (`:552`); `prepareProductPayload` (`:1255-1282`) passes through `variants`, `data`, `meta`. The SDK is **`@inkress/admin-sdk`'s `InkressSDK`** (`import :13`, `createMerchantSDK :417-424`), configured from `INKRESS_CONFIG` → base URL `https://api-dev.inkress.com` (sandbox) or `https://api.inkress.com` (live) (`app/lib/inkress-sdk.server.ts:51`; config `app/lib/config.server.ts:65-72`, mode defaults to `'sandbox'`). So the revamp Markets creator authors per-SKU variants but sends them to **Inkress**, not the FleekSite posts/variants DB — this is the convergence target, and it is the UI whose data shape (per-SKU price/stock/sku/image) already matches the Inkress product model.

### 2c. Reconciliation for the mapping

- The **`variants` table** fully supports per-SKU price/stock/image/sku (§1b) and is the storefront's source of truth for pricing/stock/charge.
- The **classic authoring UI (fs-admin)** under-uses it: it authors product-level price/stock + option axes (attributes/options) and leans on the DB trigger for the single default variant; true per-SKU variant rows come from the `/api/v1/variants` API.
- The **revamp Markets UI** is the one that authors per-SKU rows the way Inkress models them — and it already targets Inkress. So the FleekSite→Inkress product mapping is: FleekSite `posts`(type=3)→Inkress product; FleekSite `variants`→Inkress per-SKU variants (the natural join, since both are "buyable SKU under a product with own price/stock"); FleekSite `attributes`/`options`→Inkress option axes/values.

---

## 3. HOW THE STOREFRONT READS + PRICES VARIANTS

The storefront runtime is **fs-hono** (server-rendered Liquid) plus a small vanilla-JS layer in the theme kit (`theme-catalogue/pipeline/kit/core/fk-cart.js`, `fk.js`). Two live ports: Halyard (Dawn) demosite.fleeksite.com, Tideline (Horizon) loaded.fleeksite.com (`STOREFRONT-SDK-REQUIREMENTS.md:13-15`).

### 3a. Product grid = the `variants` collection with `distinct: post_id` (NOT posts)

Critical platform fact: **`{% collection posts %}` does NOT load variants**, so a product card built from `posts` has no price and no stock. Every grid/search/related-row is built on the **`variants`** collection, which inner-joins each variant to its product (`v.post`). `distinct: post_id` collapses to one card per product while still giving a variant id to add to the bag.
- Grid: `theme-catalogue/pipeline/kit/sections/shop-grid.liquid:4-16` — `{% collection variants, fk_shop, limit: 24, order: id asc, exclude_params: true %}`; reads `v.price` (`:40`), `v.stock`/`v.unlimited` (`:36`), `p.meta.compare_at > v.price` for sale (`:38`); card carries `data-price="{{ v.price }}"`, `data-title`, the variant id for the buy button.
- The distinct-by-product SQL: `fs-hono/src/lib/liquid/search/variants.ts:144-179` — `db.selectDistinctOn([posts.id], { v: variants, p: posts }).innerJoin(posts, eq(variants.postId, posts.id))`. Default filters `posts.type=3`, `status=1`, not deleted, not expired (`:62-87`). Filters: `q` (ilike name/title/body/tags), `sku`, `mpn`, `stock_greater_than/less_than`, `label`, `category`, `tag`, `order "col asc|desc"` (`:94-142`).

### 3b. search.json (live search endpoint = a Liquid template, post type 10)

`theme-catalogue/pipeline/kit/pages/search.json.liquid`. Uses `{% collection variants, fk_pv, q: <q>, limit: 10, distinct: post_id %}` (`:20`). Emits per product hit (`:23-30`):
```json
{ "title": p.title, "url": p.permalink, "image": p.cover_image,
  "price": v.price, "label": p.label,
  "available": (v.unlimited or v.stock > 0) }
```
Plus a `pages[]` array from `blogs&questions&pictures` (`:36-43`). Envelope documented in `STOREFRONT-SDK-REQUIREMENTS.md:127`.

### 3c. Cart contract (client-owned; server stores an opaque blob)

The server does NOT model the cart. `POST /api/v1/cart` stores an opaque `info` jsonb, one row per (site_id,user_id) in `cart_lines`; "line management is the client's responsibility" (`fs-hono/src/routes/api/v1/cart.ts:1-15,47-80`). Guests are 401 on `/api/v1/cart` (`requireAuth`, cart.ts:49) so the bag lives in localStorage until sign-in (fk-cart.js:20-21,188-211).

**The cart item shape** (the only server-parsed contract), `CheckoutService` `CartInfoLine` `fs-hono/src/services/checkout.service.ts:32-40`:
```
info.items[] = { variant_id, post_id, price, quantity, total, title }
```
fk-cart.js builds each line from the buy form's `data-fk-*` dataset (fk-cart.js:154-165, 498-507): `variant_id`, `post_id`, `title`, `variant_name`, `image`, `href`, `price` (major units), `max` (= stock, or null when `unlimited==1`), `quantity`, `total`.

### 3d. Stock check (bulk)

- `POST /api/v1/variants/check_stock` — body `{ variant_ids: [] }` (or `{items:[{variant_id}]}`), returns `{ data: { items: [{ id, stock }] } }`. `fs-hono/src/routes/api/v1/commerce.ts:73-91`. fk-cart calls it right before placing the order and trims/blocks lines that now exceed live stock (fk-cart.js:582-615).
- Per-product stock: `GET /api/v1/variants/stock/:uid` returns id/name/sku/stock/total/price/quantitySold for every variant of a product (`commerce.ts:56-70`).
- `unlimited==true` means no ceiling; `stock` only meaningful when false (SDK-requirements §3.4; enforced in check_stock consumer fk-cart.js:596,599).

### 3e. Checkout charges from the VARIANT-derived order

- Browser posts `POST /payments/checkout` with `{ email, phone, paymentMethod, notes, items:[{variant_id,quantity}], discountCode, shippingAddress, billingAddress }` (fk-cart.js:631-657). Route: `fs-hono/src/routes/payments/index.ts:33`.
- `CheckoutService.processCheckout` (`checkout.service.ts:42-127`): loads the cart_lines row, reads `info.items[]`, `subtotal = Σ price×quantity` (`:60-68`), inserts `orders` (total, `price=total/100`) and one `order_lines` row per item carrying `variantId`, `postId`, `quantity`, `total`, `price`, `itemPrice` (`:99-114`). So **each order line references the variant it charged**; the variant owned the price.
- Provider dispatch by `paymentMethod`: stripe/paypal/wipay/inkress (`payments/index.ts:66-123`). Return URL `/order/confirm/:uid`, cancel `/cart`.
- **DISCREPANCY to flag:** in this fs-hono branch, `/payments/checkout` forwards to `processCheckout` which prices from the STORED `cart_lines.info.items[].price` (client-supplied) and IGNORES `body.items`. It does NOT re-price/re-stock-check from the variant ids server-side. The theme docs assert the intended contract is "the server prices every line; the bag sends ids + quantities only" (SDK-requirements §3.1; "Resolved 2026-09-18 jamlance/fs-web#26" in COMMERCE.md:63-72). That server-reprice is present in deployed fs-web but NOT in the fs-hono port at `feature/hono-migration` HEAD. Worth verifying before trusting fs-hono checkout as authoritative.

### 3f. Liquid context bindings for a product page

- `current_user` in Liquid context (`fs-hono/src/lib/liquid/context.ts:146`); `page.variants` defaulted on a post (`context.ts:235-236`); `page.meta` defaulted (`:235`).
- Pages that vary by user are not cached (`fs-hono/src/routes/site/pages.ts:133`).

---

## 4. WHAT A FLEEKSITE "VARIANT" IS

A **variant is the per-SKU buyable unit** — the thing a customer actually adds to the bag and pays for. Concretely:
- Its own row in the `variants` table with its own `id` (bigserial), `sku`, `price` (doublePrecision), `stock` + `unlimited`, `name`, `image`, `mpn`, `quantitySold` (`commerce.ts:19-45`).
- Grouped under a **product** = a `posts` row of `type=3` via `variants.postId` FK (1 product : N variants).
- Every product has **at least one** variant (the DB trigger auto-creates a default named after the product; §1f).
- The **variant owns the price and the stock** that the storefront reads, prices, stock-checks and charges. The product (post) carries only a denormalized `price`/`priceMin`/`priceMax` range (kept in sync by `updatePostPriceRange`, `commerce.ts:288-303`) for display/sorting; it is not the source of truth for a purchase.
- Multi-axis products (Size/Color) attach option axes via `attributes` (axis) → `options` (values) → `variant_attributes` (which option this variant is), so a variant = one option per axis (§1c).
- Cart lines and order lines reference the variant by `variant_id` (plus `post_id`). The order charges the variant's price.

One line: **a FleekSite variant is a priced, stocked, individually-identified SKU (id/sku/price/stock/image/name) that belongs to exactly one product (post type=3) and is the unit the storefront sells.**

---

## 5. MONEY UNITS — the known inconsistency

`variants.price` is `doublePrecision`; `orders.total`/`order_lines.total`/`zero_total` are `integer`. There is **no single, enforced convention** — different layers disagree:

| Layer | Treats `variants.price` as | Cite |
|---|---|---|
| Storefront JS (fk-cart) | **MAJOR units** (dollars); converts to minor for arithmetic via `minor(m)=round(m*100)` | `fk-cart.js:31-37` ("Variants come off the server as doublePrecision major units") |
| Liquid `price` filter | **MAJOR units** — renders raw with 2 decimals, NO `/100` (and floors <1.00 → 0.00) | `fs-hono/src/lib/liquid/filters.ts:128-137` |
| Theme docs (stated contract) | **MAJOR units end to end** (`orders.total` is major units) | `STOREFRONT-SDK-REQUIREMENTS.md:142-145` |
| fs-hono API JSON formatter | **CENTS** — `formatPrice` does `cents/100` | `fs-hono/src/utils/price.ts:8-13` used by `utils/formatters/variant.ts:51` |
| CheckoutService / order rows | **CENTS** — "Compute totals (cents)"; stores `order.price = total/100`, `order_lines.price = it.price/100` | `checkout.service.ts:60-68,93,110-111` |
| Inkress payment adapter | **GUESSES by magnitude** — `amount > 100 ? amount/100 : amount` | `fs-hono/src/routes/payments/index.ts:106-108` |

So the same `price` number is read as dollars by the storefront/Liquid and as cents by the fs-hono API formatter + CheckoutService + order rows, and the Inkress adapter guesses. COMMERCE.md:74-80 and SDK-requirements §3.3 both flag this as a **live, unresolved bug** ("a guess here charges someone 100x wrong … Verify against a real `orders` row before any theme takes a payment"; see `theme-catalogue/CHECKOUT-TODO.md`). The kit's mitigation: keep ONE conversion point (`money()`/`minor()` in fk-cart.js) and treat `variants.price` as major units until verified.

**For the Inkress mapping:** decide the canonical unit explicitly. Inkress products/prices must land on ONE unit; do not inherit FleekSite's ambiguity.

---

## 6. WHAT FLEEKSITE NEEDS FROM A BACKEND (capabilities to map onto Inkress)

The FleekSite storefront (Liquid + fk-cart.js) requires a backend to provide, at minimum:

1. **Per-SKU price** — each buyable unit carries its own price; grid/search/cart/checkout all read `variant.price`. A product without variants is unbuyable (no price, no id to bag). (`shop-grid.liquid:4-16`, `search.json.liquid:20-30`.)
2. **Per-SKU stock + unlimited flag** — `variant.stock` (int) and `variant.unlimited` (bool). `unlimited` means no ceiling; `stock` only meaningful when false. Drives the buy button ("Sold out"), the qty `max`, and sale/availability. (`commerce.ts:22-24`; SDK-requirements §3.4.)
3. **Bulk stock re-check** — `POST /variants/check_stock { variant_ids:[] } → [{id, stock}]`, called immediately before order placement to trim/refuse over-sold lines. (`commerce.ts:73-91`; fk-cart.js:582-615.)
4. **Grid grouping = one card per product, but each card owns a variant id** — the "distinct by product, joined to product" query. Backend must return variants joined to their product with a `distinct: post_id` (one row per product) yet expose the variant id + price + stock + `v.post.{title,permalink,cover_image,label,meta}`. (`variants.ts:144-179`.)
5. **Search shape** — `GET /search.json?q= → { products:[{title,url,image,price,label,available}], pages:[...] }` and a `variants` collection with `q` (title/body/tags ilike), `label`, `category`, `tag`, `order`, `limit`, `exclude`, `distinct`. (`search.json.liquid`; SDK-requirements §1.)
6. **Cart item shape (server-parsed)** — `info.items[] = {variant_id, post_id, price, quantity, total, title}` stored as an opaque blob via `POST /api/v1/cart {info:{items,currency}}` (signed-in), else client-held. (`checkout.service.ts:32-40`, `cart.ts`.)
7. **Server-priced checkout from variant ids** — accept `items:[{variant_id, quantity}]`, price + stock-check + site-scope each line server-side, create an order with one line per SKU referencing `variant_id`, hand off to a payment provider, return `{order:{uid,total}, payment:{frame_url|client_secret|approve_url}}`. (SDK-requirements §2,§3.1; `payments/index.ts`; NOTE the fs-hono gap in §3e.)
8. **A stable money unit** — one canonical unit end-to-end (see §5); today it is ambiguous.
9. **Product media beyond one image** — product carries a single `cover_image`; extra media lives in `posts.meta` (`meta.images[]`, `meta.video`, `meta.video_poster`) and the sale/compare-at is `meta.compare_at` (a "was" price above `price`). (SDK-requirements §1 "Fields read off a product / variant"; `shop-grid.liquid:38`.)
10. **Option axes → SKUs** — Size/Color style axes (attributes) with values (options) resolving to per-SKU rows (variant_attributes), so a customer picking options selects a specific variant id. (`commerce.ts:49-84`.)
11. **Customer accounts + guest checkout** — `/auth/*` (login/signup/logout/me/code/reset), `current_user` in render context, `orders` scoped to `user: current_user.id`; guests can buy (no wall). (SDK-requirements §2,§3.2.)
12. **Currency display vs charge** — render-time exchange rates into the page (cacheable), charge in the shop's own currency. (`fk-cart.js:38-99`; `filters.ts exchange`.)


---

## Run log

- Confirmed branches: fs-hono `feature/hono-migration`, fs-web `feature/upgrade-elixir-1.18.4`, fs-admin `main`, revamp `feature/ai-webpage-builder`.
- Schema read directly from fs-hono `src/db/schema/{commerce,cms,relations}.ts`.
- Default-variant trigger `post_variant_trigger` located in fs-web `sql/site_domain_trigger.sql:79-92` and prod dump `revamp/mms-schema.sql:327-339,4096` (via subagent, cross-checked).
- Storefront read/charge paths read directly from fs-hono `src/routes/api/v1/{commerce,cart}.ts`, `src/services/checkout.service.ts`, `src/routes/payments/index.ts`, `src/lib/liquid/{filters.ts,search/variants.ts}`, `src/utils/{price.ts,formatters/variant.ts}`.
- Cart contract + storefront-needs corroborated by theme-catalogue `COMMERCE.md`, `STOREFRONT-SDK-REQUIREMENTS.md`, `pipeline/kit/core/fk-cart.js`, `pipeline/kit/pages/search.json.liquid`, `pipeline/kit/sections/shop-grid.liquid`.
- Creator UIs read directly (revamp `admin.markets.products.new.tsx`, `app/lib/markets-client.ts`, `app/lib/inkress-sdk.server.ts`; fs-admin `templates/post/types/_product.html.eex`, `controllers/variant_controller.ex`, `router.ex`) and cross-checked by subagent.

## Open items / caveats (flagged, not resolved)

1. **Money-unit bug is live and unresolved** (§5) — canonical unit must be decided before mapping to Inkress. See `theme-catalogue/CHECKOUT-TODO.md`.
2. **fs-hono `/payments/checkout` does not re-price/re-stock-check from request `items`** (§3e) — it prices from the stored `cart_lines.info` (client-supplied prices). The "server prices every line" contract (SDK-requirements §3.1, fs-web#26) is NOT implemented in this fs-hono branch. Verify against deployed fs-web before treating fs-hono checkout as authoritative.
3. **Two backends** — fs-admin authors the MMS `posts`/`variants` DB the storefront reads; revamp Markets authors Inkress (sandbox by default). Whether/how revamp-created products reach the live storefront (via Inkress) is out of scope here and unverified.
4. **Legacy UI under-populates the `variants` table** (§2c) — per-SKU price/stock rows come from the `/api/v1/variants` API, not the fs-admin form.

## DONE
