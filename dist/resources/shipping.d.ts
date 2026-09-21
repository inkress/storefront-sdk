import type { HttpClient } from '../client';
import type { ApiResponse, PaginatedResponse, ShippingMethod, ShippingMethodInput, ShippingMethodsParams, ShippingArea, ShippingAreaInput } from '../types';
/**
 * Shipping resource for managing delivery methods and shipping areas
 *
 * This resource provides functionality for managing shipping methods and
 * shipping areas based on the actual available API endpoints.
 * Only includes methods that correspond to real API routes.
 */
export declare class ShippingResource {
    private client;
    constructor(client: HttpClient);
    /**
     * List shipping methods with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of shipping methods
     */
    listMethods(params?: ShippingMethodsParams): Promise<ApiResponse<PaginatedResponse<ShippingMethod>>>;
    /**
     * Get a specific shipping method by ID
     *
     * @param id - The shipping method ID
     * @returns Promise resolving to the shipping method
     */
    getMethod(id: number): Promise<ApiResponse<ShippingMethod>>;
    /**
     * Create a new shipping method (requires authentication)
     *
     * @param input - The shipping method data to create
     * @returns Promise resolving to the created shipping method
     */
    createMethod(input: ShippingMethodInput): Promise<ApiResponse<ShippingMethod>>;
    /**
     * Update an existing shipping method (requires authentication)
     *
     * @param id - The shipping method ID to update
     * @param input - The updated shipping method data
     * @returns Promise resolving to the updated shipping method
     */
    updateMethod(id: number, input: ShippingMethodInput): Promise<ApiResponse<ShippingMethod>>;
    /**
     * Delete a shipping method (requires authentication)
     *
     * @param id - The shipping method ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    deleteMethod(id: number): Promise<ApiResponse<void>>;
    /**
     * List shipping areas
     *
     * @param params - Query parameters for pagination
     * @returns Promise resolving to array of shipping areas
     */
    listAreas(params?: {
        page?: number;
        page_size?: number;
    }): Promise<ApiResponse<PaginatedResponse<ShippingArea>>>;
    /**
     * Get a specific shipping area by ID
     *
     * @param id - The shipping area ID
     * @returns Promise resolving to the shipping area
     */
    getArea(id: number): Promise<ApiResponse<ShippingArea>>;
    /**
     * Create a new shipping area (requires authentication)
     *
     * @param input - The shipping area data to create
     * @returns Promise resolving to the created shipping area
     */
    createArea(input: ShippingAreaInput): Promise<ApiResponse<ShippingArea>>;
    /**
     * Update an existing shipping area (requires authentication)
     *
     * @param id - The shipping area ID to update
     * @param input - The updated shipping area data
     * @returns Promise resolving to the updated shipping area
     */
    updateArea(id: number, input: ShippingAreaInput): Promise<ApiResponse<ShippingArea>>;
    /**
     * Delete a shipping area (requires authentication)
     *
     * @param id - The shipping area ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    deleteArea(id: number): Promise<ApiResponse<void>>;
    /**
     * Get active shipping methods only
     *
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of active shipping methods
     */
    getActiveMethods(params?: Omit<ShippingMethodsParams, 'status'>): Promise<ApiResponse<PaginatedResponse<ShippingMethod>>>;
    /**
     * Search shipping methods by name
     *
     * @param name - Name to search for
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of matching shipping methods
     */
    searchMethodsByName(name: string, params?: Omit<ShippingMethodsParams, 'name'>): Promise<ApiResponse<PaginatedResponse<ShippingMethod>>>;
    /**
     * Get shipping methods within a price range
     * Note: Price filtering may need to be implemented on the API side
     *
     * @param maxPrice - Maximum price filter
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of shipping methods within price range
     */
    getMethodsByMaxPrice(maxPrice: number, params?: ShippingMethodsParams): Promise<ApiResponse<PaginatedResponse<ShippingMethod>>>;
    /**
     * Get shipping methods by estimated delivery days
     * Note: Estimated days filtering may need to be implemented on the API side
     *
     * @param estimatedDays - Estimated delivery days
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of shipping methods with specific delivery time
     */
    getMethodsByDeliveryDays(estimatedDays: number, params?: ShippingMethodsParams): Promise<ApiResponse<PaginatedResponse<ShippingMethod>>>;
    /**
     * Get the cheapest shipping method
     *
     * @param params - Query parameters for filtering
     * @returns Promise resolving to the cheapest shipping method
     */
    getCheapestMethod(params?: ShippingMethodsParams): Promise<ApiResponse<ShippingMethod | null>>;
    /**
     * Get the fastest shipping method (shortest estimated days)
     *
     * @param params - Query parameters for filtering
     * @returns Promise resolving to the fastest shipping method
     */
    getFastestMethod(params?: ShippingMethodsParams): Promise<ApiResponse<ShippingMethod | null>>;
    /**
     * Find shipping areas that include a specific country
     *
     * @param countryCode - Country code to search for
     * @returns Promise resolving to shipping areas covering the country
     */
    getAreasByCountry(countryCode: string): Promise<ApiResponse<ShippingArea[]>>;
    /**
     * Get active shipping areas only
     *
     * @returns Promise resolving to active shipping areas
     */
    getActiveAreas(): Promise<ApiResponse<ShippingArea[]>>;
    /**
     * Check if shipping is available to a country
     *
     * @param countryCode - Country code to check
     * @returns Promise resolving to availability status
     */
    isShippingAvailableToCountry(countryCode: string): Promise<ApiResponse<{
        available: boolean;
        areas: ShippingArea[];
    }>>;
}
//# sourceMappingURL=shipping.d.ts.map