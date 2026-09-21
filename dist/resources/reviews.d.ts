import type { HttpClient } from '../client';
import type { ApiResponse, PaginatedResponse, Review, ReviewInput, ReviewListParams, ReviewStats } from '../types';
import { ReviewQueryBuilder, type Queryable } from '../utils/query-builders';
import { type ReviewQueryParams, type ReviewListResponse } from '../types/resources';
/**
 * Reviews resource for managing product reviews and ratings
 *
 * Reviews allow customers to rate and comment on products they've purchased.
 * This resource provides functionality for submitting, retrieving, and managing
 * product reviews with support for filtering, moderation, and statistics.
 */
export declare class ReviewsResource implements Queryable<ReviewListResponse> {
    private client;
    constructor(client: HttpClient);
    /**
     * List reviews with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of reviews
     */
    list(params?: ReviewListParams): Promise<ApiResponse<PaginatedResponse<Review>>>;
    /**
     * Run a typed review query (rating range/date filters + pagination).
     *
     * @example await reviews.query({ parent_id: 123, rating: { min: 4 }, page: 1 })
     */
    query(params?: ReviewQueryParams): Promise<ApiResponse<ReviewListResponse>>;
    /** Start a fluent review query, e.g. `reviews.createQueryBuilder().whereProduct(123).whereMinRating(4)`. */
    createQueryBuilder(initialQuery?: ReviewQueryParams): ReviewQueryBuilder;
    /**
     * Get a specific review by ID
     *
     * @param id - The review ID
     * @returns Promise resolving to the review
     */
    get(id: number): Promise<ApiResponse<Review>>;
    /**
     * Submit a new product review (requires authentication)
     *
     * @param input - The review data to create
     * @returns Promise resolving to the created review
     */
    create(input: ReviewInput): Promise<ApiResponse<Review>>;
    /**
     * Update an existing review (requires authentication)
     * Only the review author can update their own review
     *
     * @param id - The review ID to update
     * @param input - The updated review data
     * @returns Promise resolving to the updated review
     */
    update(id: number, input: Partial<Omit<ReviewInput, 'parent_id'>>): Promise<ApiResponse<Review>>;
    /**
     * Delete a review (requires authentication)
     * Only the review author can delete their own review
     *
     * @param id - The review ID to delete
     * @returns Promise resolving to void on successful deletion
     */
    delete(id: number): Promise<ApiResponse<void>>;
    /**
     * Get reviews for a specific product
     *
     * @param productId - The product ID
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of product reviews
     */
    getByProduct(productId: number, params?: Omit<ReviewListParams, 'parent_id'>): Promise<ApiResponse<PaginatedResponse<Review>>>;
    /**
     * Get review statistics for a product
     *
     * @param productId - The product ID
     * @returns Promise resolving to review statistics
     */
    getProductStats(productId: number): Promise<ApiResponse<ReviewStats>>;
    /**
     * Get reviews by a specific customer (requires authentication)
     *
     * @param customerId - The customer ID (optional, defaults to current authenticated customer)
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of customer reviews
     */
    getByCustomer(customerId?: number, params?: Omit<ReviewListParams, 'customer_id'>): Promise<ApiResponse<PaginatedResponse<Review>>>;
    /**
     * Get reviews for a product filtered by rating
     *
     * @param productId - The product ID
     * @param rating - The rating to filter by (1-5)
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of reviews with specific rating
     */
    getByProductAndRating(productId: number, rating: number, params?: Omit<ReviewListParams, 'parent_id' | 'rating'>): Promise<ApiResponse<PaginatedResponse<Review>>>;
    /**
     * Get verified purchase reviews for a product
     *
     * @param productId - The product ID
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of verified purchase reviews
     */
    getVerifiedReviews(productId: number, params?: Omit<ReviewListParams, 'parent_id'>): Promise<ApiResponse<PaginatedResponse<Review>>>;
    /**
     * Search reviews by content
     *
     * @param query - Search term to match against review title and comment
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of matching reviews
     */
    search(query: string, params?: ReviewListParams): Promise<ApiResponse<PaginatedResponse<Review>>>;
    /**
     * Get most helpful reviews for a product
     *
     * @param productId - The product ID
     * @param params - Additional query parameters
     * @returns Promise resolving to list of most helpful reviews
     */
    getTopRated(productId: number, params?: Omit<ReviewListParams, 'parent_id'>): Promise<ApiResponse<Review[]>>;
    /**
     * Get bulk review statistics for multiple products
     *
     * @param productIds - Array of product IDs
     * @returns Promise resolving to record of product ID to review stats
     */
    getBulkStats(productIds: number[]): Promise<ApiResponse<Record<number, ReviewStats>>>;
}
//# sourceMappingURL=reviews.d.ts.map