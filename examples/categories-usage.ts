import { InkressStorefrontSDK } from '../src/index';

// Example: Using the Categories Resource
async function demonstrateCategoriesUsage() {
  // Initialize the SDK
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username',
    authToken: 'your-auth-token' // Required for creating/updating/deleting categories
  });

  try {
    console.log('=== Categories Resource Examples ===');

    // Example 1: List all categories
    const allCategories = await inkress.categories.list();
    console.log('All categories:', allCategories.data);

    // Example 2: Search categories
    const electronicsCategories = await inkress.categories.search('electronics');
    console.log('Electronics categories:', electronicsCategories.data);

    // Example 3: Get categories by kind (type)
    const kindCategories = await inkress.categories.getByKind(1);
    console.log('Categories of kind 1:', kindCategories.data);

    // Example 4: Get root categories (top-level)
    const rootCategories = await inkress.categories.getRoots({
      per_page: 20,
      sort: 'name',
      order: 'asc'
    });
    console.log('Root categories:', rootCategories.data);

    // Example 5: Get category tree structure
    const categoryTree = await inkress.categories.getCategoryTree(3); // Max depth of 3
    console.log('Category tree:', categoryTree.data);

    // Example 6: Get a specific category
    if (allCategories.data && allCategories.result.entries.length > 0) {
      const firstCategory = allCategories.result.entries[0];
      const category = await inkress.categories.get(firstCategory.id);
      console.log('Specific category:', category.data);

      // Get children of this category
      const children = await inkress.categories.getChildren(firstCategory.id);
      console.log('Category children:', children.data);
    }

    // Example 7: Create a new category (requires authentication)
    const newCategory = await inkress.categories.create({
      name: 'Smart Home Devices',
      description: 'Internet-connected devices for home automation',
      kind: 1,
      kind_id: 1
    });
    console.log('Created category:', newCategory.data);

    // Example 8: Create a subcategory (requires authentication)
    if (newCategory.data) {
      const subcategory = await inkress.categories.createSubcategory(newCategory.data.id, {
        name: 'Smart Speakers',
        description: 'Voice-activated smart speakers and displays',
        kind: 1,
        kind_id: 2
      });
      console.log('Created subcategory:', subcategory.data);

      // Example 9: Update the subcategory (requires authentication)
      if (subcategory.data) {
        const updatedSubcategory = await inkress.categories.update(subcategory.data.id, {
          name: 'Smart Speakers & Displays',
          description: 'Voice-activated smart speakers, displays, and hubs',
          kind: 1,
          kind_id: 2
        });
        console.log('Updated subcategory:', updatedSubcategory.data);

        // Example 10: Delete the subcategory (requires authentication)
        const deleteResult = await inkress.categories.delete(subcategory.data.id);
        console.log('Subcategory deleted:', deleteResult.state === 'ok');
      }

      // Example 11: Delete the main category (requires authentication)
      const deleteResult = await inkress.categories.delete(newCategory.data.id);
      console.log('Category deleted:', deleteResult.state === 'ok');
    }

    // Example 12: Advanced filtering
    const filteredCategories = await inkress.categories.list({
      page: 1,
      per_page: 10,
      kind: 1,
      sort: 'created_at',
      order: 'desc',
      search: 'tech'
    });
    console.log('Filtered categories:', filteredCategories.data);

  } catch (error) {
    console.error('Error:', error);
  }
}

// Example: Building a category navigation component
async function buildCategoryNavigation(sdk: InkressStorefrontSDK) {
  try {
    // Get the full category tree
    const treeResponse = await sdk.categories.getCategoryTree(2); // 2 levels deep
    
    if (treeResponse.state === 'ok' && treeResponse.data) {
      return treeResponse.data.map(category => ({
        id: category.id,
        name: category.name,
        description: category.description,
        children: category.children.map(child => ({
          id: child.id,
          name: child.name,
          description: child.description,
          children: child.children || []
        }))
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Failed to build category navigation:', error);
    return [];
  }
}

// Example: Category breadcrumb functionality
async function getCategoryBreadcrumb(sdk: InkressStorefrontSDK, categoryId: number) {
  try {
    const breadcrumb: Array<{ id: number; name: string }> = [];
    let currentCategoryId: number | undefined = categoryId;

    // Traverse up the category tree
    while (currentCategoryId) {
      const categoryResponse = await sdk.categories.get(currentCategoryId);
      
      if (categoryResponse.state === 'ok' && categoryResponse.data) {
        const category = categoryResponse.data;
        breadcrumb.unshift({
          id: category.id,
          name: category.name
        });
        
        // Move to parent category
        currentCategoryId = category.parent_id;
      } else {
        break;
      }
    }

    return breadcrumb;
  } catch (error) {
    console.error('Failed to get category breadcrumb:', error);
    return [];
  }
}

// Example: Category-based product filtering
async function getProductsByCategory(sdk: InkressStorefrontSDK, categoryId: number) {
  try {
    // Get products in this specific category
    const productsResponse = await sdk.products.search({
      category_id: categoryId,
      per_page: 20
    });

    if (productsResponse.state === 'ok' && productsResponse.data) {
      return productsResponse.result.entries;
    }
    
    return [];
  } catch (error) {
    console.error('Failed to get products by category:', error);
    return [];
  }
}

// Example: Category statistics
async function getCategoryStatistics(sdk: InkressStorefrontSDK) {
  try {
    const stats = {
      totalCategories: 0,
      rootCategories: 0,
      categoriesByKind: {} as Record<number, number>
    };

    // Get all categories
    const allCategoriesResponse = await sdk.categories.list({ per_page: 1000 });
    
    if (allCategoriesResponse.state === 'ok' && allCategoriesResponse.data) {
      const categories = allCategoriesResponse.result.entries;
      
      stats.totalCategories = categories.length;
      stats.rootCategories = categories.filter(cat => !cat.parent_id).length;
      
      // Count by kind
      categories.forEach(category => {
        stats.categoriesByKind[category.kind] = (stats.categoriesByKind[category.kind] || 0) + 1;
      });
    }

    return stats;
  } catch (error) {
    console.error('Failed to get category statistics:', error);
    return null;
  }
}

// Export the demonstration functions
export { 
  demonstrateCategoriesUsage,
  buildCategoryNavigation,
  getCategoryBreadcrumb,
  getProductsByCategory,
  getCategoryStatistics
};
