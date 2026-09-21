# Product write-path inventory (READ-ONLY) — commerce-api

Purpose: every code path that WRITES `products` rows, plus every writer (if any)
of the orphaned `variants` table, cited `path:line`, so a later change wiring
variants (e.g. `cast_assoc :variants` on Product, or a new variant-write flow)
can be made without breaking existing product create/update/delete. This is an
inventory only — no dead/unused/safe conclusions; where something could not be
independently confirmed it is marked **UNCONFIRMED**.

Repo: `/Users/romario/projects/inkress/commerce-api`
Investigated on branch `feature/spi-3ds`, HEAD `47377c921bb7633a67f45f2fd0380b41cb419b6e`
(working tree has unrelated uncommitted changes to 3DS/payment-link files per
`git status` — none of the files cited below are among them, confirmed by
comparing the modified-file list against every path cited in this document).
Context read first: `convergence/VARIANT-TRUTH.md`,
`convergence/backend-variant-model.md` (prior READ-side investigation, marked
COMPLETE, same repo/branch — reused for a handful of already-verified facts
about the `variants` migration's column list, explicitly marked below as
"per prior investigation"; every write-path claim in this document was
independently re-derived from source in this pass).

Status: COMPLETE

---

## 1. Product create/update/delete — generic resource path

There is no dedicated product controller. `POST/PUT/DELETE /api/v1/products(/:id)`
resolves through one generic dispatcher shared by every Ecto schema in the app.

### 1a. Routing

- `lib/api_web/router.ex:392-393` — the catch-all:
  ```elixir
  scope "/v1" do
    resources "/:resource_path", PageController, except: [:new, :edit]
  end
  ```
  nested inside `scope "/api", ApiWeb do pipe_through [:api, :with_session, :with_client] end`
  (`router.ex:227-228`, the enclosing scope closes at `:395`).
- This catch-all scope is a **second, separate** `scope "/v1" do ... end` from the
  earlier one that wraps the named routes (auth/users/roles/etc.) and is piped
  through `[:authorise]` (that earlier block closes at `router.ex:390`, confirmed
  by reading `:380-395` directly — line `:392` opens a fresh `scope "/v1"` with no
  `pipe_through`, right after the first one's `end` at `:390`). So the router-level
  `pipeline :authorise` (`router.ex:43-45`, `plug Api.Plug.LoggedIn` only) is
  **not** in the pipe chain for product/variant CRUD — see §6 for what actually
  gates it.
- `lib/api_web/controllers/page_controller.ex:1-40` — `ApiWeb.PageController`:
  `use ApiWeb.Defaults, :controller` (`:3`), `plug :block_sensitive_resources`
  (`:13`), `plug ApiWeb.Authorise` (`:14`, a *module* plug — confusingly similar
  name to the router's `pipeline :authorise`, but a different mechanism, see §6).
  `block_sensitive_resources/2` (`:16-32`) 404s `@blocked_resources ~w(encrypted_passwords)`
  (`:11`) and any resource with no resolvable context module; `products`/`variants`
  are neither, so both pass through.

### 1b. Resource resolution (which module actually runs)

- `lib/api_web/defaults.ex:24-75`, `set_resource/2` (injected into `PageController`
  via the `controller do ... end` quote block, `defaults.ex:10-134`, through
  `use ApiWeb.Defaults, :controller`): parses the request path into segments,
  picks the resource segment (`:40-47`), looks it up in `Utils.list_resources()`
  (`:50-54`), then rewrites the resolved module's leading `Api` to `Context`
  (`:56-65`) — e.g. `Api.Inventory.Product` → `Context.Inventory.Product`.
- `lib/api/utils/utils.ex:4-10`, `Utils.list_resources/0`: enumerates every
  compiled module under the `Api.*` namespace (`list_modules/0`, `:12-15`) that
  exports `__schema__/1` (i.e. every Ecto schema module), and maps each to
  `{module.__schema__(:source), module}` — a `{table_name_string, module}` pair.
  Both `Api.Inventory.Product` (`@source "products"`, `product.ex:4`) and
  `Api.Inventory.ProductVariant` (`@source "variants"`, `product_variant.ex:4`)
  resolve this way — `"products"` and `"variants"` are the URL segments, driven
  purely by each schema's table name, not by any hand-registered route.
- `lib/api_web/defaults.ex:86-98` `create/2`, `:107-119` `update/2`,
  `:121-132` `delete/2` — each does `apply(resource_module, :create/:update/:delete, [params])`,
  i.e. `Context.Inventory.Product.create/1` or `Context.Inventory.ProductVariant.create/1`
  etc.

### 1c. `Context.Inventory.Product` / `Context.Inventory.ProductVariant` — the resource-specific hooks

- `lib/api/context/inventory/product.ex:1-26`: `alias Api.Inventory.Product`,
  `@resource_module Product` (`:2-3`), `use Context.Defaults` (`:4`).
  `process_context/1` (`:6-18`): resolves `currency_id` — uses
  `context["currency_id"]` if present, else looks up `context["currency"]` /
  `context["currency_code"]` in `Constants.currencies()[:currency]` by index,
  defaulting to index `0 + 1 = 1` if nothing matches (`:8-13`). `process_context/2`
  (`:20-25`, used on **update**): `record |> Utils.atom_keys_to_string() |> Utils.Map.deep_merge(context) |> process_context()`
  — i.e. the EXISTING record's full field set is deep-merged UNDER the incoming
  update payload before the currency_id step.
- `lib/api/context/inventory/product_variant.ex:1-12`: `alias Api.Inventory.ProductVariant`,
  `@resource_module ProductVariant` (`:2-3`), `use Context.Defaults` (`:4`).
  `process_context/1` (`:6-9`) is a pure passthrough — no field engineering.
  `process_context/2` (`:11`) is `def process_context(context, _record), do: process_context(context)`
  — **the existing record is ignored entirely on update**, unlike Product. This
  is a real behavioural asymmetry between the two resources' update flow.

### 1d. `Context.Defaults` — the shared create/update/delete engine (`lib/api/context/default.ex`)

Both context modules above get this via `use Context.Defaults` (`default.ex:38-557`,
the `__using__/1` macro body).

**CREATE** (`default.ex:248-281`):
1. `apply_general_fields/1` (`:434-441`): `apply_status/1` (`:463-474`, string
   `"status"`/`:status` → `Constants.kinds()` integer), `apply_kind/1`
   (`:476-487`, same for `"kind"`), `Map.put("user_id", Process.get(:current_user)[:id])`
   (`:438`), `apply_organisation_id/1` (`:453-461`, stamps `"organisation_id"`
   from the tenant `Api.Org.Repo.get_org_id()` only when `> 0`),
   `Helpers.Context.put_uid/1` (`:440`, `lib/api/helpers/context.ex:9-12`,
   generates a `"uid"` UUID).
2. `process_context/1` — the resource hook, §1c above.
3. `clean_context/1` (`:424-432`): drops any non-string-keyed entry and drops
   `"image"`/`"logo"` keys (handled out-of-band, see §1f).
4. `Helpers.Context.changeset({:ok, context}, @resource_module)`
   (`default.ex:256`, → `lib/api/helpers/context.ex:200-214`): strips any
   `%Plug.Upload{}` values to `nil` (`:203-206`), then
   `module |> struct() |> schema.changeset(context)` where `module` is the
   **atom** `@resource_module` (`Api.Inventory.Product` /
   `Api.Inventory.ProductVariant`), so `struct(module)` is a fresh
   `%Product{id: nil}` / `%ProductVariant{id: nil}` — this hits each schema's
   FIRST changeset clause (new-record), see §1e/§1f.
5. `insert_record/1` (`default.ex:83-140`) — one `Ecto.Multi`, same DB
   transaction:
   - `Multi.insert(:record, changeset)` (`:89`).
   - `Multi.run(:org, ..., &insert_org_record/1)` (`:90-98` → `:142-161`):
     inserts an `Api.Auth.OrganisationRecord` row (`record_id`, `record` = table
     name) when tenant `org_id > 0`.
   - `Multi.run(:merchant, ..., &insert_merchant_record/1)` (`:99-107` →
     `:163-180`): inserts an `Api.Auth.MerchantRecord` row when tenant
     `merchant_id > 0` **and** the schema declares a `:merchant` association
     (`is_merchant_asset = :merchant in record.__struct__.__schema__(:associations)`,
     `:165`) — both `Product` (`has_one :merchant, through: [:merchant_record, :merchant]`,
     `product.ex:42`) and `ProductVariant` (`product_variant.ex:29`) qualify, so
     **creating a variant through this path would stamp merchant scoping
     identically to a product**.
   - `Multi.run(:user, ..., &insert_user_record/1)` (`:108-111` → `:216-235`).
   - `Multi.run(:app, ..., &insert_app_record/1)` (`:112-115` → `:187-214`):
     stamps the calling OAuth app's `oauth_client_id` via a polymorphic
     `app_records` row when the request used an integration token.
6. `post_process/2` — default no-op (`:420-422`, `defoverridable` at `:546-556`);
   neither `Context.Inventory.Product` nor `Context.Inventory.ProductVariant`
   overrides it (confirmed — no `post_process` definition in either file).
7. `handle_response/2` (`:489-494`).
8. On `{:ok, record}`: `Helpers.Context.set_image(get_type(), record, raw_context)`
   — §1f — then `preloader(record, :defaults)` (`:508-522`): auto-preloads every
   `cardinality: :one` association except
   `[:organisation_record, :organisation, :user_record, :user, :merchant_record]`
   — for `Product` this yields `:currency, :category, :merchant`.

**UPDATE** (`default.ex:283-345`):
1. `context |> get()` (`:373-390`): tenant-scoped fetch — either
   `apply(:"Elixir.Query.#{get_type()}", :perform_single, [context])` (`:377`,
   when the caller supplies a `"secure_attributes"`-shaped context) or
   `Api.Org.Repo.get(@resource_module, id)` (`:390`). `nil`/`false` short-circuit
   to an error (`:290-294`) **before any write is attempted**. Tenant scoping
   itself is `Api.Org.Repo.prepare_query/3` (`lib/api/org.ex:35`) reading
   process-dictionary state set by `put_org_id/1` (`:373`) / `put_merchant_id/1`
   (`:381`) — this is what stops one merchant updating/deleting another
   merchant's product via this route (mechanism cited; internals of
   `prepare_query/3` not traced further — out of scope for a write inventory).
2. `apply_general_fields/1`, then `process_context(context, record)` — §1c: for
   Product this deep-merges the fetched record into the payload; for
   ProductVariant it does not.
3. `clean_context/1`.
4. `Helpers.Context.changeset({:ok, context}, record)` (`default.ex:307` →
   `context.ex:200-214`): now `module` is the fetched **struct**, so
   `schema = module.__struct__` (`:209`) and `struct(record) |> schema.changeset(context)`
   — `struct(record)` on an already-existing struct is idempotent, so this is
   `Product.changeset(record, context)` / `ProductVariant.changeset(record, context)`
   with a non-nil `id` — the EXISTING-record changeset clause, §1e/§1f.
5. `Api.Org.Repo.update()` (`:308`) — direct update, **not** wrapped in the
   `insert_record` Multi, so a normal update does not insert a fresh
   `merchant_records` row — **except** `:314-323`: if the caller is a
   super_admin/super_moderator (`is_acting_as_super_user/0`, `:76-78`,
   `Api.Org.Repo.get_role_id() < 3`), `insert_merchant_record/1` runs again
   (rescue-wrapped), which — if a tenant `merchant_id` is set in process state
   at that moment — inserts an additional `merchant_records` row for the
   product/variant being updated.
6. `Helpers.Context.set_image/3` again (§1f), then `preloader(:defaults)` again.

**DELETE** (`default.ex:349-365`): `params |> get()` — same tenant-scoped
fetch/guard as update (`:352-358`) — then `record |> Api.Org.Repo.delete()`
(`:362`) — a hard delete, no soft-delete/status flag in this function. Identical
mechanism for `Product` and `ProductVariant` when reached via this route.

### 1e. `Api.Inventory.Product` changeset — `lib/api/schema/inventory/product.ex`

Schema fields (`:7-23` plus `currency_code` at `:25`, separated by a blank
line): `data:map, meta:map, permalink:string, price:float, image:string,
public:boolean(false), unlimited:boolean(false), rating_sum:integer,
rating_count:integer, status:integer, tag_ids:{array,integer}, teaser:string,
title:string, units_remaining:integer, units_sold:integer,
secure:boolean(virtual), uid:string, currency_code:string`, plus
`belongs_to :currency` → `currency_id` (`:28`), `belongs_to :category` →
`category_id` (`:29`). **No `has_many`/`cast_assoc`/`put_assoc` anywhere** —
`grep -rn "cast_assoc\|put_assoc\|has_many" lib/api/schema/inventory/` returns
zero hits repo-wide.

- New-record clause (`:52-60`): forces `attrs["status"] || 2` (`:54`, string-keyed
  only), then `cast(attrs, __schema__(:fields))` (`:57`) — **casts every schema
  field generically**, not a hand-picked whitelist — then `put_permalink/2`
  (permalink slug generation/validation, not further inspected here), then
  `apply_constraints/1`.
- Existing-record clause (`:63-68`): `cast(attrs, __schema__(:fields) -- @immutable -- @secure)`,
  `@immutable = ~w(inserted_at)a` (`:49`), `@secure = ~w()a` (`:47`, empty) — every
  field except `inserted_at` is mutable through a plain update.
- `apply_constraints/1` (`:79-97`):
  - `validate_merchant_context/1` (`:70-77`): adds a `:merchant_id` changeset
    error if `Api.Org.Repo.get_merchant_id()` is `nil` — **the changeset itself
    refuses to validate without a tenant merchant context**, independent of any
    router/controller check.
  - `validate_number` bounds (`0 <= x < 300_000_000`) on `price` (`:82`),
    `units_remaining` (`:83`), `units_sold` (`:84`), `rating_sum` (`:85`),
    `rating_count` (`:86`).
  - Length caps: `permalink<=128` (`:87`), `teaser<=512` (`:88`), `title<=96`
    (`:89`).
  - `validate_required(@required)` (`:90`), `@required = ~w(price currency_id permalink price status title)a`
    (`:48`, `price` listed twice).
  - `assoc_constraint(:category)` (`:91`), `assoc_constraint(:currency)` (`:92`).
  - `unique_constraint([:product_id, :variant_group_option_ids], message: "Variant already exists")`
    (`:94-96`) — **`product_id` and `variant_group_option_ids` are not fields on
    this schema and not columns on the `products` table** (cross-checked against
    the full `products` migration column list, §5) — this constraint targets
    a Postgres constraint name that cannot exist for this table, so it can never
    fire as written.

DB-level constraint not mirrored in the changeset: `priv/repo/migrations/20221015172525_create_products.exs:31`
adds a named CHECK constraint `number_must_be_positive` on `price >= 0.00`, but
`apply_constraints/1` never calls `check_constraint(:price, name: :number_must_be_positive)`
— the app-level `validate_number(:price, ...)` (`:82`) normally catches a bad
price first, so this DB constraint is an un-translated backstop: if ever hit, it
would surface as a raw `Ecto.ConstraintError`/`Postgrex.Error`, not a friendly
changeset error.

Schema/table mismatch on `user_id`: the `products` table has a `user_id` FK
column (`references(:users, ...)`, migration `:23`, §5), but `Product`'s schema
block declares no `field :user_id` and no `belongs_to :user`/`:creator` (the
latter is explicitly commented out, `product.ex:27`,
`# belongs_to :creator, Api.Accounts.User`). So the `"user_id"` that
`apply_general_fields/1` sets on every create (`default.ex:438`) is not in
`__schema__(:fields)` and is silently dropped by `cast/3`. `@inkress/admin-sdk`'s
`CreateProductData`/`UpdateProductData` TS interfaces (`admin-sdk/src/types.ts:481-495,498-513`)
also advertise a `user_id?: number` field that the API does not persist.

### 1f. `Api.Inventory.ProductVariant` changeset — `lib/api/schema/inventory/product_variant.ex`

Reachable ONLY through the same generic route, at URL segment `variants` (the
table name). Schema fields (`:6-19`): `available:boolean(false),
available_after:integer, available_before:integer, description:string,
hash:string, image:string, name:string, price:float, quantity:integer,
quantity_sold:integer, sku:string, unlimited:boolean(false),
secure:boolean(virtual)`, plus `belongs_to :creator, Api.Accounts.User` →
`creator_id` (`:21`), `belongs_to :product, Api.Inventory.Product` →
`product_id` (`:22`).

Three changeset clauses (vs. Product's two):
- New-record (`:40-44`): `cast(attrs, __schema__(:fields))` — all fields.
- `%{secure: true}` (`:46-51`): `cast(attrs, __schema__(:fields) -- @immutable)`,
  `@immutable = ~w(inserted_at sku product_id creator_id)a` (`:36`).
- Fallback/existing (`:53-58`): `cast(attrs, __schema__(:fields) -- @immutable -- @secure)`,
  `@secure = ~w()a` (empty) — same field exclusions as the `secure: true` clause.

Per the update trace in §1d, `Helpers.Context.changeset({:ok, context}, record)`
calls `ProductVariant.changeset(record, context)` where `record` came from
`Context.Defaults.get/1` — a plain DB load never populates the **virtual**
`:secure` field, so `record.secure` is `nil`/absent, meaning the generic-route
update path matches the **fallback clause** (`:53-58`), never the
`%{secure: true}` clause (`:46-51`). **UNCONFIRMED** whether any other code
path in the app ever constructs a `%ProductVariant{secure: true}` before
calling `changeset/2` — none was found in the paths traced in this document.

`apply_constraints/1` (`:60-74`): `validate_number` bounds on `price` (`:62`),
and also on **`:units_remaining`** (`:63`), **`:units_sold`** (`:64`),
`:rating_sum` (`:65`), `:rating_count` (`:66`) — **none of
`units_remaining/units_sold/rating_sum/rating_count` are fields on this schema**
(compare the field list `:7-19` above); length caps `hash<=64` (`:67`),
`image<=1024` (`:68`), `name<=128` (`:69`), `sku<=128` (`:70`);
`validate_required(@required)` (`:71`), `@required = ~w(hash price quantity sku product_id creator_id)a`
(`:35`); `assoc_constraint(:creator)` (`:72`), `assoc_constraint(:product)`
(`:73`) — this last one is the only FK-integrity check tying a variant to a
real product row. Unlike `Product.apply_constraints/1`, there is **no**
`validate_merchant_context/1`-equivalent call here — nothing in this changeset
itself refuses to validate without a tenant context (tenant stamping still
happens one layer up, in `insert_record/1`'s `insert_merchant_record/1`, §1d).

### 1g. Non-changeset write reached from the same create/update flow: async image/logo `update_all`

`Helpers.Context.set_image/3` (`lib/api/helpers/context.ex:19-167`) is called
from both `create/2` (`default.ex:264`) and `update/2` (`default.ex:326`) with
the **original, pre-`clean_context`** params (so `"image"`/`"logo"` survive to
here even though `clean_context/1` stripped them from what reached the
changeset). Every success branch (`:32,46,68,75,94,102,122,130,150,158`) calls
`update_asset_image/3` (`:169-185`):
```elixir
Task.async(fn ->
  ...
  record.__struct__
  |> where([s], s.id == ^record.id)
  |> Api.Org.Repo.update_all(set: opts)
end)
```
(`context.ex:181-183`, `opts` defaults to `[image: url]`). This is a raw,
**asynchronous, detached-from-the-request** `update_all` that sets `image` (or
`logo`) directly on the `products`/`variants` row, entirely outside
`Product.changeset/2` / `ProductVariant.changeset/2` — no `apply_constraints/1`,
no merchant-context check, no length validation. Both `Product` (`image:string`,
`product.ex:11`) and `ProductVariant` (`image:string`, `product_variant.ex:12`)
have an `image` field, so this bypass applies to both when reached via §1d.

### 1h. Who calls this in practice (known external callers, for context — not an exhaustive client audit)

- `@inkress/admin-sdk`, `admin-sdk/src/resources/products.ts:123-166`:
  `create(data: CreateProductData)` (`:123`) and `update(id, data: UpdateProductData)`
  (`:145`) both call `translateProductToInternal(data)` (`:46-56`) — a shallow
  `{...userFacing}` spread plus a `status` string→integer translation only, no
  `variants` handling of any kind — then `POST /products` / `PUT /products/:id`.
  `CreateProductData`/`UpdateProductData` (`admin-sdk/src/types.ts:481-495,498-513`)
  have no `variants` field; a caller wanting variant-shaped data must nest it
  inside the free-form `data?: Record<string, any>` field.
- The FleekSite/revamp merchant product-authoring UI does exactly that: this
  session's own working directory,
  `/Users/romario/projects/fleeksite/revamp/app/routes/admin.markets.products.new.tsx`,
  builds a create/update payload whose `data` object includes
  `variants: { hasVariants, options: variants }` (verified directly, lines
  ~318-368 of that file; the `variants` sub-object itself is at `:364-367`) —
  i.e. the live "variant" authoring UI writes into `data.variants.options`
  through this exact same generic Product create/update path, never touching
  the `variants` table.

---

## 2. Product-specific controllers/services bypassing the generic path

Repo-wide audit, `grep -rn "Api\.Inventory\.Product\b" lib test` (excluding
`ProductVariant`/`ProductAttribute` matches) returns exactly these categories
of hit — no others exist:
1. The generic alias lines: `lib/api/context/inventory/product.ex:2`,
   `lib/api/queries/product.ex:2`.
2. FK references *to* Product from five other schemas (not writers of Product):
   `lib/api/schema/inventory/product_relaunch.ex:13`,
   `lib/api/schema/inventory/product_variant_group.ex:9`,
   `lib/api/schema/inventory/product_variant_exclusion.ex:10`,
   `lib/api/schema/inventory/product_variant.ex:22`,
   `lib/api/schema/inventory/product_availability.ex:11`, plus
   `lib/api/schema/purchase/order_line.ex:19-21` (`belongs_to :product,
   Api.Inventory.Product, foreign_key: :variant_id, references: :id` — the
   order-line's `variant_id` column is wired to `products.id`, not
   `variants.id`; full detail in `convergence/backend-variant-model.md` §4,
   not re-derived here as it is a read/order-freeze concern, not a product
   write path).
3. Two READ-only queries, no write: `lib/api/services/orders/processor.ex:759-761`
   (`fetch_products/1` — `select`s `[:id, :title, :price, :image, :currency_id, :units_remaining, :unlimited, :data]`
   to build an in-memory stock/price snapshot while assembling an order) and
   `lib/api/services/orders/session_based_checkout.ex:480-482` (same shape,
   same field list).

**No dedicated product controller exists.** `lib/api_web/controllers/` has 20
files (`auth_controller.ex, checkout_session_controller.ex, config_controller.ex,
dispute_hold_controller.ex, dispute_lookup_controller.ex, dispute_settle_controller.ex,
fallback_controller.ex, file_controller.ex, hook_controller.ex,
merchant_controller.ex, oauth_client_controller.ex, oauth_controller.ex,
order_controller.ex, page_controller.ex, payment_controller.ex,
payment_link_controller.ex, post_controller.ex, role_controller.ex,
shopify_controller.ex, subscription_controller.ex, user_controller.ex`) — none
named for products/variants. `ApiWeb.ShopifyController`
(`lib/api_web/controllers/shopify_controller.ex`, 145 lines) implements only
Shopify **Payments** session/refund/capture/void — zero occurrences of
"product" or "variant" anywhere in the file (grepped).

**Checkout/order code never decrements stock.** `processor.ex:761` and
`session_based_checkout.ex:482` SELECT `units_remaining`/`unlimited` to
validate availability (`processor.ex:856-857`,
`session_based_checkout.ex:566-570`), but neither file, nor any other file
under `lib/api/services` (grepped for `units_remaining`/`units_sold`), ever
WRITEs those fields. The processor module states this directly in its own
comment: "Product line items are optional; when present it runs the same
stock-availability check and creates the same order_lines as the online path
(which, like this path, does not decrement inventory)."
(`lib/api/services/orders/processor.ex:317-318`). The only writer of
`products.units_remaining`/`units_sold` found anywhere in this investigation is
a direct create/update through the generic changeset (§1e) with those fields
in the request body.

**The only non-changeset write to a `products`/`variants` row found anywhere**
is the async `image`/`logo` `update_all` in §1g — reached from inside the same
generic create/update flow, not a separate route.

**Two more generic-route resources FK to Product but write their own tables**,
not `products`:
- `Context.Inventory.ProductRelaunch` (`lib/api/context/inventory/product_relaunch.ex`,
  same `use Context.Defaults` pattern) writes `product_relaunches`. Schema
  `lib/api/schema/inventory/product_relaunch.ex`: `@required = ~w(interval lineage product_id period)a`
  (`:26`), `assoc_constraint(:product)` (`:55`) — requires a valid `product_id`.
- `Context.Inventory.ProductAvailability` (`lib/api/context/inventory/product_availability.ex`,
  same pattern) writes `product_availability`. Schema
  `lib/api/schema/inventory/product_availability.ex`: `@required = ~w(day_of_week start_time end_time)a`
  (`:24`), `assoc_constraint(:product)` (`:46`).

Neither is cast from, nor casts into, `Product` itself — both are independent
generic-route resources at their own table-name URL segment
(`product_relaunches`, `product_availability`).

**Two schemas outside the inventory domain carry a live FK to the orphaned
`variants` table (a reference, not a write)**:
- `Api.Appointment.Booking` (`lib/api/schema/appointments/booking.ex`):
  `belongs_to :variant, Api.Inventory.ProductVariant` (`:14`). `@required = ~w(start_time end_time state)a`
  (`:28`) — `variant_id` is castable (via `belongs_to`) but **not required**;
  `assoc_constraint(:variant)` (`:48`) rejects a supplied `variant_id` that
  doesn't resolve to a real `variants` row.
- `Api.Feedback.Review` (`lib/api/schema/feedback/review.ex`):
  `belongs_to :variant, Api.Inventory.ProductVariant` (`:16`); `variant_id` is
  listed in `@immutable` (`:35`, cannot change post-create via the non-secure
  clause); `assoc_constraint(:variant)` (`:55`) and
  `unique_constraint([:customer_id, :variant_id], ...)` (`:56`).

Neither Booking nor Review creates/updates a `variants` row — they only
reference one if a caller supplies `variant_id`.

---

## 3. The `variants` table — writers

**Only reachable writer**: `Context.Inventory.ProductVariant`
(`lib/api/context/inventory/product_variant.ex`), via the identical generic
route mechanism as Product (§1a-§1d), at URL segment `variants` — i.e.
`POST/PUT/DELETE /api/v1/variants(/:id)`, gated by the same `ApiWeb.Authorise`
plug (§6) and the same `ApiWeb.PageController`.

**No seed writes it**: `priv/repo/seeds.exs` contains zero occurrences of
"product" or "variant" (grepped).

**No application code outside the generic Context module** constructs a
`%Api.Inventory.ProductVariant{}` changeset or calls
`Api.Org.Repo.insert/update/delete` on one. Full repo-wide audit,
`grep -rn "Api\.Inventory\.ProductVariant\b" lib test`, returns exactly:
`lib/api/context/inventory/product_variant.ex:2` (alias, the writer above),
`lib/api/queries/product_variant.ex:2` (alias, read-only `Query.ProductVariant`),
`lib/api/schema/inventory/product_variant.ex:1` (its own `defmodule`),
`lib/api/schema/appointments/booking.ex:14` and
`lib/api/schema/feedback/review.ex:16` (out-of-domain FK references, §2, not
writers).

**Test-side attempted callers exist but reference nonexistent modules.**
`test/api_web/controllers/product_variant_controller_test.exs` (166 lines):
`alias Api.Stores` / `alias Api.Stores.ProductVariant` (`:4-5`),
`Stores.create_product_variant(@create_attrs)` (`:54`), and
`Routes.product_variant_path(conn, :index/:create/:show/:update/:delete)`
throughout (`:64,72,76,112,118,140,152,156`).
`test/api_web/controllers/product_variant_group_controller_test.exs`: same
pattern, `alias Api.Stores` / `alias Api.Stores.ProductVariantGroup` (`:4-5`).
`test/api_web/controllers/product_variant_attribute_controller_test.exs`: same
`Api.Stores` pattern (per prior investigation,
`convergence/backend-variant-model.md:134-143`, which additionally found this
one references a route helper — `Routes.product_variant_attribute_path` — with
no backing route at all).

Independently verified in this pass:
- `grep -rn "defmodule Api.Stores" lib/` → **zero results**. `Api.Stores` /
  `Api.Stores.*` does not exist anywhere in `lib/`.
- `router.ex` has zero "variant" route entries (grepped directly, §1a/§2), so
  `Routes.product_variant_path/2,3` is not a generated Phoenix route helper
  either.
- Both missing symbols are referenced, unconditionally, at the top of
  `product_variant_controller_test.exs` and `product_variant_group_controller_test.exs`
  (the `alias` lines execute at compile time). **Not executed in this
  read-only inventory** — this is static evidence (module/helper existence),
  not a runtime-confirmed `mix test` failure — but both missing symbols are
  independently, directly verifiable and would each on their own prevent these
  files from compiling under normal Elixir semantics.
- The **same** `Api.Stores` defect is present on the scaffold test for the
  real, live `Product` entity too:
  `test/api_web/controllers/product_controller_test.exs:4-5` —
  `alias Api.Stores` / `alias Api.Stores.Product`.
- `grep -rln "Context\.Inventory\.Product" test/` → **zero results** — no test
  file anywhere in `test/` references the real `Context.Inventory.Product` or
  `Context.Inventory.ProductVariant` modules that §1/§3 describe.
- None of the four `product*_controller_test.exs` files carry a
  `@moduletag`/`@tag` skip annotation (grepped). `test/test_helper.exs` is two
  lines, `ExUnit.start()` + `Ecto.Adapters.SQL.Sandbox.mode(Api.Org.Repo, :manual)`
  — no configured exclusions.

---

## 4. Feed / bulk importers

Checked all four worktrees named in the task brief:

| worktree | branch | HEAD |
|---|---|---|
| `commerce-api-feed-41` | `feat/mobile-feed-41` | `451d28db6a7db74b2be01c2c026ac3e7926fd8ce` |
| `commerce-api-feed-enrich` | `feat/feed-enrichment` | `cb978d04925fab27ca9ba951b2fc73eb0d75e627` |
| `commerce-api-feed-fixes` | `feat/mobile-feed-hardening` | `29a9bf98eef0ff6dced321e5d40bd64d3595e387` |
| `commerce-api-mobile-feed` | `feat/mobile-feed` | `81fa10ed25425109564731ee55c37720e4cdfe16` |

All four implement `Service.Feed`, present at `lib/api/services/feed/feed.ex`
in every one of them. Its own moduledoc states the scope directly:

> "Merchant activity feed: merges commerce events from their existing source
> tables (no event-write changes) into one reverse-chronological stream with an
> opaque keyset cursor. Types: `:order_created`, `:order_paid`, `:order_failed`,
> `:payout_sent`, `:payout_failed`, `:dispute_opened`, `:verification_changed`."
> — `commerce-api-feed-41/lib/api/services/feed/feed.ex:1-6`

This is a **read-only merchant notification/activity feed over
orders/payouts/disputes** — not a product-catalog data feed or bulk importer.

Grepped every one of the four worktrees' `lib/` trees for `roduct`/`ariant`
(case-insensitive, `grep -rIn`): each returns 77-79 hits
(`commerce-api-feed-41`: 79, `commerce-api-feed-enrich`: 78,
`commerce-api-feed-fixes`: 78, `commerce-api-mobile-feed`: 77). Every hit is
one of:
(a) the same pre-existing orphaned `product_view.ex` / `product_variant_view.ex`
/ `product_variant_attribute_view.ex` Phoenix views already present on the main
branch (identical content to what `convergence/backend-variant-model.md` §1c
documents for `feature/spi-3ds`);
(b) the generic `get "/products", PageController, :index` router line (each
worktree's `router.ex`, e.g. `commerce-api-feed-41/lib/api_web/router.ex:216,221`);
(c) unrelated substring matches (e.g. "invariant" in a comment, "products" in
a `checkout_session_controller.ex` sample JSON docstring).
**No `Product.changeset`, `ProductVariant.changeset`, `Api.Org.Repo.insert/update`
call on either schema, or any CSV/bulk-upsert code touching `data.variants`,
was found in any of the four worktrees.**

Supplementary check on the main `commerce-api` checkout (not just the 4
worktrees named in the brief): `grep -rli "bulk\|csv_import\|catalog_sync\|product_import\|import_product" lib`
returns 4 files (`lib/api/org.ex`, `lib/api/auth/policy_cache.ex`,
`lib/api/schema/ledger/account_balance.ex`,
`lib/api/schema/ledger/transaction_entry.ex`) — none product-related
(substring false-positives on "sync"/"import"-adjacent words in unrelated
code). `ls -d *product* *catalog* *gmc*` under `/Users/romario/projects/inkress/`
finds no top-level directory named for a product feed/catalog importer. **No
bulk/feed product importer was found anywhere in this investigation's search
scope.**

---

## 5. Migrations touching `products` / `variants`

`grep -n "table(:products)\|table(:variants)" priv/repo/migrations/*.exs`
returns exactly these hits, across exactly 4 files:

**`products`** — created
`priv/repo/migrations/20221015172525_create_products.exs:5-26`:
```
category_id:integer, currency_id:integer, data:map, meta:map,
permalink:string(128), price:float(default 0.00),
public:boolean(default false, not null), status:integer,
tag_ids:{array,integer}, teaser:string(512), title:string(96),
unlimited:boolean(default false, not null),
units_remaining:integer(default 0), units_sold:integer(default 0),
rating_sum:integer(default 0), rating_count:integer(default 0),
uid:string(default uuid_generate_v4()), user_id:references(users),
inserted_at/updated_at
```
Indexes on `category_id`/`currency_id` (`:28-29`); a named CHECK constraint
`number_must_be_positive` on `price >= 0.00` (`:31`, see §1e for the
changeset-side gap). Altered twice since:
- `priv/repo/migrations/20240210013613_add_product_image.exs:6-8` adds
  `image:string(2048)`.
- `priv/repo/migrations/20260105161800_add_currency_code_fields.exs:13-15`
  adds `currency_code:string`, plus a one-time backfill
  (`UPDATE products SET currency_code = 'JMD' WHERE currency_id IS NULL`, etc.,
  `:37-39`).

No other migration ever touches `products` — confirmed, exactly these 3 files
match `table(:products)`.

**`variants`** — created
`priv/repo/migrations/20221015174921_create_product_variants.exs:5` (module
name `CreateVariants`; the table is literally named `variants`, not
`product_variants`, despite the migration's filename). Full column list per
the prior investigation's read of this same file
(`convergence/backend-variant-model.md` §1a, migration lines `:6-26`):
```
available_after/available_before:integer,
available:boolean(default false, not null), default:boolean(default false),
description:text, hash:string(64), image:string(1024), name:string(128),
price:float(default 0.00), units_remaining:integer(default 1),
units_sold:integer(default 0), rating_sum:integer(default 0),
rating_count:integer(default 0), sku:string(128),
unlimited:boolean(default false, not null),
variant_group_option_ids:array(integer), product_id:references(products),
creator_id:references(users), inserted_at/updated_at
```
Unique constraints on `sku` and `hash`, a check `price >= 0.00`, unique on
`(product_id, variant_group_option_ids)`. **Never altered since creation** —
independently confirmed here (`grep -n "table(:variants)"
priv/repo/migrations/*.exs` → exactly this one file), matching the prior
investigation's own independent grep of the same fact.

Column-vs-schema-field mismatch (independently confirmed against my own read
of `product_variant.ex` in §1f): the table has `units_remaining`/`units_sold`
columns; the schema (`product_variant.ex:15-16`) declares fields named
`quantity`/`quantity_sold` instead, with no `source:` remap on either — so the
schema's `quantity`/`quantity_sold` fields do not correspond to any column on
the real table, and the table's actual `units_remaining`/`units_sold` columns
are not exposed by the schema under any name.

---

## 6. RBAC scopes for product/variant write

Two parallel, synchronized authorization layers both key on the literal
strings `"products"` and `"variants"` as the resource name.

### 6a. Role-table grants — `priv/rbac.yaml`

Exact blocks (line numbers = block header; each `view/list/create/update/delete`
key is one line below in the order listed):

- `products:` (header `:180`): `view` (`:181`) and `list` (`:182`) both include
  `'public'` plus every staff/org/merchant/affiliate/customer role; `create`
  (`:183`), `update` (`:184`), `delete` (`:185`) all =
  `['super_admin', 'super_moderator', 'organisation_admin', 'organisation_moderator', 'merchant_admin', 'merchant_moderator']`.
- `variants:` (header `:301`): `view` (`:302`) includes `'public'`; **`list`
  (`:303`) does NOT include `'public'`** (only `super_admin, super_moderator,
  platform_affiliate, organisation_admin, organisation_moderator,
  organisation_affiliate, merchant_admin, merchant_moderator,
  merchant_affiliate, customer`) — a real asymmetry vs. `products:list`
  (`:182`), which does include `'public'`. `create`/`update`/`delete`
  (`:304-306`) are the identical 6-role list to `products`.
- `product_availability:` (`:187`), `product_relaunches:` (`:194`),
  `product_tags:` (`:201`), `product_variant_exclusions:` (`:208`) — each a
  5-line block (`view/list/create/update/delete`) with the **same** 6-role
  list for every action, including `view`/`list` (narrower than
  `products`/`variants`: no `'public'`, no `*_affiliate`, no `'customer'` even
  for read).
- `variant_groups:` (`:291`) and `variant_group_options:` (`:296`) — each only
  3 lines (`view/list/create`); **no `update`/`delete` key exists in the yaml
  for either resource at all.**

### 6b. Enforcement: two code paths read this (or a DB mirror of it)

- `ApiWeb.Authorise.legacy_allowed?/5` (`lib/api_web/plugs/authorise.ex:52-63`):
  first checks `ApiWeb.YamlAuthorise.check_permission(conn)` (reads
  `rbac.yaml` directly), then JWT/token-permission fallbacks
  (`Context.Auth.TokenPermission.is_jwt_allowed/4`,
  `Context.Auth.TokenPermission.is_allowed/3`).
- `ApiWeb.Authorise.db_allowed?/6` (`:69-94`): explicitly denies an anonymous
  principal (`:78-79`), else `Api.Auth.Policy.allows?(role_id, resource, action)`
  (`:82`) — `Api.Auth.Policy.allows?/3` (`lib/api/auth/policy.ex:26,28,42`)
  short-circuits `true` for `role_id in [1, 2]` (super_admin/super_moderator)
  and otherwise checks a DB-backed grant — else an owner check
  (`ApiWeb.YamlAuthorise.owner_allowed?/1`, `:85`), else the same JWT/token
  fallbacks.
- `Api.Auth.PolicySeed` (`lib/api/auth/policy_seed.ex:3,21,79,103,149`)
  backfills/reconciles the DB-backed grant table **from `rbac.yaml`** — so 6b's
  DB path is a synchronized mirror of 6a, not an independently-maintained list.
- Which path is authoritative: `enforce_db?/0` (`authorise.ex:99-105`, env var
  `ENFORCE_DB_AUTHZ` / config `:api, :enforce_db_authz`). `legacy_allowed?/5`
  always runs regardless, for shadow-comparison telemetry
  (`role_or_token_allowed/6:40-49`, `shadow_compare/3` call at `:42`).
- **Which plug actually runs for product/variant CRUD**: `ApiWeb.Authorise`
  (the module above) is wired via `plug ApiWeb.Authorise` inside
  `ApiWeb.PageController` itself (`lib/api_web/controllers/page_controller.ex:14`)
  — this is a **different mechanism** from the router's own
  `pipeline :authorise do plug Api.Plug.LoggedIn end` (`router.ex:43-45`),
  which gates only the earlier, separate `scope "/v1" do pipe_through [:authorise] ... end`
  block for the named routes (auth/users/roles/etc.) — confirmed outside the
  generic `/:resource_path` scope, §1a. `ApiWeb.Authorise.call/2` (`:16-36`)
  branches on `principal.source`: `:service` (bot key) →
  `Api.Auth.BotPolicy.allows?/2` gate (`:112-137`); `:oauth` (integration
  token) → `resource`/`action` resolved via `ApiWeb.ActionResolver.resolve(conn)`
  then `oauth_allowed?(principal.scopes, resource, action)` (`:26`, not read
  further in this pass — presumed to route to `Api.Auth.Scopes.covers?/3`
  below, **UNCONFIRMED** the exact call site of `oauth_allowed?/3` itself);
  anything else → `role_or_token_allowed/6`.

### 6c. OAuth scope grants (third-party integration apps) — `lib/api/auth/scopes.ex`

- `"products:write"` (`:109-120`) expands to:
  `{"products","create"}, {"products","update"}, {"variants","create"}, {"variants","update"}, {"categories","create"}, {"categories","update"}, {"product_tags","create"}, {"product_tags","update"}`.
- `"products:read"` (`:97-108`) expands to `view`/`list` on `products`,
  `variants`, `categories`, `product_tags`.
- **No scope anywhere in `@scopes` (`:62-257`) grants `{"products","delete"}`
  or `{"variants","delete"}`** — the only `"delete"` permission in the entire
  file is `{"webhook_urls","delete"}` (`:190`). An OAuth-authenticated
  integration app can never delete a product or a variant through this scope
  system, regardless of which scope string it is granted.
- `Api.Auth.Scopes.covers?/3` (`:395-400`) is the coverage check; `expand/1`
  (`:277-289`) does scope→permission expansion; `to_permissions/1`
  (`:371-389`) resolves scopes to `Api.Auth.Permission` DB rows (not traced
  further — outside a product/variant write inventory).
- Net effect: a `products:write`-scoped OAuth app is granted `variants`
  `create`/`update` permission even though, per §3, nothing in this
  codebase's own product-authoring UI/SDK ever populates a `variants` row —
  the permission exists and would be honoured by `Context.Inventory.ProductVariant.create/1`
  (§1d) if any OAuth caller ever POSTs to `/api/v1/variants`.

---

## 7. Per-path breakage-risk notes

- **§1d/§1e — `Context.Defaults.create/update/delete` + `Product.changeset/2`**:
  a future `cast_assoc :variants` (or similar) on `Api.Inventory.Product` would
  be picked up automatically by `cast(attrs, __schema__(:fields))` at
  `product.ex:57` (new) and `:65` (existing) since those calls cast whatever
  `__schema__(:fields)` returns — no other code change needed to make the
  field castable — but `apply_constraints/1` (`:79-97`) would need an explicit
  `cast_assoc(:variants, ...)`/`validate_...` call added, and every existing
  caller that already sends unrelated fields would suddenly have a live
  `variants` key checked instead of silently dropped (today a stray
  `"variants"` key in the payload is simply not a schema field and is ignored
  by `cast/3`).
- **§1c/§1d — Product vs. ProductVariant `process_context/2` asymmetry**:
  Product's update path deep-merges the existing record into the payload
  before validation (`product.ex` context module, `:20-25`); ProductVariant's
  does not (`product_variant.ex` context module, `:11`). Any variant-wiring
  work that reuses `Context.Defaults` generically for a new variant-write flow
  needs to decide, explicitly, which merge behaviour it wants — inheriting the
  wrong one silently changes partial-update semantics.
- **§1g — async `update_all` image bypass**: any variant-wiring change that
  adds fields to `Product`/`ProductVariant` will NOT be reflected by this path
  (`context.ex:169-185`) — it only ever touches `image`/`logo` — but it is a
  precedent for "write bypasses the changeset for this one field," worth
  knowing about if a variant image needs equivalent handling.
- **§1e — `unique_constraint([:product_id, :variant_group_option_ids], ...)`**:
  currently inert (targets non-existent fields/columns, `product.ex:94-96`).
  If a variant-wiring change ever adds real `product_id`/`variant_group_option_ids`-
  shaped fields to `Product` (unlikely, but the naming is suggestive of the
  dormant `ProductVariantGroup` system, §2), this constraint would suddenly
  start being live and could reject inserts that previously succeeded.
  Otherwise, adding *different* real variant fields leaves this line as
  pre-existing dead weight, not a new risk.
- **§1d — merchant_records double-insert on super_admin update**
  (`default.ex:314-323`): any new variant-write flow that copies the
  `Context.Defaults.update/2` pattern inherits this super_admin-only
  side-effect (an extra `Api.Auth.MerchantRecord` row) whether it wants it or
  not.
- **§2 — no stock decrement anywhere today**: a variant-wiring project that
  intends variants to carry their own stock must add a decrement write from
  scratch (checkout/order code has none for `products.units_remaining` either,
  per `processor.ex:317-318`); there is no existing decrement call site to
  extend or accidentally duplicate.
- **§3 — `variants` table has zero live writers today**: any new code path
  that starts inserting real rows into `variants` makes two previously-inert
  FK declarations meaningful for the first time — `Api.Appointment.Booking.variant_id`
  (`booking.ex:14,48`) and `Api.Feedback.Review.variant_id`
  (`review.ex:16,55-56`) — both `assoc_constraint(:variant)`, both currently
  only ever validated against an always-empty table. Populating `variants`
  means these two FKs start actually constraining booking/review writes that
  happen to supply a `variant_id`.
- **§3 — 4 scaffold test files reference a nonexistent `Api.Stores` namespace**
  (`product_controller_test.exs`, `product_variant_controller_test.exs`,
  `product_variant_group_controller_test.exs`,
  `product_variant_attribute_controller_test.exs`): on the static evidence
  gathered here, these do not compile as committed. Any variant-wiring work
  that wants `mix test` green, or that wants a real regression net for
  "product create/update/delete still works," is starting from zero working
  test coverage for this schema pair specifically (confirmed no other test
  file references the real `Context.Inventory.Product`/`ProductVariant`
  modules) and will likely need to fix-or-replace these four files as a
  prerequisite, not as part of the variant change itself.
- **§6 — OAuth `variants:create`/`variants:update` already granted**: any new
  variant-write flow reachable at `/api/v1/variants` inherits an
  already-live permission grant for `products:write`-scoped OAuth apps
  (`scopes.ex:109-120`) — such an app could start creating/updating real
  `variants` rows the moment the route starts accepting/validating requests
  successfully, with no additional scope work required and no `delete`
  exposure (§6c).
- **§6 — two authorization decision paths (legacy yaml vs DB-backed) must
  agree**: `rbac.yaml`'s `variants:` block (`:301-306`) and whatever
  `Api.Auth.Policy`/`role_permissions` currently holds (seeded from the same
  yaml via `policy_seed.ex`) both already grant create/update/delete on
  `variants` to the same 6 roles as `products` — no RBAC change is implied by
  wiring the table itself, but `ENFORCE_DB_AUTHZ` drift between the two
  (`authorise.ex:99-105`) is a pre-existing condition to be aware of, not
  something a variant change introduces.

---

## DONE
