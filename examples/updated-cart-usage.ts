import { InkressStorefrontSDK } from '../src/index';

// Example: Using the Updated Cart Resource
async function demonstrateUpdatedCartUsage() {
  // Initialize the SDK
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username',
    authToken: 'your-auth-token' // Required for remote cart operations
  });

  try {
    // Example 1: Basic local cart operations (same as before)
    console.log('=== Local Cart Operations ===');
    
    // Add items to cart
    const product1 = await inkress.products.get(1);
    const product2 = await inkress.products.get(2);
    
    if (product1.data && product2.data) {
      inkress.cart.addItem(product1.data, 2);
      inkress.cart.addItem(product2.data, 1);
      
      console.log('Local cart after adding items:', inkress.cart.get());
    }

    // Example 2: Sync local cart to remote server (updated implementation)
    console.log('\n=== Remote Cart Operations ===');
    
    const syncResult = await inkress.cart.syncToRemote();
    console.log('Cart synced to remote:', syncResult.data);

    // Example 3: List remote carts (updated with new parameters)
    const remoteCarts = await inkress.cart.listRemoteCarts({
      page: 1,
      limit: 10,
      sort: 'created_at',
      order: 'desc'
    });
    console.log('Remote carts:', remoteCarts.data);

    // Example 4: Load cart from remote server (updated implementation)
    if (syncResult.data?.id) {
      const loadedCart = await inkress.cart.loadFromRemote(syncResult.data.id);
      console.log('Loaded cart from remote:', loadedCart.data);
    }

    // Example 5: Add item to remote cart (new method)
    if (syncResult.data?.id && product1.data) {
      const addResult = await inkress.cart.addItemToRemoteCart(
        syncResult.data.id,
        product1.data.id,
        product1.data.id, // variant_id - using product id for now
        1,
        product1.data.price
      );
      console.log('Item added to remote cart:', addResult.data);
    }

    // Example 6: Update item quantity in remote cart (new method)
    if (syncResult.data?.id && product1.data) {
      const updateResult = await inkress.cart.updateItemQuantityInRemoteCart(
        syncResult.data.id,
        product1.data.id,
        product1.data.id, // variant_id
        3 // new quantity
      );
      console.log('Item quantity updated in remote cart:', updateResult.data);
    }

    // Example 7: Remove item from remote cart (new method)
    if (syncResult.data?.id && product2.data) {
      const removeResult = await inkress.cart.removeItemFromRemoteCart(
        syncResult.data.id,
        product2.data.id,
        product2.data.id // variant_id
      );
      console.log('Item removed from remote cart:', removeResult.data);
    }

    // Example 8: Update remote cart directly (new method)
    if (syncResult.data?.id) {
      const updateCartResult = await inkress.cart.updateRemoteCart(
        syncResult.data.id,
        {
          user_id: 123,
          session_id: 'updated-session-id',
          data: {
            total: 299.99,
            quantity: 2,
            items: [
              {
                product_id: 1,
                variant_id: 1,
                quantity: 2,
                unit_price: 149.995 // Changed from total to unit_price
              }
            ]
          }
        }
      );
      console.log('Remote cart updated:', updateCartResult.data);
    }

    // Example 9: Delete remote cart (existing method)
    if (syncResult.data?.id) {
      const deleteResult = await inkress.cart.deleteRemoteCart(syncResult.data.id);
      console.log('Remote cart deleted:', deleteResult.state === 'ok');
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

// Example: Cart event handling (unchanged)
function setupCartEventHandlers(sdk: InkressStorefrontSDK) {
  sdk.on('cart:item:added', ({ item, cart }) => {
    console.log('Cart item added:', item.product.name, 'x', item.quantity);
    console.log('Cart total:', cart.subtotal);
  });

  sdk.on('cart:item:updated', ({ item, cart }) => {
    console.log('Cart item updated:', item.product.name, 'quantity:', item.quantity);
    console.log('Cart total:', cart.subtotal);
  });

  sdk.on('cart:item:removed', ({ itemId, cart }) => {
    console.log('Cart item removed:', itemId);
    console.log('Cart total:', cart.subtotal);
  });

  sdk.on('cart:cleared', ({ cart }) => {
    console.log('Cart cleared');
  });
}

// Example: Working with cart data structures
function demonstrateCartDataStructures() {
  console.log('\n=== Cart Data Structures ===');
  
  // Local cart structure (used by SDK)
  const localCart = {
    id: 'cart_local_123',
    items: [
      {
        id: 'item_1',
        product: {
          id: 1,
          name: 'Product 1',
          price: 99.99,
          // ... other product fields
        },
        quantity: 2,
        price: 99.99
      }
    ],
    subtotal: 199.98,
    total_items: 2,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  // Remote cart structure (API format)
  const remoteCart = {
    id: 'cart_remote_456',
    user_id: 123,
    session_id: 'sess_abc123',
    data: {
      total: 199.98,
      quantity: 2,
      items: [
        {
          product_id: 1,
          variant_id: 1,
          quantity: 2,
          unit_price: 99.99 // Changed from total to unit_price
        }
      ]
    },
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  console.log('Local cart structure:', localCart);
  console.log('Remote cart structure:', remoteCart);
}

// Export the demonstration functions
export { 
  demonstrateUpdatedCartUsage,
  setupCartEventHandlers,
  demonstrateCartDataStructures
};
