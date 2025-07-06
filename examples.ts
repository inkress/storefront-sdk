/**
 * Inkress Storefront SDK - Basic Usage Examples
 * 
 * This file demonstrates how to use the Inkress Storefront SDK
 * in various scenarios.
 */

import { InkressStorefrontSDK } from './src/index';

// Initialize the SDK
const sdk = new InkressStorefrontSDK({
  endpoint: 'https://api.inkress.com',
  merchantUsername: 'demo-merchant',
  timeout: 10000
});

// Example 1: Load and display products
async function loadProducts() {
  try {
    const response = await sdk.products.search({ 
      limit: 10,
      q: 'electronics'
    });
    
    console.log('Products loaded:', response.data?.entries.length || 0);
    return response.data?.entries || [];
  } catch (error) {
    console.error('Failed to load products:', error);
  }
}

// Example 2: Search functionality
async function searchProducts(query: string) {
  try {
    const results = await sdk.products.search({
      q: query,
      min_price: 10,
      max_price: 100
    });
    
    console.log(`Found ${results.data?.entries.length || 0} products for "${query}"`);
    return results.data?.entries || [];
  } catch (error) {
    console.error('Search failed:', error);
  }
}

// Example 3: Cart management
function setupCart() {
  // Listen to cart events
  sdk.on('cart:item:added', ({ item, cart }) => {
    console.log('Added to cart:', item);
    updateCartDisplay();
  });

  sdk.on('cart:item:updated', ({ item, cart }) => {
    console.log('Cart item updated:', item);
    updateCartDisplay();
  });

  sdk.on('cart:item:removed', ({ itemId, cart }) => {
    console.log('Removed from cart:', itemId);
    updateCartDisplay();
  });

  // Add item to cart (requires a product object)
  const sampleProduct = {
    id: 123,
    name: 'Sample Product',
    description: 'A sample product for testing',
    price: 29.99,
    currency_code: 'USD',
    status: 1,
    merchant_id: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  sdk.cart.addItem(sampleProduct, 2);

  // Update quantity
  const cart = sdk.cart.get();
  if (cart.items.length > 0) {
    sdk.cart.updateItemQuantity(cart.items[0].id, 3);
  }
}

// Example 4: Wishlist management
function setupWishlist() {
  // Listen to wishlist events
  sdk.on('wishlist:item:added', ({ item, wishlist }) => {
    console.log('Added to wishlist:', item);
    updateWishlistDisplay();
  });

  sdk.on('wishlist:item:removed', ({ itemId, wishlist }) => {
    console.log('Removed from wishlist:', itemId);
    updateWishlistDisplay();
  });

  // Add to wishlist (requires a product object)
  const sampleProduct = {
    id: 456,
    name: 'Another Product',
    description: 'Another sample product',
    price: 19.99,
    currency_code: 'USD',
    status: 1,
    merchant_id: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  sdk.wishlist.addItem(sampleProduct);

  // Toggle wishlist status by removing and adding
  if (sdk.wishlist.hasProduct(456)) {
    sdk.wishlist.removeProduct(456);
  } else {
    sdk.wishlist.addItem(sampleProduct);
  }

  // Check if item is in wishlist
  const isInWishlist = sdk.wishlist.hasProduct(456);
  console.log('Product in wishlist:', isInWishlist);
}

// Example 5: Customer authentication
async function handleAuth() {
  try {
    // Login
    const response = await sdk.auth.login({
      email: 'customer@example.com',
      password: 'password123'
    });
    
    console.log('Logged in:', response.data?.customer);

    // Update profile
    await sdk.auth.updateProfile({
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '+1234567890'
    });

    console.log('Profile updated successfully');

  } catch (error) {
    console.error('Authentication failed:', error);
  }
}

// Example 6: Order management
async function createOrder() {
  try {
    const cart = sdk.cart.get();
    
    if (cart.items.length === 0) {
      console.log('Cart is empty, cannot create order');
      return;
    }

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

    console.log('Order created:', order.result);

    // Clear cart after successful order
    sdk.cart.clear();

  } catch (error) {
    console.error('Order creation failed:', error);
  }
}

// Example 7: Custom API calls
async function customRequests() {
  try {
    // Submit a product review using generic resource
    await sdk.generic.post('/reviews', {
      parent_id: 123,
      rating: 5,
      body: 'Excellent product!',
      customer_name: 'John Doe'
    });

    // Get custom merchant data
    const customData = await sdk.generic.get('/merchant/custom-info');
    console.log('Custom data:', customdata.entries);

  } catch (error) {
    console.error('Custom request failed:', error);
  }
}

// Helper functions for UI updates
function updateCartDisplay() {
  const cart = sdk.cart.get();
  const total = sdk.cart.getSubtotal();
  
  console.log(`Cart: ${cart.items.length} items, Total: $${total.toFixed(2)}`);
  
  // Update your UI here
  // e.g., document.getElementById('cart-count').textContent = cart.items.length.toString();
}

function updateWishlistDisplay() {
  const wishlist = sdk.wishlist.get();
  
  console.log(`Wishlist: ${wishlist.items.length} items`);
  
  // Update your UI here
  // e.g., document.getElementById('wishlist-count').textContent = wishlist.items.length.toString();
}

// Example 8: Get merchant information
async function getMerchantInfo() {
  try {
    // Get merchant fees
    const fees = await sdk.merchants.getFees('demo-merchant', {
      currency: 'USD',
      total: 100
    });
    console.log('Merchant fees:', fees.data);
    
    // Get merchant tokens
    const tokens = await sdk.merchants.getTokens('demo-merchant');
    console.log('Merchant tokens:', tokens.data);
    
    return fees.data;
  } catch (error) {
    console.error('Failed to get merchant info:', error);
  }
}

// Example 9: Get merchant products
async function getMerchantProducts() {
  try {
    const products = await sdk.merchants.getProducts('demo-merchant', {
      limit: 10,
      page: 1
    });
    console.log('Merchant products:', products.data?.entries.length || 0);
    
    return products.data?.entries || [];
  } catch (error) {
    console.error('Failed to get merchant products:', error);
  }
}

// Main function to run examples
async function runExamples() {
  console.log('Starting Inkress SDK examples...');
  
  try {
    // Load merchant info
    await getMerchantInfo();
    
    // Get merchant products
    await getMerchantProducts();
    
    // Load initial data
    await loadProducts();
    
    // Setup cart and wishlist
    setupCart();
    setupWishlist();
    
    // Search example
    await searchProducts('electronics');
    
    // Authentication example (uncomment if you have valid credentials)
    // await handleAuth();
    
    console.log('Examples completed!');
  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  runExamples().catch(console.error);
}

export {
  loadProducts,
  searchProducts,
  setupCart,
  setupWishlist,
  handleAuth,
  createOrder,
  customRequests,
  getMerchantInfo,
  getMerchantProducts,
  runExamples
};
