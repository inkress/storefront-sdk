# Merchants Resource Summary

## Overview
The `MerchantsResource` class provides access to public merchant information essential for building storefronts. It includes methods to retrieve merchant profiles, products, fees, tokens, and payment methods.

## Available Methods

### 1. `getByUsername(merchantUsername: string)`
**Purpose:** Get merchant profile information including name, logo, about text, and branding details.

**Returns:** `Promise<ApiResponse<PublicMerchant>>`

**Example:**
```typescript
const merchant = await sdk.merchants.getByUsername('acme-store');
console.log(merchant.data.name);  // "Acme Store"
console.log(merchant.data.logo);  // "https://example.com/logo.jpg"
```

### 2. `getProducts(merchantUsername: string, params?: ProductSearchParams)`
**Purpose:** Get a merchant's public products with optional filtering and pagination.

**Returns:** `Promise<ApiResponse<PaginatedResponse<Product>>>`

**Example:**
```typescript
const products = await sdk.merchants.getProducts('acme-store', {
  limit: 20,
  page: 1
});
```

### 3. `getFees(merchantUsername: string, params?: { currency?: string; total?: number })`
**Purpose:** Get merchant's fee structure for transparency and calculations.

**Returns:** `Promise<ApiResponse<PublicMerchantFees>>`

**Example:**
```typescript
const fees = await sdk.merchants.getFees('acme-store', {
  currency: 'USD',
  total: 100
});
```

### 4. `getTokens(merchantUsername: string)`
**Purpose:** Get merchant's public API tokens for client-side integrations.

**Returns:** `Promise<ApiResponse<PublicMerchantTokens>>`

**Example:**
```typescript
const tokens = await sdk.merchants.getTokens('acme-store');
console.log(tokens.data.publishable_key);
```

### 5. `getPaymentMethods(merchantUsername: string)`
**Purpose:** Get merchant's available payment methods for checkout.

**Returns:** `Promise<ApiResponse<PaymentMethod[]>>`

**Example:**
```typescript
const methods = await sdk.merchants.getPaymentMethods('acme-store');
const enabled = methods.data?.filter(method => method.enabled);
```

## Types

### `PublicMerchant`
```typescript
interface PublicMerchant {
  id: number;
  name: string;
  username: string;
  about?: string;
  logo?: string;
  sector?: string;
  theme_colour?: string;
  domain?: {
    cname?: string;
  };
}
```

### `PublicMerchantFees`
```typescript
interface PublicMerchantFees {
  currency_code: string;
  subtotal: number;
  fees: {
    platform_fee: number;
    payment_processing_fee: number;
    total_fees: number;
  };
  total: number;
}
```

### `PublicMerchantTokens`
```typescript
interface PublicMerchantTokens {
  publishable_key?: string;
  client_id?: string;
}
```

### `PaymentMethod`
```typescript
interface PaymentMethod {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  config?: Record<string, any>;
}
```

## Common Use Cases

### 1. Building a Storefront
```typescript
async function buildStorefront(merchantUsername: string) {
  const [merchant, products, fees, paymentMethods] = await Promise.all([
    sdk.merchants.getByUsername(merchantUsername),
    sdk.merchants.getProducts(merchantUsername, { limit: 20 }),
    sdk.merchants.getFees(merchantUsername, { currency: 'USD', total: 100 }),
    sdk.merchants.getPaymentMethods(merchantUsername)
  ]);

  return {
    merchant: merchant.data,
    products: products.data?.entries || [],
    paymentMethods: paymentMethods.data?.filter(m => m.enabled) || [],
    feeStructure: fees.data
  };
}
```

### 2. Merchant Branding
```typescript
const merchant = await sdk.merchants.getByUsername('acme-store');
const branding = {
  name: merchant.data?.name,
  logo: merchant.data?.logo,
  colors: merchant.data?.theme_colour,
  domain: merchant.data?.domain?.cname
};
```

### 3. Fee Transparency
```typescript
const fees = await sdk.merchants.getFees('acme-store', {
  currency: 'USD',
  total: orderTotal
});

console.log(`Platform Fee: $${fees.data?.fees.platform_fee}`);
console.log(`Payment Fee: $${fees.data?.fees.payment_processing_fee}`);
console.log(`Total Fees: $${fees.data?.fees.total_fees}`);
```

## API Endpoints

All methods use public endpoints that don't require authentication:

- `GET /api/v1/public/m/{merchant_username}` - Get merchant profile
- `GET /api/v1/public/m/{merchant_username}/products` - Get merchant products
- `GET /api/v1/public/m/{merchant_username}/fees` - Get merchant fees
- `GET /api/v1/public/m/{merchant_username}/tokens` - Get merchant tokens
- `GET /api/v1/public/m/{merchant_username}/payment_methods` - Get payment methods

## Error Handling

All methods return API responses with proper error handling:

```typescript
try {
  const merchant = await sdk.merchants.getByUsername('unknown-merchant');
} catch (error) {
  if (error.response?.status === 404) {
    console.log('Merchant not found');
  } else {
    console.error('API error:', error);
  }
}
```

## Changes Made

1. **Added `getByUsername()` method** - Get merchant profile information
2. **Added `PublicMerchant` interface** - Type definition for merchant profile
3. **Added OpenAPI specification** - Documented the new endpoint
4. **Updated documentation** - Added comprehensive examples and usage patterns
5. **Created usage examples** - Practical examples for common storefront scenarios

The merchants resource is now complete with all necessary functionality for building storefronts.
