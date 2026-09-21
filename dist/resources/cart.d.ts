import type { BrowserStorage } from '../storage';
import type { EventEmitter } from '../events';
import type { HttpClient } from '../client';
import type { Cart, CartItem, Product, ApiResponse, PaginatedResponse } from '../types';
import type { CreateCheckoutSessionInput, CreateCheckoutSessionResponseData, CheckoutCustomer } from '../types/checkout';
/**
 * The slice of the checkout resource the cart needs to start a session.
 * Declared structurally to avoid a cart <-> checkout import cycle.
 */
export interface CheckoutInitiator {
    createSession(input: CreateCheckoutSessionInput): Promise<ApiResponse<CreateCheckoutSessionResponseData>>;
}
/** Options for turning the local cart into a checkout session. */
export interface CartCheckoutOptions {
    customer?: CheckoutCustomer;
    /** Defaults to the currency of the first cart item. */
    currency_code?: string;
    title?: string;
    reference_id?: string;
    data?: CreateCheckoutSessionInput['data'];
}
export interface RemoteCart {
    id: string;
    user_id?: number;
    session_id?: string;
    data: CartData;
    created_at: string;
    updated_at: string;
}
export interface CartData {
    total: number;
    items: CartLineItem[];
    quantity: number;
}
export interface CartLineItem {
    product_id: number;
    variant_id: number;
    quantity: number;
    unit_price: number;
    product?: Product;
}
export interface CartInput {
    user_id?: number;
    session_id?: string;
    data: CartDataInput;
}
export interface CartDataInput {
    total: number;
    items: CartLineInput[];
    quantity: number;
}
export interface CartLineInput {
    product_id: number;
    variant_id: number;
    quantity: number;
    unit_price: number;
}
export interface ListCartsParams {
    page?: number;
    page_size?: number;
    user_id?: number;
    session_id?: string;
    sort?: 'created_at' | 'updated_at' | 'user_id';
    order?: 'asc' | 'desc';
}
/**
 * Cart resource for managing shopping cart with local storage and remote sync
 */
export declare class CartResource {
    private storage;
    private eventEmitter;
    private client;
    private checkoutResource?;
    constructor(storage: BrowserStorage<Cart>, eventEmitter: EventEmitter, client: HttpClient);
    /** Wire the checkout resource so {@link checkout} can open a session. */
    setCheckout(checkout: CheckoutInitiator): void;
    /**
     * Build the checkout-session input from the current cart line items.
     * Useful if you want to inspect/augment the payload before paying.
     *
     * `currency_code` defaults to the first item's product currency, falling back
     * to 'JMD' when absent. If the cart mixes currencies you MUST pass
     * `currency_code` explicitly — the subtotal is a plain numeric sum and is only
     * meaningful within a single currency.
     */
    buildCheckoutInput(options?: CartCheckoutOptions): CreateCheckoutSessionInput;
    /**
     * Start checkout for the current cart: builds the order payload from the line
     * items and opens a checkout session (returns the hosted-frame fields).
     * Emits `checkout:started`. Requires the SDK-wired checkout resource.
     */
    checkout(options?: CartCheckoutOptions): Promise<ApiResponse<CreateCheckoutSessionResponseData>>;
    /**
     * Get current cart
     */
    get(): Cart;
    /**
     * Add product to cart
     */
    addItem(product: Product, quantity?: number): Cart;
    /**
     * Remove product from cart by product ID
     */
    removeProduct(productId: number): Cart;
    /**
     * Update item quantity
     */
    updateItemQuantity(itemId: string, quantity: number): Cart;
    /**
     * Remove item from cart
     */
    removeItem(itemId: string): Cart;
    /**
     * Clear all items from cart
     */
    clear(): Cart;
    /**
     * Get total number of items in cart
     */
    getItemCount(): number;
    /**
     * Get unique item count (number of different products)
     */
    getUniqueItemCount(): number;
    /**
     * Check if product is in cart
     */
    hasProduct(productId: number): boolean;
    /**
     * Get specific item by product ID
     */
    getItem(productId: number): CartItem | undefined;
    /**
     * Check if cart is empty
     */
    isEmpty(): boolean;
    /**
     * Calculate cart subtotal
     */
    getSubtotal(): number;
    /**
     * Sync local cart to remote server (requires authentication)
     */
    syncToRemote(): Promise<ApiResponse<RemoteCart>>;
    /**
     * Load cart from remote server (requires authentication)
     */
    loadFromRemote(cartId: string): Promise<ApiResponse<Cart>>;
    /**
     * List remote carts (requires authentication)
     */
    listRemoteCarts(params?: ListCartsParams): Promise<ApiResponse<PaginatedResponse<RemoteCart>>>;
    /**
     * Update remote cart
     */
    updateRemoteCart(cartId: string, input: CartInput): Promise<ApiResponse<RemoteCart>>;
    /**
     * Delete remote cart
     */
    deleteRemoteCart(cartId: string): Promise<ApiResponse<void>>;
    /**
     * Add item to remote cart by updating the cart data
     */
    addItemToRemoteCart(cartId: string, productId: number, variantId: number, quantity: number, price: number): Promise<ApiResponse<RemoteCart>>;
    /**
     * Remove item from remote cart by updating the cart data
     */
    removeItemFromRemoteCart(cartId: string, productId: number, variantId: number): Promise<ApiResponse<RemoteCart>>;
    /**
     * Update item quantity in remote cart
     */
    updateItemQuantityInRemoteCart(cartId: string, productId: number, variantId: number, quantity: number): Promise<ApiResponse<RemoteCart>>;
    /**
     * Create empty cart structure
     */
    private createEmptyCart;
    /**
     * Update cart totals and metadata
     */
    private updateCartTotals;
    /**
     * Generate unique cart ID
     */
    private generateCartId;
    /**
     * Generate unique item ID
     */
    private generateItemId;
    /**
     * Generate session ID for anonymous carts
     */
    private generateSessionId;
}
//# sourceMappingURL=cart.d.ts.map