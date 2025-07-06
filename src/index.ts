import { HttpClient, type StorefrontConfig } from './client';
import { StorageManager } from './storage';
import { EventEmitter } from './events';

// Import resources
import { MerchantsResource } from './resources/merchants';
import { ProductsResource } from './resources/products';
import { CategoriesResource } from './resources/categories';
import { AuthResource } from './resources/auth';
import { OrdersResource } from './resources/orders';
import { CartResource } from './resources/cart';
import { WishlistResource } from './resources/wishlist';
import { GenericResource } from './resources/generic';
import { GenericsResource } from './resources/generics';
import { ReviewsResource } from './resources/reviews';
import { ShippingResource } from './resources/shipping';
import { FilesResource } from './resources/files';

// Re-export types for convenience
export * from './types';
export { InkressApiError } from './client';

/**
 * Main Inkress Storefront SDK class
 * 
 * @example
 * ```typescript
 * import { InkressStorefrontSDK } from '@inkress/storefront-sdk';
 * 
 * // Basic initialization
 * const inkress = new InkressStorefrontSDK({
 *   merchantUsername: 'your-merchant-username'
 * });
 * 
 * // With custom configuration
 * const inkress = new InkressStorefrontSDK({
 *   endpoint: 'https://api.inkress.com',
 *   merchantUsername: 'your-merchant-username',
 *   authToken: 'customer-auth-token', // For authenticated requests
 * });
 * 
 * // Get merchant info
 * const merchant = await inkress.merchants.getByUsername('merchant-username');
 * 
 * // Search products
 * const products = await inkress.products.search({ q: 'electronics' });
 * 
 * // Browse categories
 * const categories = await inkress.categories.list();
 * const categoryTree = await inkress.categories.getCategoryTree();
 * 
 * // Add to cart
 * inkress.cart.addItem(product, 2);
 * 
 * // Submit a product review
 * await inkress.reviews.create({
 *   parent_id: 123,
 *   rating: 5,
 *   body: 'Great product! Exactly what I was looking for.'
 * });
 * 
 * // Get product reviews
 * const reviews = await inkress.reviews.getByProduct(123);
 * 
 * // Get available shipping methods
 * const methods = await inkress.shipping.listMethods();
 * 
 * // Find cheapest shipping option
 * const cheapest = await inkress.shipping.getCheapestMethod();
 * 
 * // Store custom data using generics
 * await inkress.generics.create({
 *   key: 'user-preferences',
 *   kind: 1,
 *   data: { theme: 'dark', language: 'en' }
 * });
 * 
 * // Upload and manage files
 * const fileInput = document.querySelector('input[type="file"]');
 * const uploadResult = await inkress.files.upload(fileInput.files[0], {
 *   tags: ['product-image'],
 *   folder: 'products'
 * });
 * 
 * // Get optimized image URL
 * const optimizedUrl = inkress.files.getOptimizedUrl(uploadResult.result.file, 800, 600);
 * 
 * // Listen to cart events
 * inkress.on('cart:item:added', ({ item, cart }) => {
 *   console.log('Item added to cart:', item);
 * });
 * ```
 */
export class InkressStorefrontSDK {
  private client: HttpClient;
  private storageManager: StorageManager;
  private eventEmitter: EventEmitter;

  // Resource instances
  public readonly merchants: MerchantsResource;
  public readonly products: ProductsResource;
  public readonly categories: CategoriesResource;
  public readonly auth: AuthResource;
  public readonly orders: OrdersResource;
  public readonly cart: CartResource;
  public readonly wishlist: WishlistResource;
  public readonly generic: GenericResource;
  public readonly generics: GenericsResource;
  public readonly reviews: ReviewsResource;
  public readonly shipping: ShippingResource;
  public readonly files: FilesResource;

  constructor(config: StorefrontConfig = {}) {
    // Initialize core components
    this.client = new HttpClient(config);
    this.storageManager = new StorageManager(
      config.merchantUsername ? `inkress-${config.merchantUsername}` : 'inkress'
    );
    this.eventEmitter = new EventEmitter();

    // Initialize resources
    this.merchants = new MerchantsResource(this.client);
    this.products = new ProductsResource(this.client);
    this.categories = new CategoriesResource(this.client);
    this.auth = new AuthResource(this.client);
    this.orders = new OrdersResource(this.client);
    this.reviews = new ReviewsResource(this.client);
    this.shipping = new ShippingResource(this.client);
    this.files = new FilesResource(this.client);
    
    // Initialize cart and wishlist with storage, events, and client
    this.cart = new CartResource(
      this.storageManager.createStorage('cart'),
      this.eventEmitter,
      this.client
    );
    
    this.generic = new GenericResource(this.client);
    this.generics = new GenericsResource(this.client);
    
    this.wishlist = new WishlistResource(
      this.storageManager.createStorage('wishlist'),
      this.eventEmitter,
      this.generic
    );
  }

  /**
   * Update SDK configuration
   */
  updateConfig(newConfig: Partial<StorefrontConfig>): void {
    this.client.updateConfig(newConfig);
    
    // Update storage prefix if merchant username changed
    if (newConfig.merchantUsername) {
      this.storageManager = new StorageManager(`inkress-${newConfig.merchantUsername}`);
      
      // Reinitialize cart and wishlist with new storage
      const cartResource = new CartResource(
        this.storageManager.createStorage('cart'),
        this.eventEmitter,
        this.client
      );
      const wishlistResource = new WishlistResource(
        this.storageManager.createStorage('wishlist'),
        this.eventEmitter,
        this.generic
      );
      
      // Replace the resources (this is a bit hacky but maintains the public API)
      Object.assign(this.cart, cartResource);
      Object.assign(this.wishlist, wishlistResource);
    }
  }

  /**
   * Set authentication token for customer-specific requests
   */
  setAuthToken(token: string): void {
    this.updateConfig({ authToken: token });
  }

  /**
   * Clear authentication token
   */
  clearAuthToken(): void {
    this.updateConfig({ authToken: '' });
  }

  /**
   * Set user ID for remote storage features (like wishlist sync)
   */
  setUserId(userId: number): void {
    this.wishlist.setUserId(userId);
  }

  /**
   * Set merchant username
   */
  setMerchant(username: string): void {
    this.updateConfig({ merchantUsername: username });
  }

  /**
   * Get current configuration (without sensitive data)
   */
  getConfig(): Omit<StorefrontConfig, 'authToken'> {
    return this.client.getConfig();
  }

  // Event system delegation
  
  /**
   * Listen to SDK events
   */
  on: EventEmitter['on'] = (...args) => this.eventEmitter.on(...args);

  /**
   * Remove event listener
   */
  off: EventEmitter['off'] = (...args) => this.eventEmitter.off(...args);

  /**
   * Listen to event once
   */
  once: EventEmitter['once'] = (...args) => this.eventEmitter.once(...args);

  /**
   * Emit an event (mainly for internal use)
   */
  emit: EventEmitter['emit'] = (...args) => this.eventEmitter.emit(...args);

  /**
   * Remove all event listeners
   */
  removeAllListeners: EventEmitter['removeAllListeners'] = (...args) => 
    this.eventEmitter.removeAllListeners(...args);

  // Utility methods

  /**
   * Clear all local storage data (cart, wishlist, etc.)
   */
  clearLocalData(): boolean {
    return this.storageManager.clearAll();
  }

  /**
   * Get all local storage keys
   */
  getLocalStorageKeys(): string[] {
    return this.storageManager.getAllKeys();
  }

  /**
   * Initialize for a specific merchant (convenience method)
   */
  static forMerchant(merchantUsername: string, config: Omit<StorefrontConfig, 'merchantUsername'> = {}): InkressStorefrontSDK {
    return new InkressStorefrontSDK({
      ...config,
      merchantUsername
    });
  }

  /**
   * Create SDK instance with authentication
   */
  static withAuth(authToken: string, config: Omit<StorefrontConfig, 'authToken'> = {}): InkressStorefrontSDK {
    return new InkressStorefrontSDK({
      ...config,
      authToken
    });
  }

  /**
   * Create SDK instance for specific merchant with authentication
   */
  static forMerchantWithAuth(
    merchantUsername: string, 
    authToken: string, 
    config: Omit<StorefrontConfig, 'merchantUsername' | 'authToken'> = {}
  ): InkressStorefrontSDK {
    return new InkressStorefrontSDK({
      ...config,
      merchantUsername,
      authToken
    });
  }
}
