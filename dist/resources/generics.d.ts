import type { HttpClient } from '../client';
import type { ApiResponse, PaginatedResponse, Generic, GenericInput, ListGenericsParams } from '../types';
/**
 * Generics resource for managing key-value store entries on the server
 *
 * The generics API provides a flexible key-value store where you can:
 * - Store arbitrary JSON data with a unique key
 * - Categorize entries using the 'kind' field
 * - Query and filter entries by key or kind
 *
 * This is useful for storing configuration, settings, metadata, or any
 * structured data that doesn't fit into other specific resources.
 */
export declare class GenericsResource {
    private client;
    constructor(client: HttpClient);
    /**
     * List generics with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of generics
     */
    list(params?: ListGenericsParams): Promise<ApiResponse<PaginatedResponse<Generic>>>;
    /**
     * Get a specific generic by ID
     *
     * @param id - The generic ID
     * @returns Promise resolving to the generic entry
     */
    get(id: string): Promise<ApiResponse<Generic>>;
    /**
     * Create a new generic entry
     *
     * @param input - The generic data to create
     * @returns Promise resolving to the created generic
     */
    create(input: GenericInput): Promise<ApiResponse<Generic>>;
    /**
     * Update an existing generic entry
     *
     * @param id - The generic ID to update
     * @param input - The updated generic data
     * @returns Promise resolving to the updated generic
     */
    update(id: string, input: GenericInput): Promise<ApiResponse<Generic>>;
    /**
     * Delete a generic entry
     *
     * @param id - The generic ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    delete(id: string): Promise<ApiResponse<void>>;
    /**
     * Get a generic by its key (searches through all generics)
     * Note: This may not be efficient for large datasets. Consider using list() with key filter instead.
     *
     * @param key - The key to search for
     * @returns Promise resolving to the first generic with matching key, or undefined if not found
     */
    getByKey(key: string): Promise<ApiResponse<Generic | undefined>>;
    /**
     * Get all generics of a specific kind
     *
     * @param kind - The kind to filter by
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of generics of the specified kind
     */
    getByKind(kind: number, params?: Omit<ListGenericsParams, 'kind'>): Promise<ApiResponse<PaginatedResponse<Generic>>>;
    /**
     * Create or update a generic by key
     * If a generic with the given key exists, it will be updated; otherwise, a new one will be created.
     *
     * @param key - The key to create or update
     * @param kind - The kind category
     * @param data - The data to store
     * @returns Promise resolving to the created or updated generic
     */
    createOrUpdate(key: string, kind: number, data: Record<string, any>): Promise<ApiResponse<Generic>>;
    /**
     * Delete a generic by its key
     *
     * @param key - The key of the generic to delete
     * @returns Promise resolving to true if deleted, false if not found
     */
    deleteByKey(key: string): Promise<ApiResponse<boolean>>;
}
//# sourceMappingURL=generics.d.ts.map