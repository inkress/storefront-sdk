import type { HttpClient } from '../client';
import type { ApiResponse } from '../types';

/**
 * Low-level escape hatch for calling API endpoints the SDK does not wrap.
 *
 * Exposed as `sdk.generic`. This is a raw HTTP passthrough — YOU supply the
 * path and payload, and are responsible for the endpoint existing. For the
 * typed `/generics` key-value store (list/get/create/update/getByKey/…), use
 * `sdk.generics` ({@link GenericsResource}) instead.
 *
 * @example
 * // Call an endpoint the SDK doesn't have a dedicated resource for:
 * await sdk.generic.post('/some/custom/endpoint', { ... });
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
}
