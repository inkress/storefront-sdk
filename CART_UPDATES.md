# Cart Resource Updates - OpenAPI Alignment

## Summary

The `CartResource` class has been updated to align with the OpenAPI specification. The main changes involve restructuring the cart data format and API endpoints to match the backend implementation.

## Key Changes

### 1. **Updated Cart Data Structure**

#### Before (Old Structure):
```typescript
interface RemoteCart {
  id: string;
  user_id?: number;
  session_id?: string;
  currency_code: string;
  subtotal: number;
  total: number;
  line_items_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface RemoteCartLine {
  id: string;
  cart_id: string;
  product_id: number;
  quantity: number;
  price: number;
  total: number;
  product?: Product;
  created_at: string;
  updated_at: string;
}
```

#### After (New Structure - OpenAPI Aligned):
```typescript
interface RemoteCart {
  id: string;
  user_id?: number;
  session_id?: string;
  data: CartData;
  created_at: string;
  updated_at: string;
}

interface CartData {
  total: number;
  items: CartLineItem[];
  quantity: number;
}

interface CartLineItem {
  product_id: number;
  variant_id: number;
  quantity: number;
  unit_price: number;
  product?: Product;
}
```

### 2. **API Endpoints**

#### Available Endpoints:
- `GET /api/v1/carts` - List carts with filtering
- `POST /api/v1/carts` - Create cart
- `GET /api/v1/carts/{id}` - Get cart by ID
- `PUT /api/v1/carts/{id}` - Update cart
- `DELETE /api/v1/carts/{id}` - Delete cart

#### Removed Endpoints:
- ❌ `/api/v1/cart_lines` (separate line item endpoints don't exist in OpenAPI)

### 3. **Updated Methods**

#### Modified Methods:
- `syncToRemote()` - Now creates cart with embedded items
- `loadFromRemote()` - Converts new API format to local cart
- `listRemoteCarts()` - Updated with new filtering parameters

#### New Methods:
- `updateRemoteCart()` - Update entire cart data
- `addItemToRemoteCart()` - Add item by updating cart data
- `removeItemFromRemoteCart()` - Remove item by updating cart data
- `updateItemQuantityInRemoteCart()` - Update item quantity

#### Removed Methods:
- ❌ `addItemToRemoteCart()` (old cart line version)
- ❌ `getRemoteCartLines()`
- ❌ `updateRemoteCartLine()`
- ❌ `removeRemoteCartLine()`

### 4. **Type Definitions**

#### New Types Added:
```typescript
interface CartInput {
  user_id?: number;
  session_id?: string;
  data: CartDataInput;
}

interface CartDataInput {
  total: number;
  items: CartLineInput[];
  quantity: number;
}

interface CartLineInput {
  product_id: number;
  variant_id: number;
  quantity: number;
  unit_price: number; // Changed from 'total' to 'unit_price'
}

interface ListCartsParams {
  page?: number;
  limit?: number;
  user_id?: number;
  session_id?: string;
  sort?: 'created_at' | 'updated_at' | 'user_id';
  order?: 'asc' | 'desc';
}
```

**Important**: Cart line items now use `unit_price` instead of `total`. The total for each line is calculated as `unit_price * quantity`.

#### Local Types (Unchanged):
```typescript
interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  total_items: number;
  created_at: string;
  updated_at: string;
}

interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  price: number;
}
```

## Migration Guide

### For Existing Code:

1. **Local cart operations remain unchanged** - All local cart methods (`addItem`, `removeItem`, `updateItemQuantity`, etc.) work exactly the same.

2. **Remote cart operations have changed**:
   ```typescript
   // OLD: Separate line item operations
   await cart.addItemToRemoteCart(cartId, {
     cart_id: cartId,
     product_id: 1,
     quantity: 2,
     price: 99.99
   });

   // NEW: Item operations via cart data updates
   await cart.addItemToRemoteCart(cartId, productId, variantId, quantity, unitPrice);
   ```

3. **Cart line item structure**:
   ```typescript
   // OLD: Used 'total' field
   {
     product_id: 1,
     variant_id: 1,
     quantity: 2,
     total: 199.98 // Total price for this line
   }

   // NEW: Uses 'unit_price' field
   {
     product_id: 1,
     variant_id: 1,
     quantity: 2,
     unit_price: 99.99 // Price per unit
   }
   ```

3. **Cart sync operations**:
   ```typescript
   // OLD: Manual line item sync
   const cart = await cart.syncToRemote();
   for (const item of localCart.items) {
     await cart.addItemToRemoteCart(cart.id, item);
   }

   // NEW: Automatic embedded item sync
   const cart = await cart.syncToRemote(); // Items are included automatically
   ```

### Benefits of New Structure:

1. **Simplified API** - Single cart endpoint instead of separate line items
2. **Atomic Updates** - Cart and items updated together
3. **Better Performance** - Fewer API calls needed
4. **Variant Support** - Now supports product variants
5. **OpenAPI Compliance** - Matches the actual backend API

### Backwards Compatibility:

- ✅ Local cart operations are fully backwards compatible
- ✅ Event system remains unchanged
- ✅ Storage mechanisms unchanged
- ⚠️ Remote cart operations require code updates

## Usage Examples

See `examples/updated-cart-usage.ts` for comprehensive usage examples of the new cart resource functionality.
