# Inkress variant support — the confirmed truth (2026-09-21)

Corrects the earlier "no variant entity" claim (a subagent over-read; verified wrong). Grounded in
commerce-api + revamp markets source (file:line below).

## Two things exist; they are not the same
1. **The LIVE model: product + options in `product.data` jsonb.** The **product is the buyable unit**.
   "Variants/options" (size/colour) are authored by the revamp markets editor and stored in
   `product.data.variants.options` (`revamp/app/routes/admin.markets.products.new.tsx:320,365-367`,
   read back at `:976-978`). Inkress prices the product + option add-ons (the SDK's `computeUnitPrice`
   mirrors this). Checkout freezes the line from the PRODUCT: `variant_id = product.id`,
   `product_variant_name_frozen = product.title`, `product_variant_total_frozen = product.price`
   (`commerce-api/lib/api/services/orders/processor.ex:1264-1267`).
2. **The ORPHANED entity: a real `variants` table + `ProductVariant` schema.** `belongs_to :product`,
   fields name/price/quantity/sku/unlimited/image (`commerce-api/lib/api/schema/inventory/product_variant.ex`),
   a standalone CRUD resource (`Context.Inventory.ProductVariant`, routable via the generic
   `/:resource_path` resolver, `router.ex:393`), `Query.ProductVariant`, `ProductVariantView`, plus a
   Shopify-style `ProductVariantGroup`/`GroupOption`/`Exclusion` system, plus RBAC (`variants:create`).
   **Nothing live uses it:** the Product changeset has NO `variants` field / `has_many` / `cast_assoc`
   (`schema/inventory/product.ex` — casts scalars + `data`/`meta` only, so a top-level `variants` in
   `products.create` is dropped by Ecto); `Query.Product` preloads only `currency/category/merchant`
   (`queries/product.ex:7-8`) so a product GET never returns table-variants; checkout ignores it (above).
   Copy-paste cruft confirms the orphaning: `product_variant.ex:63-66` validates `units_remaining`/`units_sold`/`rating_*`
   fields it doesn't have; `product.ex:94` has a `unique_constraint([:product_id, :variant_group_option_ids])`
   on fields not on Product. Both are no-ops.

## Why this matters for FleekSite
FleekSite needs **buyable variant SKUs** (each variant a row with its own id/price/stock; `distinct: post_id`
grids). Inkress's live model is **one product + option add-ons in `data`** — a different shape. So driving
FleekSite variants through Inkress is NOT "just expose the existing table"; it is either (i) wire the orphaned
`variants` table into product-create + checkout + storefront-read so a variant becomes a real buyable unit, or
(ii) map FleekSite variants onto product+options-in-data. Either path must NOT break the live product+data model
that the markets editor, the marketplace, and checkout depend on — hence the full product read/write vetting (in
progress → vet-product-{write,read,consumers}.md) precedes the plan.

## UNVERIFIED (fold into the vetting)
- The exact `data` shape of a real product with options (empirical: hit the API for a sample) — code says
  `data.variants.options`, but markets-client also maps a top-level `raw.variants` (`markets-client.ts:1139`);
  confirm which the API actually returns.
