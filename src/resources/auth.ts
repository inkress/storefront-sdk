import { InkressApiError } from '../client';
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
   * Check whether the current auth token/session is still valid.
   *
   * Hits `GET /auth/valid`, which returns an empty `200` body when the session
   * is valid and `401` when it is not — it does NOT return the customer record.
   * Resolves `true`/`false` accordingly; non-401 errors (network, 5xx) propagate.
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.client.get<null>('/auth/valid', {});
      return true;
    } catch (error) {
      if (error instanceof InkressApiError && error.status === 401) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Fetch a customer profile by id (`GET /users/:id`).
   *
   * `customerId` is the `customer.id` returned by {@link login} / {@link register}.
   * Subject to the server's authorization rules for the `accounts.user` resource.
   */
  async getProfile(customerId: number): Promise<ApiResponse<Customer>> {
    return this.client.get<Customer>(`/users/${customerId}`, {});
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
   * Update a customer profile by id (`PUT /users/:id`).
   *
   * `customerId` is the `customer.id` from {@link login} / {@link register}.
   * Subject to the server's authorization rules for the `accounts.user` resource.
   */
  async updateProfile(
    customerId: number,
    updates: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>,
  ): Promise<ApiResponse<Customer>> {
    return this.client.put<Customer>(`/users/${customerId}`, updates);
  }

  /**
   * Change a customer's password (`PUT /users/:id` with the new password).
   *
   * The API sets the password directly and does not verify a current password,
   * so none is required. `customerId` is the `customer.id` from {@link login} /
   * {@link register}. Subject to server-side authorization.
   */
  async changePassword(customerId: number, newPassword: string): Promise<ApiResponse<Customer>> {
    return this.client.put<Customer>(`/users/${customerId}`, { password: newPassword });
  }
}
