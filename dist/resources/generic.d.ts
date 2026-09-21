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
export declare class GenericResource {
    private client;
    constructor(client: HttpClient);
    /**
     * Make a GET request to any endpoint
     */
    get<T = any>(path: string, params?: Record<string, any>): Promise<ApiResponse<T>>;
    /**
     * Make a POST request to any endpoint
     */
    post<T = any>(path: string, data?: any): Promise<ApiResponse<T>>;
    /**
     * Make a PUT request to any endpoint
     */
    put<T = any>(path: string, data?: any): Promise<ApiResponse<T>>;
    /**
     * Make a DELETE request to any endpoint
     */
    delete<T = any>(path: string): Promise<ApiResponse<T>>;
}
//# sourceMappingURL=generic.d.ts.map