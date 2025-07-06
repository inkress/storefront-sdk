import { InkressStorefrontSDK } from '../src/index';

/**
 * Example usage of the hybrid wishlist (local + remote storage)
 */

async function demonstrateHybridWishlist() {
  // Initialize SDK
  const sdk = new InkressStorefrontSDK({
    merchantUsername: 'demo-merchant',
    authToken: 'your-auth-token' // Required for remote storage
  });

  // Set user ID for remote storage features
  sdk.setUserId(123);

  console.log('=== Hybrid Wishlist Demo ===');

  // Get a sample product (you'd normally fetch this from the products resource)
  const sampleProduct = {
    id: 1,
    title: 'Sample Product',
    price: 29.99,
    teaser: 'A sample product for testing',
    permalink: 'sample-product',
    image: 'https://example.com/product.jpg',
    status: 1,
    public: true,
    unlimited: false,
    units_remaining: 10,
    tag_ids: [],
    currency: {
      id: 1,
      code: 'USD',
      symbol: '$',
      name: 'US Dollar'
    },
    merchant: {
      id: 1,
      name: 'Demo Merchant',
      username: 'demo-merchant'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    // 1. Add item to wishlist (saves to both local and remote)
    console.log('\n1. Adding product to wishlist...');
    const wishlistAfterAdd = await sdk.wishlist.addItem(sampleProduct);
    console.log('Wishlist after adding item:', {
      itemCount: wishlistAfterAdd.total_items,
      items: wishlistAfterAdd.items.map(item => item.product.title)
    });

    // 2. Check if product is in wishlist
    console.log('\n2. Checking if product is in wishlist...');
    const hasProduct = await sdk.wishlist.hasProduct(sampleProduct.id);
    console.log('Has product:', hasProduct);

    // 3. Get wishlist (tries remote first, falls back to local)
    console.log('\n3. Getting current wishlist...');
    const currentWishlist = await sdk.wishlist.get();
    console.log('Current wishlist:', {
      itemCount: currentWishlist.total_items,
      lastUpdated: currentWishlist.updated_at
    });

    // 4. Get wishlist from local storage only (synchronous)
    console.log('\n4. Getting local wishlist...');
    const localWishlist = sdk.wishlist.getLocal();
    console.log('Local wishlist:', {
      itemCount: localWishlist.total_items,
      lastUpdated: localWishlist.updated_at
    });

    // 5. Use synchronous methods (local storage only)
    console.log('\n5. Using synchronous methods...');
    console.log('Has product (local):', sdk.wishlist.hasProductLocal(sampleProduct.id));
    console.log('Item count (local):', sdk.wishlist.getItemCountLocal());
    console.log('Is empty (local):', sdk.wishlist.isEmptyLocal());

    // 6. Toggle product (remove since it's already added)
    console.log('\n6. Toggling product...');
    const toggleResult = await sdk.wishlist.toggleProduct(sampleProduct);
    console.log('Toggle result:', {
      added: toggleResult.added,
      newItemCount: toggleResult.wishlist.total_items
    });

    // 7. Add product back and sort
    console.log('\n7. Adding product back and sorting...');
    await sdk.wishlist.addItem(sampleProduct);
    const sortedWishlist = await sdk.wishlist.sortByName();
    console.log('Sorted wishlist:', {
      itemCount: sortedWishlist.total_items,
      items: sortedWishlist.items.map(item => item.product.title)
    });

    // 8. Sync operations
    console.log('\n8. Demonstrating sync operations...');
    
    // Force sync from remote
    console.log('Syncing from remote...');
    const syncedFromRemote = await sdk.wishlist.syncFromRemote();
    console.log('Synced from remote:', {
      itemCount: syncedFromRemote.total_items
    });

    // Force sync to remote
    console.log('Syncing to remote...');
    await sdk.wishlist.syncToRemote();
    console.log('Synced to remote successfully');

    // 9. Clear wishlist
    console.log('\n9. Clearing wishlist...');
    const clearedWishlist = await sdk.wishlist.clear();
    console.log('Cleared wishlist:', {
      itemCount: clearedWishlist.total_items,
      isEmpty: clearedWishlist.items.length === 0
    });

  } catch (error) {
    console.error('Error during wishlist operations:', error);
  }
}

// Event listeners
function setupEventListeners(sdk: InkressStorefrontSDK) {
  sdk.on('wishlist:item:added', ({ item, wishlist }) => {
    console.log('📝 Wishlist item added:', {
      productTitle: item.product.title,
      totalItems: wishlist.total_items
    });
  });

  sdk.on('wishlist:item:removed', ({ itemId, wishlist }) => {
    console.log('❌ Wishlist item removed:', {
      itemId,
      totalItems: wishlist.total_items
    });
  });

  sdk.on('wishlist:cleared', ({ wishlist }) => {
    console.log('🗑️ Wishlist cleared:', {
      totalItems: wishlist.total_items
    });
  });
}

// Run the demo
async function runDemo() {
  const sdk = new InkressStorefrontSDK({
    merchantUsername: 'demo-merchant',
    authToken: 'your-auth-token'
  });

  setupEventListeners(sdk);
  sdk.setUserId(123);

  await demonstrateHybridWishlist();
}

// Uncomment to run the demo
// runDemo().catch(console.error);

export { demonstrateHybridWishlist, setupEventListeners };
