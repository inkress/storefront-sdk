import type { HttpClient } from '../client';
import type { ApiResponse } from '../types';

/**
 * Generic resource for accessing any API endpoints not covered by specific resources
 * Useful for custom endpoints, extensions, or new features
 */
export class GenericResource {
  constructor(private client: HttpClient) {}

  /**
   * Make a GET request to any endpoint
   */
  async get<T = any>(
    path: string, 
    params?: Record<string, any>
  ): Promise<ApiResponse<T>> {
    return this.client.get<T>(path, params);
  }

  /**
   * Make a POST request to any endpoint
   */
  async post<T = any>(
    path: string, 
    data?: any
  ): Promise<ApiResponse<T>> {
    return this.client.post<T>(path, data);
  }

  /**
   * Make a PUT request to any endpoint
   */
  async put<T = any>(
    path: string, 
    data?: any
  ): Promise<ApiResponse<T>> {
    return this.client.put<T>(path, data);
  }

  /**
   * Make a DELETE request to any endpoint
   */
  async delete<T = any>(
    path: string
  ): Promise<ApiResponse<T>> {
    return this.client.delete<T>(path);
  }

  // Convenience methods for common custom endpoints

  /**
   * Sync cart to server (if you have a server-side cart endpoint)
   */
  async syncCart(cartData: any, customerId?: number): Promise<ApiResponse<any>> {
    const endpoint = customerId 
      ? `/customers/${customerId}/cart/sync`
      : '/cart/sync';
    
    return this.post(endpoint, cartData);
  }

  /**
   * Sync wishlist to server (if you have a server-side wishlist endpoint)
   */
  async syncWishlist(wishlistData: any, customerId?: number): Promise<ApiResponse<any>> {
    const endpoint = customerId 
      ? `/customers/${customerId}/wishlist/sync`
      : '/wishlist/sync';
    
    return this.post(endpoint, wishlistData);
  }

  /**
   * Get server-side cart (if available)
   */
  async getServerCart(customerId?: number): Promise<ApiResponse<any>> {
    const endpoint = customerId 
      ? `/customers/${customerId}/cart`
      : '/cart';
    
    return this.get(endpoint, {});
  }

  /**
   * Get server-side wishlist (if available)
   */
  async getServerWishlist(customerId?: number): Promise<ApiResponse<any>> {
    const endpoint = customerId 
      ? `/customers/${customerId}/wishlist`
      : '/wishlist';
    
    return this.get(endpoint, {});
  }

  /**
   * Send contact/support message
   */
  async sendContactMessage(data: {
    name: string;
    email: string;
    subject?: string;
    message: string;
    merchant_id?: number;
  }): Promise<ApiResponse<{ message: string }>> {
    return this.post('/contact', data);
  }

  /**
   * Subscribe to newsletter
   */
  async subscribeNewsletter(data: {
    email: string;
    name?: string;
    merchant_id?: number;
  }): Promise<ApiResponse<{ message: string }>> {
    return this.post('/newsletter/subscribe', data);
  }

  /**
   * Track custom analytics event
   */
  async trackEvent(data: {
    event: string;
    properties?: Record<string, any>;
    merchant_id?: number;
  }): Promise<ApiResponse<{ message: string }>> {
    return this.post('/analytics/track', data);
  }

  /**
   * Get shipping rates for order
   */
  async getShippingRates(data: {
    items: Array<{ product_id: number; quantity: number }>;
    shipping_address: {
      country: string;
      state?: string;
      city: string;
      postal_code: string;
    };
  }): Promise<ApiResponse<any>> {
    return this.post('/shipping/rates', data);
  }

  /**
   * Apply coupon/discount code
   */
  async applyCoupon(data: {
    code: string;
    cart_total: number;
    items?: Array<{ product_id: number; quantity: number; price: number }>;
  }): Promise<ApiResponse<any>> {
    return this.post('/coupons/apply', data);
  }
}
