import type { HttpClient } from '../client';
import type {
  ApiResponse,
  Customer,
  CustomerAuthResponse,
  CustomerLoginRequest,
  CustomerRegisterRequest,
} from '../types';

/**
 * Auth resource for customer authentication and account management
 */
export class AuthResource {
  constructor(private client: HttpClient) {}

  /**
   * Register a new customer account
   */
  async register(customerData: CustomerRegisterRequest): Promise<ApiResponse<CustomerAuthResponse>> {
    return this.client.post<CustomerAuthResponse>('/auth/register', customerData);
  }

  /**
   * Login a customer with email and password
   */
  async login(credentials: CustomerLoginRequest): Promise<ApiResponse<CustomerAuthResponse>> {
    return this.client.post<CustomerAuthResponse>('/auth/login', credentials);
  }

  /**
   * Logout the current customer
   */
  async logout(): Promise<ApiResponse<{ message: string }>> {
    return this.client.post<{ message: string }>('/auth/logout', {});
  }

  /**
   * Validate current token/session
   */
  async validateToken(): Promise<ApiResponse<Customer>> {
    return this.client.get<Customer>('/auth/valid', {});
  }

  /**
   * Get current customer profile (alias for validateToken)
   */
  async getProfile(): Promise<ApiResponse<Customer>> {
    return this.validateToken();
  }

  /**
   * Request password reset email
   */
  async requestPasswordReset(email: string): Promise<ApiResponse<{ message: string }>> {
    return this.client.post<{ message: string }>('/auth/request_reset', { email });
  }

  /**
   * Reset password with token
   */
  async resetPassword(data: {
    token: string;
    password: string;
  }): Promise<ApiResponse<{ message: string }>> {
    return this.client.post<{ message: string }>('/auth/reset', data);
  }

  /**
   * Update customer profile (requires authentication)
   * Note: This would typically be done through a separate users endpoint
   */
  async updateProfile(updates: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>): Promise<ApiResponse<Customer>> {
    // This endpoint may not exist in the current API, you might need to implement it
    return this.client.put<Customer>('/users/profile', updates);
  }

  /**
   * Change customer password (requires authentication)
   * Note: This would typically be done through a separate users endpoint
   */
  async changePassword(data: {
    current_password: string;
    new_password: string;
  }): Promise<ApiResponse<{ message: string }>> {
    // This endpoint may not exist in the current API, you might need to implement it
    return this.client.put<{ message: string }>('/users/password', data);
  }
}
