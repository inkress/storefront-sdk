# Shipping Resource Documentation

The Shipping Resource provides functionality for managing shipping methods and shipping areas based on the actual available API endpoints.

## Features

### 🚚 Shipping Methods Management
- List, create, update, and delete shipping methods
- Filter methods by price, delivery time, and status
- Find cheapest and fastest shipping options

### 🌍 Shipping Areas Management
- Manage shipping areas with country coverage
- Check shipping availability by country
- Active area filtering

## Available API Endpoints

The shipping resource is built on these actual API endpoints:
- `GET/POST /api/v1/shipping_methods` - Manage shipping methods
- `GET/PUT/DELETE /api/v1/shipping_methods/{id}` - Individual method operations
- `GET/POST /api/v1/shipping_areas` - Manage shipping areas
- `GET/PUT/DELETE /api/v1/shipping_areas/{id}` - Individual area operations

## Quick Start

```typescript
import { InkressStorefrontSDK } from '@inkress/storefront-sdk';

const inkress = new InkressStorefrontSDK({
  merchantUsername: 'your-merchant-username',
  authToken: 'your-auth-token' // Required for CRUD operations
});

// List shipping methods
const methods = await inkress.shipping.listMethods();

// Find cheapest option
const cheapest = await inkress.shipping.getCheapestMethod();

// Check country availability
const availability = await inkress.shipping.isShippingAvailableToCountry('US');
```

## API Reference

### Shipping Methods

#### `listMethods(params?)`
List shipping methods with optional filtering and pagination.

#### `getMethod(id)`
Get a specific shipping method by ID.

#### `createMethod(input)` *
Create a new shipping method.

#### `updateMethod(id, input)` *
Update an existing shipping method.

#### `deleteMethod(id)` *
Delete a shipping method.

### Shipping Areas

#### `listAreas(params?)`
List shipping areas with pagination.

#### `getArea(id)`
Get a specific shipping area by ID.

#### `createArea(input)` *
Create a new shipping area.

#### `updateArea(id, input)` *
Update an existing shipping area.

#### `deleteArea(id)` *
Delete a shipping area.

### Convenience Methods

#### `getActiveMethods()`
Get only active shipping methods (status = 1).

#### `getCheapestMethod()`
Find the shipping method with the lowest price.

#### `getFastestMethod()`
Find the shipping method with the shortest delivery time.

#### `getAreasByCountry(countryCode)`
Find shipping areas that cover a specific country.

#### `isShippingAvailableToCountry(countryCode)`
Check if shipping is available to a specific country.

**Note: Methods marked with * require authentication*

## Types

### ShippingMethod
```typescript
interface ShippingMethod {
  id: number;
  name: string;
  description?: string;
  price: number;
  estimated_days?: number;
  status: number;
  data?: Record<string, any>;
  created_at: string;
  updated_at: string;
}
```

### ShippingArea
```typescript
interface ShippingArea {
  id: number;
  name: string;
  description?: string;
  countries?: string[];
  status: number;
  created_at: string;
  updated_at: string;
}
```

### Input Types
```typescript
interface ShippingMethodInput {
  name: string;
  description?: string;
  price: number;
  estimated_days?: number;
  status?: number;
  data?: Record<string, any>;
}

interface ShippingAreaInput {
  name: string;
  description?: string;
  countries?: string[];
  status?: number;
}
```

## Examples

See `examples/shipping-usage.ts` for comprehensive usage examples including:
- Basic shipping method and area management
- Customer shipping selection workflow
- Admin shipping setup procedures

## Error Handling

```typescript
try {
  const method = await inkress.shipping.createMethod(methodData);
} catch (error) {
  if (error.response?.status === 401) {
    // Authentication required
  } else if (error.response?.status === 422) {
    // Validation errors
  }
}
```

## Best Practices

1. **Authentication**: Use auth tokens for create/update/delete operations
2. **Status Management**: Use status = 1 for active methods/areas
3. **Country Codes**: Use uppercase ISO country codes (US, CA, etc.)
4. **Filtering**: Leverage convenience methods for common use cases
5. **Error Handling**: Check response status and handle validation errors

## Limitations

This resource only includes functionality that corresponds to actual API endpoints. Advanced features like:
- Real-time shipping quotes
- Package tracking
- Address validation  
- Rate calculation

Would need to be implemented through separate API integrations or additional endpoints.
