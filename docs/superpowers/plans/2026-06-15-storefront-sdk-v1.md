# @inkress/storefront-sdk v1.0.0 Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Each PR phase is a feature branch off `main`, reviewed by an adversarial agent (`feature-dev:code-reviewer`) before merge.

**Goal:** Build `@inkress/storefront-sdk` into a complete, SSR-safe storefront SDK that mirrors `@inkress/admin-sdk`'s architecture, supersets the unpublished `sdks/inkress-storefront-sdk`, and adds a checkout/money path.

**Architecture:** `HttpClient` + one-file-per-resource + ported typed query system + browser state (cart/wishlist/storage/events) + checkout. Default export `InkressStorefrontSDK`; back-compat named `Inkress` shim.

> **Build-base correction (2026-06-15):** On first push it surfaced that
> `origin/main` had been force-updated to the developed v1.0.1 lineage
> (byte-identical to `sdks/inkress-storefront-sdk`), not the published v0.0.1
> stub (now `old-main`). So this work builds **on top of `main` (v1.0.1)** as
> incremental upgrades — preserving its existing resources/storage/events — and
> ships as **v1.1.0**. PR1 therefore *upgrades* the existing client/tooling and
> adds payment utils + the `Inkress` back-compat shim rather than scaffolding
> from scratch. Remaining PRs (query system, resource hardening, browser-state
> hardening, checkout) are unchanged in intent.

**Tech Stack:** TypeScript, cross-fetch, tslib, rollup (ESM/CJS/browser + d.ts), jest + ts-jest + jsdom + jest-fetch-mock, eslint.

**Reference sources (read these when implementing):**
- Architecture/quality gold standard: `../admin-sdk/src/*`
- Query system to port: `../admin-sdk/src/utils/query-transformer.ts`, `../admin-sdk/src/utils/query-builders.ts`
- Checkout session types: `../admin-sdk/src/resources/checkout-sessions.ts`
- Feature superset source: `../sdks/inkress-storefront-sdk/src/*` (client, storage, events, all resources, types)
- Payment URL stub: current `storefront-sdk/src/index.ts` (`createPaymentUrl`, `encodeJSONToB64`)

---

## File Structure (target)

```
src/
  index.ts            SDK facade + re-exports + default export + Inkress shim
  client.ts           HttpClient, StorefrontConfig, InkressApiError, ApiResponse, RequestOptions
  types.ts            core shared types
  types/resources.ts  per-resource query-params/list-response/field-type maps
  types/{product,category,order,cart,customer,line-item,review,shipping,file,merchant,generic,wishlist,checkout}.ts
  resources/{merchants,products,categories,orders,reviews,shipping,files,generics,generic,auth,checkout,cart,wishlist}.ts
  browser/{storage,events}.ts
  utils/{query-transformer,query-builders,payment}.ts
  __tests__/*.test.ts
docs/superpowers/{specs,plans}/...
README.md CHANGELOG.md CONTRIBUTING.md LICENSE
package.json tsconfig.json rollup.config.js jest.config.cjs jest.setup.js .eslintrc.json .npmignore
examples/*
```

---

## PR1 — Scaffold + client + core types + back-compat shim

**Branch:** `feat/scaffold-and-client`

**Files:**
- Modify: `package.json` (v1.0.0, scripts, deps, exports — model on `../sdks/inkress-storefront-sdk/package.json` + `../admin-sdk/package.json`)
- Create: `tsconfig.json`, `rollup.config.js`, `jest.config.cjs`, `jest.setup.js`, `.eslintrc.json`, `.npmignore`
- Create: `src/client.ts`, `src/types.ts`, `src/index.ts` (skeleton + shim)
- Create: `src/utils/payment.ts` (needed by shim)
- Test: `src/__tests__/client.test.ts`, `src/__tests__/payment.test.ts`
- Remove stray root `cart.ts` (misplaced draft; `git status` shows untracked).

- [ ] **Step 1:** Replace `package.json` with v1.0.0 config: name `@inkress/storefront-sdk`, `main`/`module`/`browser`/`types`, `exports` map (browser/import/require/types), scripts (`build`,`build:browser`,`dev`,`test`,`test:watch`,`lint`,`lint:fix`,`type-check`,`clean`,`prepare`,`prepublishOnly`), deps `cross-fetch`+`tslib`, devDeps mirroring old storefront pkg (rollup plugins, jest, jsdom, fetch-mock, ts-jest, eslint, typescript). Copy `files`, `keywords`, `author`, `repository` from old storefront pkg.
- [ ] **Step 2:** Add `tsconfig.json`, `rollup.config.js` (ESM+CJS+browser terser + d.ts), `jest.config.cjs` (ts-jest, jsdom testEnvironment), `jest.setup.js` (enable fetch mock), `.eslintrc.json`, `.npmignore` — port from `../sdks/inkress-storefront-sdk` adjusting output names to match `exports`.
- [ ] **Step 3:** Write `src/client.ts` — port `../sdks/inkress-storefront-sdk/src/client.ts` and upgrade: add `mode: 'live'|'sandbox'` with endpoint resolution (`api.inkress.com`/`api-dev.inkress.com`) like `../admin-sdk/src/client.ts`; keep `merchantUsername`→`Client-Id: m-<u>`, `authToken`→Bearer, retry/timeout, `ApiResponse`, `InkressApiError`, `get/post/put/delete/patch`, `updateConfig/getConfig`.
- [ ] **Step 4:** Write `src/utils/payment.ts` — isomorphic `encodeJSONToB64` (browser btoa + node Buffer fallback, from stub), `generateRandomId`, `buildPaymentUrl(opts, baseSiteUrl)` returning `/merchants/{username}/order?link_token=&order_token=`.
- [ ] **Step 5:** Write `src/types.ts` — `StorefrontConfig` re-export, `ApiResponse`, `PageInfo`, money/currency types, `Customer`, `PaymentURLOptions`.
- [ ] **Step 6:** Write `src/index.ts` skeleton — `InkressStorefrontSDK` class wiring `HttpClient` only (resources added in later PRs), `updateConfig/getConfig/setAuthToken/clearAuthToken/setMerchant`, static `forMerchant/withAuth/forMerchantWithAuth`; export default; export named `Inkress` back-compat class (uses `utils/payment.ts`) with `setToken/setClient/createPaymentUrl/generateRandomId`; `export { InkressApiError }` and `export * from './types'`.
- [ ] **Step 7:** Tests — `payment.test.ts`: `createPaymentUrl` produces decodable order_token (base64 round-trips to order data), validates required fields, defaults currency JMD. `client.test.ts`: headers include `Client-Id` for username, `Authorization` for authToken, endpoint resolves by mode.
- [ ] **Step 8:** `npm install`, `npm run type-check`, `npm test`, `npm run build` — all green. Commit. Open PR1. Adversarial review. Merge.

---

## PR2 — Query system

**Branch:** `feat/query-system`

**Files:**
- Create: `src/utils/query-transformer.ts` (port verbatim from `../admin-sdk/src/utils/query-transformer.ts`)
- Create: `src/utils/query-builders.ts` (port from admin-sdk, keep only storefront-relevant builders: Product, Category, Order, Review; drop admin-only ones)
- Create: `src/types/resources.ts` (port the query-param/list-response/field-type-map pattern for products, categories, orders, reviews)
- Test: `src/__tests__/query-transformer.test.ts` (port relevant cases from `../admin-sdk/src/__tests__/query-transformer.test.ts`)

- [ ] **Step 1:** Copy `query-transformer.ts` from admin-sdk unchanged; verify it has no admin-specific imports.
- [ ] **Step 2:** Port `query-builders.ts`; remove builders for resources the storefront doesn't expose; keep `Queryable`, `processQuery` wiring. Keep `ProductQueryBuilder`, `CategoryQueryBuilder`, `OrderQueryBuilder`, `ReviewQueryBuilder`.
- [ ] **Step 3:** Create `types/resources.ts` with `*QueryParams`, `*ListResponse`, `*_FIELD_TYPES` for the 4 resources, modeled on admin-sdk.
- [ ] **Step 4:** Port query-transformer tests; `npm test` green.
- [ ] **Step 5:** `type-check` + `build` green. Commit. PR2. Adversarial review. Merge.

---

## PR3 — API resources + types

**Branch:** `feat/api-resources`

**Files:**
- Create: `src/types/{product,category,order,merchant,review,shipping,file,generic,customer,line-item}.ts` — full models (replace the old SDK's thin 5–8 line stubs with complete typed models, sourced from old SDK usage + admin-sdk types).
- Create: `src/resources/{merchants,products,categories,orders,reviews,shipping,files,generics,generic,auth}.ts` — port from `../sdks/inkress-storefront-sdk/src/resources/*`, re-typed, list methods use the query builders from PR2.
- Modify: `src/index.ts` — wire these resources into the facade.
- Test: `src/__tests__/{products,categories,reviews,shipping,auth}.test.ts` — mock fetch, assert correct path/method/headers/params and response unwrapping.

- [ ] **Step 1:** Write full type models. Each model file exports its interface(s); `types/resources.ts` and resources import from them.
- [ ] **Step 2:** Port each resource preserving its public method names (`getByUsername`, `search`, `getCategoryTree`, `getByProduct`, `listMethods`, `getCheapestMethod`, `upload`, `getOptimizedUrl`, `login/register/me/refresh`, etc.). Replace `any` with real types. Use `processQuery`/builders for list endpoints.
- [ ] **Step 3:** Wire resources into `InkressStorefrontSDK` constructor + readonly fields.
- [ ] **Step 4:** Per-resource tests with `jest-fetch-mock`: assert request path/method and that `result` is unwrapped. At minimum products.search, categories.getCategoryTree, reviews.getByProduct, shipping.getCheapestMethod, auth.login.
- [ ] **Step 5:** `type-check` + `test` + `build` green. Commit. PR3. Adversarial review. Merge.

---

## PR4 — Browser state (storage, events, cart, wishlist)

**Branch:** `feat/browser-state`

**Files:**
- Create: `src/browser/storage.ts` — port `StorageManager`/`BrowserStorage` from `../sdks/inkress-storefront-sdk/src/storage.ts`; ensure in-memory fallback when `window`/`localStorage` undefined (SSR-safe).
- Create: `src/browser/events.ts` — port `EventEmitter` from old SDK; add typed event map (`cart:item:added|removed|updated|cleared`, `wishlist:updated`, `checkout:started`).
- Create: `src/types/{cart,wishlist}.ts` — Cart, CartItem, Wishlist models.
- Create: `src/resources/cart.ts` — port from old SDK `resources/cart.ts` (takes storage+events+client): add/remove/update items, totals, clear, persistence, events. `checkout()` method stubbed to call `checkout` resource (wired in PR5).
- Create: `src/resources/wishlist.ts` — port from old SDK: local + optional remote sync via `generic`.
- Modify: `src/index.ts` — wire storage/events/cart/wishlist; expose `on/off/once/emit/removeAllListeners`, `setUserId`, `clearLocalData`, `getLocalStorageKeys`.
- Test: `src/__tests__/{cart,storage}.test.ts` (jsdom): cart add/remove/qty/total math + emitted events; storage memory fallback when localStorage absent.

- [ ] **Step 1:** Port storage with SSR-safe fallback; test that `getItem/setItem` work without `window`.
- [ ] **Step 2:** Port events with typed map; test on/emit/off.
- [ ] **Step 3:** Cart + wishlist models and resources.
- [ ] **Step 4:** Cart tests (jsdom): adding item emits `cart:item:added` and updates total; removing updates; clear empties + emits `cart:cleared`.
- [ ] **Step 5:** Wire into facade. `type-check` + `test` + `build` green. Commit. PR4. Adversarial review. Merge.

---

## PR5 — Checkout money path + docs/examples

**Branch:** `feat/checkout-and-docs`

**Files:**
- Create: `src/types/checkout.ts` — `PaymentURLOptions`, `CheckoutSession*` (port from `../admin-sdk/src/resources/checkout-sessions.ts`), `CreateCheckoutSessionInput`.
- Create: `src/resources/checkout.ts` — `createPaymentUrl(opts)` (uses `utils/payment.ts` + client config for base site URL + mode), `createSession(input)`, `getSession(id)`, `redirectToCheckout(urlOrSession)` (SSR-guarded).
- Modify: `src/resources/cart.ts` — implement `checkout()` to build order payload from line items and delegate to `checkout` resource.
- Modify: `src/index.ts` — wire `checkout` resource.
- Create/Modify: `README.md` (admin-sdk scale), `CHANGELOG.md` (v0.0.1→v1.0.0 migration), `CONTRIBUTING.md`, `examples/{products,cart,checkout,reviews,shipping,wishlist,files,ssr}.{ts,js}`.
- Test: `src/__tests__/checkout.test.ts` — `createPaymentUrl` URL shape; `createSession` posts correct payload; `redirectToCheckout` no-ops under SSR (no `window`).

- [ ] **Step 1:** checkout types + resource.
- [ ] **Step 2:** `cart.checkout()` builds payload (currency, items→products, customer, total) and calls `checkout.createSession` / returns payment URL.
- [ ] **Step 3:** Wire `checkout` into facade.
- [ ] **Step 4:** Tests: payment URL round-trip via resource, session POST payload, SSR redirect no-op.
- [ ] **Step 5:** Write README (quickstart, auth, per-resource, checkout, cart/wishlist, SSR, "with admin-sdk"), CHANGELOG migration, examples.
- [ ] **Step 6:** Final full verify: `npm run clean && npm run build` (ESM+CJS+browser+d.ts present), `type-check`, `test`, `lint` all green. Commit. PR5. Adversarial review. Merge.

---

## Self-Review (coverage vs spec)

- §3 auth/security → PR1 client (mode/Client-Id/Bearer) ✓
- §5.1 HttpClient → PR1 ✓
- §5.2 query system → PR2 ✓
- §5.3 API resources → PR3 ✓
- §5.4 checkout → PR5 ✓
- §5.5 browser state → PR4 ✓
- §5.6 facade → built incrementally PR1/3/4/5 ✓
- §6 SSR → PR4 storage fallback + PR5 redirect guard ✓
- §7 build/test → PR1 tooling, verified each PR ✓
- §8 versioning/shim → PR1 ✓
- §9 docs → PR5 ✓

No placeholders; method names consistent across tasks (`createPaymentUrl`, `createSession`, `getSession`, `redirectToCheckout`, `checkout()`, `getByUsername`, `getCategoryTree`, `getByProduct`, `getCheapestMethod`).
