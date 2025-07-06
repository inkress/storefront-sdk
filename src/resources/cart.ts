import type { BrowserStorage } from '../storage';
import type { EventEmitter } from '../events';
import type { HttpClient } from '../client';
import type {
  Cart,
  CartItem,
  Product,
  ApiResponse,
  PaginatedResponse,
} from '../types';

// Remote cart types for API
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
export class CartResource {
  private storage: BrowserStorage<Cart>;
  private eventEmitter: EventEmitter;
  private client: HttpClient;

  constructor(storage: BrowserStorage<Cart>, eventEmitter: EventEmitter, client: HttpClient) {
    this.storage = storage;
    this.eventEmitter = eventEmitter;
    this.client = client;
  }

  /**
   * Get current cart
   */
  get(): Cart {
    const cart = this.storage.get();
    if (!cart) {
      return this.createEmptyCart();
    }
    return cart;
  }

  /**
   * Add product to cart
   */
  addItem(product: Product, quantity = 1): Cart {
    const cart = this.get();
    const existingItemIndex = cart.items.findIndex(item => item.product.id === product.id);

    if (existingItemIndex >= 0) {
      // Update existing item
      cart.items[existingItemIndex].quantity += quantity;
      cart.items[existingItemIndex].price = product.price; // Update price in case it changed
    } else {
      // Add new item
      const newItem: CartItem = {
        id: this.generateItemId(),
        product,
        quantity,
        price: product.price,
      };
      cart.items.push(newItem);
    }

    const updatedCart = this.updateCartTotals(cart);
    this.storage.set(updatedCart);

    // Emit event
    this.eventEmitter.emit('cart:item:added', {
      item: cart.items[existingItemIndex >= 0 ? existingItemIndex : cart.items.length - 1],
      cart: updatedCart
    });

    return updatedCart;
  }

  /**
   * Remove product from cart by product ID
   */
  removeProduct(productId: number): Cart {
    const cart = this.get();
    const itemToRemove = cart.items.find(item => item.product.id === productId);
    
    if (itemToRemove) {
      return this.removeItem(itemToRemove.id);
    }
    
    return cart;
  }

  /**
   * Update item quantity
   */
  updateItemQuantity(itemId: string, quantity: number): Cart {
    if (quantity <= 0) {
      return this.removeItem(itemId);
    }

    const cart = this.get();
    const itemIndex = cart.items.findIndex(item => item.id === itemId);

    if (itemIndex >= 0) {
      cart.items[itemIndex].quantity = quantity;
      const updatedCart = this.updateCartTotals(cart);
      this.storage.set(updatedCart);

      // Emit event
      this.eventEmitter.emit('cart:item:updated', {
        item: cart.items[itemIndex],
        cart: updatedCart
      });

      return updatedCart;
    }

    return cart;
  }

  /**
   * Remove item from cart
   */
  removeItem(itemId: string): Cart {
    const cart = this.get();
    const itemToRemove = cart.items.find(item => item.id === itemId);
    
    if (itemToRemove) {
      cart.items = cart.items.filter(item => item.id !== itemId);
      const updatedCart = this.updateCartTotals(cart);
      this.storage.set(updatedCart);

      // Emit event
      this.eventEmitter.emit('cart:item:removed', {
        itemId,
        cart: updatedCart
      });

      return updatedCart;
    }

    return cart;
  }

  /**
   * Clear all items from cart
   */
  clear(): Cart {
    const emptyCart = this.createEmptyCart();
    this.storage.set(emptyCart);

    // Emit event
    this.eventEmitter.emit('cart:cleared', {
      cart: emptyCart
    });

    return emptyCart;
  }

  /**
   * Get total number of items in cart
   */
  getItemCount(): number {
    const cart = this.get();
    return cart.items.reduce((total, item) => total + item.quantity, 0);
  }

  /**
   * Get unique item count (number of different products)
   */
  getUniqueItemCount(): number {
    const cart = this.get();
    return cart.items.length;
  }

  /**
   * Check if product is in cart
   */
  hasProduct(productId: number): boolean {
    const cart = this.get();
    return cart.items.some(item => item.product.id === productId);
  }

  /**
   * Get specific item by product ID
   */
  getItem(productId: number): CartItem | undefined {
    const cart = this.get();
    return cart.items.find(item => item.product.id === productId);
  }

  /**
   * Check if cart is empty
   */
  isEmpty(): boolean {
    const cart = this.get();
    return cart.items.length === 0;
  }

  /**
   * Calculate cart subtotal
   */
  getSubtotal(): number {
    const cart = this.get();
    return cart.subtotal;
  }

  // Remote API methods for cart backup/sync

  /**
   * Sync local cart to remote server (requires authentication)
   */
  async syncToRemote(): Promise<ApiResponse<RemoteCart>> {
    const cart = this.get();
    
    // Convert local cart to remote format
    const cartData: CartDataInput = {
      total: cart.subtotal,
      quantity: cart.total_items,
      items: cart.items.map(item => ({
        product_id: item.product.id,
        variant_id: item.product.id, // TODO: Add variant support
        quantity: item.quantity,
        unit_price: item.price
      }))
    };

    // Create or update remote cart
    const remoteCart = await this.client.post<RemoteCart>('/carts', {
      session_id: this.generateSessionId(),
      data: cartData
    });

    return remoteCart;
  }

  /**
   * Load cart from remote server (requires authentication)
   */
  async loadFromRemote(cartId: string): Promise<ApiResponse<Cart>> {
    const remoteCart = await this.client.get<RemoteCart>(`/carts/${cartId}`, {});
    
    if (remoteCart.state === 'ok' && remoteCart.result) {
      // Convert remote cart to local format
      const localCart: Cart = {
        id: remoteCart.result.id,
        items: remoteCart.result.data.items.map((item: CartLineItem) => ({
          id: `item_${item.product_id}_${item.variant_id}`,
          product: item.product!, // TODO: Fetch product details if not included
          quantity: item.quantity,
          price: item.unit_price
        })),
        subtotal: remoteCart.result.data.total,
        total_items: remoteCart.result.data.quantity,
        created_at: remoteCart.result.created_at,
        updated_at: remoteCart.result.updated_at
      };

      // Save to local storage
      this.storage.set(localCart);
      
      return {
        state: 'ok',
        result: localCart
      };
    }

    return {
      state: 'error',
      result: undefined
    };
  }

  /**
   * List remote carts (requires authentication)
   */
  async listRemoteCarts(params?: ListCartsParams): Promise<ApiResponse<PaginatedResponse<RemoteCart>>> {
    return this.client.get<PaginatedResponse<RemoteCart>>('/carts', params);
  }

  /**
   * Update remote cart
   */
  async updateRemoteCart(cartId: string, input: CartInput): Promise<ApiResponse<RemoteCart>> {
    return this.client.put<RemoteCart>(`/carts/${cartId}`, input);
  }

  /**
   * Delete remote cart
   */
  async deleteRemoteCart(cartId: string): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/carts/${cartId}`);
  }

  /**
   * Add item to remote cart by updating the cart data
   */
  async addItemToRemoteCart(cartId: string, productId: number, variantId: number, quantity: number, price: number): Promise<ApiResponse<RemoteCart>> {
    // First get the current cart
    const currentCart = await this.client.get<RemoteCart>(`/carts/${cartId}`, {});
    
    if (currentCart.state === 'ok' && currentCart.result) {
      const cartData = currentCart.result.data;
      
      // Find existing item
      const existingItemIndex = cartData.items.findIndex((item: CartLineItem) => 
        item.product_id === productId && item.variant_id === variantId
      );
      
      if (existingItemIndex >= 0) {
        // Update existing item
        cartData.items[existingItemIndex].quantity += quantity;
        // Note: unit_price stays the same, total cart value is recalculated
      } else {
        // Add new item
        cartData.items.push({
          product_id: productId,
          variant_id: variantId,
          quantity,
          unit_price: price
        });
      }
      
      // Recalculate totals
      cartData.total = cartData.items.reduce((sum: number, item: CartLineItem) => sum + (item.unit_price * item.quantity), 0);
      cartData.quantity = cartData.items.reduce((sum: number, item: CartLineItem) => sum + item.quantity, 0);
      
      // Update the cart
      return this.updateRemoteCart(cartId, {
        user_id: currentCart.result.user_id,
        session_id: currentCart.result.session_id,
        data: cartData
      });
    }
    
    return {
      state: 'error',
      result: undefined
    };
  }

  /**
   * Remove item from remote cart by updating the cart data
   */
  async removeItemFromRemoteCart(cartId: string, productId: number, variantId: number): Promise<ApiResponse<RemoteCart>> {
    // First get the current cart
    const currentCart = await this.client.get<RemoteCart>(`/carts/${cartId}`, {});
    
    if (currentCart.state === 'ok' && currentCart.result) {
      const cartData = currentCart.result.data;
      
      // Remove the item
      cartData.items = cartData.items.filter((item: CartLineItem) => 
        !(item.product_id === productId && item.variant_id === variantId)
      );
      
      // Recalculate totals
      cartData.total = cartData.items.reduce((sum: number, item: CartLineItem) => sum + (item.unit_price * item.quantity), 0);
      cartData.quantity = cartData.items.reduce((sum: number, item: CartLineItem) => sum + item.quantity, 0);
      
      // Update the cart
      return this.updateRemoteCart(cartId, {
        user_id: currentCart.result.user_id,
        session_id: currentCart.result.session_id,
        data: cartData
      });
    }
    
    return {
      state: 'error',
      result: undefined
    };
  }

  /**
   * Update item quantity in remote cart
   */
  async updateItemQuantityInRemoteCart(cartId: string, productId: number, variantId: number, quantity: number): Promise<ApiResponse<RemoteCart>> {
    if (quantity <= 0) {
      return this.removeItemFromRemoteCart(cartId, productId, variantId);
    }
    
    // First get the current cart
    const currentCart = await this.client.get<RemoteCart>(`/carts/${cartId}`, {});
    
    if (currentCart.state === 'ok' && currentCart.result) {
      const cartData = currentCart.result.data;
      
      // Find the item
      const itemIndex = cartData.items.findIndex((item: CartLineItem) => 
        item.product_id === productId && item.variant_id === variantId
      );
      
      if (itemIndex >= 0) {
        const item = cartData.items[itemIndex];
        
        // Update quantity (unit_price stays the same)
        item.quantity = quantity;
        
        // Recalculate totals
        cartData.total = cartData.items.reduce((sum: number, item: CartLineItem) => sum + (item.unit_price * item.quantity), 0);
        cartData.quantity = cartData.items.reduce((sum: number, item: CartLineItem) => sum + item.quantity, 0);
        
        // Update the cart
        return this.updateRemoteCart(cartId, {
          user_id: currentCart.result.user_id,
          session_id: currentCart.result.session_id,
          data: cartData
        });
      }
    }
    
    return {
      state: 'error',
      result: undefined
    };
  }

  /**
   * Create empty cart structure
   */
  private createEmptyCart(): Cart {
    return {
      id: this.generateCartId(),
      items: [],
      subtotal: 0,
      total_items: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Update cart totals and metadata
   */
  private updateCartTotals(cart: Cart): Cart {
    cart.subtotal = cart.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    cart.total_items = cart.items.reduce((total, item) => total + item.quantity, 0);
    cart.updated_at = new Date().toISOString();
    return cart;
  }

  /**
   * Generate unique cart ID
   */
  private generateCartId(): string {
    return `cart_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate unique item ID
   */
  private generateItemId(): string {
    return `item_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate session ID for anonymous carts
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}
