import type { HttpClient } from '../client';
import type { ApiResponse, Customer, CustomerAuthResponse, CustomerLoginRequest, CustomerRegisterRequest } from '../types';
/**
 * Auth resource for customer authentication and account management
 */
export declare class AuthResource {
    private client;
    constructor(client: HttpClient);
    /**
     * Register a new customer account
     */
    register(customerData: CustomerRegisterRequest): Promise<ApiResponse<CustomerAuthResponse>>;
    /**
     * Login a customer with email and password
     */
    login(credentials: CustomerLoginRequest): Promise<ApiResponse<CustomerAuthResponse>>;
    /**
     * Logout the current customer
     */
    logout(): Promise<ApiResponse<{
        message: string;
    }>>;
    /**
     * Check whether the current auth token/session is still valid.
     *
     * Hits `GET /auth/valid`, which returns an empty `200` body when the session
     * is valid and `401` when it is not — it does NOT return the customer record.
     * Resolves `true`/`false` accordingly; non-401 errors (network, 5xx) propagate.
     */
    validateToken(): Promise<boolean>;
    /**
     * Fetch a customer profile by id (`GET /users/:id`).
     *
     * `customerId` is the `customer.id` returned by {@link login} / {@link register}.
     * Subject to the server's authorization rules for the `accounts.user` resource.
     */
    getProfile(customerId: number): Promise<ApiResponse<Customer>>;
    /**
     * Request password reset email
     */
    requestPasswordReset(email: string): Promise<ApiResponse<{
        message: string;
    }>>;
    /**
     * Reset password with token
     */
    resetPassword(data: {
        token: string;
        password: string;
    }): Promise<ApiResponse<{
        message: string;
    }>>;
    /**
     * Update a customer profile by id (`PUT /users/:id`).
     *
     * `customerId` is the `customer.id` from {@link login} / {@link register}.
     * Subject to the server's authorization rules for the `accounts.user` resource.
     */
    updateProfile(customerId: number, updates: Partial<Omit<Customer, 'id' | 'created_at' | 'updated_at'>>): Promise<ApiResponse<Customer>>;
    /**
     * Change a customer's password (`PUT /users/:id` with the new password).
     *
     * The API sets the password directly and does not verify a current password,
     * so none is required. `customerId` is the `customer.id` from {@link login} /
     * {@link register}. Subject to server-side authorization.
     */
    changePassword(customerId: number, newPassword: string): Promise<ApiResponse<Customer>>;
}
//# sourceMappingURL=auth.d.ts.map