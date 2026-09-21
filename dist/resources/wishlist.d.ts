import type { BrowserStorage } from '../storage';
import type { EventEmitter } from '../events';
import type { GenericsResource } from './generics';
import type { Wishlist, WishlistItem, Product } from '../types';
/**
 * Wishlist resource for managing customer wishlist with remote and local storage
 */
export declare class WishlistResource {
    private storage;
    private eventEmitter;
    private generics;
    private readonly wishlistKind;
    private userId?;
    constructor(storage: BrowserStorage<Wishlist>, eventEmitter: EventEmitter, generics: GenericsResource, userId?: number);
    /**
     * Set (or clear, when called with no argument) the user ID used for remote
     * wishlist sync.
     */
    setUserId(userId?: number): void;
    /**
     * Get current wishlist (tries remote first, falls back to local)
     */
    get(): Promise<Wishlist>;
    /**
     * Get wishlist synchronously from local storage only
     */
    getLocal(): Wishlist;
    /**
     * Add product to wishlist
     */
    addItem(product: Product): Promise<Wishlist>;
    /**
     * Remove item from wishlist
     */
    removeItem(itemId: string): Promise<Wishlist>;
    /**
     * Remove product from wishlist (by product ID)
     */
    removeProduct(productId: number): Promise<Wishlist>;
    /**
     * Toggle product in wishlist (add if not present, remove if present)
     */
    toggleProduct(product: Product): Promise<{
        wishlist: Wishlist;
        added: boolean;
    }>;
    /**
     * Clear entire wishlist
     */
    clear(): Promise<Wishlist>;
    /**
     * Check if product is in wishlist
     */
    hasProduct(productId: number): Promise<boolean>;
    /**
     * Get specific item by product ID
     */
    getItem(productId: number): Promise<WishlistItem | undefined>;
    /**
     * Check if wishlist is empty
     */
    isEmpty(): Promise<boolean>;
    /**
     * Get wishlist item count
     */
    getItemCount(): Promise<number>;
    /**
     * Get all products in wishlist
     */
    getProducts(): Promise<Product[]>;
    /**
     * Sort wishlist items
     */
    sort(compareFn?: (a: WishlistItem, b: WishlistItem) => number): Promise<Wishlist>;
    /**
     * Sort by product name
     */
    sortByName(ascending?: boolean): Promise<Wishlist>;
    /**
     * Sort by product price
     */
    sortByPrice(ascending?: boolean): Promise<Wishlist>;
    /**
     * Sort by date added
     */
    sortByDateAdded(ascending?: boolean): Promise<Wishlist>;
    /**
     * Sync wishlist from remote storage
     */
    syncFromRemote(): Promise<Wishlist>;
    /**
     * Force sync local wishlist to remote storage
     */
    syncToRemote(): Promise<void>;
    /**
     * Check if product is in wishlist (local storage only)
     */
    hasProductLocal(productId: number): boolean;
    /**
     * Get specific item by product ID (local storage only)
     */
    getItemLocal(productId: number): WishlistItem | undefined;
    /**
     * Check if wishlist is empty (local storage only)
     */
    isEmptyLocal(): boolean;
    /**
     * Get wishlist item count (local storage only)
     */
    getItemCountLocal(): number;
    /**
     * Get all products in wishlist (local storage only)
     */
    getProductsLocal(): Product[];
    /**
     * Get remote wishlist from the `/generics` key-value store.
     */
    private getRemoteWishlist;
    /**
     * Save wishlist to the `/generics` key-value store (upsert by key).
     */
    private saveToRemote;
    /**
     * Create empty wishlist
     */
    private createEmptyWishlist;
    /**
     * Update wishlist metadata
     */
    private updateWishlistMeta;
    /**
     * Generate unique item ID
     */
    private generateItemId;
}
//# sourceMappingURL=wishlist.d.ts.map