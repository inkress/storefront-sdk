# Backend Product-Variant Data Model — Investigation Notes

Investigation into whether Inkress commerce-api has a first-class product-variant
entity, and the exact contract to read it from a storefront. READ-ONLY research
to inform building a first-class Variant entity in the Inkress storefront SDK.

Repo root: `/Users/romario/projects/inkress/commerce-api` (Elixir/Phoenix).
Investigated on the checked-out branch `feature/spi-3ds` unless a citation
explicitly names a different branch/commit.

**Headline finding: there IS a `variants` table + Ecto schema, but it is
dormant/dead code. The LIVE checkout, order, and public-read code paths treat
the PRODUCT as the only purchasable/priced/stocked unit. There is no working
public endpoint that lists or embeds real per-SKU variants today.**

Status: COMPLETE

---

## 1. Schema (product_variants / variants)

### 1a. The dormant "real" variant table

- Migration: `priv/repo/migrations/20221015174921_create_product_variants.exs`
  (filename says `product_variants`, but the migration module is
  `Api.Repo.Migrations.CreateVariants` and it creates a table literally named
  `variants`, not `product_variants`) — `priv/repo/migrations/20221015174921_create_product_variants.exs:5`.
  Columns (ground truth, from the migration):
  - `id` (implicit serial PK)
  - `available_after` : integer — `:6`
  - `available_before` : integer — `:7`
  - `available` : boolean, default false, not null — `:8`
  - `default` : boolean, default false — `:9`
  - `description` : text — `:10`
  - `hash` : string(64) — `:11`
  - `image` : string(1024) — `:12`
  - `name` : string(128) — `:13`
  - `price` : float, default 0.00 — `:14`
  - `units_remaining` : integer, default 1 — `:15`
  - `units_sold` : integer, default 0 — `:16`
  - `rating_sum` : integer, default 0 — `:17`
  - `rating_count` : integer, default 0 — `:18`
  - `sku` : string(128) — `:19`
  - `unlimited` : boolean, default false, not null — `:20`
  - `variant_group_option_ids` : array(integer) — `:21`
  - `product_id` : references `products` — `:22`
  - `creator_id` : references `users` — `:23`
  - `inserted_at` / `updated_at` — `:25-26`
  - Constraints: unique on `sku` (`:30`), unique on `hash` (`:31`), check
    `price >= 0.00` (`:35`), unique on `(product_id, variant_group_option_ids)` (`:36`).
  - No migration ever renames/alters these columns — confirmed by grepping
    every migration file for `variants`/`units_remaining`; the only migration
    touching the `variants` table is this create (verified with
    `grep -rl "table(:variants)" priv/repo/migrations/`, one hit).

- Ecto schema: `Api.Inventory.ProductVariant`, `lib/api/schema/inventory/product_variant.ex:1`,
  `@source "variants"` (`:4`). Declared fields (`:7-19`):
  `available`, `available_after`, `available_before`, `description`, `hash`,
  `image`, `name`, `price`, **`quantity`**, **`quantity_sold`**, `sku`,
  `unlimited`, `secure` (virtual). Associations: `belongs_to :creator, Api.Accounts.User` (`:21`),
  `belongs_to :product, Api.Inventory.Product` (`:22`), plus the standard
  polymorphic `merchant_record`/`merchant` has_one pair (`:24-29`).
  `@required` = `hash price quantity sku product_id creator_id` (`:35`).

  **Schema/DB column mismatch (bug, not verified live).** The schema's fields
  are named `quantity` / `quantity_sold` (`lib/api/schema/inventory/product_variant.ex:15-16`),
  with no `source:` remap, but the migration only ever created
  `units_remaining` / `units_sold` (see above) — there is no `creator_id`
  either... wait, there is (`creator_id` exists), but the *view* layer (below)
  also reads a `user_id` field that the schema doesn't declare at all. Ecto
  requires an exact field/column name match unless `source:` is given, so
  `SELECT quantity FROM variants` would fail against the real table.
  UNCONFIRMED AT RUNTIME (no DB/app access in this investigation), but there is
  no evidence anywhere of a migration that would make this work, and independent
  corroborating evidence below (the orphaned view, the non-compiling test) makes
  "this code path is dead and has never run against the real schema" the far
  more likely explanation than "it works."

- Variant → Product: `belongs_to :product, Api.Inventory.Product` (`lib/api/schema/inventory/product_variant.ex:22`).
  The reverse direction does **not** exist: `Api.Inventory.Product`
  (`lib/api/schema/inventory/product.ex:1-98`) declares no `has_many :variants`
  or `has_many :product_variants` anywhere (confirmed with
  `grep -rn "has_many :variants" lib/` → zero hits repo-wide). So even in code,
  a `Product` cannot be preloaded with its variants — you can only query
  `variants` directly by `product_id`.

### 1b. The Shopify-style "options → variant" support tables (also dormant)

Alongside `variants`, four more tables model a classic
option-group/option-value/variant-combination system — but nothing in the
live app wires them together into a working feature:

- `variant_groups` (e.g. "Size", "Color"): `id`, `name` —
  `priv/repo/migrations/20221015174021_create_variant_groups.exs:5-6`; a later
  migration bolts on a `values` map column —
  `priv/repo/migrations/20240210013653_add_variant_group_json_values.exs:6-8`.
  Schema: `Api.Inventory.VariantGroup` at `lib/api/schema/inventory/variant_group.ex`.
- `variant_group_options` (e.g. "Small", "Red"): `id`, `value`, `variant_group_id` —
  `priv/repo/migrations/20221015174435_create_variant_group_options.exs:5-7`.
  Schema: `lib/api/schema/inventory/variant_group_option.ex`.
- `product_variant_groups` (join table product ↔ chosen option): `product_id`,
  `variant_group_option_id`, unique on the pair —
  `priv/repo/migrations/20221015174631_create_product_variant_groups.exs:5-7,13`.
  Schema: `lib/api/schema/inventory/product_variant_group.ex`.
- `product_variant_exclusions` (marks incompatible combinations): `hash`,
  `product_id` — `priv/repo/migrations/20221015175052_create_product_variant_exclusions.exs:5-7`.
  Schema: `lib/api/schema/inventory/product_variant_exclusion.ex`.

None of these four have a router entry, a live controller, or a call site
outside their own `Context.Inventory.*` / `Query.*` generic scaffold modules
(`lib/api/context/inventory/variant_group.ex`, `variant_group_option.ex`,
`product_variant_group.ex`, `product_variant_exclusion.ex` and their
`lib/api/queries/*` counterparts — all one-liner `use Context.Defaults` /
`use Query.Defaults` scaffolds, same shape as `lib/api/queries/product_variant.ex:1-10`
shown below).

### 1c. Dead-code evidence (why "dormant" and not just "unused but working")

- **Orphaned Phoenix views.** `lib/api_web/views/product_variant_view.ex`,
  `product_variant_group_view.ex`, `variant_group_view.ex`, and
  `product_variant_attribute_view.ex` each define `render/2` clauses
  (`"index.json"`/`"show.json"`/`"<name>.json"`), but no controller in the app
  calls `render(conn, ...)` for any of them — confirmed by grepping the whole
  `lib/` tree for each view module name; the only hit is each file referencing
  itself. This app's actual generic controller (`ApiWeb.Defaults`, see §2)
  JSON-encodes structs directly via `jason/2`
  (`lib/api_web/defaults.ex:18-22`), never through a Phoenix view. These view
  files are `mix phx.gen.json`-style leftovers.
  - `lib/api_web/views/product_variant_view.ex`'s `"product_variant.json"`
    clause reads `product_variant.quantity`, `product_variant.quantity_sold`,
    and **`product_variant.user_id`** — the schema has no `user_id` field at
    all (it's `creator_id` via `belongs_to :creator`), a second, independent
    field-name bug confirming this stack was never exercised end-to-end.
- **Non-compiling test.** `test/api_web/controllers/product_variant_attribute_controller_test.exs:4-5`
  aliases `Api.Stores` / `Api.Stores.ProductVariantAttribute` (no such module
  exists anywhere under `lib/`) and `:30` calls
  `Routes.product_variant_attribute_path(conn, :index)` (no such route exists —
  the router has zero occurrences of the word "variant", see §2). This test
  cannot compile against the current app, let
  alone pass, and there is no `product_variant_attributes` migration or schema
  anywhere in the tree (`find lib -iname "*product_variant_attribute*"` finds
  only the test and the orphaned view). This is scaffold debris, not a working
  feature.
- **Router has no variant routes at all.** `grep -n "variant" lib/api_web/router.ex`
  returns zero matches. The only way any variant-shaped resource is reachable
  by HTTP is the generic catch-all described in §2/§5, and only under its
  literal table name `variants` (not `product_variants`).

### 1d. What actually owns price and stock today

- **Price**: both `products` and `variants` have their own `price` column at
  the schema/DB level (`priv/repo/migrations/20221015172525_create_products.exs:11`
  and `priv/repo/migrations/20221015174921_create_product_variants.exs:14`), so
  architecturally a variant *could* override a product's price. **In practice,
  every live code path (checkout, order creation) only ever reads
  `products.price`** — see §4 and the checkout trace below. The `variants`
  table's `price` is written by no live code and read by no live code.
- **Stock**: modeled the same way on both tables — a count column
  (`units_remaining`, decremented as `units_sold` grows) plus an `unlimited`
  boolean escape hatch that makes the count irrelevant when true. Product:
  `priv/repo/migrations/20221015172525_create_products.exs:17-19`. Variant:
  `priv/repo/migrations/20221015174921_create_product_variants.exs:15-16,20`
  (note again the variant *schema* renames these to `quantity`/`quantity_sold`,
  see §1a). **Live stock checks only ever read `products.units_remaining` /
  `products.unlimited`** — confirmed in the checkout validator:
  `lib/api/services/orders/session_based_checkout.ex:480` selects
  `[:id, :title, :price, :image, :currency_id, :units_remaining, :unlimited, :data]`
  from `Api.Inventory.Product` (only), and the out-of-stock checks at
  `lib/api/services/orders/session_based_checkout.ex:567` and `:570` read
  `record[:units_remaining]` / `record[:unlimited]` off that same product
  record. There is no query against the `variants` table anywhere in the
  checkout or order-processing code (`grep -n "variant" lib/api/services/orders/processor.ex`
  and the same on `session_based_checkout.ex` — every hit is accounted for in
  §4 below, and none of them touch the `variants` table).

**Conclusion for §1: yes, a `variants` table and `Api.Inventory.ProductVariant`
schema exist, with belongs_to product / its own price / its own stock fields —
but it is disconnected scaffold code (mismatched field names, orphaned views,
a non-compiling test, zero router wiring). The entity that is actually live,
priced, stocked, and read by the storefront is the `Product` alone.**

---

## 2. Public read endpoints

Router: `lib/api_web/router.ex`. All public (unauthenticated — inside
`pipe_through [:api, :with_session, :with_client]` but *outside* the
`pipe_through [:authorise]` block that requires login, see `:283-284` vs `:227-395`)
storefront routes live under `/api/v1/public/...`:

| Method | Path | Controller action | Line |
|---|---|---|---|
| GET | `/api/v1/public/m` | `MerchantController.public_view` | `router.ex:189` |
| GET | `/api/v1/public/o/:organisation_username/products` | `PageController.index` | `router.ex:204` |
| GET | `/api/v1/public/o/:organisation_username/merchants` | `PageController.index` | `router.ex:205` |
| GET | `/api/v1/public/m/:merchant_username/products` | `PageController.index` | `router.ex:209` |
| GET/POST | `/api/v1/public/m/:merchant_username/fees` | `MerchantController.get_fees` | `router.ex:210-211` |
| GET | `/api/v1/public/m/:merchant_username/tokens` | `MerchantController.public_tokens` | `router.ex:212` |
| GET | `/api/v1/public/m/:merchant_username/payment_methods` | `MerchantController.payment_methods` | `router.ex:213` |
| GET | `/api/v1/public/:secret/merchants` | `MerchantController.public_list` | `router.ex:217` |
| GET | `/api/v1/public/:secret/organisations` | `MerchantController.public_list_organisations` | `router.ex:219` |

**There is no `/products/:id` route and no `/variants` or `/product_variants`
route anywhere under `/api/v1/public/...`.** A single product can only be
fetched by adding an `id` (or other) filter to the `products` list call (see
below) — there is no dedicated public "show" endpoint for a product, and no
public variant endpoint of any kind.

### 2a. How `GET /api/v1/public/m/:merchant_username/products` actually resolves

This app has **no bespoke product controller** — every REST-ish resource
(including the "public products" route above) is served by one generic
dispatcher, `ApiWeb.PageController` (`lib/api_web/controllers/page_controller.ex:1-40`),
built on the `ApiWeb.Defaults` macro:

1. `plug :set_resource` (`lib/api_web/defaults.ex:14,24-75`) splits the request
   path, finds the last non-path-param segment (here, `"products"`), and looks
   it up in `Utils.list_resources()` (`lib/api/utils/utils.ex:4-10`) — a map
   built at runtime from **every** Ecto schema's `__schema__(:source)` (its
   *table* name) to its module. `"products"` → `Api.Inventory.Product` →
   rewritten to `Context.Inventory.Product` (`lib/api_web/defaults.ex:56-65`).
2. `index/2` (`lib/api_web/defaults.ex:77-84`) calls
   `apply(Context.Inventory.Product, :list, [params])` and wraps the result as
   `%{state: :ok, result: data}` via `jason/2` (`:18-22`, `:4-8`) — a direct
   `Jason.encode` of whatever Elixir terms come back, **not** a Phoenix
   view/`render_*` call.
3. `Context.Defaults.list/1` (`lib/api/context/default.ex:412-415`) forwards to
   `Query.Product.perform/1` (`Query.Defaults.perform/2`,
   `lib/api/queries/default.ex:42-117`).
4. `Query.Product` (`lib/api/queries/product.ex:1-27`) declares:
   - `preloads: [:currency, :category, :merchant]` (`:7`) — **no `:variants`,
     because no such association exists to preload (§1a).**
   - `fts_fields: [:title]` (`:9`) — the `?q=` full-text search only matches
     product **title**, nothing variant-related.
   - `group_by_fields` (`:10-16`) and `aggregate_fields` (`:17-24`) power
     `?group_by=` faceting (category_id/currency_id/status/public/unlimited,
     with sum/avg/min/max/count over price, units_remaining, units_sold,
     rating_sum, rating_count, id).
5. Query params, generically handled for every resource including `products`
   (`lib/api/queries/filters.ex`):
   - `?q=<text>` — full-text search over `fts_fields`
     (`lib/api/queries/default.ex:97`, implemented via `search_by_string/3`).
   - `?page=`, `?page_size=` (alias `?limit=`) — pagination
     (`lib/api/queries/default.ex:161-179` → `Query.Filters.paginate/2`,
     `lib/api/queries/filters.ex:645-653` → `Paginate.query/2`,
     `lib/api/utils/paginate.ex:5-11`).
   - `?order=` — order-by (`lib/api/queries/default.ex:111`).
   - `?updated_since=<ISO8601>` — incremental sync filter
     (`lib/api/queries/default.ex:137-156`).
   - `?group_by=<field[,field]>` — aggregation, see above
     (`lib/api/queries/default.ex:102-108`).
   - `?<field>=<value>` — plain equality filter on any schema field
     (`lib/api/queries/filters.ex:405-406` catch-all clause). This is how a single
     product is fetched publicly: `?id=123`, there is no dedicated show route.
   - `?<field>_in=a,b,c`, `?<field>_min=`/`?<field>_gte=`,
     `?<field>_max=`/`?<field>_lte=` (also `_lt`/`_gt`) — range/set filters
     (`lib/api/queries/filters.ex:378-403`) — this is exactly what
     `@inkress/admin-sdk`'s `ProductQueryBuilder`/`ProductQueryParams`
     (`price: {min, max}`) and the storefront-sdk's `getByPriceRange` compile
     down to.
   - `?contains.<field>=`, `?before.<field>=`/`?after.<field>=`/`?on.<field>=`
     (date), `?distinct.<field>=` — generic prefix filters
     (`lib/api/queries/filters.ex:335-351,412-418`). `distinct.<field>` runs
     `distinct([o], field(o, ^field))` on the query — this is the only
     "distinct" mechanism that exists anywhere in the query layer; it is
     completely generic (works on any resource/field), not a
     variant-specific "collapse to one row per product" feature. Since there
     is no public variants endpoint to apply it to, **this does not answer a
     "distinct by product" need for variants** — there is nothing to be
     distinct over.
   - Merchant scoping for `:merchant_username` is done by
     `ApiWeb.Plug.WithClient` (`lib/api_web/plugs/with_client.ex:19-27,54-58,72-75`):
     it resolves the path param to a merchant, then calls
     `Api.Org.Repo.put_merchant_id/1` so every query issued afterwards
     (via `Api.Org.Repo`'s tenant-scoping `prepare_query`, not further
     inspected here) is automatically confined to that merchant's rows.

### 2b. Response envelope and per-item shape (products)

Envelope, ground-truth from the real (non-degenerate) paginator,
`Paginate.page_map/4` (`lib/api/utils/paginate.ex:144-191`):

```json
{
  "state": "ok",
  "result": {
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total_entries": 57,
      "more": true,
      "next_page": 2,
      "total_pages": 3,
      "next_pages": [2, 3],
      "last_pages": []
    },
    "entries": [ { /* one product, see below */ } ]
  }
}
```
(`"more"`/`"next_page"`/`"total_pages"` only appear when there is a next page,
`:159-168`; `"last_page"` only appears when `page > 1`, `:170-176`.) This
matches what `@inkress/admin-sdk`'s `ProductsResource.list()` already assumes:
`this.client.get<{ entries: InternalProduct[]; pagination: any }>('/products', ...)`
(`/Users/romario/projects/inkress/admin-sdk/src/resources/products.ts:79,87`).
Note: `Query.Defaults.perform/2` has a separate *degenerate* fallback shape
(flat `page`/`page_size`/`total_entries`/`entries` with an always-empty
`"pagination": {}`) used only when a resource declares
`required_query_fields` that the request didn't satisfy
(`lib/api/queries/default.ex:53-64`) — `Query.Product` declares no
`required_query_fields`, so `products` listing always uses the real nested
shape above, not this fallback.

Per-item shape: each entry is the `Api.Inventory.Product` struct, JSON-encoded
via the `@derive {Jason.Encoder, except: [...]}` on `Schema.Defaults`
(`lib/api/schema/default.ex:8-17` — excludes only
`__struct__, __meta__, action, secure, user_id, organisation_record, merchant_record`).
Combined with the schema's own fields (`lib/api/schema/inventory/product.ex:6-24`)
and `Query.Product`'s preloads (`:currency, :category, :merchant`), an entry
looks like:

```json
{
  "id": 123,
  "uid": "…",
  "title": "…",
  "teaser": "…",
  "permalink": "/…",
  "price": 19.99,
  "currency_code": "JMD",
  "currency_id": 4,
  "currency": { "...Currency struct fields..." },
  "category_id": 7,
  "category": { "...Category struct fields..." },
  "merchant": { "...Merchant struct fields (via has_one through)..." },
  "image": "https://…",
  "public": true,
  "unlimited": false,
  "units_remaining": 12,
  "units_sold": 4,
  "rating_sum": 0,
  "rating_count": 0,
  "status": 2,
  "tag_ids": [1, 2],
  "data": { "attributes": [...], "customer_inputs": [...] },
  "meta": {},
  "inserted_at": "…",
  "updated_at": "…"
}
```
There is **no `variants` key and no `product_variants` key** on this object —
confirmed by the absence of any such association on the schema (§1a) and the
absence of `:variants`/`:product_variants` from `Query.Product`'s preload list
(`lib/api/queries/product.ex:7-8`). Whatever "variant-like" shape the
storefront reads today comes from the free-form `data.attributes` /
`data.customer_inputs` JSON blob (see the storefront-sdk contrast, below) —
not from a relational variant.

### 2c. Does a variants query join and embed its parent product?

Only the **generic, non-public, admin/internal** path can reach the `variants`
table at all (see §5) — `Query.ProductVariant` (`lib/api/queries/product_variant.ex:1-10`):
```elixir
@attribs [
  resource_module: ProductVariant
  # json_field: "permits",
  # preloads: [:user]
]
```
Preloads are commented out entirely (and the commented-out one, `:user`, isn't
even a real association on the schema — it's `:creator`). Since
`Context.Defaults.list/1` calls `Query.ProductVariant.perform/1` with no
`opts`, the effective preload list is `[]`
(`lib/api/queries/default.ex:20`/`96`, falling through to `@attribs[:preloads] || []`).
**Answer: no — a variants query does not join/embed its parent product.** A
listed variant's `product` field would come back `null` in JSON (Ecto ships
`Jason.Encoder` for `%Ecto.Association.NotLoaded{}`,
`deps/ecto/lib/ecto/json.ex:2`) rather than the embedded product record.

---

## 3. Stock check (bulk variant-ids → stock)

**No such endpoint exists.** `grep -rn "check_stock" lib/` across the entire
commerce-api tree returns zero results — no controller action, no context
function, no route named anything like `check_stock`. The storefront-sdk
already documents this gap itself:
`/Users/romario/projects/inkress/storefront-sdk/src/resources/products.ts:179-189` —
`ProductsResource.checkStock(productId)` re-fetches the single product and
derives a stock snapshot from it, with the comment *"there is no dedicated
stock endpoint"*. There is nothing bulk (variant-ids-in, `[{id, stock}]`-out)
anywhere in commerce-api today.

---

## 4. Order-line variant fields

Schema: `Api.Purchase.OrderLine`, `lib/api/schema/purchase/order_line.ex:1-72`,
table `order_lines`. Migration:
`priv/repo/migrations/20221015142352_create_order_lines.exs:5-14` — plain
`variant_id : integer` column with **no FK constraint** (unlike `order_id`,
which does get `references(:orders, ...)`, `:14`).

The Ecto schema nonetheless gives `variant_id` application-level meaning:
```elixir
belongs_to :product, Api.Inventory.Product,
  foreign_key: :variant_id,
  references: :id
```
(`lib/api/schema/purchase/order_line.ex:19-21`). **This is the single most
important fact in this investigation: on an order line, the column named
`variant_id` is wired, in code, to reference a row in `products.id` — not a
row in `variants.id`.** This is confirmed independently three ways:

1. **Where the value comes from at order-create.**
   `lib/api/services/orders/processor.ex:1264-1267` (`create_order_lines/1`)
   builds each line from `params[:products]` (a list of already-resolved
   *product* maps) and does `Map.put(:variant_id, product[:id])` — `product[:id]`
   is a `products.id`, produced upstream by `validate_products/1`
   (`lib/api/services/orders/session_based_checkout.ex:474-585`), which
   resolves cart items **exclusively** against `Api.Inventory.Product`
   (`:480`, `select(... [:id, :title, :price, ...])`) — never against
   `Api.Inventory.ProductVariant`/`variants`.
2. **The cart's own documented item shape.** `Api.Checkout.Cart`'s embedded
   sample doc (`lib/api/schema/checkout/cart.ex:41-56`) shows cart line items
   as `{quantity, product_id, variant_id, discount_id, tax_id}` — i.e., the
   *intended* design does distinguish `product_id` from `variant_id`
   (two lines share `product_id: 2` but differ as `variant_id: 1` vs `5`), but
   nothing in the live checkout code (`session_based_checkout.ex`) reads or
   resolves that `variant_id` against the `variants` table — only `product_id`
   round-trips into a real DB lookup.
3. **The PR that just exposed it, in the author's own words.** Commit
   `6a130b09` ("feat(discount-codes): expose order-line variant_id on invoice
   display", `sirromariof@gmail.com`, 2026-09-20) states directly: *"Expose the
   frozen variant_id (order_lines.variant_id, set from the cart product id at
   order-create)"* and *"It is the same identity the order-create eligibility
   check uses"* — i.e., the PR author's own description confirms `variant_id`
   == the product's id, used so `products: [{id, cost}]` product-scoped
   discount quoting lines up with what got charged.

### 4a. `format_order/1` — the exact fields

Function: `Context.Purchase.Order.format_order/1`,
`lib/api/context/purchase/order.ex:172`. The `:lines` key is built at (current
checked-out branch, **pre**-PR #213):
```elixir
# lib/api/context/purchase/order.ex:225
|> Map.put(:lines, Enum.map(record[:order_lines] || [], fn(order_line) ->
     Map.take(order_line, [:product_variant_name_frozen, :product_variant_total_frozen, :quantity, :properties, :meta_data])
   end))
```
So today, on `feature/spi-3ds` (and on `version/4.1-beta` tip `5f13913d`), a
serialized order line has: `product_variant_name_frozen`,
`product_variant_total_frozen`, `quantity`, `properties`, `meta_data`. No
`variant_id`.

### 4b. PR #213 — confirmed via `gh pr view 213`

```json
{"number":213,"state":"OPEN","title":"Expose order-line variant_id on invoice display (unblocks scoped-code quoting)","baseRefName":"version/4.1-beta","headRefName":"feat/discount-scope-line-id","url":"https://github.com/jamlance/commerce-api/pull/213"}
```
Commit `6a130b09` on branch `feat/discount-scope-line-id` (open PR, **not yet
merged into `version/4.1-beta`** as of this investigation — confirmed with
`git merge-base --is-ancestor 6a130b09 version/4.1-beta` → `NO`, same for
`remotes/origin/version/4.1-beta`). The change (only diff in the PR):
```elixir
# lib/api/context/purchase/order.ex:232 on branch feat/discount-scope-line-id
|> Map.put(:lines, Enum.map(record[:order_lines] || [], fn(order_line) ->
     Map.take(order_line, [:variant_id, :product_variant_name_frozen, :product_variant_total_frozen, :quantity, :properties, :meta_data])
   end))
```
So **once #213 merges**, a line gains exactly one new key, `variant_id`
(an integer — the frozen product id for that line, per §4 above), alongside
the five pre-existing keys. Full post-#213 line field set:
`variant_id, product_variant_name_frozen, product_variant_total_frozen, quantity, properties, meta_data`.

There are no other `*_frozen` variant fields anywhere on `OrderLine` — the
complete field list on the schema is `discount_id, discount_total_frozen,
product_variant_name_frozen, product_variant_total_frozen, quantity, tax_id,
tax_total_frozen, properties, meta_data` (`lib/api/schema/purchase/order_line.ex:7-16`).
There is no `product_variant_id`, `product_variant_sku_frozen`, or similar —
only the two `product_variant_*_frozen` fields shown above, both of which are
snapshots of the *product's* title/price at order time, not of a `variants`
row.

### 4c. Independent confirmation from `@inkress/admin-sdk`

`/Users/romario/projects/inkress/admin-sdk/src/types.ts:624-630` (`ProductItem`,
the order-creation input type) documents `id: number` as **"Product variant
ID"** — the SDK's own pre-existing terminology already conflates "product id"
and "variant id" for this exact field, consistent with everything above.
`admin-sdk/src/types.ts:771-776` (`OrderResponse.lines`) is the **pre-#213**
shape (`product_variant_name_frozen`, `product_variant_total_frozen`,
`quantity` — no `variant_id` yet), matching §4a exactly.

---

## 5. Admin authoring

### 5a. commerce-api side: the generic resource route, not a dedicated controller

There is no bespoke "create a variant" controller/action. The only way to
reach `Api.Inventory.ProductVariant` over HTTP is the **generic catch-all**
resource route:
```elixir
# lib/api_web/router.ex:392-394
scope "/v1" do
  resources "/:resource_path", PageController, except: [:new, :edit]
end
```
This block sits inside `scope "/api", ApiWeb do pipe_through [:api, :with_session, :with_client]`
(`router.ex:227-228`) but **outside** the nested `scope "/v1" do pipe_through [:authorise] ... end`
block that ends at `router.ex:390` — so the router-level login requirement
(`Api.Plug.LoggedIn`) is not applied here. `ApiWeb.PageController` itself does
run `plug ApiWeb.Authorise` (`lib/api_web/controllers/page_controller.ex:14`),
which is presumably where real authorization happens (RBAC via `rbac.yaml`,
not inspected further in this investigation — out of scope for a variant-read
question, flagged here only because it affects who could hit this route).

Because `Utils.list_resources()` keys resources by their **table name**
(`m.__schema__(:source)`, `lib/api/utils/utils.ex:8`), the URL segment that
would route to `Api.Inventory.ProductVariant` is the table's name,
**`variants`** — i.e. `POST /api/v1/variants` / `PUT /api/v1/variants/:id` /
`GET /api/v1/variants` — **not** `/api/v1/product_variants`. Given the
schema/column mismatches documented in §1a/§1c, UNCONFIRMED whether this
actually works at runtime; the evidence (orphaned view with a second,
independent field-name bug; non-compiling sibling test) points to "no."

### 5b. `@inkress/admin-sdk`: no variants resource

Searched `/Users/romario/projects/inkress/admin-sdk` end-to-end
(`find . -path ./node_modules -prune -o -iname "*variant*" -print` → zero
files; `grep -rli "variant" src/` → only `src/types.ts`, two hits, both
already covered in §4c — an order-line/order-item doc comment and type field,
not a variant resource). `src/resources/` contains 20 resource files
(`addresses, billing-plans, categories, checkout-sessions, currencies,
exchange-rates, fees, financial-accounts, financial-requests, generics, kyc,
merchants, orders, payment-links, payment-methods, products, public,
subscriptions, tokens, transaction-entries, users, webhook-urls`) — no
`variants.ts`. `ProductsResource` (`admin-sdk/src/resources/products.ts:30-237`)
only ever calls `/products` (list/get/create/update/delete/query) — never
`/variants`.

**Conclusion for §5: there is currently no admin-side way — neither a
commerce-api controller nor an admin-sdk resource — to author a real,
distinct-price/distinct-stock product variant.** A merchant "variant" today
can only be represented as a `data.customer_inputs` option on the product
itself (see below) or as a wholly separate `Product` row.

---

## Contrast: storefront-sdk current state

Per the task brief, read
`/Users/romario/projects/inkress/storefront-sdk/src/utils/variants.ts` and
`src/resources/products.ts`. Confirmed: **"variants" in the current SDK means
product custom fields/options, not a distinct entity**:

- `getProductCustomFields` / `getProductAttributes` / `getProductCustomerInputs`
  (`storefront-sdk/src/utils/variants.ts:23-61`) all read off
  `product.data.attributes` / `product.data.customer_inputs` — the same
  free-form `data` JSON blob seen in the product JSON shape in §2b — with a
  fallback to a flat `product.custom_fields`/`data.custom_fields` array
  (`:72-81`). A "variant" field of `type: 'options'` carries its own
  `options[].price` delta.
- `computeProductUnitPrice` (`:90-110`) computes a line's unit price as
  `product.price` (the base, single product-level price) **plus** the chosen
  option's `price` delta and any filled add-on input prices — there is no
  per-variant price row anywhere in this computation; it's arithmetic over
  one product's base price plus JSON-declared deltas. This matches the
  backend reality found in §1d/§4 exactly: only `products.price` is ever
  authoritative server-side (see `session_based_checkout.ex`'s
  `customer_inputs`-driven `property_costs` addition,
  `lib/api/services/orders/session_based_checkout.ex:497-513`, which mirrors
  the same base-price-plus-option-deltas model server-side).
- `isProductInStock` / `getProductAvailableStock` / `toProductStock`
  (`:112-130`) read `product.unlimited` / `product.units_remaining` — again,
  product-level fields only, matching §1d.
- `ProductsResource.checkStock` (`storefront-sdk/src/resources/products.ts:179-189`)
  explicitly documents *"there is no dedicated stock endpoint"* and re-fetches
  the product — independently corroborating §3.

**This means the storefront-sdk's current "variant" model is not an
incomplete implementation of the backend's `variants` table — it is, in
effect, the only variant-like mechanism the backend actually exercises live.**
A first-class `Variant` entity in the SDK has nothing real to read from the
backend yet: building one means either (a) modeling it purely client-side over
`data.attributes`/`data.customer_inputs` (formalizing what already works), or
(b) treating this as a joint SDK+backend project to resurrect/fix the dormant
`variants` table, wire a real controller + router entry + public read route
for it, fix the `quantity`/`units_remaining` and `user_id`/`creator_id`
field-name bugs, add `has_many :variants` to `Product`, and decide whether
`order_lines.variant_id` keeps meaning "product id" (breaking) or gets a
genuinely new column for a real variant reference (additive). That decision
is a product/backend call, not something the SDK can paper over.

---

## DONE
