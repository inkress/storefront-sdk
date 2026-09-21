import { type StorefrontConfig } from './client';
import { EventEmitter } from './events';
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
import { CheckoutResource } from './resources/checkout';
import { AddressesResource } from './resources/addresses';
export * from './types/checkout';
export { CheckoutResource } from './resources/checkout';
export type { CheckoutInitiator, CartCheckoutOptions } from './resources/cart';
export * from './types';
export { InkressApiError } from './client';
export type { HttpClient, RequestOptions } from './client';
export { buildPaymentUrl, encodeJSONToB64, decodeB64ToJSON, generateRandomId, validatePaymentOptions, type PaymentURLOptions, type PaymentCustomer, } from './utils/payment';
import { type PaymentURLOptions as _PaymentURLOptions } from './utils/payment';
export * from './types/resources';
export { processQuery, QueryBuilder, type QueryParams, type RangeQuery, type StringQuery, type DateQuery, type JsonQueryParams, } from './utils/query-transformer';
export { ProductQueryBuilder, CategoryQueryBuilder, OrderQueryBuilder, ReviewQueryBuilder, type Queryable, } from './utils/query-builders';
export { getProductCustomFields, getProductAttributes, getProductCustomerInputs, computeProductUnitPrice, isProductInStock, getProductAvailableStock, toProductStock, normalizeFacetRow, } from './utils/variants';
export { AddressesResource } from './resources/addresses';
export { mountStorefront } from './dom';
export type { StorefrontDomOptions, StorefrontDomHandle, StorefrontCartApi, CartAddInput, FleekLine, HookFields, IkCartDetail, } from './dom';
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
export declare class InkressStorefrontSDK {
    private client;
    private storageManager;
    private eventEmitter;
    readonly merchants: MerchantsResource;
    readonly products: ProductsResource;
    readonly categories: CategoriesResource;
    readonly auth: AuthResource;
    readonly orders: OrdersResource;
    readonly cart: CartResource;
    readonly wishlist: WishlistResource;
    readonly generic: GenericResource;
    readonly generics: GenericsResource;
    readonly reviews: ReviewsResource;
    readonly shipping: ShippingResource;
    readonly files: FilesResource;
    readonly checkout: CheckoutResource;
    readonly addresses: AddressesResource;
    constructor(config?: StorefrontConfig);
    /**
     * Update SDK configuration
     */
    updateConfig(newConfig: Partial<StorefrontConfig>): void;
    /**
     * Set authentication token for customer-specific requests
     */
    setAuthToken(token: string): void;
    /**
     * Clear authentication token
     */
    clearAuthToken(): void;
    /**
     * Set user ID for remote storage features (like wishlist sync)
     */
    setUserId(userId: number): void;
    /**
     * Set merchant username
     */
    setMerchant(username: string): void;
    /**
     * Get current configuration (without sensitive data)
     */
    getConfig(): Omit<StorefrontConfig, 'authToken'>;
    /**
     * Listen to SDK events
     */
    on: EventEmitter['on'];
    /**
     * Remove event listener
     */
    off: EventEmitter['off'];
    /**
     * Listen to event once
     */
    once: EventEmitter['once'];
    /**
     * Emit an event (mainly for internal use)
     */
    emit: EventEmitter['emit'];
    /**
     * Remove all event listeners
     */
    removeAllListeners: EventEmitter['removeAllListeners'];
    /**
     * Clear all local storage data (cart, wishlist, etc.)
     */
    clearLocalData(): boolean;
    /**
     * Get all local storage keys
     */
    getLocalStorageKeys(): string[];
    /**
     * Initialize for a specific merchant (convenience method)
     */
    static forMerchant(merchantUsername: string, config?: Omit<StorefrontConfig, 'merchantUsername'>): InkressStorefrontSDK;
    /**
     * Create SDK instance with authentication
     */
    static withAuth(authToken: string, config?: Omit<StorefrontConfig, 'authToken'>): InkressStorefrontSDK;
    /**
     * Create SDK instance for specific merchant with authentication
     */
    static forMerchantWithAuth(merchantUsername: string, authToken: string, config?: Omit<StorefrontConfig, 'merchantUsername' | 'authToken'>): InkressStorefrontSDK;
}
/**
 * Legacy v0.0.1 `Inkress` class. Preserved so existing `createPaymentUrl`
 * users keep working after upgrading. Prefer {@link InkressStorefrontSDK} and
 * its checkout resource for new code.
 *
 * @deprecated Use {@link InkressStorefrontSDK}.
 */
export declare class Inkress {
    private clientKey;
    private token;
    private siteBaseUrl;
    constructor({ clientKey, token, mode, }?: {
        clientKey?: string;
        token?: string;
        mode?: 'live' | 'test';
    });
    setClient(clientKey: string): void;
    setToken(token: string): void;
    generateRandomId(): string;
    createPaymentUrl(options: _PaymentURLOptions): string;
}
export { InkressStorefrontSDK as default };
//# sourceMappingURL=index.d.ts.map