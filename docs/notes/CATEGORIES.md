# Categories Resource

## Overview

The `CategoriesResource` provides a comprehensive interface for managing product categories in the Inkress storefront. Categories support hierarchical structures, filtering, and various organizational features.

## Features

- **CRUD Operations**: Create, read, update, and delete categories
- **Hierarchical Structure**: Support for parent-child relationships
- **Search & Filtering**: Search by name/description and filter by various criteria
- **Tree Building**: Automatic category tree construction with configurable depth
- **Convenience Methods**: Specialized methods for common use cases

## API Endpoints

- `GET /api/v1/categories` - List categories with filtering
- `POST /api/v1/categories` - Create new category (auth required)
- `GET /api/v1/categories/{id}` - Get specific category
- `PUT /api/v1/categories/{id}` - Update category (auth required)
- `DELETE /api/v1/categories/{id}` - Delete category (auth required)

## Data Structure

### Category Interface
```typescript
interface Category {
  id: number;
  name: string;
  description?: string;
  kind: number;           // Category type/kind
  kind_id?: number;       // Additional kind identifier
  parent_id?: number;     // Parent category ID (null for root)
  merchant_id: number;
  created_at: string;
  updated_at: string;
}
```

### CategoryInput Interface
```typescript
interface CategoryInput {
  name: string;
  description?: string;
  kind: number;
  kind_id?: number;
  parent_id?: number;
}
```

### CategoryTree Interface
```typescript
interface CategoryTree extends Category {
  children: CategoryTree[];
}
```

## Basic Usage

### Initialize SDK
```typescript
import { InkressStorefrontSDK } from '@inkress/storefront-sdk';

const inkress = new InkressStorefrontSDK({
  merchantUsername: 'your-merchant-username',
  authToken: 'your-auth-token' // Required for create/update/delete operations
});
```

### List Categories
```typescript
// Get all categories
const categories = await inkress.categories.list();

// With pagination and filtering
const filteredCategories = await inkress.categories.list({
  page: 1,
  limit: 20,
  kind: 1,
  sort: 'name',
  order: 'asc'
});
```

### Search Categories
```typescript
// Search by name or description
const results = await inkress.categories.search('electronics');

// Search with additional filters
const results = await inkress.categories.search('tech', {
  kind: 1,
  limit: 10
});
```

### Get Category Details
```typescript
// Get specific category
const category = await inkress.categories.get(123);

// Get category children
const children = await inkress.categories.getChildren(123);

// Get root categories
const roots = await inkress.categories.getRoots();
```

### Create Categories
```typescript
// Create root category
const newCategory = await inkress.categories.create({
  name: 'Electronics',
  description: 'Electronic devices and accessories',
  kind: 1,
  kind_id: 1
});

// Create subcategory
const subcategory = await inkress.categories.createSubcategory(newCategory.data.id, {
  name: 'Smartphones',
  description: 'Mobile phones and accessories',
  kind: 1,
  kind_id: 2
});
```

### Update and Delete
```typescript
// Update category
const updated = await inkress.categories.update(123, {
  name: 'Updated Category Name',
  description: 'Updated description',
  kind: 1
});

// Delete category
await inkress.categories.delete(123);
```

## Advanced Features

### Category Tree
```typescript
// Get full category tree (3 levels deep)
const tree = await inkress.categories.getCategoryTree(3);

// Use tree for navigation
if (tree.state === 'ok' && tree.data) {
  tree.data.forEach(rootCategory => {
    console.log(`Root: ${rootCategory.name}`);
    rootCategory.children.forEach(child => {
      console.log(`  Child: ${child.name}`);
      child.children.forEach(grandchild => {
        console.log(`    Grandchild: ${grandchild.name}`);
      });
    });
  });
}
```

### Category Filtering
```typescript
// Filter by kind
const kindCategories = await inkress.categories.getByKind(1);

// Complex filtering
const filtered = await inkress.categories.list({
  kind: 1,
  parent_id: 123,
  search: 'smartphone',
  sort: 'created_at',
  order: 'desc',
  limit: 50
});
```

## Common Use Cases

### 1. Navigation Menu
```typescript
async function buildNavigation() {
  const tree = await inkress.categories.getCategoryTree(2);
  
  return tree.data?.map(category => ({
    id: category.id,
    name: category.name,
    url: `/category/${category.id}`,
    children: category.children.map(child => ({
      id: child.id,
      name: child.name,
      url: `/category/${child.id}`
    }))
  })) || [];
}
```

### 2. Breadcrumb Navigation
```typescript
async function getBreadcrumb(categoryId: number) {
  const breadcrumb = [];
  let currentId = categoryId;

  while (currentId) {
    const category = await inkress.categories.get(currentId);
    if (category.data) {
      breadcrumb.unshift({
        id: category.data.id,
        name: category.data.name
      });
      currentId = category.data.parent_id;
    } else {
      break;
    }
  }

  return breadcrumb;
}
```

### 3. Category-based Product Filtering
```typescript
async function getProductsByCategory(categoryId: number) {
  const products = await inkress.products.search({
    category_id: categoryId,
    limit: 20
  });
  
  return products.data?.entries || [];
}
```

### 4. Category Management Dashboard
```typescript
async function getCategoryStats() {
  const allCategories = await inkress.categories.list({ limit: 1000 });
  
  if (allCategories.result) {
    const categories = allCategories.result.entries;
    return {
      total: categories.length,
      roots: categories.filter(c => !c.parent_id).length,
      byKind: categories.reduce((acc, c) => {
        acc[c.kind] = (acc[c.kind] || 0) + 1;
        return acc;
      }, {} as Record<number, number>)
    };
  }
  
  return null;
}
```

## Error Handling

```typescript
try {
  const category = await inkress.categories.get(123);
  
  if (category.state === 'ok' && category.data) {
    // Success - use category.data
    console.log('Category:', category.data.name);
  } else {
    // Handle error
    console.error('Failed to get category');
  }
} catch (error) {
  console.error('Network error:', error);
}
```

## Authentication Requirements

- **Public operations**: `list()`, `get()`, `search()`, `getByKind()`, `getChildren()`, `getRoots()`, `getCategoryTree()`
- **Authenticated operations**: `create()`, `update()`, `delete()`, `createSubcategory()`

Make sure to provide an `authToken` in the SDK configuration for authenticated operations.

## Best Practices

1. **Use tree structure** for navigation components
2. **Implement breadcrumbs** for better UX
3. **Cache category data** when possible
4. **Validate parent relationships** before creating subcategories
5. **Handle deep nesting** carefully to avoid performance issues
6. **Use pagination** for large category lists
7. **Implement search** for better category discovery

## Performance Considerations

- The `getCategoryTree()` method makes multiple API calls - use sparingly
- Consider limiting tree depth for better performance
- Cache category data on the client side when appropriate
- Use pagination for large category lists
