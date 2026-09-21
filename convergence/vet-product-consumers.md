# Product/variant CONSUMER inventory (vetting, verified 2026-09-21)

Every consumer that reads or writes Inkress products/variants, so a variant-wiring change doesn't break
them. Verified directly (greps + git show + the admin-sdk sub-agent pass); `path:line` cited.
(Rewritten reliably after the first agent over-delegated and left a skeleton; its package map is kept.)

## Two decisive conclusions
1. **NO consumer reads or writes the `variants` table.** Repo-wide sweep across commerce-web, storefront-sdk,
   inkress-mobile, revamp for `/variants`, `product_variants`, `.variants.(create|update|list|get)` →
   the only hits are `import … from '../utils/variants'` in storefront-sdk (a helper file named "variants"
   that reads `product.data.attributes`/`customer_inputs`, NOT the table). ⇒ **Wiring the orphaned `variants`
   table in is ADDITIVE — no consumer breaks.**
2. **Every consumer depends on the product + `product.data`-options model** (product = buyable unit; options in
   `data.variants.options` / `data.attributes` / `data.customer_inputs`; order lines carry
   `product_variant_*_frozen` (frozen from the PRODUCT) + `properties`). ⇒ **This model must be PRESERVED —
   any change is expand-only: never remove/rename a `product.data` option key or change the `/products` shape.**

## Package/location map (verified)
- `@inkress/admin-sdk`: revamp pins `github:inkress/admin-sdk#feature/checkout-sessions`; resolved copy in
  `revamp/node_modules/@inkress/admin-sdk` = **v1.1.46** (dist-only). Local clones: `inkress/admin-sdk`
  (v1.1.52, branch `feat/discount-codes`), `admin-sdk-app-perf` (v1.1.47), `sdks/inkress-admin-sdk` (v1.0.0).
- `@inkress/storefront-sdk`: `inkress/storefront-sdk` (v1.1.2) + worktree `_worktrees/sf-sdk-convergence` (v1.2.0).
- Mobile: `inkress/inkress-mobile` (Expo RN, merchant app). `commerce-api-mobile-feed` is a commerce-api branch, not a client.

## Per-consumer

### revamp markets editor (`fleeksite/revamp`) — READ + WRITE
- Writes via `@inkress/admin-sdk` `products.create/update` (`app/lib/markets-client.ts:549,568`), payload built by
  `prepareProductPayload` (`:1255-1282`): options go inside `data` (`admin.markets.products.new.tsx:320,365-367`
  → `data.variants.options`); a top-level `variants` is also set (`markets-client.ts:1277`) but see admin-sdk below.
- Reads back `data.variants.options` (`new.tsx:976-978`). **Breakage risk:** any change to the `/products` `data`
  shape or the products endpoint breaks create/edit/list in the live merchant admin.

### @inkress/admin-sdk `ProductsResource` — passthrough
- 7 methods, `GET/POST/PUT/DELETE /products` + `GET /products/:id` (verified vs branch source AND the resolved
  v1.1.46 dist — no drift). **NO `variants` field/handling anywhere**; `create`/`update` only translate `status`
  (string→int) and spread the rest, so `data` (incl. `data.variants.options`) passes through and a top-level
  `variants` is sent in the body but **dropped by commerce-api's Product changeset** (no cast). `data` typed loose
  `Record<string,any>`. **Breakage risk:** none of its own; it mirrors the `/products` contract.

### commerce-web — READ (marketplace) + WRITE-adjacent (checkout)
- Marketplace product pages read `product.data` options (`app/types/marketplace.ts:272 customer_inputs?`, +
  `data.attributes`); option pricing mirrors `computeUnitPrice`. **Breakage risk:** option rendering/pricing.
- Checkout worktree `_worktrees/cw-checkout-sdk` (my refactor): reads invoice/order lines where `variant_id =
  product.id` and `product_variant_*_frozen` come from the product. **Breakage risk:** line rendering + the
  order-create `products:[{id,quantity}]` (id = product id).

### @inkress/storefront-sdk — READ helpers
- `src/utils/variants.ts` reads `product.data.attributes` + `product.data.customer_inputs` (`:25-26,39-40,53-55`)
  and `computeProductUnitPrice` (base + option add-ons). Cart keys by `product.id`. **Breakage risk:** these helpers
  assume product+data-options; they never touch the `variants` table.

### inkress-mobile — READ (orders/products) + WRITE (product create)
- Order display reads `line.product_variant_name_frozen` / `product_variant_total_frozen` (= product title/price)
  + `properties` for options (`lib/orders.ts:106-108,728-730`; `app/(app)/sales/[id].tsx:573`). Has
  `app/(app)/store/products/new.tsx` (product create). **No variants-table use.** **Breakage risk:** order-line
  display (frozen fields) + product create.

### fs-hono / FleekSite — NOT a product-API consumer today
- `src/lib/external/inkress.ts:186-201` defines `fetchProducts()` (`GET /products`) but it has **no call site**
  (repo-wide grep). `src/lib/payments/inkress.ts:16` imports only `InkressSDK` (the payment gateway /
  checkout-sessions), not `fetchProducts`. ⇒ FleekSite reads its OWN local DB for products (per fs-hono-runtime.md).
  **Breakage risk:** none — driving FleekSite products through Inkress is greenfield on the FleekSite side.

## Implication for the plan
Wiring the `variants` table into product-create + checkout + a storefront read is **additive** (zero current
consumers of the table) and can be done **expand/contract** while leaving the product+`data`-options model — which
revamp markets, commerce-web, storefront-sdk, and mobile all depend on — completely intact. The order-line frozen
fields (`product_variant_*_frozen`) keep their SHAPE regardless of whether the source is the product or a real
variant, so mobile/web order display is unaffected by changing the source.

## CRITICAL verified nuances (from the full consumer sweep, 2026-09-21)

1. **TWO inconsistent options-in-`data` shapes — they don't interoperate.**
   - `data.attributes` + `data.customer_inputs` = the CANONICAL marketplace shape. READ by commerce-web
     marketplace (all 4 loaders: `marketplace.$username.$permalink.tsx:180-181`, `._index.tsx:450-451`,
     `api.marketplace.$username.products.ts:60-61`) + the storefront SDK (`utils/variants.ts:25-26,39-40`,
     self-doc "the one commerce-web's marketplace consumes"). WRITTEN by the OLD commerce-web product form
     (`dashboard.store.products.$id.tsx:85-86,340,446-471` + `components/forms/product-form.tsx`).
   - `data.variants.options` = written by the NEW revamp markets editor (`admin.markets.products.new.tsx:320,365-367`,
     read back `:976-977`). **NOT read by the marketplace or the storefront SDK** — only by revamp's own
     storefront page (`products.$productId.tsx:450,652`), which currently runs on **mock data** (`:134` fetch commented out).
   - ⇒ **A product authored in the revamp markets editor appears OPTION-LESS to the marketplace and the storefront SDK.**
     Romario's "author in Inkress → read via the storefront SDK" premise is already broken for revamp-authored options.
     Also: `revamp` markets never persists the option-GROUP names (`variantOptions` hardcoded to `['Size','Color','Material']`,
     never submitted — `new.tsx:1006,2372-2373`).
2. **The buyable unit + option-pricing is `product` + `properties`, priced client-side + re-priced server-side.**
   commerce-web computes an option delta from `customer_inputs` (`getOptionPrice`, `marketplace.$username.$permalink.tsx:514-530`),
   stores it on the cart item as `properties[key] = {value, price}`, and sends only `products:[{id,quantity,properties}]`
   to `order.create` (`checkout._index.tsx:331-337`) — never a computed price. (4 divergent add-on implementations exist;
   one storefront subtotal omits the delta — `._index.tsx:983`.) Order lines freeze `product_variant_*_frozen` from the
   product + `properties`. My refactored invoice checkout + the pre-rewrite one send only `{id,quantity}` (drop `properties`) —
   pre-existing behavior, preserved.
3. **FleekSite has its OWN variant SKU model.** `fs-hono/src/db/schema/commerce.ts:19-45` = a normalized `variants`
   table (id/sku/stock/unlimited/price/name/image, FK `postId`) on FleekSite's own DB (`mms_dev` @ og.rfitzy.net) —
   real per-variant SKUs. FleekSite does NOT read Inkress products (`fetchProducts` dead). So "drive FleekSite variants
   through Inkress" = replace FleekSite's own SKU table with an Inkress-driven one — greenfield on the read side, but the
   TARGET SKU shape already exists in FleekSite to match.

## Implication for the plan (updated)
Two problems, not one: (i) the orphaned Inkress `variants` table (additive to wire), AND (ii) the incoherent options
model (two `data` shapes; revamp-authored options unreadable by storefront). A coherent variant story for FleekSite must
pick ONE canonical shape and make authoring + storefront-read agree, WITHOUT breaking the marketplace (`data.attributes`/
`customer_inputs`) or the markets editor (`data.variants.options`) — i.e. an adapter/normalisation layer, expand-only.

## DONE
