# @inkress/storefront-sdk

Everything you need to build a storefront on **Inkress Commerce** — in the browser or Node.js. Typed API resources for products, categories, reviews, shipping, orders and files; an offline-first cart and wishlist; a fluent, type-safe query system; and a secure checkout/money path.

Pairs with [`@inkress/admin-sdk`](https://github.com/inkress/admin-sdk): same config conventions, same `ApiResponse` envelope, same `InkressApiError`, and the same query builders — a developer using both feels one product.

## Features

- 🌐 **Universal & SSR-safe** — browser and Node.js (Remix / React Router loaders). Cart/storage degrade to an in-memory fallback on the server; the redirect helper no-ops safely.
- 🔎 **Typed query system** — `.where()/.whereRange()/.whereContains()` builders plus `query()` with contextual status/kind translation, identical to `admin-sdk`.
- 🛒 **Offline-first cart & wishlist** — local storage with events and optional remote sync.
- 💳 **Checkout money path** — hosted-order URLs and checkout sessions (PowerTranz SPI frame). No card data ever touches the SDK.
- 🔔 **Event-driven** — react to cart/wishlist/checkout changes.
- 💪 **Fully typed** — ESM, CommonJS, and a minified browser UMD bundle, with `.d.ts`.

## Installation

```bash
npm install @inkress/storefront-sdk
```

## Quick start

```typescript
import { InkressStorefrontSDK } from '@inkress/storefront-sdk';

const sdk = InkressStorefrontSDK.forMerchant('your-merchant-username');
// equivalent: new InkressStorefrontSDK({ merchantUsername: 'your-merchant-username' })

// Browse products with the typed query builder
const { result } = await sdk.products
  .createQueryBuilder()
  .whereStatus('published')
  .wherePriceRange(10, 100)
  .orderBy('created_at', 'desc')
  .paginate(1, 20)
  .execute();

// Build a cart
sdk.cart.addItem(result!.entries[0], 2);
sdk.on('cart:item:added', ({ cart }) => console.log('subtotal:', cart.subtotal));

// Check out
const session = await sdk.cart.checkout({ customer: { email: 'shopper@example.com' } });
sdk.checkout.redirectToCheckout(session.result!.frame_url);
```

## Configuration

```typescript
interface StorefrontConfig {
  mode?: 'live' | 'sandbox';   // resolves endpoints (default: 'live')
  endpoint?: string;           // advanced: override the API origin
  siteUrl?: string;            // advanced: override the hosted-checkout origin
  apiVersion?: string;         // default: 'v1'
  merchantUsername?: string;   // sent as `Client-Id: m-<username>`
  authToken?: string;          // customer Bearer token for authenticated calls
  timeout?: number;            // ms, default 30000
  retries?: number;            // retry 5xx/timeouts, default 0
  headers?: Record<string, string>;
}
```

`mode` resolves both the API and the hosted-checkout site origin:

| mode | API endpoint | site (hosted checkout) |
|------|--------------|------------------------|
| `live` (default) | `https://api.inkress.com` | `https://inkress.com` |
| `sandbox` | `https://api-dev.inkress.com` | `https://dev.inkress.com` |

### Auth & security model

- **Public by default.** A `merchantUsername` lets you browse products, categories and merchant info with no secret.
- **Optional customer `authToken`** (Bearer) unlocks customer-scoped actions: their orders, profile, posting reviews, wishlist sync.
- **No secrets, no card data.** This is the public storefront surface. Checkout initiates via a public order token or a hosted payment frame; settlement and the strict 3DS gate live server-side. Keep the auth token in memory (the default) — avoid persisting bearer tokens to `localStorage`.

#### Privilege levels

This SDK covers both storefront (shopper) and store-management operations. The
write methods below hit the same API but require a **merchant/admin-privileged**
token — a shopper's `authToken` will be rejected by the server. They are included
so you can build a merchant's own storefront/admin, not for untrusted clients:

| Requires | Methods |
| --- | --- |
| Public (Client-Id only) | `merchants.*`, `products.*`, `categories` reads, `reviews` reads, `shipping` reads, `checkout.*`, `files.upload`, local `cart.*` |
| Customer (Bearer) | `auth.getProfile/updateProfile/changePassword`, `orders.list/create`, `reviews.create`, `wishlist` remote sync |
| Merchant/admin (privileged Bearer) | `categories.create/update/delete`, `shipping.create*/update*/delete*`, `files.update/delete`, `generics.create/update/delete` |

```typescript
const sdk = InkressStorefrontSDK.forMerchantWithAuth('acme', customerJwt);
// or with auth only (no merchant): InkressStorefrontSDK.withAuth(customerJwt)
// or, later:
sdk.setAuthToken(customerJwt);
sdk.clearAuthToken();
```

## The query system

Every list-bearing resource (`products`, `categories`, `orders`, `reviews`) exposes two equivalent paths:

```typescript
// 1) Fluent builder
await sdk.products.createQueryBuilder()
  .whereStatus('published')        // contextual string -> API code
  .wherePriceRange(20, 200)        // -> price_min / price_max
  .whereTitleContains('shirt')     // -> contains.title
  .whereCategory([3, 4])           // -> category_id_in
  .paginate(1, 24)
  .orderBy('created_at', 'desc')
  .execute();

// 2) Plain object query (same transform + translation)
await sdk.products.query({ status: 'published', price: { min: 20 }, page: 1 });
```

Filters map to the Inkress filter grammar: ranges → `field_min`/`field_max`, arrays → `field_in`, substrings → `contains.field`, dates → `after.field`/`before.field`. Contextual `status`/`kind` strings are translated to their numeric codes (e.g. product `status: 'published'` → `2`); order `status` is a string and passes through.

## Resources

### Products
```typescript
await sdk.products.get(123);
await sdk.products.search({ q: 'sneakers' });
await sdk.products.getByCategory(42);
await sdk.products.query({ price: { min: 50, max: 150 }, public: true });
```

### Product variants & options
Products carry `custom_fields` (authored in the merchant product form): static
attributes and customer-fillable inputs, where `type: 'options'` fields offer
`{ label, price }` choices with per-option add-on pricing.
```typescript
const { result: product } = await sdk.products.get(123);
sdk.products.getAttributes(product);       // static specs (Material: Cotton)
sdk.products.getCustomerInputs(product);   // options / fillable inputs

// Live unit price for the shopper's selections:
const price = sdk.products.computeUnitPrice(product, [
  { name: 'Size', option: 'Large' },       // +option price
  { name: 'Gift note', filled: true },     // +input add-on price
]);
```

### Stock
```typescript
sdk.products.isInStock(product);           // unlimited || units_remaining > 0
sdk.products.getAvailableStock(product);   // number, or null when unlimited
await sdk.products.checkStock(123);        // fresh { inStock, unlimited, unitsRemaining }
```

### Faceted search
Server-side faceting via the API's `group_by` — counts and price/stock ranges
per group, in one request. Group fields: `category_id`, `currency_id`, `status`,
`public`, `unlimited`.
```typescript
const { result: facets } = await sdk.products.facets(
  { status: 'published' },
  { groupBy: 'category_id' },
);
// facets: [{ field: 'category_id', value: 3, count: 12, priceMin: 10, priceMax: 99, ... }]
```

### Categories
```typescript
await sdk.categories.list();
await sdk.categories.getCategoryTree();        // nested tree
await sdk.categories.createQueryBuilder().whereParent(7).execute();
```

### Reviews
```typescript
await sdk.reviews.getByProduct(123);
await sdk.reviews.create({ parent_id: 123, rating: 5, body: 'Great!' }); // requires auth
await sdk.reviews.createQueryBuilder().whereProduct(123).whereMinRating(4).execute();
```

### Shipping
```typescript
await sdk.shipping.listMethods();
await sdk.shipping.getCheapestMethod();
```

### Orders (requires auth)
```typescript
await sdk.orders.query({ status: 'completed' });
await sdk.orders.getByReference('ORD-123');
```

### Files
```typescript
const uploaded = await sdk.files.upload(file, { folder: 'products' });
const thumb = sdk.files.getOptimizedUrl(uploaded.result.file, 800, 600);
```

### Auth (customer)
```typescript
const { result } = await sdk.auth.login({ email, password });
sdk.setAuthToken(result!.token);

const customerId = result!.customer.id;
await sdk.auth.getProfile(customerId);                         // GET /users/:id
await sdk.auth.updateProfile(customerId, { first_name: 'Jane' }); // PUT /users/:id
await sdk.auth.changePassword(customerId, 'new-password');     // PUT /users/:id

// Session check — resolves true/false (does NOT return the profile):
const stillValid = await sdk.auth.validateToken();
```

Profile read/update and password change target `/users/:id` (the id comes from
`login`/`register`) and are subject to the server's authorization rules.

### Saved addresses
A customer's saved addresses (`/addresses`). Addresses are owned via
`kind`/`kind_id`; `kind_id` is the customer id.
```typescript
await sdk.addresses.listForCustomer(customerId);
await sdk.addresses.create({
  kind: 1, kind_id: customerId,
  street: '1 Main St', city: 'Kingston', state: 'KSA', country: 'JM',
});
await sdk.addresses.update(addressId, { city: 'Montego Bay' });
await sdk.addresses.delete(addressId);
```

## Cart

A local, offline-first cart persisted to storage and surfaced through events.

```typescript
sdk.cart.addItem(product, 2);
sdk.cart.updateItemQuantity(itemId, 3);
sdk.cart.removeProduct(productId);
sdk.cart.getSubtotal();
sdk.cart.clear();

sdk.on('cart:item:added',   ({ cart }) => {});
sdk.on('cart:item:updated', ({ cart }) => {});
sdk.on('cart:item:removed', ({ cart }) => {});
sdk.on('cart:cleared',      ({ cart }) => {});
```

## Wishlist

```typescript
sdk.setUserId(customerId);          // enable remote sync
await sdk.wishlist.addItem(product);
await sdk.wishlist.toggleProduct(product);
await sdk.wishlist.get();
```

## Checkout (the money path)

Two ways to take payment; neither sees card data.

**Hosted-order URL** — the simplest path:
```typescript
const url = sdk.checkout.createPaymentUrl({ total: 49.99, title: 'Order #1' });
sdk.checkout.redirectToCheckout(url);   // SSR-safe: no-ops on the server
```

**Checkout session** — returns a hosted payment frame (PowerTranz SPI):
```typescript
const session = await sdk.checkout.createSession({
  currency_code: 'JMD',
  total: 100,
  customer: { email: 'shopper@example.com' },
});
sdk.checkout.redirectToCheckout(session.result!.frame_url);

// Later, check status:
const state = await sdk.checkout.getSession(session.result!.session_id);
```

**From the cart** — builds the order payload from line items:
```typescript
const session = await sdk.cart.checkout({ customer: { email } });
sdk.checkout.redirectToCheckout(session.result!.frame_url);
```

> The strict 3DS / money gate runs **server-side**. The SDK only initiates payment; it never settles and never handles a PAN.

## Server-side rendering

The SDK is safe to construct and use in server loaders (Remix / RR7). Browser-only features degrade gracefully:

- `cart`/`wishlist` storage falls back to a per-SDK-instance in-memory store (no cross-request bleed — construct one SDK per request).
- `checkout.redirectToCheckout()` no-ops and returns `false` when there's no `window`.

## Using with `@inkress/admin-sdk`

The two SDKs share configuration, the `ApiResponse<T>` envelope, `InkressApiError`, and the query builder API. Use the admin SDK on the server (with your secret/JWT) for management, and the storefront SDK on the client (public) for shopping:

```typescript
import { InkressSDK } from '@inkress/admin-sdk';
import { InkressStorefrontSDK } from '@inkress/storefront-sdk';

const admin = new InkressSDK({ accessToken, username: 'acme' });        // server
const shop  = InkressStorefrontSDK.forMerchant('acme');                 // client
```

## Legacy `Inkress` (v0.0.1 compatibility)

The original `Inkress` class is still exported so existing `createPaymentUrl` code keeps working:

```typescript
import { Inkress } from '@inkress/storefront-sdk';
const inkress = new Inkress({ mode: 'live' });
const url = inkress.createPaymentUrl({ username: 'acme', total: 25 });
```

Prefer `InkressStorefrontSDK` + `sdk.checkout` for new code. See [`CHANGELOG.md`](./CHANGELOG.md) for the migration.

## Build outputs

| field | file | format |
|-------|------|--------|
| `module` | `dist/index.esm.js` | ESM |
| `main` | `dist/index.cjs` | CommonJS |
| `browser` | `dist/index.browser.js` | minified UMD (`InkressStorefront`) |
| `types` | `dist/index.d.ts` | TypeScript declarations |

```html
<script src="https://unpkg.com/@inkress/storefront-sdk/dist/index.browser.js"></script>
<script>
  const sdk = InkressStorefront.InkressStorefrontSDK.forMerchant('acme');
</script>
```

## License

MIT
