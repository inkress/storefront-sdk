# Inkress Storefront SDK

A comprehensive JavaScript/TypeScript SDK for building storefronts with Inkress Commerce. This SDK provides easy-to-use APIs for managing customers, products, orders, cart, wishlist, and more.

## Features

- 🌐 **Universal compatibility**: Works in browsers and Node.js
- 🛒 **Complete storefront functionality**: Products, categories, cart, wishlist, orders, authentication
- 📱 **Offline-first cart & wishlist**: Local storage with remote sync capabilities
- 🔔 **Event-driven architecture**: React to cart/wishlist changes in real-time
- 💪 **TypeScript support**: Full type definitions included
- 🔒 **Authentication**: Customer login, registration, and session management
- 📦 **Multiple builds**: ESM, CommonJS, and browser UMD
- 🔄 **Remote cart sync**: Backup and sync cart to server for authenticated users
- 🗂️ **Category management**: Hierarchical categories with tree building and search

## Installation

```bash
npm install @inkress/storefront-sdk
# or
yarn add @inkress/storefront-sdk
```

## Quick Start

```typescript
import { InkressStorefrontSDK } from '@inkress/storefront-sdk';

// Initialize the SDK
const sdk = new InkressStorefrontSDK({
  endpoint: 'https://api.inkress.com', // Your API endpoint
  merchantUsername: 'your-merchant-username'
});

// Load products
const response = await sdk.products.search({ limit: 10 });
const products = response.data?.entries || [];

// Add to cart
const product = products[0];
sdk.cart.addItem(product, 2);

// Listen to cart changes
sdk.on('cart:item:added', ({ item, cart }) => {
  console.log('Added to cart:', item);
});
```

## Browser Usage

```html
<script src="https://unpkg.com/@inkress/storefront-sdk/dist/index.browser.js"></script>
<script>
  const sdk = new InkressStorefrontSDK({
    endpoint: 'https://api.inkress.com',
    merchantUsername: 'your-merchant-username'
  });
</script>
```

## API Reference

### Configuration

```typescript
interface StorefrontConfig {
  endpoint?: string;          // API endpoint URL (default: https://api.inkress.com)
  apiVersion?: string;        // API version (default: v1)
  merchantUsername?: string;  // Your merchant username
  authToken?: string;         // Customer auth token for authenticated requests
  timeout?: number;           // Request timeout in milliseconds (default: 10000)
  headers?: Record<string, string>; // Custom headers
}
```

### Products

```typescript
// Search products
const response = await sdk.products.search({
  q?: string;              // Search query
  limit?: number;          // Results per page
  page?: number;           // Page number
  category_id?: number;    // Filter by category
  min_price?: number;      // Minimum price filter
  max_price?: number;      // Maximum price filter
  in_stock?: boolean;      // Only show in-stock items
});

// Get product by ID
const product = await sdk.products.get(123);

// Get featured products
const featured = await sdk.products.featured({ limit: 5 });
```

### Categories

The SDK provides full category management with hierarchical support, search capabilities, and tree building.

```typescript
// List all categories
const categories = await sdk.categories.list();

// Search categories
const electronics = await sdk.categories.search('electronics');

// Get category tree (hierarchical structure)
const tree = await sdk.categories.getCategoryTree(3); // 3 levels deep

// Get specific category
const category = await sdk.categories.get(123);

// Get child categories
const children = await sdk.categories.getChildren(123);

// Create category (requires authentication)
const newCategory = await sdk.categories.create({
  name: 'Smart Devices',
  description: 'Internet-connected smart devices',
  kind: 1
});

// Create subcategory (requires authentication)
const subcategory = await sdk.categories.createSubcategory(newCategory.data.id, {
  name: 'Smart Speakers',
  description: 'Voice-activated speakers',
  kind: 1
});
```

### Merchants

The SDK provides methods to access public merchant information, essential for building storefronts.

```typescript
// Get merchant profile (name, logo, about, etc.)
const merchant = await sdk.merchants.getByUsername('acme-store');
console.log(merchant.data.name);       // "Acme Store"
console.log(merchant.data.logo);       // "https://example.com/logo.jpg"
console.log(merchant.data.about);      // "We sell quality products"

// Get merchant's products
const products = await sdk.merchants.getProducts('acme-store', {
  limit: 20,
  page: 1
});

// Get merchant's fee structure
const fees = await sdk.merchants.getFees('acme-store');
console.log(fees.data.fees.platform_fee);           // Platform fee
console.log(fees.data.fees.payment_processing_fee); // Payment processing fee
console.log(fees.data.fees.total_fees);             // Total fees

// Get merchant's public API tokens
const tokens = await sdk.merchants.getTokens('acme-store');
console.log(tokens.data.publishable_key); // For client-side integrations

// Get merchant's payment methods
const paymentMethods = await sdk.merchants.getPaymentMethods('acme-store');
const enabled = paymentMethods.data?.filter(method => method.enabled);
console.log(enabled); // Only enabled payment methods

// Complete storefront setup example
const storefront = {
  merchant: merchant.data,
  products: products.data?.entries || [],
  paymentMethods: enabled,
  feeStructure: fees.data
};
```

### Cart

```typescript
// Add item to cart
const product = { /* Product object */ };
sdk.cart.addItem(product, 2); // product, quantity

// Update item quantity
sdk.cart.updateItemQuantity('item-id', 3);

// Remove item
sdk.cart.removeItem('item-id');

// Remove by product ID
sdk.cart.removeProduct(123);

// Get cart contents
const cart = sdk.cart.get();

// Get cart subtotal
const subtotal = sdk.cart.getSubtotal();

// Get item count
const itemCount = sdk.cart.getItemCount();

// Clear cart
sdk.cart.clear();

// Check if product is in cart
const inCart = sdk.cart.hasProduct(123);

// Remote cart sync (for authenticated users)
await sdk.cart.syncToRemote(); // Upload local cart to server
const remoteCarts = await sdk.cart.listRemoteCarts(); // List saved carts
await sdk.cart.loadFromRemote('cart-id'); // Load cart from server
```

### Wishlist

```typescript
// Add to wishlist
const product = { /* Product object */ };
sdk.wishlist.addItem(product);

// Remove from wishlist
sdk.wishlist.removeItem('item-id');

// Remove by product ID
sdk.wishlist.removeProduct(123);

// Check if product is in wishlist
const inWishlist = sdk.wishlist.hasProduct(123);

// Get wishlist items
const wishlist = sdk.wishlist.get();

// Clear wishlist
sdk.wishlist.clear();

// Sort wishlist by date added (newest first)
sdk.wishlist.sortByDateAdded();
```

### Authentication

```typescript
// Customer login
const response = await sdk.auth.login({
  email: 'customer@example.com',
  password: 'password123'
});

// Customer registration
const customer = await sdk.auth.register({
  email: 'new@example.com',
  password: 'password123',
  first_name: 'John',
  last_name: 'Doe'
});

// Get current session
const session = await sdk.auth.getSession();

// Update profile
const updated = await sdk.auth.updateProfile({
  first_name: 'Jane',
  phone: '+1234567890'
});

// Change password
await sdk.auth.changePassword({
  current_password: 'old-password',
  new_password: 'new-password'
});

// Request password reset
await sdk.auth.requestPasswordReset('customer@example.com');

// Logout
await sdk.auth.logout();
```

### Orders

The Orders resource provides comprehensive order management for storefronts, including order creation, tracking, and status management.

```typescript
// === Storefront Core Functionality ===

// Create order from cart (checkout process)
const cart = sdk.cart.get();
const order = await sdk.orders.create({
  currency_code: 'USD',
  kind: 'order',
  products: cart.items.map(item => ({
    id: item.product.id,
    quantity: item.quantity
  })),
  data: {
    shipping_address: {
      address: '123 Main St',
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      country: 'US'
    }
  }
  // reference_id will be auto-generated if not provided
});

// List customer orders (requires authentication)
const orders = await sdk.orders.list({
  page_size: 10,
  page: 1,
  status: 'completed'
});

// Get specific order
const order = await sdk.orders.get(123);

// Find order by reference ID
const orderByRef = await sdk.orders.getByReference('ORD-2024-001');

// Get order tracking info
const tracking = await sdk.orders.getTracking(123);
console.log(`Tracking: ${tracking.data.tracking_number}`);

// Cancel order (if cancellable)
if (sdk.orders.isCancellable(order.data)) {
  await sdk.orders.cancel(123, 'Customer request');
}

// === Order Status & Statistics ===

// Get public order status (no auth required)
const status = await sdk.orders.getStatus('ord_abc123');
console.log(`Status: ${status.data.entries.result}`);

// Get detailed order info (requires auth)
const detailed = await sdk.orders.getDetailedStatus('ord_abc123');

// Get order statistics (for merchants)
const stats = await sdk.orders.getStats();
console.log(`Total orders: ${stats.data.total_orders}`);

// === Convenience Methods ===

// Get recent orders
const recent = await sdk.orders.getRecent(5);

// Get orders by status
const pending = await sdk.orders.getPending();
const completed = await sdk.orders.getCompleted();
const cancelled = await sdk.orders.getCancelled();

// Check order capabilities
const canCancel = sdk.orders.isCancellable(order.data);
const canTrack = sdk.orders.isTrackable(order.data);
```

### Merchant Information

```typescript
// Get merchant fees for a purchase
const response = await sdk.merchants.getFees('merchant-username', {
  currency: 'USD',
  total: 100
});
const fees = response.data;

// Get merchant products
const products = await sdk.merchants.getProducts('merchant-username', {
  limit: 10,
  page: 1
});

// Get merchant public tokens/keys
const tokens = await sdk.merchants.getTokens('merchant-username');

// Get merchant payment methods
const paymentMethods = await sdk.merchants.getPaymentMethods('merchant-username');
```

### Generic Resource

For custom endpoints or features not explicitly covered by other resources:

```typescript
// Make custom GET request
const data = await sdk.generic.get('/api/v1/custom-endpoint');

// Make custom POST request
const result = await sdk.generic.post('/api/v1/custom-endpoint', { data: 'value' });

// Submit product review using reviews endpoint
await sdk.generic.post('/api/v1/reviews', {
  product_id: 123,
  rating: 5,
  comment: 'Great product!',
  customer_name: 'John Doe'
});

// Access shipping methods
const shippingMethods = await sdk.generic.get('/api/v1/shipping_methods');

// Access payment methods  
const paymentMethods = await sdk.generic.get('/api/v1/payment_methods');
```

## Events

The SDK emits events for various actions. You can listen to these events to update your UI:

```typescript
// Cart events
sdk.on('cart:item:added', ({ item, cart }) => console.log('Added:', item));
sdk.on('cart:item:updated', ({ item, cart }) => console.log('Updated:', item));
sdk.on('cart:item:removed', ({ itemId, cart }) => console.log('Removed:', itemId));
sdk.on('cart:cleared', ({ cart }) => console.log('Cart cleared'));

// Wishlist events
sdk.on('wishlist:item:added', ({ item, wishlist }) => console.log('Added to wishlist:', item));
sdk.on('wishlist:item:removed', ({ itemId, wishlist }) => console.log('Removed from wishlist:', itemId));
sdk.on('wishlist:cleared', ({ wishlist }) => console.log('Wishlist cleared'));

// Authentication events
sdk.on('customer:authenticated', ({ customer, token }) => console.log('Logged in:', customer));
sdk.on('customer:logout', () => console.log('Logged out'));

// Remove event listener
const unsubscribe = sdk.on('cart:item:added', handler);
unsubscribe(); // Remove listener
```

## Error Handling

The SDK throws typed errors that you can catch and handle:

```typescript
import { InkressApiError } from '@inkress/storefront-sdk';

try {
  const product = await sdk.products.get(999999);
} catch (error) {
  if (error instanceof InkressApiError) {
    console.log('API Error:', error.message, error.status);
  } else {
    console.log('Unexpected error:', error);
  }
}
```

## React Integration Example

```tsx
import React, { useEffect, useState } from 'react';
import { InkressStorefrontSDK } from '@inkress/storefront-sdk';

const sdk = new InkressStorefrontSDK({
  baseUrl: 'https://your-api.com',
  merchantId: 'your-merchant-id'
});

export function CartButton() {
  const [cartCount, setCartCount] = useState(0);

  useEffect(() => {
    // Initialize cart count
    const cart = sdk.cart.get();
    setCartCount(cart.items.length);

    // Listen to cart changes
    const unsubscribeAdd = sdk.on('cart:item:added', () => {
      const updatedCart = sdk.cart.get();
      setCartCount(updatedCart.items.length);
    });

    const unsubscribeRemove = sdk.on('cart:item:removed', () => {
      const updatedCart = sdk.cart.get();
      setCartCount(updatedCart.items.length);
    });

    return () => {
      unsubscribeAdd();
      unsubscribeRemove();
    };
  }, []);

  return (
    <button>
      Cart ({cartCount})
    </button>
  );
}
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  Product,
  CartItem,
  WishlistItem,
  Customer,
  Order,
  Category,
  Merchant
} from '@inkress/storefront-sdk';
```

## Local Storage

Cart and wishlist data is automatically persisted to local storage (in browsers) or memory (in Node.js). You can customize the storage prefix:

```typescript
const sdk = new InkressStorefrontSDK({
  endpoint: 'https://api.inkress.com',
  merchantUsername: 'your-merchant-username',
  // Custom storage prefix for multi-tenant apps
}

// Cart and wishlist data is automatically persisted to browser localStorage
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions, please use the [GitHub Issues](https://github.com/inkress/storefront-sdk/issues) page.
