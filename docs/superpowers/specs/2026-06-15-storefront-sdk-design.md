# @inkress/storefront-sdk v1.0.0 — Design Spec

**Date:** 2026-06-15
**Status:** Approved
**Repo:** `inkress/storefront-sdk` (public, npm `@inkress/storefront-sdk`)

## 1. Goal

Build out `@inkress/storefront-sdk` into a complete, storefront-grade SDK that:

- **Mirrors the architecture quality of `@inkress/admin-sdk`** — `HttpClient`, one-file-per-resource, a typed query system (`QueryBuilder` + `query-transformer`), multi-target rollup build, jest tests, comprehensive README.
- **Is a strict superset of the unpublished `sdks/inkress-storefront-sdk` (v1.0.1)** — preserves its cart, wishlist, reviews, shipping, files, generics, events, and storage surfaces, re-typed and hardened.
- **Adds a real checkout / money path** — `createPaymentUrl` (ported from the published v0.0.1 stub) plus checkout sessions and a hosted-checkout redirect helper.
- **Pairs with `admin-sdk`** — identical config conventions, response envelope (`ApiResponse`), error type (`InkressApiError`), and query API so a developer using both feels one product.

Ships as **v1.0.0**, superseding the published v0.0.1 stub. A back-compat `Inkress` shim keeps existing `createPaymentUrl` users working.

## 2. Non-goals

- No merchant **secret** keys, no PAN/card data, no settlement logic in the SDK. This is the public storefront surface; the strict 3DS / money gate stays server-side.
- No admin/management operations (those belong to `admin-sdk`).
- No framework-specific bindings (React hooks, etc.) in v1.0.0 — the SDK is framework-agnostic and SSR-safe so any framework can wrap it.

## 3. Auth & security model

- **Public by default:** `merchantUsername` → `Client-Id: m-<username>` header. Browsing products/categories/merchant needs no secret.
- **Optional customer `authToken`** (Bearer) for customer-scoped actions: their orders, profile, wishlist sync, posting reviews.
- **`mode: 'live' | 'sandbox'`** resolves endpoints exactly like admin-sdk: `https://api.inkress.com` / `https://api-dev.inkress.com`. `endpoint` override retained.
- **AuthToken held in memory by default.** Persistence is opt-in only (never auto-write a bearer token to localStorage). README documents the XSS consideration.
- Checkout initiates via a public **order-token** + **hosted checkout frame** (PowerTranz SPI). The SDK never sees card data and never settles.

## 4. Module layout (mirrors admin-sdk)

```
src/
  index.ts            InkressStorefrontSDK class · re-exports · default export · back-compat `Inkress` shim
  client.ts           HttpClient · StorefrontConfig · InkressApiError · ApiResponse · RequestOptions
  types.ts            core shared types (config, envelope, pagination, money)
  types/
    resources.ts      per-resource query-params · list-response · field-type maps (admin-sdk pattern)
    product.ts category.ts order.ts cart.ts customer.ts line-item.ts
    review.ts shipping.ts file.ts merchant.ts generic.ts wishlist.ts checkout.ts
  resources/
    merchants.ts products.ts categories.ts orders.ts reviews.ts
    shipping.ts files.ts generics.ts generic.ts auth.ts
    checkout.ts       NEW — money path
    cart.ts           stateful (storage + events + client)
    wishlist.ts       stateful (storage + events + generic, optional remote sync)
  browser/
    storage.ts        StorageManager — namespaced localStorage with in-memory/SSR fallback
    events.ts         EventEmitter — typed storefront events
  utils/
    query-transformer.ts   ported from admin-sdk
    query-builders.ts      ported; builders for list-bearing storefront resources
    payment.ts             isomorphic base64 · createPaymentUrl · id generation
  __tests__/          jest specs
```

## 5. Core components

### 5.1 HttpClient (`client.ts`)
Based on the existing storefront client, upgraded to admin-sdk parity:
- `mode`-based endpoint resolution (not just hardcoded endpoint).
- `Client-Id: m-<username>` for public; `Authorization: Bearer` when `authToken` present.
- Timeout via `Promise.race`, retry on 5xx/timeout with backoff.
- `get/post/put/delete/patch` helpers; `get` serializes query params.
- `ApiResponse<T>` envelope `{ state, result?, data? }`; `InkressApiError` with `status`/`details`.
- `updateConfig` / `getConfig` (strips `authToken`).

### 5.2 Query system (`utils/`)
Port `query-transformer.ts` (the `processQuery` + `QueryBuilder` core, range/string/date/json query types) and `query-builders.ts` (per-resource builders) from admin-sdk. Define builders only for list-bearing storefront resources: **products, categories, orders, reviews**. Plain object params still accepted (back-compat).

### 5.3 API resources
Each resource takes `HttpClient`, exposes typed methods preserving the old SDK's public surface, re-typed against the new full models. Coverage:
- **merchants** — `getByUsername`, public profile.
- **products** — `list/search` (query builder), `get`, variants.
- **categories** — `list`, `get`, `getCategoryTree`.
- **orders** — customer order list/get (auth), create.
- **reviews** — `getByProduct`, `create`, list.
- **shipping** — `listMethods`, `getCheapestMethod`, rate calc.
- **files** — `upload`, `getOptimizedUrl`.
- **generics / generic** — key-value custom data store.
- **auth** — customer `login/register/me/refresh/logout`.

### 5.4 Checkout (`resources/checkout.ts` + `utils/payment.ts`) — money path
- `createPaymentUrl(opts)` — isomorphic base64 encode of order data → hosted `/merchants/{username}/order?link_token=&order_token=` URL. Validation + currency default ported and hardened from the stub.
- `createSession(input)` / `getSession(id)` — checkout sessions reusing admin-sdk `CheckoutSession*` types; returns `frame_url` / `redirect_data` for the hosted/SPI frame.
- `redirectToCheckout(urlOrSession)` — SSR-guarded `window.location.assign`.
- `cart.checkout()` builds the order payload from line items and delegates to `checkout`.

### 5.5 Browser state (`browser/` + `resources/cart.ts`, `wishlist.ts`)
- `StorageManager`: per-merchant namespaced localStorage, in-memory fallback when `window`/`localStorage` is absent (SSR-safe).
- `EventEmitter`: typed events — `cart:item:added|removed|updated|cleared`, `wishlist:updated`, `checkout:started`.
- `cart`: line items, quantities, totals, persistence, events, `checkout()`.
- `wishlist`: local + optional remote sync via generics when a `userId`/auth is set.

### 5.6 SDK facade (`index.ts`)
`InkressStorefrontSDK` wires client + storage + events + resources (as the old SDK does), exposes `on/off/once/emit`, `setAuthToken/clearAuthToken/setMerchant/setUserId`, `updateConfig/getConfig`, `clearLocalData`, and static `forMerchant` / `withAuth` / `forMerchantWithAuth` constructors. Default export = `InkressStorefrontSDK`. Named export `Inkress` = back-compat shim with `createPaymentUrl`/`setToken`/`setClient`/`generateRandomId`.

## 6. Isomorphic / SSR

Works in browser and Node (`cross-fetch`). Browser-only features degrade gracefully: storage uses in-memory fallback, `redirectToCheckout` no-ops with a warning under SSR. This matters because the primary consumer stack is Remix / React Router v7 (server loaders).

## 7. Build · test · tooling (match admin-sdk + old storefront pkg)

- **rollup** → ESM (`dist/index.esm.js`) + CJS (`dist/index.cjs`/`index.js`) + **browser bundle (terser)** + `.d.ts`. `package.json` `exports` with `browser`/`import`/`require`/`types`.
- **jest** + ts-jest + `jest-environment-jsdom` + `jest-fetch-mock` for cart/storage/client tests.
- **eslint**, **tsconfig**, `type-check`. Scripts mirror admin-sdk (`build`, `dev`, `test`, `lint`, `type-check`, `clean`, `prepare`, `prepublishOnly`).
- Dependencies: `cross-fetch`, `tslib`. Dev deps mirror admin-sdk/old-storefront.

### Test focus
Query transformer correctness; payment URL encode (browser + node base64); cart math + emitted events; storage memory fallback; client headers/auth selection; checkout payload building.

## 8. Versioning & back-compat

- Bump to **v1.0.0**.
- Keep a named `Inkress` export (the stub's class) so `import Inkress from '@inkress/storefront-sdk'` style usage and `createPaymentUrl` keep working. The new default export is `InkressStorefrontSDK`; `Inkress` remains available as a named export and is documented as legacy.
- `CHANGELOG.md` documents the migration (v0.0.1 → v1.0.0): what's new, what's preserved, how to migrate the payment-URL usage.

## 9. Docs

- README at admin-sdk scale: quickstart, auth model, per-resource reference, checkout flow, cart/wishlist, SSR notes, "using with @inkress/admin-sdk" section.
- `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE` (exists).
- `examples/` directory: cart, checkout, products, reviews, shipping, wishlist, files, SSR usage.

## 10. Delivery plan (PR-per-phase, adversarial review each)

Work happens on feature branches off `main`; each phase is a PR reviewed by an adversarial agent (`feature-dev:code-reviewer`) before merge.

- **PR1 — Scaffold + client + core types + back-compat shim.** package.json/tsconfig/rollup/jest/eslint, `client.ts`, `types.ts`, `index.ts` skeleton with `Inkress` shim, spec + plan docs. Compiles + a smoke test.
- **PR2 — Query system.** Port `query-transformer.ts` + `query-builders.ts` + tests.
- **PR3 — API resources + types.** merchants, products, categories, orders, reviews, shipping, files, generics, generic, auth + per-resource types + tests.
- **PR4 — Browser state.** storage, events, cart, wishlist + tests.
- **PR5 — Checkout money path + docs.** payment util, checkout resource, `cart.checkout()`, README, examples, CHANGELOG, final build verification.

Each PR must build (`npm run build`), pass `type-check`, and pass tests before merge.

## 11. Success criteria

- `npm run build` produces ESM + CJS + browser + `.d.ts` cleanly.
- `npm test` and `npm run type-check` pass.
- Public API covers everything the old `sdks/inkress-storefront-sdk` did, plus checkout.
- A developer can: init for a merchant, browse products/categories with typed queries, manage a local cart, run a customer auth flow, post a review, compute shipping, and initiate checkout — entirely from the SDK.
- Config/envelope/error/query conventions match `admin-sdk`.
