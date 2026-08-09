import type { HttpClient } from '../client';
import type {
  ApiResponse,
  Product,
  ProductSearchParams,
  PaginatedResponse,
  ProductCustomField,
  CustomFieldSelection,
  ProductStock,
  FacetBucket,
  ProductFacetsOptions,
  ProductGroupByField,
} from '../types';
import { PRODUCT_GROUP_BY_FIELDS } from '../types';
import { processQuery } from '../utils/query-transformer';
import { ProductQueryBuilder, type Queryable } from '../utils/query-builders';
import {
  getProductCustomFields,
  getProductAttributes,
  getProductCustomerInputs,
  computeProductUnitPrice,
  isProductInStock,
  getProductAvailableStock,
  toProductStock,
  normalizeFacetRow,
} from '../utils/variants';
import {
  PRODUCT_FIELD_TYPES,
  QUERY_CONTEXT,
  type ProductQueryParams,
  type ProductListResponse,
} from '../types/resources';

/**
 * Products resource for accessing product information.
 *
 * Two ways to list:
 *  - `search(params)` and the convenience helpers — simple param objects.
 *  - `query(params)` / `createQueryBuilder()` — the typed query system shared
 *    with @inkress/admin-sdk (range/contains/date filters + status translation).
 */
export class ProductsResource implements Queryable<ProductListResponse> {
  constructor(private client: HttpClient) {}

  /**
   * Get a specific product by ID
   */
  async get(productId: number): Promise<ApiResponse<Product>> {
    return this.client.get<Product>(`/products/${productId}`);
  }

  /**
   * Run a typed product query. Transforms range/contains/date filters and
   * translates contextual `status` strings (e.g. 'published') to API codes.
   *
   * @example await products.query({ status: 'published', price: { min: 20 }, page: 1 })
   */
  async query(params?: ProductQueryParams): Promise<ApiResponse<ProductListResponse>> {
    const processed = processQuery(params || {}, PRODUCT_FIELD_TYPES, { context: QUERY_CONTEXT.product });
    return this.client.get<ProductListResponse>('/products', processed);
  }

  /** Start a fluent product query, e.g. `products.createQueryBuilder().whereStatus('published').execute()`. */
  createQueryBuilder(initialQuery?: ProductQueryParams): ProductQueryBuilder {
    return new ProductQueryBuilder(this, initialQuery);
  }

  /**
   * Search products with filters and pagination (simple param object).
   */
  async search(params?: ProductSearchParams): Promise<ApiResponse<PaginatedResponse<Product>>> {
    return this.client.get<PaginatedResponse<Product>>('/products', params);
  }

  /**
   * Get products by category
   */
  async getByCategory(
    categoryId: number, 
    params?: Omit<ProductSearchParams, 'category_id'>
  ): Promise<ApiResponse<PaginatedResponse<Product>>> {
    return this.search({ ...params, category_id: categoryId });
  }

  /**
   * Search products by query string
   */
  async searchByQuery(
    query: string, 
    params?: Omit<ProductSearchParams, 'q' | 'search'>
  ): Promise<ApiResponse<PaginatedResponse<Product>>> {
    return this.search({ ...params, q: query || params?.search || params?.q });
  }

  /**
   * Get products within a price range
   */
  async getByPriceRange(
    minPrice: number,
    maxPrice: number,
    params?: Omit<ProductSearchParams, 'min_price' | 'max_price'>
  ): Promise<ApiResponse<PaginatedResponse<Product>>> {
    return this.search({ ...params, price_min: minPrice, price_max: maxPrice });
  }

  /**
   * Get only in-stock products
   */
  async getInStock(
    params?: Omit<ProductSearchParams, 'in_stock'>
  ): Promise<ApiResponse<PaginatedResponse<Product>>> {
    return this.search({ ...params, units_remaining_min: 1 });
  }

  /**
   * Get featured/popular products (customize based on your API)
   */
  async getFeatured(params?: ProductSearchParams): Promise<ApiResponse<PaginatedResponse<Product>>> {
    // This might need to be adjusted based on your API's featured products endpoint
    return this.search({ ...params, 'data.featured': true });
  }

  /**
   * Get recently added products
   */
  async getRecent(
    limit = 12,
    params?: Omit<ProductSearchParams, 'limit' | 'sort' | 'order'>
  ): Promise<ApiResponse<PaginatedResponse<Product>>> {
    return this.search({
      ...params,
      limit,
      sort: 'created_at',
      order: 'desc'
    });
  }

  // ---------------------------------------------------------------------------
  // Variants / options (read helpers — authored in the merchant product form)
  // ---------------------------------------------------------------------------

  /** All custom fields (variants/options/attributes) on a product. */
  getCustomFields(product: Product): ProductCustomField[] {
    return getProductCustomFields(product);
  }

  /** Static attributes/specs (fields with a value, non-`options`). */
  getAttributes(product: Product): ProductCustomField[] {
    return getProductAttributes(product);
  }

  /** Customer-fillable inputs (`options` fields or fields with no preset value). */
  getCustomerInputs(product: Product): ProductCustomField[] {
    return getProductCustomerInputs(product);
  }

  /**
   * Compute a product's unit price for the given customer selections
   * (base price + chosen option prices + add-on prices for filled inputs).
   */
  computeUnitPrice(product: Product, selections: CustomFieldSelection[] = []): number {
    return computeProductUnitPrice(product, selections);
  }

  // ---------------------------------------------------------------------------
  // Stock
  // ---------------------------------------------------------------------------

  /** Whether a product is purchasable (unlimited or has remaining units). */
  isInStock(product: Product): boolean {
    return isProductInStock(product);
  }

  /** Available units for a product, or `null` when unlimited. */
  getAvailableStock(product: Product): number | null {
    return getProductAvailableStock(product);
  }

  /**
   * Fetch a fresh stock snapshot by re-reading the product (there is no
   * dedicated stock endpoint). Use before checkout for an up-to-date count.
   */
  async checkStock(productId: number): Promise<ApiResponse<ProductStock>> {
    const response = await this.get(productId);
    return {
      state: response.state,
      result: response.result ? toProductStock(response.result) : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Faceted search (server-side group_by)
  // ---------------------------------------------------------------------------

  /**
   * Faceted product search. Applies the given filters and groups results by one
   * or more whitelisted fields, returning per-group counts and price/stock
   * aggregates in a single request (`GET /products?...&group_by=...`).
   *
   * @example
   * // Category facet counts + price range for published products:
   * await products.facets({ status: 'published' }, { groupBy: 'category_id' });
   */
  async facets(
    filters: ProductQueryParams | undefined,
    options: ProductFacetsOptions,
  ): Promise<ApiResponse<FacetBucket[]>> {
    const groupBy: ProductGroupByField[] = Array.isArray(options.groupBy)
      ? options.groupBy
      : [options.groupBy];

    const invalid = groupBy.filter((f) => !PRODUCT_GROUP_BY_FIELDS.includes(f));
    if (invalid.length > 0) {
      throw new Error(
        `Unsupported facet group_by field(s): ${invalid.join(', ')}. ` +
          `Allowed: ${PRODUCT_GROUP_BY_FIELDS.join(', ')}.`,
      );
    }

    const processed = processQuery(filters || {}, PRODUCT_FIELD_TYPES, {
      context: QUERY_CONTEXT.product,
    });
    const response = await this.client.get<ProductListResponse>('/products', {
      ...processed,
      group_by: groupBy.join(','),
    });

    const rows: Array<Record<string, any>> = (response.result as any)?.entries ?? [];
    return {
      state: response.state,
      result: rows.map((row) => normalizeFacetRow(row, groupBy[0])),
    };
  }
}
