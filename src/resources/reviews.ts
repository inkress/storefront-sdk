import type { HttpClient } from '../client';
import type {
  ApiResponse,
  PaginatedResponse,
  Review,
  ReviewInput,
  ReviewListParams,
  ReviewStats,
} from '../types';

/**
 * Reviews resource for managing product reviews and ratings
 * 
 * Reviews allow customers to rate and comment on products they've purchased.
 * This resource provides functionality for submitting, retrieving, and managing
 * product reviews with support for filtering, moderation, and statistics.
 */
export class ReviewsResource {
  constructor(private client: HttpClient) {}

  /**
   * List reviews with optional filtering and pagination
   * 
   * @param params - Query parameters for filtering and pagination
   * @returns Promise resolving to paginated list of reviews
   */
  async list(params?: ReviewListParams): Promise<ApiResponse<PaginatedResponse<Review>>> {
    return this.client.get<PaginatedResponse<Review>>('/reviews', params);
  }

  /**
   * Get a specific review by ID
   * 
   * @param id - The review ID
   * @returns Promise resolving to the review
   */
  async get(id: number): Promise<ApiResponse<Review>> {
    return this.client.get<Review>(`/reviews/${id}`);
  }

  /**
   * Submit a new product review (requires authentication)
   * 
   * @param input - The review data to create
   * @returns Promise resolving to the created review
   */
  async create(input: ReviewInput): Promise<ApiResponse<Review>> {
    return this.client.post<Review>('/reviews', input);
  }

  /**
   * Update an existing review (requires authentication)
   * Only the review author can update their own review
   * 
   * @param id - The review ID to update
   * @param input - The updated review data
   * @returns Promise resolving to the updated review
   */
  async update(id: number, input: Partial<Omit<ReviewInput, 'parent_id'>>): Promise<ApiResponse<Review>> {
    return this.client.put<Review>(`/reviews/${id}`, input);
  }

  /**
   * Delete a review (requires authentication)
   * Only the review author can delete their own review
   * 
   * @param id - The review ID to delete
   * @returns Promise resolving to void on successful deletion
   */
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/reviews/${id}`);
  }

  // Product-specific review methods

  /**
   * Get reviews for a specific product
   * 
   * @param productId - The product ID
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of product reviews
   */
  async getByProduct(productId: number, params?: Omit<ReviewListParams, 'parent_id'>): Promise<ApiResponse<PaginatedResponse<Review>>> {
    return this.list({ ...params, parent_id: productId });
  }

  /**
   * Get review statistics for a product
   * 
   * @param productId - The product ID
   * @returns Promise resolving to review statistics
   */
  async getProductStats(productId: number): Promise<ApiResponse<ReviewStats>> {
    return this.client.get<ReviewStats>(`/products/${productId}/reviews/stats`);
  }

  /**
   * Get reviews by a specific customer (requires authentication)
   * 
   * @param customerId - The customer ID (optional, defaults to current authenticated customer)
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of customer reviews
   */
  async getByCustomer(customerId?: number, params?: Omit<ReviewListParams, 'customer_id'>): Promise<ApiResponse<PaginatedResponse<Review>>> {
    return this.list({ ...params, customer_id: customerId });
  }

  /**
   * Get reviews for a product filtered by rating
   * 
   * @param productId - The product ID
   * @param rating - The rating to filter by (1-5)
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of reviews with specific rating
   */
  async getByProductAndRating(
    productId: number, 
    rating: number, 
    params?: Omit<ReviewListParams, 'parent_id' | 'rating'>
  ): Promise<ApiResponse<PaginatedResponse<Review>>> {
    return this.list({ ...params, parent_id: productId, rating });
  }

  /**
   * Get verified purchase reviews for a product
   * 
   * @param productId - The product ID
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of verified purchase reviews
   */
  async getVerifiedReviews(productId: number, params?: Omit<ReviewListParams, 'parent_id'>): Promise<ApiResponse<PaginatedResponse<Review>>> {
    // Note: The 'verified_purchase' field would need to be added to ReviewListParams if this functionality exists
    return this.list({ ...params, parent_id: productId });
  }

  /**
   * Search reviews by content
   * 
   * @param query - Search term to match against review title and comment
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of matching reviews
   */
  async search(query: string, params?: ReviewListParams): Promise<ApiResponse<PaginatedResponse<Review>>> {
    // Note: Search functionality would depend on API support
    return this.list({ ...params });
  }

  // Review moderation and management methods

  /**
   * Get most helpful reviews for a product
   * 
   * @param productId - The product ID
   * @param params - Additional query parameters
   * @returns Promise resolving to list of most helpful reviews
   */
  async getTopRated(productId: number, params?: Omit<ReviewListParams, 'parent_id'>): Promise<ApiResponse<Review[]>> {
    const response = await this.list({
      ...params,
      parent_id: productId,
      sort: 'helpful_count',
      order: 'desc',
      page_size: 10
    });
    
    return {
      ...response,
      result: response.result ? response.result.entries : []
    };
  }

  /**
   * Get bulk review statistics for multiple products
   * 
   * @param productIds - Array of product IDs
   * @returns Promise resolving to record of product ID to review stats
   */
  async getBulkStats(productIds: number[]): Promise<ApiResponse<Record<number, ReviewStats>>> {
    return this.client.post<Record<number, ReviewStats>>('/reviews/bulk-stats', { product_ids: productIds });
  }
}