import type { HttpClient } from '../client';
import type { ApiResponse, PaginatedResponse, Category, CategoryInput, CategoryListParams, CategoryTree } from '../types';
import { CategoryQueryBuilder, type Queryable } from '../utils/query-builders';
import { type CategoryQueryParams, type CategoryListResponse } from '../types/resources';
/**
 * Categories resource for managing product categories
 *
 * Categories provide a way to organize products into hierarchical groups.
 * They support nested structures through parent_id relationships and can
 * be filtered by various criteria including kind, name, and description.
 */
export declare class CategoriesResource implements Queryable<CategoryListResponse> {
    private client;
    constructor(client: HttpClient);
    /**
     * List categories with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of categories
     */
    list(params?: CategoryListParams): Promise<ApiResponse<PaginatedResponse<Category>>>;
    /**
     * Run a typed category query (range/contains/date filters + pagination).
     *
     * @example await categories.query({ name: { contains: 'apparel' }, page: 1 })
     */
    query(params?: CategoryQueryParams): Promise<ApiResponse<CategoryListResponse>>;
    /** Start a fluent category query. */
    createQueryBuilder(initialQuery?: CategoryQueryParams): CategoryQueryBuilder;
    /**
     * Get a specific category by ID
     *
     * @param id - The category ID
     * @returns Promise resolving to the category
     */
    get(id: number): Promise<ApiResponse<Category>>;
    /**
     * Create a new category (requires authentication)
     *
     * @param input - The category data to create
     * @returns Promise resolving to the created category
     */
    create(input: CategoryInput): Promise<ApiResponse<Category>>;
    /**
     * Update an existing category (requires authentication)
     *
     * @param id - The category ID to update
     * @param input - The updated category data
     * @returns Promise resolving to the updated category
     */
    update(id: number, input: CategoryInput): Promise<ApiResponse<Category>>;
    /**
     * Delete a category (requires authentication)
     *
     * @param id - The category ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    delete(id: number): Promise<ApiResponse<void>>;
    /**
     * Search categories by name or description
     *
     * @param query - Search term to match against name and description
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of matching categories
     */
    search(query: string, params?: Omit<CategoryListParams, 'q'>): Promise<ApiResponse<PaginatedResponse<Category>>>;
    /**
     * Get categories by kind (type)
     *
     * @param kind - The category kind to filter by
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of categories of the specified kind
     */
    getByKind(kind: number, params?: Omit<CategoryListParams, 'kind'>): Promise<ApiResponse<PaginatedResponse<Category>>>;
    /**
     * Get child categories of a parent category
     *
     * @param parentId - The parent category ID
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of child categories
     */
    getChildren(parentId: number, params?: Omit<CategoryListParams, 'parent_id'>): Promise<ApiResponse<PaginatedResponse<Category>>>;
    /**
     * Get root categories (categories without a parent)
     *
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of root categories
     */
    getRoots(params?: CategoryListParams): Promise<ApiResponse<PaginatedResponse<Category>>>;
    /**
     * Create a subcategory under a parent category (requires authentication)
     *
     * @param parentId - The parent category ID
     * @param input - The category data (parent_id will be set automatically)
     * @returns Promise resolving to the created subcategory
     */
    createSubcategory(parentId: number, input: Omit<CategoryInput, 'parent_id'>): Promise<ApiResponse<Category>>;
    /**
     * Get the full category tree starting from root categories
     * Note: This makes multiple API calls to build the tree structure
     *
     * @param maxDepth - Maximum depth to traverse (default: 3)
     * @returns Promise resolving to a tree structure of categories
     */
    getCategoryTree(maxDepth?: number): Promise<ApiResponse<CategoryTree[]>>;
    /**
     * Build category tree recursively (helper method)
     *
     * @private
     */
    private buildCategoryTree;
}
//# sourceMappingURL=categories.d.ts.map