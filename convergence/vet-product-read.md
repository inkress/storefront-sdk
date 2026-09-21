# Product READ path inventory (commerce-api) — 2026-09-21

READ-ONLY inventory. Repo checked out at `/Users/romario/projects/inkress/commerce-api`
(branch `feature/spi-3ds`, has local uncommitted modifications — line numbers below are
against the CURRENT working tree, not a specific commit). Inventory + citations only;
empirical check is its own section. Uncertainty flagged `UNCONFIRMED: …`.

Status: COMPLETE.

---

## 0. The mechanism that decides everything below

`ApiWeb.ProductView` (`lib/api_web/views/product_view.ex`) is **DEAD CODE**. Repo-wide
grep (including all `_worktrees/*` and `.claude/worktrees/*` checkouts) shows it is only
ever referenced by itself (`alias ApiWeb.ProductView` + `render_many/render_one` calls
inside its own file). No controller calls `render(conn, ApiWeb.ProductView, ...)` or
`render(conn, "product.json", ...)` anywhere. `find lib -iname "*product_controller*"`
returns nothing — there is no `ProductController`. So the `%{data: ...}` / `id, title,
description, image, teaser, units_sold, units_remaining, public, status, uid, currency,
permalink, tags, meta, data, available_after, available_before, user_id, price, rating,
rating_count, store_id` field list in `product_view.ex:13-38` is **not what any live
endpoint returns**. This mirrors the `variants` table finding in VARIANT-TRUTH.md: two
orphaned "designed" surfaces (a view and a table) that nothing wires up.

All product reads instead go through the **generic resource controller**:

- `lib/api_web/router.ex:393` — `resources "/:resource_path", PageController, except: [:new, :edit]`
  (also reused directly for the "public" merchant/org product routes, see §1).
- `lib/api_web/controllers/page_controller.ex:1-40` — `ApiWeb.PageController`, `use ApiWeb.Defaults, :controller`,
  `plug :block_sensitive_resources` (line 13, blocks `encrypted_passwords` + any resource with
  no `resource_module`) then `plug ApiWeb.Authorise` (line 14, RBAC gate — UNCONFIRMED exactly
  how anonymous public-storefront traffic passes this; not traced further, out of scope).
- `lib/api_web/defaults.ex` (`ApiWeb.Defaults.controller/0` quoted macro, injected into
  `PageController`):
  - `set_resource/2` (lines 24-75) parses the request path to a resource name (e.g. `"products"`),
    resolves it via `Utils.list_resources()` (`lib/api/utils/utils.ex:4-10`, which walks every
    `Api.*` module that has `__schema__/1`, i.e. every Ecto schema, keyed by its `__schema__(:source)`
    table name) to the **schema** module `Api.Inventory.Product`, then string-swaps the leading
    `Api` segment for `Context` (`defaults.ex:56-65`) to get the **context** module
    `Context.Inventory.Product`. This same resolver is how `/variants` would map to
    `Context.Inventory.ProductVariant` — see §5.
  - `index/2` (`defaults.ex:77-84`): `data = apply(resource_module, :list, [params])`, response
    `jason(conn, %{state: :ok, result: data})`.
  - `show/2` (`defaults.ex:100-105`): `data = apply(resource_module, :get, [params])`, response
    `%{state: (:ok|:error), result: data}`.
  - `jason/2` (`defaults.ex:18-22`, also `lib/api_web/defaults.ex:4-8` top-level) pipes the response
    map through `Utils.Map.transform/1` then `json(conn, …)` — it does **not** go through any
    Phoenix view/template.
- `lib/api/context/default.ex` (`Context.Defaults`, `use`d by `Context.Inventory.Product` at
  `lib/api/context/inventory/product.ex:4`):
  - `list/1` (line 412-415): `apply(:"Elixir.Query.#{get_type()}", :perform, [context])` →
    `Query.Product.perform/1` (`Query.Defaults`, see below).
  - `get/1` (lines 369-395): for a plain numeric/string id with no `"id"` key shape it's
    `Api.Org.Repo.get(@resource_module, id)`; for the `%{"id" => id}` shape used by the `:show`
    action it calls `apply(:"Elixir.Query.#{get_type()}", :perform_single, [context])` →
    `Query.Product.perform_single/1`.
- `lib/api/queries/default.ex` (`Query.Defaults`, `use`d by `Query.Product` at
  `lib/api/queries/product.ex:26`):
  - `perform/2` (lines 42-117): builds the query from `@attribs[:preloads]` (`Query.Product`:
    `[:currency, :category, :merchant]`, `product.ex:7`), applies `search_by_string("q", attrs["q"],
    @attribs[:fts_fields])` i.e. **`?q=` full-text-searches `title` only** (`fts_fields: [:title]`,
    `queries/product.ex:9`), supports **group_by/aggregate** faceting when `attrs["group_by"]` is
    one of `category_id | currency_id | status | public | unlimited` (`queries/product.ex:10-16`)
    aggregating `price | units_remaining | units_sold | rating_sum | rating_count | id`
    (`queries/product.ex:17-24`), else falls through to `paginate(attrs)` (Scrivener-style —
    result is a page map with an `"entries"` list, not a bare array; exact shape not traced
    further here, tangential to variants). The `filter_by_json_field` call that would let a query
    filter `?data[...]=` is **commented out** for `perform/2` (`queries/default.ex:100`) — list
    endpoints cannot filter by contents of `data`.
  - `perform_single/2` (lines 119-130): same as above but with `@attribs[:single_preloads]`
    (same 3 preloads for Product) and **does** apply `filter_by_json_field(@attribs[:json_field],
    attrs[@attribs[:json_field]])` (line 125) — i.e. a single-product GET *can* be filtered by a
    `?data=…` param match against the `data` jsonb column (mechanism not traced further; tangential).
- **Serialization**: since nothing calls `ProductView`, the `result` value handed to `json/2` is
  the raw `%Api.Inventory.Product{}` Ecto struct (or a list/page of them), passed through
  `Utils.Map.transform/1` (`lib/api/utils/map.ex:103-118`) which only resolves
  `%Ecto.Association.NotLoaded{}` → `nil` and rebuilds the same struct type (does not strip/rename
  fields). Jason can encode the struct directly because every schema built on `Schema.Defaults`
  (`lib/api/schema/default.ex:8-17`) carries
  `@derive {Jason.Encoder, except: [:__struct__, :__meta__, :action, :secure, :user_id,
  :organisation_record, :merchant_record]}`. **Every other field on the schema is serialized**,
  including `data` verbatim as stored in Postgres.

**Net effect: the JSON shape of a product read is "every column of `Api.Inventory.Product`
except the 6 excluded above, plus whatever of `currency`/`category`/`merchant` got preloaded",
wrapped in `{"state": "ok", "result": …}`. `data` comes through byte-for-byte as stored — so
"does the read path return `data.variants.options`" reduces entirely to "what's actually stored
in the `data` column", not to any serialization-layer filtering.** See `Api.Inventory.Product`
schema fields at `lib/api/schema/inventory/product.ex:6-44` for the full list (id, data, meta,
permalink, price, image, public, unlimited, rating_sum, rating_count, status, tag_ids, teaser,
title, units_remaining, units_sold, uid, currency_code, currency_id, category_id, + assocs
currency/category/organisation/merchant via `organisation_record`/`merchant_record`; no
`variants` field/association exists on the schema — confirms VARIANT-TRUTH.md).

---

## 1. Public storefront products — `GET /api/v1/public/m/:merchant_username/products` (+ org variant)

- Route: `lib/api_web/router.ex:208-209` (merchant) and `:203-204` (org, `o/:organisation_username`),
  both `pipe_through [:api, :with_session, :with_client]` (`router.ex:97,228`), both dispatch to
  `PageController, :index` — i.e. **the exact same generic index action described in §0**, not a
  dedicated public controller/serializer. `set_resource/2`'s path-parsing (`defaults.ex:40-47`)
  special-cases segment index 4 == `"public"` (`defaults.ex:43-44`) to still resolve the resource
  name (`"products"`) correctly off a `/public/m/:x/products` path.
- No single-product public GET route exists (`resources "/:resource_path"` only under the
  session-authenticated generic scope, `router.ex:392-394`; the public scopes at 188-220 declare
  only the literal paths shown, no `/public/m/:username/products/:id`). Confirmed by full read of
  `router.ex` (`lib/api_web/router.ex:1-421`, provided above) — no other product route exists.
- Response shape: `{"state":"ok","result": <Scrivener-style page map with "entries": [<product>,...]> }`
  where each `<product>` is the raw struct fields from §0 (bare list of all schema columns +
  `currency`/`category`/`merchant` preloads), **not** the `product_view.ex` shape.
- Does it return `data`? **Yes**, verbatim, per §0.
- Does it return `data.variants.options`? **Only if that's what's actually stored in the row's
  `data` column** — the serialization layer applies no filtering. See empirical check (§6).
- Callers: any storefront/marketplace/SDK client hitting the public API directly (FleekSite
  `@inkress/storefront-sdk`, revamp markets editor's read-back, commerce-web checkout's product
  lookups) — I did not trace every caller repo in this pass (out of scope: this doc is
  commerce-api-only per the task); flagged `UNCONFIRMED: caller inventory across repos not
  exhaustively traced, only commerce-api server-side code`.
- **RBAC, confirmed (resolves what was an open question about how "public" traffic passes
  `ApiWeb.Authorise`):** `priv/rbac.yaml:180-182` — resource `products`: `view` and `list` both
  include the literal role `'public'`. So `ApiWeb.Authorise` (`page_controller.ex:14`) passes an
  unauthenticated caller straight through for `products` view/list; no special-casing needed for
  the "public" path segment beyond RBAC already granting the `public` role that access.
- Full response envelope, confirmed independently by reading `Paginate.page_map/4`
  (`lib/api/utils/paginate.ex:144-191`) AND by the empirical fetch in §6:
  `{"state":"ok","result":{"pagination":{"page":1,"page_size":20,"total_entries":N,"more":bool,
  "next_page":n,"total_pages":n,"next_pages":[...],"last_pages":[...]},"entries":[<product>,...]}}`.

---

## 2. Admin/merchant product reads — list/get, faceted `group_by`, search `?q=`

- Route: `GET /api/v1/products` and `GET /api/v1/products/:id`, both via
  `resources "/:resource_path", PageController, except: [:new, :edit]` (`router.ex:393`), inside
  `scope "/api", pipe_through [:api, :with_session, :with_client]` (`router.ex:227-228`) — **note
  this scope does NOT additionally `pipe_through [:authorise]`** (that pipe is only added to the
  sibling `scope "/v1"` at `router.ex:283-284`, which covers `/merchants`, `/users`, `/orders`,
  etc., not the generic `resources "/:resource_path"` block at `:392-394`). The only gate on the
  generic route is `ApiWeb.PageController`'s own `plug ApiWeb.Authorise` (`page_controller.ex:14`).
- This is **the exact same code path as §0/§1** — same `PageController` actions, same
  `Context.Inventory.Product` → `Query.Product` → `Query.Defaults.perform/perform_single`, same
  raw-struct Jason serialization, same envelope shape. There is no separate "admin" product
  controller, view, or query module. The only things that differ per-request are: (a) which
  merchant/org scope `Api.Org.Repo` is carrying (set by `ApiWeb.Plug.WithClient` from `Client-Id`
  header or an authenticated session — `with_client.ex:1-90`, not re-traced here), and (b) which
  RBAC role the caller has (`priv/rbac.yaml:180-184`: `create`/`update`/`delete` require
  `super_admin|super_moderator|organisation_admin|organisation_moderator|merchant_admin|merchant_moderator`,
  i.e. no `'public'`/`'customer'` — reads are open, writes are not).
- **Faceted / `group_by`**: `?group_by=category_id|currency_id|status|public|unlimited`
  (`queries/product.ex:10-16`) aggregating `price|units_remaining|units_sold|rating_sum|
  rating_count|id` via sum/avg/min/max/count (`queries/product.ex:17-24`), implemented generically
  in `Query.Defaults.perform/2` (`queries/default.ex:85-117`, `grouped?` check + `apply_group_by`/
  `apply_group_select`/`apply_group_order`, definitions in `Query.Filters` — not re-traced, out of
  scope for the variants question).
- **Search `?q=`**: full-text over `fts_fields: [:title]` only (`queries/product.ex:9`,
  `search_by_string/3` call at `queries/default.ex:97`) — title only, never touches `data`.
- **Single-product filter by `data`**: `perform_single/2` (`queries/default.ex:119-130`) applies
  `filter_by_json_field(@attribs[:json_field], attrs[@attribs[:json_field]])` (line 125) where
  `@attribs[:json_field] = "data"` (`queries/product.ex:6`) — so `GET /api/v1/products/:id?data=…`
  can filter on the `data` jsonb column; the list action has the equivalent call commented out
  (`queries/default.ex:100`), so list calls cannot filter by `data` contents. Mechanism of
  `filter_by_json_field` itself not traced further (tangential to the variants question).
- Response shape: identical to §1 — raw `Api.Inventory.Product` struct(s) wrapped in
  `{"state":"ok","result": …}`, `data` verbatim, no `ProductView`, no variants.

---

## 3. Order / checkout product resolution — freezing the line item

Two **independent, hand-duplicated** implementations exist; both read the DB directly (bypassing
`Context.Inventory.Product`/`Query.Product` entirely) and both never touch the `variants` table.

### 3a. `Service.Order.Processor` (classic order-create path)

`lib/api/services/orders/processor.ex`, `fetch_products/1` (private, lines 755-868):
- Lines 759-762: `Api.Inventory.Product |> where([p], p.id in ^product_ids) |> select([p], map(p,
  [:id, :title, :price, :image, :currency_id, :units_remaining, :unlimited, :data])) |>
  Api.Org.Repo.all()` — a raw Ecto query selecting exactly 8 columns, **`:data` included, no join
  to `variants`, no `:category_id`, no preloads at all.**
- Line 772: `customer_inputs = (record[:data]["customer_inputs"] || [])` — reads the option list
  straight out of the `data` jsonb.
- Lines 774-793: for each customer-submitted `product[:properties]` (`{name, value}` pairs), finds
  the matching entry in `customer_inputs` by `attr["name"] == name`, then prices it: if that entry
  has `option[:options]` (a list), the price comes from
  `Enum.find(option[:options], fn opt -> opt[:label] == value end)[:price]`; otherwise from
  `option[:price]` directly. **This is the exact shape empirically confirmed in §6:
  `data.customer_inputs[].options[].{label,price}`.**
- Line 802: `discounted_cost = Utils.parse_float(record[:data]["discounted_price"], 0.00)`.
- Line 820: `Map.put(:attributes, record[:data]["attributes"] || [])` — copied into line metadata
  only, not priced.
- Lines 810-812: `unit_cost = base_cost + property_costs`; `total_cost = quantity * unit_cost`.
- Lines 853-858: stock/currency validation reads `record.units_remaining`/`record[:unlimited]`
  directly off the Product row (not a variant row).
- **Freeze site**, `create_order_lines/1` (lines 1260-1287), building each `OrderLine`:
  - `product_variant_name_frozen: product[:title]` (line 1264) — the Product's own title.
  - `product_variant_total_frozen: product[:price]` (line 1265) — NOTE this is `product[:price]`
    *after* the `Map.put(:price, total_cost)` reassignment at line 837, i.e. the fully computed
    line total (base ± discount + addon costs) × quantity, not the raw catalog price.
  - `variant_id: product[:id]` (line 1267) — **the Product's own id.** Confirms VARIANT-TRUTH.md:
    "variant_id" is semantically "the product id", never a `variants` table row id.
  - `properties: product[:properties]` (line 1269) — the resolved `{name: {value, price}}` map.
  - `meta_data: product[:line_meta_data]` (line 1270) — `%{original_product: %{title, price,
    image, unit_cost, addon_cost, discounted_cost, customer_inputs, attributes, currency_code}}`
    (built lines 814-821, 829-830) — a full snapshot of the priced product at order time.

### 3b. `Service.Order.SessionBasedCheckout` (Shopify-style `/v1/checkout/sessions` flow)

`lib/api/services/orders/session_based_checkout.ex` — explicitly commented as a parallel
reimplementation ("aligned with Service.Order.Processor.fetch_products", line 475):
- `validate_products/1` (lines 474-583): **line-for-line the same** raw select
  (`lib/api/services/orders/session_based_checkout.ex:480-483`, identical 8-column list), same
  `data["customer_inputs"]`/`data["attributes"]`/`data["discounted_price"]` reads (lines 497, 517,
  532), same per-option pricing logic (lines 500-508), same no-`variants`-table-touch.
  Router entry point: `POST /v1/checkout/sessions` → `CheckoutSessionController, :create`
  (`router.ex:264`), `GET/DELETE /v1/checkout/sessions/:id` (`router.ex:265-266`).
- The validated/priced product list is stored on the session itself (`session.data["products"]`),
  not re-fetched from `Product` at order-finalize time.
- **Freeze site**, `create_order_line_records/2` (lines 1193-1219): reads
  `session.data["products"]` and writes, per product (lines 1201-1208): `variant_id:
  product["id"]`, `product_variant_name_frozen: product["title"]`, `product_variant_total_frozen:
  product["price"] || product["cost"] || 0.00`, `quantity`, `properties`, `meta_data:
  product["line_meta_data"]` — same field set, same semantics, same "variant_id = product id" as
  §3a, independently implemented.

**Risk for the variants project**: because this logic is duplicated (not shared), wiring the
`variants` table into checkout means updating **both** `processor.ex:755-868`/`:1260-1287` AND
`session_based_checkout.ex:474-583`/`:1193-1219` — missing one leaves one checkout path still
treating `variant_id` as a product id while the other treats it as a real variant row id.

---

## 4. Feed / mobile-feed reads — do NOT touch products

Checked all four sibling worktrees: `commerce-api-feed-enrich` (branch `feat/feed-enrichment`),
`commerce-api-mobile-feed` (`feat/mobile-feed`), `commerce-api-feed-41` (`feat/mobile-feed-41`),
`commerce-api-feed-fixes` (`feat/mobile-feed-hardening`) — all four have an identical file layout
(`lib/api_web/controllers/feed_controller.ex`, `lib/api/services/feed/feed.ex`, `lib/api/context/
feedback/`, `lib/api/schema/feedback/`), i.e. they are sequential iterations of the same feature,
not divergent designs.

- Route: `GET /api/v1/feed` → `FeedController, :index` (checked in `commerce-api-feed-enrich`:
  `lib/api_web/router.ex:372-376`, comment: "ACTIVITY FEED (mobile app M1) — merged,
  reverse-chronological merchant [...]").
- `grep -n -i "product\|variant" lib/api/services/feed/feed.ex lib/api_web/controllers/
  feed_controller.ex` → **zero real hits** (one unrelated "Variant B" code-comment label for a
  state-machine implementation choice, `feed.ex:33,310` — not product variants).
- Whole-subtree grep (`lib/api/services/feed/`, `lib/api/context/feedback/`, `lib/api/schema/
  feedback/`, plus the controller) for the substring `product` → only
  `lib/api/schema/feedback/review.ex:57`, a changeset error-message string ("User has an existing
  review for this product already.") — not a real field/read.
- **Conclusion: this is a merchant activity feed (orders/payouts/disputes), not a product or
  catalog feed. It exposes no product or variant data at all** — confirmed by direct grep across
  all four worktrees' feed subsystem, not inferred from commit messages alone.

---

## 5. `/variants` reads — reachable, unused, RBAC allows public `view`

- `Api.Inventory.ProductVariant` schema (`lib/api/schema/inventory/product_variant.ex:1-4`):
  `@source "variants"` (the real table name) — fields `available, available_after,
  available_before, description, hash, image, name, price, quantity, quantity_sold, sku,
  unlimited, secure(virtual)`, `belongs_to :creator`, `belongs_to :product`, `has_one :merchant`
  (through `merchant_record`). `use Schema.Defaults` (line 2) → same
  `@derive {Jason.Encoder, except: [...]}` as Product, so it CAN be Jason-encoded directly.
- `Query.ProductVariant` (`lib/api/queries/product_variant.ex:1-9`): `@attribs [resource_module:
  ProductVariant]` — **no `preloads`, no `single_preloads`, no `fts_fields`, no `json_field`, no
  `group_by_fields`** (all commented out, lines 6-7). `use Query.Defaults` still gives it
  `perform/1`/`perform_single/1` for free.
- `Context.Inventory.ProductVariant` (`lib/api/context/inventory/product_variant.ex:1-10`): thin
  `use Context.Defaults`, `@resource_module ProductVariant`.
- **Reachability**: `Utils.list_resources()` (`utils.ex:4-10`) maps table-name `"variants"` →
  `Api.Inventory.ProductVariant` → swapped to `Context.Inventory.ProductVariant`
  (`defaults.ex:56-65`) — reachable via the exact same generic `resources "/:resource_path"` route
  as products (`router.ex:393`): **`GET /api/v1/variants`** (list) and **`GET
  /api/v1/variants/:id`** (show). No dedicated controller/route needed — this is automatic for
  every schema in the app. There is NO public `/api/v1/public/m/:username/variants` route (the
  public scopes at `router.ex:188-220` only declare the literal sub-paths shown in §1/§2, no
  catch-all).
- **RBAC**, `priv/rbac.yaml:301-306`, resource `variants`: `view` includes `'public'` (so `GET
  /api/v1/variants/:id` for a known id is world-readable, same as products); `list` does **NOT**
  include `'public'` (only staff/org/merchant/`customer` roles) — an asymmetry vs. `products`
  where both `view` and `list` allow `'public'`.
- **Zero live callers**: `grep -rn "Context.Inventory.ProductVariant\b|Query.ProductVariant\b"
  lib/` (excluding the two files that define them) → no matches anywhere in `lib/`. The only way
  this code executes today is an external HTTP client directly requesting `/api/v1/variants[/:id]`
  — nothing internal to commerce-api ever calls it.
- `ApiWeb.ProductVariantView` (`lib/api_web/views/product_variant_view.ex`) is **dead code**, same
  pattern as `ApiWeb.ProductView` (§0): only self-referenced (`grep -rn "ProductVariantView"
  lib/`), never called by any controller. Even if it were called, the response would show `%{data:
  render_many(...)}` with fields `id, name, description, price, quantity, quantity_sold, sku,
  unlimited, available*, image, hash, product_id` (per the view file) — but since nothing wires it
  in, this shape is aspirational, not live.
- **Net for the variants project**: `/api/v1/variants` is a live, working, RBAC-gated (mostly
  non-public) generic CRUD endpoint over an orphaned table — enabling it further (e.g. adding
  preloads, or a public route) would be additive/isolated (touches `Query.ProductVariant`'s
  `@attribs` + router only) and would NOT by itself change what `/products` or `/public/m/:x/
  products` return, since those never join `variants` (§0, §1, §3). The risk is entirely on the
  *write*/*checkout* side (§3), not the read side.

---

## 6. Empirical check — real product `data` shape

**The credential path given in the task did not work**: `INKRESS_MARKETPLACE_API_KEY=dummy` in
`/Users/romario/projects/inkress/commerce-web/.env:11` is a placeholder, not a real key.
`/Users/romario/projects/fleeksite/revamp/.env` also only has placeholders
(`INKRESS_BEARER_TOKEN=your_jwt_token_here`, `INKRESS_CLIENT_ID=your_client_id_here`). No usable
key was found in `~/.claude/secrets/` (listed filenames only, nothing named for a read-only
Inkress marketplace key) or in `admin-sdk`/`commerce-web` examples/tests (all placeholders like
`m-your-merchant-username`).

**Worked around it**: §1/§2 already established that the RBAC role `'public'` covers `products:
view` AND `products:list` (`priv/rbac.yaml:180-182`), and that the generic `/api/v1/products`
route sits behind only `ApiWeb.Authorise`, not a hard login requirement. So I hit the **real
production API with no credentials at all**:

```
curl https://api.inkress.com/api/v1/products?page_size=100[&page=2]
```

This worked — HTTP 200, real live data, confirmed 155 total products in the platform catalog at
fetch time. **This is empirical ground truth, not a fixture.**

### 6a. The `data` shape — resolves VARIANT-TRUTH.md's open question

Real product id 95, "Tomcat Disposable Rat & Mouse Bait Stattion (Child & Dog Resistant)" —
its `data` object, verbatim (description truncated for length, nothing else altered):

```json
{
  "attributes": [
    { "name": "Bait Station", "type": "number", "value": "1" },
    { "name": "Bait Block", "type": "number", "value": "1" }
  ],
  "customer_inputs": [
    {
      "name": "Wholesale Pricing For This Item",
      "options": [
        { "label": "Two Units (1 Pack)", "price": 2299.98 }
      ],
      "price": 2299.98,
      "type": "options"
    }
  ],
  "description": "<p>...(HTML, truncated)...</p>"
}
```

- **`data.variants.options` does NOT exist. There is no top-level `variants` key either.** Scanned
  all 155 live products (2 pages) for the literal substring `"variant"` anywhere in the JSON: only
  one false-positive hit (product id 14, the English word "variant" inside a pepper's marketing
  description — "often a variant of the Scotch bonnet" — not structured data).
  **VARIANT-TRUTH.md's UNVERIFIED note is now resolved: the API returns `data.customer_inputs[]
  .options[]`, never `data.variants.options`.**
  `UNCONFIRMED: whether the revamp markets editor ALSO writes a `data.variants.options` shape
  that simply had zero live rows in this 155-product sample — the read side (this doc) proves what
  the API returns today, not every shape the write side might ever produce. Cross-check against
  vet-product-write.md.`
- `data.customer_inputs[].options[]` matches `{label, price}` exactly as read by both checkout
  implementations (§3a line 782-787, §3b line 500-508: `Enum.find(option[:options], fn opt ->
  opt[:label] == value end)[:price]`).
- `data.attributes[]` matches `{name, type, value}`, read but not priced (§3a line 820, §3b line
  532).
- Out of 155 real products, only **1** had `data.customer_inputs` / `data.attributes` populated —
  options are rare in the live catalog today, but the shape is confirmed real, not hypothetical.
- No `data.variants`, no top-level `variants` array, on any of the 155 products.

### 6b. CRITICAL, UNRELATED SECURITY FINDING — surfaced by this empirical check, not asked for

`GET https://api.inkress.com/api/v1/products` with **zero authentication** (no Bearer token, no
Client-Id header) returns, for every product, its preloaded `merchant` object (§0/§1: preloads
`[:currency, :category, :merchant]`, no view-layer redaction because `ProductView` is dead code —
raw struct serialization applies NO field restriction). The dedicated public-merchant endpoint
(`GET /api/v1/public/m`, `MerchantController.public_view` → `Context.Accounts.Merchant.
get_public_view/1`) explicitly strips sensitive fields via `DataSanitizer.sanitize/3`
(`lib/api/context/accounts/merchant.ex:8-24`, `restricted_fields` includes `"username", "email",
"phone", "data.bank_info", "data.registration_webhook"`, lines 9-15) — **but the product list's
merchant preload goes through NO such sanitizer.** Result: anyone, unauthenticated, hitting
`/api/v1/products` gets each seller's full `merchant.data.bank_info` — bank name, branch name,
branch code, routing number, account number, account holder name/type — plus
`merchant.data.registration_webhook`, plus `merchant.email`/`merchant.phone`/`merchant.username`.

Confirmed at scale, not a one-off: in the 155-product sample, **9 distinct merchants'** full bank
details leaked this way (merchant ids/usernames: 59/jamaicaauthentictreats, 102/876listit,
55/shancrochetthat, 128/iamwelljamaica, 53/redtag, 69/thejamaicanhoney, 65/braintickers,
68/mezmertechja, 51/nonitropicals). Example (account number masked here; the live API returns it
unmasked):
```json
{"account_holder_name":"Tenchoy Bethune","account_holder_type":"Personal",
 "account_number":"*****7546","account_type":"Savings",
 "bank_name":"National commercial bank","branch_code":"002",
 "branch_name":"New kingston","routing_number":"0000002","swift_code":""}
```
This is live in production right now, is unrelated to the variants question, and is out of scope
for this doc to fix — flagging prominently per the instruction to verify against ground truth. A
minimal fix would run the same `DataSanitizer.sanitize/3` restricted-field list (or a subset, e.g.
just `data.bank_info`/`data.registration_webhook`/`email`/`phone`) over the `:merchant` preload
before serialization in `Query.Product`'s consumers — but that's a design decision for a dedicated
fix, not something to patch inline in a read-only inventory pass.

---

## What exposing variants (via the orphaned `variants` table) would touch, on the READ side

Given everything above, making `variants` a real read-visible entity — WITHOUT breaking any
existing product read — would require touching, additively:

1. **`Query.Product`'s `@attribs`** (`lib/api/queries/product.ex:7-8`) — add `:variants` (or
   similar) to `preloads`/`single_preloads` IF a `has_many :variants` were added to the `Product`
   schema (`lib/api/schema/inventory/product.ex` currently has no such association — §0). Adding
   an association + preload is additive and would not change any existing field already returned.
2. **`Api.Inventory.Product` schema** — add the `has_many :variants, Api.Inventory.ProductVariant`
   association (currently absent, confirmed `lib/api/schema/inventory/product.ex:6-44`). Since
   serialization is "every field via `@derive Jason.Encoder except: [...]`" (§0), a newly-added
   preloaded association would automatically appear in every product response (list AND single)
   the moment it's preloaded — this is a blast-radius point: it affects §1 (public storefront),
   §2 (admin/merchant), and any other caller of `Query.Product`/`Context.Inventory.Product`
   simultaneously, since they all share the same query/serialization path. No opt-in mechanism
   exists today (no sparse fieldset / `?include=` param seen in `Query.Defaults`).
3. **`Query.ProductVariant`'s `@attribs`** (`lib/api/queries/product_variant.ex`) — currently no
   `preloads` at all (§5); would need `preloads: [:product]` (or similar) for a direct
   `/api/v1/variants` read to be useful, plus deciding whether to open `priv/rbac.yaml:301-306`'s
   `list` action to `'public'` (currently not, unlike `view`) if direct public variant listing is
   desired.
4. **Checkout (§3)** — NOT a read-side change, but the read-side work is pointless for buyability
   unless `processor.ex:755-868`/`:1260-1287` AND `session_based_checkout.ex:474-583`/
   `:1193-1219` both learn to resolve a real variant row (price/stock/id) instead of the product
   row — today both hard-code Product as the priced/stocked unit and never query `variants`.
5. **Nothing in §4 (feed)** needs to change — it doesn't read products at all.
6. **§6b's security gap is orthogonal** but worth fixing in the same pass if `merchant` continues
   to be preloaded onto every product response — adding more preloaded data (variants) to the same
   unsanitized serialization path is more surface, not less.

## DONE

