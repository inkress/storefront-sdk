import type { HttpClient } from '../client';
import type { ApiResponse, PaginatedResponse, SavedAddress, AddressInput, AddressListParams } from '../types';
/**
 * Addresses resource — a customer's saved addresses (`/addresses`).
 *
 * Addresses are owned polymorphically via `kind` (owner type) + `kind_id`
 * (owner id). For a storefront customer, `kind_id` is their customer id; use
 * {@link AddressesResource.listForCustomer} to scope to one customer.
 */
export declare class AddressesResource {
    private client;
    constructor(client: HttpClient);
    /** List addresses (optionally filtered). */
    list(params?: AddressListParams): Promise<ApiResponse<PaginatedResponse<SavedAddress>>>;
    /** List a single customer's saved addresses. */
    listForCustomer(customerId: number, params?: Omit<AddressListParams, 'kind_id'>): Promise<ApiResponse<PaginatedResponse<SavedAddress>>>;
    /** Get an address by id. */
    get(id: number): Promise<ApiResponse<SavedAddress>>;
    /** Create a new address. */
    create(input: AddressInput): Promise<ApiResponse<SavedAddress>>;
    /** Update an existing address. */
    update(id: number, input: Partial<AddressInput>): Promise<ApiResponse<SavedAddress>>;
    /** Delete an address. */
    delete(id: number): Promise<ApiResponse<void>>;
}
//# sourceMappingURL=addresses.d.ts.map