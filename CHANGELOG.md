# Changelog

All notable changes to the Inkress Storefront SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Storefront DOM kit (additive) — the SDK gains FleekSite's two declarative
conventions so themes can drive the existing cart from markup, without a second cart
model. Opt-in: importing the SDK still touches nothing until `mountStorefront` runs.

### Added
- **`mountStorefront(sdk, options?)`** — binds delegated `data-*` hooks and bridges the
  cart emitter to DOM `CustomEvent`s over the existing `inkress.cart`.
  - **`ik-*` native, `fk-*` fallback** — every attribute is read `data-ik-<x>`, then
    `data-fk-<x>`, then bare `data-<x>` (one rule for hooks and data payload alike), so
    new Inkress themes author `ik-*` while ported FleekSite themes keep working untouched.
  - **DOM events** — `ik:cart` (+ granular `ik:cart:item:added` …) and, for compat,
    `fk:cart` with the FleekSite-shaped detail.
  - **Hooks covered (cart money-path):** `add`/`buynow`, `buy` box + `buy-qty`/`buy-inc`/
    `buy-dec`, `variant` select (`buy-price`/`buy-stock`), line `inc`/`dec`/`qty`/`remove`,
    `cart-count`/`cart-total`/`cart-lines`/`cart-empty`/`cart-filled`, `drawer`(+`-open`/
    `-close`/`-scrim`), `checkout`(+`-status`) → `cart.checkout()` → redirect.
  - Stock is clamped through the Product's own `unlimited`/`units_remaining`.
- **`window.inkressCart`** imperative surface (`read/add/setQty/remove/clear/count/
  subtotal/money/open/close`); aliased to `window.fkCart` for legacy theme code.
- **`dist/inkress-storefront.kit.js`** — self-executing IIFE build; a theme includes one
  script that reads `data-ik-merchant`/`data-ik-mode`/`data-currency` off `<html>`,
  constructs the SDK, and mounts (exposes `window.inkress`).
- New types: `StorefrontDomOptions`, `StorefrontDomHandle`, `StorefrontCartApi`,
  `CartAddInput`, `FleekLine`, `HookFields`, `IkCartDetail`.

## [1.3.0] - 2026-09-25

- `cards` resource (Ink Pay): `list`, `remove`, `feeDisclosure`, `connectIntent` (opens a connect with the accepted fee disclosure and returns the mode "store" checkout intent for the hosted card frame), `completeConnect` (polls the pending completion with bounded backoff).

### Fixed (final-review fix wave, same day)

- **`cards.*` needs the shopper's OWN session JWT — never the merchant `public_key`.** Reusing
  checkout's `setAuthToken(public_key)` for `cards.connectIntent` would vault the shopper's card
  onto the merchant key's OWNER, not the shopper (I-S2). `connectIntent` now refuses a `pk_`/`sk_`
  token client-side before any network call, and the identical server-side `403` (now also
  enforced on `connect/2`, closing that seam) is typed the same way everywhere as
  `CardOwnerSessionRequiredError` on `list`/`remove`/`connectIntent`.
- **Connect/complete refusals are now typed** (`CardConnectError`, `reason`): the new `409`
  `card_removed` (a replay after the account was removed/disconnected), `fee_consent_missing`,
  `owner_mismatch`, `reference_mismatch`, `order_not_found`, `connect_order_captured`, and — on
  `connectIntent` — `fee_disclosure_changed` / `fee_disclosure_version_required` (both carry the
  current `feeDisclosure` typed, ready to re-show) / `fee_disclosure_unavailable` (I-S1).
- `connectIntent`'s two-step failure no longer loses the connect reference: if the checkout-intent
  request fails after `/cards/connect` already opened an order, `CardConnectIntentFailedError`
  carries `start` (`reference_id`/`payment_link_uid`/`fee_disclosure`) so a caller can resume the
  SAME order instead of opening a second one (m-S7).
- `remove()`'s own retry (after a lost response) reports a subsequent `404` as
  `CardAlreadyRemovedError` rather than a generic not-found (m-S5, shared decision with the admin
  SDK); a first-attempt `404` is unaffected.
- `feeDisclosure()` now validates its response the same way `connectIntent` already did, throwing
  `CardConnectContractError` on a malformed body instead of returning one (m-S2).
- `completeConnect` no longer polls an unrecognised 2xx body to exhaustion as if it were pending —
  it throws `CardConnectContractError` immediately, and a malformed `account` (e.g. missing `id`)
  is caught the same way instead of risking a raw `TypeError` (m-S3).
- `FeePayer` / `FeeComponentKind` widen to accept an unrecognised value (`KnownUnion | (string &
  {})`) instead of only claiming to at the type level while the runtime guard already accepted
  anything (m-S4, shared forward-compat decision with the admin SDK).
- `PaginationMeta.total_pages` is optional — the server only sends it when `more` is true (m-S1).
- `connectIntent`'s `returnBase` is validated client-side (`https://` with a host, no userinfo) —
  the server silently drops anything else rather than answering an error (m-S8).
- Doc-only: corrected `chargeable`/`owner_id`/`brand` (processor casing) on `SavedCard`, the
  storefront-scoping note on `CardRemovalResult.active_subscriptions`, and the replay-safety note
  on `CardConnectPendingError` (m-S6); the `Privilege levels` table gets a `cards.*` row and
  `CheckoutResource.merchantTokens`'s doc now warns against reusing the merchant key there.

## [1.2.0] - 2026-09-20

Order-first checkout money path (additive) — the discount-preserving, 3DS-hardened
path the live `commerce-web` `/checkouts/:id` page uses, so a storefront can drive the
whole checkout through the SDK. Contracts grounded in commerce-api + commerce-web.

### Added
- **Order-first checkout** on `sdk.checkout` (`CheckoutResource`):
  - `invoice(uid)` — load the payment-link invoice/order (embeds order + merchant).
  - `fees(params, username?)` — merchant fee quote (discount-inclusive; lenient on a bad code).
  - `validateDiscount(params, username?)` — server-authoritative discount quote; both accept
    and reject resolve (branch on `data.valid`). Pass `products` for a product-scoped code
    (sent as a POST body, since a `products[]` can't be querystring-encoded). Reject `reason`
    is a typed `DiscountRejectReason`.
  - `merchantTokens(username?)` — the merchant public key that authorizes order creation.
  - `createOrder(input)` — structured input flattened to the backend's dot-keyed body
    (customer / products / shipping / discount / meta_data); the server re-prices, re-resolves
    the discount under a lock, and re-validates shipping.
  - PowerTranz 3DS off the order's own payment-link uid: `checkoutIntent`, `chargeCard`,
    `complete3ds`.
- New types: `FeesQuote`, `DiscountQuote`, `DiscountRejectReason`, `DiscountLineInput`,
  `CreateOrderInput`, `CreateOrderResult`, `InvoiceDisplay`, `CheckoutIntent`,
  `ChargeCardInput`, `Complete3dsInput`, `PublicDataResponse`, plus the param types.

### Note
- The order-first path is the discount-preserving path; the session path (`createSession`)
  cannot apply discounts server-side yet. The quote is ADVISORY — order creation re-checks
  the code under a lock, so handle a rejection at `createOrder` even after a green quote.

## [1.1.2] - 2026-08-09

Storefront capability release (additive). Every shape is grounded in the Commerce
API + `commerce-web` product form — see
`docs/superpowers/specs/2026-08-09-storefront-sdk-addresses-variants-stock-facets-design.md`.

### Added
- **Saved addresses** — new `sdk.addresses` (`AddressesResource`) over the real
  `/addresses` resource: `list`, `get`, `create`, `update`, `delete`, and
  `listForCustomer(customerId)` (scopes by `kind_id`). New `SavedAddress` /
  `AddressInput` / `AddressListParams` types.
- **Product variants / options** — the merchant product form's `custom_fields`
  are now first-class on the storefront:
  - `products.getCustomFields(product)` reads them defensively (top-level
    `custom_fields`, `data.custom_fields`, or legacy `data.attributes` +
    `data.customer_inputs`).
  - `products.getAttributes` / `getCustomerInputs` mirror the form's split.
  - `products.computeUnitPrice(product, selections)` = base price + chosen option
    prices + add-on prices for filled inputs.
  - New `ProductCustomField`, `ProductCustomFieldOption`, `CustomFieldSelection`
    types, plus tree-shakeable `getProduct*` / `computeProductUnitPrice` utils.
- **Stock** — `products.isInStock(product)`, `products.getAvailableStock(product)`
  (`null` when unlimited), and `products.checkStock(productId)` for a fresh
  snapshot before checkout. New `ProductStock` type.
- **Faceted search** — `products.facets(filters, { groupBy })` uses the API's
  server-side `group_by` to return per-group counts + price/stock aggregates in
  one request. Group fields are whitelisted (`PRODUCT_GROUP_BY_FIELDS`:
  `category_id`, `currency_id`, `status`, `public`, `unlimited`). New
  `FacetBucket` / `ProductFacetsOptions` types.

### Note
- Custom fields are read the same way `commerce-web`'s marketplace reads them —
  the canonical shape `product.data.attributes` + `product.data.customer_inputs`
  — with the merchant form's `custom_fields` write payload kept as a fallback.
  `computeUnitPrice` mirrors the marketplace's own option-price logic.

## [1.1.1] - 2026-08-09

Correctness release. Several methods pointed at endpoints that do not exist in the
Commerce API; they were verified against the API router/controllers and the
`commerce-web` client, then fixed. Some public signatures changed as a result —
but only on methods that never worked against a real endpoint, so this ships as a
patch.

### Fixed
- **Wishlist remote sync** posted/read `/generis` (a typo). It now persists
  through the real `/generics` key-value store via `GenericsResource`
  (`getByKey` / `createOrUpdate`), which also fixes fragile `data`/`result`
  response handling.
- **`files.upload()`** posted to `/files/upload`, which does not exist. It now
  posts to `/files/pubload` (the real endpoint, as used by `commerce-web`). The
  redundant manual `Content-Type: multipart/form-data` header was removed (the
  client sets the multipart boundary itself).
- **`files.uploadFromUrl()`** posted to a non-existent `/files/upload-url`. There
  is no server-side upload-by-URL endpoint, so it now fetches the resource
  client-side and uploads the bytes through `/files/pubload`.
- **`auth.getProfile()`** aliased `/auth/valid`, which returns an empty body (a
  session check, not a profile). It now fetches `GET /users/:id`.

### Changed (breaking)
- **`auth.getProfile(customerId)`** now requires the customer id (from
  `login`/`register`) and hits `GET /users/:id`.
- **`auth.updateProfile(customerId, updates)`** now takes the id and hits
  `PUT /users/:id` (was the non-existent `/users/profile`).
- **`auth.changePassword(customerId, newPassword)`** now takes the id and hits
  `PUT /users/:id`; it no longer requires a `current_password` (the API does not
  verify one).
- **`auth.validateToken()`** now resolves `boolean` (`true` on 200, `false` on
  401) instead of an `ApiResponse<Customer>` — `/auth/valid` never returned a
  customer.

### Removed (breaking)
- The fabricated convenience methods on `sdk.generic` — `syncCart`,
  `syncWishlist`, `getServerCart`, `getServerWishlist`, `sendContactMessage`,
  `subscribeNewsletter`, `trackEvent`, `getShippingRates`, `applyCoupon` — all
  targeted endpoints that do not exist. `sdk.generic` remains as a raw
  request escape hatch (`get`/`post`/`put`/`delete`); use `sdk.generics` for the
  typed `/generics` store.

### Housekeeping
- Removed dead orphan type stubs under `src/types/` and two empty `src/lib/`
  files.
- Added a GitHub Actions CI workflow (lint + type-check + test + build on 18/20).
- Moved internal dev notes from the repo root into `docs/notes/`.
- Documented privilege levels (public / customer / merchant-admin) in the README.

## [1.1.0] - 2026-06-15

A major capability release that brings the storefront SDK to architectural parity
with `@inkress/admin-sdk`. Fully backward compatible.

### Added
- **`mode: 'live' | 'sandbox'`** config that resolves both the API endpoint and
  the hosted-checkout site origin (with `endpoint`/`siteUrl` overrides).
- **Typed query system** shared with `@inkress/admin-sdk`: `processQuery`, the
  `QueryBuilder` base, and `ProductQueryBuilder`/`CategoryQueryBuilder`/
  `OrderQueryBuilder`/`ReviewQueryBuilder`. Each list resource gains `query()`
  and `createQueryBuilder()`, with contextual `status`/`kind` translation.
- **Checkout money path** — a `checkout` resource: `createPaymentUrl()`,
  `createSession()`, `getSession()`, `cancelSession()`, and an SSR-safe
  `redirectToCheckout()`. Plus `cart.checkout()` which builds the order payload
  from local line items.
- **In-memory storage fallback** so the cart/wishlist work in Node/SSR (scoped
  per SDK instance — no cross-request bleed), and a robust fallback when a
  `localStorage` write throws (Safari private mode / quota).
- **`checkout:started`** event.
- Comprehensive README, examples, and an extensive jest test suite.

### Changed
- `HttpClient` now resolves endpoints from `mode` (was a hardcoded endpoint),
  handles `FormData` bodies, clears its request-timeout timer, and preserves a
  custom `endpoint` across same-mode `updateConfig` calls.
- `updateConfig({ merchantUsername })` re-points the storage namespace in place
  (and clears the wishlist user id) instead of recreating cart/wishlist.

### Backward compatibility / migration from 0.0.1
- The legacy **`Inkress`** class is still exported. Existing
  `new Inkress({ mode }).createPaymentUrl({ username, total, ... })` code keeps
  working unchanged.
- New code should prefer:
  ```diff
  - import Inkress from '@inkress/storefront-sdk';
  - const url = new Inkress({ mode: 'live' }).createPaymentUrl({ username: 'acme', total: 25 });
  + import { InkressStorefrontSDK } from '@inkress/storefront-sdk';
  + const sdk = InkressStorefrontSDK.forMerchant('acme');
  + const url = sdk.checkout.createPaymentUrl({ total: 25 });
  ```
  Note: the legacy `mode: 'test'` becomes `mode: 'sandbox'` on `InkressStorefrontSDK`.

## [1.0.0] - 2025-07-06

### Added
- Initial release of the Inkress Storefront SDK
- TypeScript support with comprehensive type definitions
- Browser-first design with Node.js compatibility
- Shopping cart functionality with persistent storage
- Wishlist management with local and remote sync
- Customer authentication and session management
- Complete product browsing and search capabilities
- Order placement and tracking
- File upload and media management
- Real-time event system for cart and wishlist updates

### Features
- **Merchants Resource**: Access merchant information and storefront data
- **Products Resource**: Product browsing, search, filtering, and categorization
- **Categories Resource**: Category navigation with hierarchical tree support
- **Authentication Resource**: Customer login, registration, and session management
- **Cart Resource**: Shopping cart with persistent storage and event-driven updates
- **Wishlist Resource**: Product wishlist with hybrid local/remote storage
- **Orders Resource**: Order creation, tracking, and history management
- **Reviews Resource**: Product reviews and ratings system
- **Shipping Resource**: Shipping methods and cost calculation
- **Files Resource**: File upload, image optimization, and media management
- **Generic Resource**: Custom data storage and retrieval
- **Generics Resource**: Batch operations for custom data management

### Browser Features
- **Persistent Storage**: Automatic cart and wishlist persistence using localStorage
- **Event System**: Real-time updates for cart additions, removals, and modifications
- **Image Optimization**: Automatic image resizing, format conversion, and optimization
- **File Upload**: Drag-and-drop file upload with progress tracking
- **Responsive Design**: Built-in responsive image URL generation

### Developer Experience
- **TypeScript First**: Comprehensive type definitions for all APIs
- **Event-Driven Architecture**: Subscribe to cart, wishlist, and other events
- **Storage Management**: Automatic data persistence with conflict resolution
- **Error Handling**: Structured error responses with helpful debugging information
- **Multiple Formats**: ESM, CJS, and browser bundles included
- **Tree Shaking**: Optimized for modern bundlers with selective imports

### Storage & Sync
- **Local Storage**: Automatic persistence of cart and wishlist data
- **Remote Sync**: Seamless synchronization with server when authenticated
- **Conflict Resolution**: Smart merging of local and remote data
- **Cross-Tab Sync**: Cart and wishlist updates across browser tabs

### Image & Media
- **File Upload**: Support for images, documents, and media files
- **Image Transformation**: Automatic resizing, cropping, and format optimization
- **CDN Integration**: Optimized delivery through content delivery networks
- **Responsive Images**: Generate multiple sizes for different screen resolutions

## [Unreleased]

### Planned
- WebSocket support for real-time updates
- Progressive Web App (PWA) utilities
- Enhanced caching strategies
- Payment integration helpers
- Analytics and tracking utilities
- A/B testing framework integration
- Advanced search with filters and facets
- Social sharing utilities
- SEO optimization helpers
