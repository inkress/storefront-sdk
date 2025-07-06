import type { HttpClient } from '../client';
import type {
  ApiResponse,
  Product,
  ProductSearchParams,
  PaginatedResponse,
} from '../types';

/**
 * Products resource for accessing product information
 */
export class ProductsResource {
  constructor(private client: HttpClient) {}

  /**
   * Get a specific product by ID
   */
  async get(productId: number): Promise<ApiResponse<Product>> {
    return this.client.get<Product>(`/products/${productId}`);
  }

  /**
   * Search products with filters and pagination
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
}
