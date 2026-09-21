import type { HttpClient } from '../client';
import type { ApiResponse, Product, ProductSearchParams, PaginatedResponse, ProductCustomField, CustomFieldSelection, ProductStock, FacetBucket, ProductFacetsOptions } from '../types';
import { ProductQueryBuilder, type Queryable } from '../utils/query-builders';
import { type ProductQueryParams, type ProductListResponse } from '../types/resources';
/**
 * Products resource for accessing product information.
 *
 * Two ways to list:
 *  - `search(params)` and the convenience helpers — simple param objects.
 *  - `query(params)` / `createQueryBuilder()` — the typed query system shared
 *    with @inkress/admin-sdk (range/contains/date filters + status translation).
 */
export declare class ProductsResource implements Queryable<ProductListResponse> {
    private client;
    constructor(client: HttpClient);
    /**
     * Get a specific product by ID
     */
    get(productId: number): Promise<ApiResponse<Product>>;
    /**
     * Run a typed product query. Transforms range/contains/date filters and
     * translates contextual `status` strings (e.g. 'published') to API codes.
     *
     * @example await products.query({ status: 'published', price: { min: 20 }, page: 1 })
     */
    query(params?: ProductQueryParams): Promise<ApiResponse<ProductListResponse>>;
    /** Start a fluent product query, e.g. `products.createQueryBuilder().whereStatus('published').execute()`. */
    createQueryBuilder(initialQuery?: ProductQueryParams): ProductQueryBuilder;
    /**
     * Search products with filters and pagination (simple param object).
     */
    search(params?: ProductSearchParams): Promise<ApiResponse<PaginatedResponse<Product>>>;
    /**
     * Get products by category
     */
    getByCategory(categoryId: number, params?: Omit<ProductSearchParams, 'category_id'>): Promise<ApiResponse<PaginatedResponse<Product>>>;
    /**
     * Search products by query string
     */
    searchByQuery(query: string, params?: Omit<ProductSearchParams, 'q' | 'search'>): Promise<ApiResponse<PaginatedResponse<Product>>>;
    /**
     * Get products within a price range
     */
    getByPriceRange(minPrice: number, maxPrice: number, params?: Omit<ProductSearchParams, 'min_price' | 'max_price'>): Promise<ApiResponse<PaginatedResponse<Product>>>;
    /**
     * Get only in-stock products
     */
    getInStock(params?: Omit<ProductSearchParams, 'in_stock'>): Promise<ApiResponse<PaginatedResponse<Product>>>;
    /**
     * Get featured/popular products (customize based on your API)
     */
    getFeatured(params?: ProductSearchParams): Promise<ApiResponse<PaginatedResponse<Product>>>;
    /**
     * Get recently added products
     */
    getRecent(limit?: number, params?: Omit<ProductSearchParams, 'limit' | 'sort' | 'order'>): Promise<ApiResponse<PaginatedResponse<Product>>>;
    /** All custom fields (variants/options/attributes) on a product. */
    getCustomFields(product: Product): ProductCustomField[];
    /** Static attributes/specs (fields with a value, non-`options`). */
    getAttributes(product: Product): ProductCustomField[];
    /** Customer-fillable inputs (`options` fields or fields with no preset value). */
    getCustomerInputs(product: Product): ProductCustomField[];
    /**
     * Compute a product's unit price for the given customer selections
     * (base price + chosen option prices + add-on prices for filled inputs).
     */
    computeUnitPrice(product: Product, selections?: CustomFieldSelection[]): number;
    /** Whether a product is purchasable (unlimited or has remaining units). */
    isInStock(product: Product): boolean;
    /** Available units for a product, or `null` when unlimited. */
    getAvailableStock(product: Product): number | null;
    /**
     * Fetch a fresh stock snapshot by re-reading the product (there is no
     * dedicated stock endpoint). Use before checkout for an up-to-date count.
     */
    checkStock(productId: number): Promise<ApiResponse<ProductStock>>;
    /**
     * Faceted product search. Applies the given filters and groups results by one
     * or more whitelisted fields, returning per-group counts and price/stock
     * aggregates in a single request (`GET /products?...&group_by=...`).
     *
     * @example
     * // Category facet counts + price range for published products:
     * await products.facets({ status: 'published' }, { groupBy: 'category_id' });
     */
    facets(filters: ProductQueryParams | undefined, options: ProductFacetsOptions): Promise<ApiResponse<FacetBucket[]>>;
}
//# sourceMappingURL=products.d.ts.map