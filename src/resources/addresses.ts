import type { HttpClient } from '../client';
import type {
  ApiResponse,
  PaginatedResponse,
  SavedAddress,
  AddressInput,
  AddressListParams,
} from '../types';

/**
 * Addresses resource — a customer's saved addresses (`/addresses`).
 *
 * Addresses are owned polymorphically via `kind` (owner type) + `kind_id`
 * (owner id). For a storefront customer, `kind_id` is their customer id; use
 * {@link AddressesResource.listForCustomer} to scope to one customer.
 */
export class AddressesResource {
  constructor(private client: HttpClient) {}

  /** List addresses (optionally filtered). */
  async list(params?: AddressListParams): Promise<ApiResponse<PaginatedResponse<SavedAddress>>> {
    return this.client.get<PaginatedResponse<SavedAddress>>('/addresses', params);
  }

  /** List a single customer's saved addresses. */
  async listForCustomer(
    customerId: number,
    params?: Omit<AddressListParams, 'kind_id'>,
  ): Promise<ApiResponse<PaginatedResponse<SavedAddress>>> {
    return this.list({ ...params, kind_id: customerId });
  }

  /** Get an address by id. */
  async get(id: number): Promise<ApiResponse<SavedAddress>> {
    return this.client.get<SavedAddress>(`/addresses/${id}`);
  }

  /** Create a new address. */
  async create(input: AddressInput): Promise<ApiResponse<SavedAddress>> {
    return this.client.post<SavedAddress>('/addresses', input);
  }

  /** Update an existing address. */
  async update(id: number, input: Partial<AddressInput>): Promise<ApiResponse<SavedAddress>> {
    return this.client.put<SavedAddress>(`/addresses/${id}`, input);
  }

  /** Delete an address. */
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/addresses/${id}`);
  }
}
