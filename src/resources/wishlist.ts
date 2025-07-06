import type { BrowserStorage } from '../storage';
import type { EventEmitter } from '../events';
import type { GenericResource } from './generic';
import type {
  Wishlist,
  WishlistItem,
  Product,
  ApiResponse,
  Generic,
  GenericInput,
} from '../types';

/**
 * Wishlist resource for managing customer wishlist with remote and local storage
 */
export class WishlistResource {
  private storage: BrowserStorage<Wishlist>;
  private eventEmitter: EventEmitter;
  private generic: GenericResource;
  private readonly wishlistKind = 2; // Kind identifier for wishlist data
  private userId?: number;

  constructor(
    storage: BrowserStorage<Wishlist>, 
    eventEmitter: EventEmitter,
    generic: GenericResource,
    userId?: number
  ) {
    this.storage = storage;
    this.eventEmitter = eventEmitter;
    this.generic = generic;
    this.userId = userId;
  }

  /**
   * Set user ID for remote storage
   */
  setUserId(userId: number): void {
    this.userId = userId;
  }

  /**
   * Get current wishlist (tries remote first, falls back to local)
   */
  async get(): Promise<Wishlist> {
    try {
      // Try to get from remote storage first
      const remoteWishlist = await this.getRemoteWishlist();
      if (remoteWishlist) {
        // Update local storage with remote data
        this.storage.set(remoteWishlist);
        return remoteWishlist;
      }
    } catch (error) {
      console.warn('Failed to fetch remote wishlist, using local storage:', error);
    }

    // Fall back to local storage
    const localWishlist = this.storage.get();
    if (!localWishlist) {
      return this.createEmptyWishlist();
    }
    return localWishlist;
  }

  /**
   * Get wishlist synchronously from local storage only
   */
  getLocal(): Wishlist {
    const wishlist = this.storage.get();
    if (!wishlist) {
      return this.createEmptyWishlist();
    }
    return wishlist;
  }

  /**
   * Add product to wishlist
   */
  async addItem(product: Product): Promise<Wishlist> {
    const wishlist = await this.get();
    
    // Check if product is already in wishlist
    if (await this.hasProduct(product.id)) {
      return wishlist; // Already exists, no change
    }

    const newItem: WishlistItem = {
      id: this.generateItemId(),
      product,
      added_at: new Date().toISOString(),
    };

    wishlist.items.push(newItem);
    const updatedWishlist = this.updateWishlistMeta(wishlist);
    
    // Save to both local and remote storage
    this.storage.set(updatedWishlist);
    await this.saveToRemote(updatedWishlist);

    this.eventEmitter.emit('wishlist:item:added', { 
      item: newItem, 
      wishlist: updatedWishlist 
    });

    return updatedWishlist;
  }

  /**
   * Remove item from wishlist
   */
  async removeItem(itemId: string): Promise<Wishlist> {
    const wishlist = await this.get();
    wishlist.items = wishlist.items.filter(item => item.id !== itemId);
    
    const updatedWishlist = this.updateWishlistMeta(wishlist);
    
    // Save to both local and remote storage
    this.storage.set(updatedWishlist);
    await this.saveToRemote(updatedWishlist);

    this.eventEmitter.emit('wishlist:item:removed', { 
      itemId, 
      wishlist: updatedWishlist 
    });

    return updatedWishlist;
  }

  /**
   * Remove product from wishlist (by product ID)
   */
  async removeProduct(productId: number): Promise<Wishlist> {
    const wishlist = await this.get();
    const itemToRemove = wishlist.items.find(item => item.product.id === productId);
    
    if (itemToRemove) {
      return this.removeItem(itemToRemove.id);
    }
    
    return wishlist;
  }

  /**
   * Toggle product in wishlist (add if not present, remove if present)
   */
  async toggleProduct(product: Product): Promise<{ wishlist: Wishlist; added: boolean }> {
    if (await this.hasProduct(product.id)) {
      return {
        wishlist: await this.removeProduct(product.id),
        added: false
      };
    } else {
      return {
        wishlist: await this.addItem(product),
        added: true
      };
    }
  }

  /**
   * Clear entire wishlist
   */
  async clear(): Promise<Wishlist> {
    const emptyWishlist = this.createEmptyWishlist();
    
    // Save to both local and remote storage
    this.storage.set(emptyWishlist);
    await this.saveToRemote(emptyWishlist);

    this.eventEmitter.emit('wishlist:cleared', { wishlist: emptyWishlist });

    return emptyWishlist;
  }

  /**
   * Check if product is in wishlist
   */
  async hasProduct(productId: number): Promise<boolean> {
    const wishlist = await this.get();
    return wishlist.items.some(item => item.product.id === productId);
  }

  /**
   * Get specific item by product ID
   */
  async getItem(productId: number): Promise<WishlistItem | undefined> {
    const wishlist = await this.get();
    return wishlist.items.find(item => item.product.id === productId);
  }

  /**
   * Check if wishlist is empty
   */
  async isEmpty(): Promise<boolean> {
    const wishlist = await this.get();
    return wishlist.items.length === 0;
  }

  /**
   * Get wishlist item count
   */
  async getItemCount(): Promise<number> {
    const wishlist = await this.get();
    return wishlist.items.length;
  }

  /**
   * Get all products in wishlist
   */
  async getProducts(): Promise<Product[]> {
    const wishlist = await this.get();
    return wishlist.items.map(item => item.product);
  }

  /**
   * Sort wishlist items
   */
  async sort(compareFn?: (a: WishlistItem, b: WishlistItem) => number): Promise<Wishlist> {
    const wishlist = await this.get();
    
    if (compareFn) {
      wishlist.items.sort(compareFn);
    } else {
      // Default sort by added_at (newest first)
      wishlist.items.sort((a, b) => 
        new Date(b.added_at).getTime() - new Date(a.added_at).getTime()
      );
    }

    const updatedWishlist = this.updateWishlistMeta(wishlist);
    
    // Save to both local and remote storage
    this.storage.set(updatedWishlist);
    await this.saveToRemote(updatedWishlist);

    return updatedWishlist;
  }

  /**
   * Sort by product name
   */
  async sortByName(ascending = true): Promise<Wishlist> {
    return this.sort((a, b) => {
      const comparison = a.product.title.localeCompare(b.product.title);
      return ascending ? comparison : -comparison;
    });
  }

  /**
   * Sort by product price
   */
  async sortByPrice(ascending = true): Promise<Wishlist> {
    return this.sort((a, b) => {
      const comparison = a.product.price - b.product.price;
      return ascending ? comparison : -comparison;
    });
  }

  /**
   * Sort by date added
   */
  async sortByDateAdded(ascending = false): Promise<Wishlist> {
    return this.sort((a, b) => {
      const comparison = new Date(a.added_at).getTime() - new Date(b.added_at).getTime();
      return ascending ? comparison : -comparison;
    });
  }

  /**
   * Sync wishlist from remote storage
   */
  async syncFromRemote(): Promise<Wishlist> {
    try {
      const remoteWishlist = await this.getRemoteWishlist();
      if (remoteWishlist) {
        this.storage.set(remoteWishlist);
        return remoteWishlist;
      }
    } catch (error) {
      console.warn('Failed to sync from remote:', error);
    }
    
    return this.getLocal();
  }

  /**
   * Force sync local wishlist to remote storage
   */
  async syncToRemote(): Promise<void> {
    const localWishlist = this.getLocal();
    await this.saveToRemote(localWishlist);
  }

  // Synchronous methods for backward compatibility (local storage only)

  /**
   * Check if product is in wishlist (local storage only)
   */
  hasProductLocal(productId: number): boolean {
    const wishlist = this.getLocal();
    return wishlist.items.some(item => item.product.id === productId);
  }

  /**
   * Get specific item by product ID (local storage only)
   */
  getItemLocal(productId: number): WishlistItem | undefined {
    const wishlist = this.getLocal();
    return wishlist.items.find(item => item.product.id === productId);
  }

  /**
   * Check if wishlist is empty (local storage only)
   */
  isEmptyLocal(): boolean {
    const wishlist = this.getLocal();
    return wishlist.items.length === 0;
  }

  /**
   * Get wishlist item count (local storage only)
   */
  getItemCountLocal(): number {
    const wishlist = this.getLocal();
    return wishlist.items.length;
  }

  /**
   * Get all products in wishlist (local storage only)
   */
  getProductsLocal(): Product[] {
    const wishlist = this.getLocal();
    return wishlist.items.map(item => item.product);
  }

  /**
   * Get remote wishlist from generic storage
   */
  private async getRemoteWishlist(): Promise<Wishlist | null> {
    if (!this.userId) {
      return null;
    }

    try {
      const response = await this.generic.get<Generic[]>(
        '/generis',
        {
          key: `wishlist_${this.userId}`,
          kind: this.wishlistKind,
          limit: 1
        }
      );

      if (response.state === 'ok' && response.result && response.data.length > 0) {
        return response.data[0].data as Wishlist;
      }
    } catch (error) {
      console.warn('Failed to fetch remote wishlist:', error);
    }

    return null;
  }

  /**
   * Save wishlist to remote storage
   */
  private async saveToRemote(wishlist: Wishlist): Promise<void> {
    if (!this.userId) {
      return;
    }

    try {
      const wishlistData: GenericInput = {
        key: `wishlist_${this.userId}`,
        kind: this.wishlistKind,
        data: wishlist
      };

      await this.generic.post('/generis', wishlistData);
    } catch (error) {
      console.warn('Failed to save wishlist to remote:', error);
    }
  }

  /**
   * Create empty wishlist
   */
  private createEmptyWishlist(): Wishlist {
    return {
      items: [],
      total_items: 0,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Update wishlist metadata
   */
  private updateWishlistMeta(wishlist: Wishlist): Wishlist {
    wishlist.total_items = wishlist.items.length;
    wishlist.updated_at = new Date().toISOString();
    
    return wishlist;
  }

  /**
   * Generate unique item ID
   */
  private generateItemId(): string {
    return `wishlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
