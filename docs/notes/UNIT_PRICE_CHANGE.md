# Cart Line Items: Total → Unit Price Change

## Summary

Changed the cart line items field from `total` to `unit_price` to better represent the data structure and improve clarity.

## Changes Made

### 1. **OpenAPI Specification**
Updated `CartLineInput` schema in `openapi.yaml`:
```yaml
# Before
total:
  type: number
  format: float
  example: 99.99

# After  
unit_price:
  type: number
  format: float
  example: 49.99
```

### 2. **TypeScript Interfaces**
Updated both `CartLineItem` and `CartLineInput` interfaces:
```typescript
// Before
interface CartLineItem {
  product_id: number;
  variant_id: number;
  quantity: number;
  total: number;        // ❌ Removed
  product?: Product;
}

// After
interface CartLineItem {
  product_id: number;
  variant_id: number;
  quantity: number;
  unit_price: number;   // ✅ Added
  product?: Product;
}
```

### 3. **Implementation Updates**

#### Total Calculation Logic:
```typescript
// Before: Used stored total values
cartData.total = cartData.items.reduce((sum, item) => sum + item.total, 0);

// After: Calculate total from unit_price * quantity
cartData.total = cartData.items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
```

#### Data Conversion:
```typescript
// Before: Store total price per line
items: cart.items.map(item => ({
  product_id: item.product.id,
  variant_id: item.product.id,
  quantity: item.quantity,
  total: item.price * item.quantity  // ❌ Calculated total
}))

// After: Store unit price
items: cart.items.map(item => ({
  product_id: item.product.id,
  variant_id: item.product.id,
  quantity: item.quantity,
  unit_price: item.price             // ✅ Unit price
}))
```

## Benefits

1. **Clearer Data Structure**: `unit_price` clearly indicates price per unit
2. **Easier Price Updates**: Can update unit price without recalculating totals
3. **Better Validation**: Unit prices are more predictable than total calculations
4. **Consistent with E-commerce Standards**: Most systems store unit prices, not line totals
5. **Simpler Tax/Discount Calculations**: Applied to unit prices before quantity multiplication

## Migration Impact

- ✅ **Local cart operations**: No changes needed
- ✅ **Event system**: No changes needed  
- ⚠️ **Remote cart operations**: Automatic - calculations updated internally
- ⚠️ **Direct API usage**: Update any manual cart data structures

## Usage Examples

```typescript
// Creating cart items with unit prices
const cartData = {
  total: 199.98,
  quantity: 2,
  items: [
    {
      product_id: 1,
      variant_id: 1,
      quantity: 2,
      unit_price: 99.99  // Price per unit, not total
    }
  ]
};

// Total is calculated as: 99.99 * 2 = 199.98
```

This change makes the cart data structure more semantically correct and aligns with standard e-commerce practices.
