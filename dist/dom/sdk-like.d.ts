/**
 * The narrow slice of the SDK the DOM kit depends on. Declared structurally so the
 * kit couples to an interface, not to the concrete `InkressStorefrontSDK` class
 * (and so tests can pass a light fake).
 */
import type { Cart, CartItem, Product, StorefrontEvents, ApiResponse } from '../types';
import type { CartCheckoutOptions } from '../resources/cart';
import type { CreateCheckoutSessionResponseData } from '../types/checkout';
export interface CartLike {
    get(): Cart;
    addItem(product: Product, quantity?: number): Cart;
    updateItemQuantity(itemId: string, quantity: number): Cart;
    removeProduct(productId: number): Cart;
    getItem(productId: number): CartItem | undefined;
    clear(): Cart;
    checkout(options?: CartCheckoutOptions): Promise<ApiResponse<CreateCheckoutSessionResponseData>>;
}
export interface StorefrontLike {
    cart: CartLike;
    on<K extends keyof StorefrontEvents>(event: K, handler: (data: StorefrontEvents[K]) => void): () => void;
}
//# sourceMappingURL=sdk-like.d.ts.map