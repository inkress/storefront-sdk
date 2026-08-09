# Storefront SDK — Addresses, Variants/Options, Stock, Faceted Search

Date: 2026-08-09
Status: approved (design + scope decisions)

## Goal

Add four storefront capabilities to `@inkress/storefront-sdk`, each grounded in
the real Commerce API + `commerce-web` data model (no invented shapes):

1. Saved addresses (customer CRUD)
2. Product variants/options (read + unit-price calculation)
3. Stock (read helpers + live check)
4. Faceted search (server-side `group_by`)

Scope decisions (approved): products are **read-only** (variants/stock are
authored in the merchant product form, not the storefront); include the add-on
**price calculator**; addresses get **full CRUD**; facets use the API's real
**server-side group_by** (no fluent builder sugar).

## Ground truth (verified in-repo)

- **Custom fields:** `commerce-web/app/components/forms/product-form.tsx` stores a
  single `custom_fields` array on the product (persisted into `product.data`,
  `json_field: "data"`). Each entry:
  `{ name: string, type: "text"|"number"|"options"|"image"|"file", value?: string, price?: number, options?: { label: string, price: number }[] }`.
  The form splits it into *attributes* (has `value`, non-options) vs *customer
  inputs* (type `options`, or no `value`) in the UI only. `options` carry a
  per-label add-on price; non-options inputs carry a single add-on `price`.
  Storage key varies by route (`custom_fields` vs `data.attributes` +
  `data.customer_inputs`) → SDK reads defensively.
- **Stock:** product columns `unlimited: bool`, `units_remaining: int`,
  `units_sold: int`. No stock endpoint; freshness = re-GET the product.
- **Facets:** `lib/api/queries/product.ex` declares `group_by_fields`
  (`category_id`, `currency_id`, `status`, `public`, `unlimited`) and
  `aggregate_fields` (`price`/`units_remaining`/`units_sold` sum/avg/min/max,
  `rating_sum`/`rating_count` sum, `id` count). Client sends
  `?group_by=field1,field2`; API returns grouped rows with aggregate columns
  named `"#{column}_#{fn}"` (e.g. `id_count`, `price_min`, `price_max`).
- **Addresses:** `Api.Kyc.Address`, `@source "addresses"` → generic resource at
  `/addresses`. Fields: `street, street_optional, city, state, country, region,
  town, postal_code, lat, lang, kind, kind_id` (polymorphic owner via
  `kind`/`kind_id`). `admin-sdk` mirrors this at `/addresses`.

## Design

### 1. `AddressesResource` (`sdk.addresses`) — new file `src/resources/addresses.ts`
- `list(params?)`, `get(id)`, `create(input)`, `update(id, input)`, `delete(id)`
  against `/addresses` + `/addresses/:id`.
- `listForCustomer(customerId, params?)` → `list({ kind_id: customerId, ...params })`.
- Types: `Address`, `AddressInput` in `src/types.ts`.

### 2. Variants/options — pure helpers in `src/utils/variants.ts`, exposed on `sdk.products`
- Types: `ProductCustomField`, `ProductCustomFieldType`, `ProductCustomFieldOption`,
  `CustomFieldSelection`.
- `getProductCustomFields(product)` — defensive read + normalize.
- `getProductAttributes(product)` / `getProductCustomerInputs(product)` — the form's split.
- `computeProductUnitPrice(product, selections)` — base `price` + selected option
  prices + add-on prices for filled non-options inputs.
- `products.getCustomFields / getAttributes / getCustomerInputs / computeUnitPrice`
  delegate to the utils (discoverable ergonomics).

### 3. Stock — pure helpers in `src/utils/variants.ts` + `sdk.products`
- `isProductInStock(product)` → `unlimited || (units_remaining ?? 0) > 0`.
- `getProductAvailableStock(product)` → `unlimited ? null : units_remaining ?? 0`.
- `products.checkStock(productId)` → re-GET `/products/:id`, return
  `{ inStock, unlimited, unitsRemaining }` (type `ProductStock`).

### 4. Faceted search — `products.facets(filters, { groupBy })`
- Sends the existing query transform + `group_by=<fields>` to `/products`.
- Group fields limited to `PRODUCT_GROUP_BY_FIELDS`
  (`category_id`|`currency_id`|`status`|`public`|`unlimited`).
- Returns `ApiResponse<FacetBucket[]>`; each bucket = `{ field, value, count,
  priceMin?, priceMax?, unitsRemaining?, ... }` normalized from `*_count`/`*_min`
  aggregate columns.

## Wiring & tests
- `index.ts`: instantiate `this.addresses`; export new types + variant/stock utils.
- Tests (jest, fetchMock pattern): addresses paths; defensive custom-field read +
  split + unit-price; stock helpers + `checkStock`; `facets()` group_by param +
  bucket parsing.
- `CHANGELOG.md` `[1.1.2]`; bump `package.json` to `1.1.2` (additive patch).

## Custom-fields read shape (resolved)
`commerce-web`'s marketplace is the source of truth (it authors AND displays the
data). Its loaders — `marketplace.$username.$permalink.tsx`,
`marketplace.$username._index.tsx`, `api.marketplace.$username.products.ts` — set
`productData = product.data` and read `productData.attributes` +
`productData.customer_inputs`. So the canonical read location is
**`product.data.attributes` + `product.data.customer_inputs`** (the read-side
shape at `marketplace.$username.$permalink.tsx:74-80` matches `ProductCustomField`
exactly). `custom_fields` is only the merchant form's *write* payload.
The SDK reads the canonical shape first, with `custom_fields` as a fallback.
`computeProductUnitPrice` mirrors the marketplace's `getOptionPrice`
(`marketplace.$username.$permalink.tsx:513-530`).
