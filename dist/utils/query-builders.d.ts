import { QueryBuilder } from './query-transformer';
import type { ApiResponse } from '../types';
import type { Product, Category, Order, Review } from '../types';
import type { ProductListResponse, CategoryListResponse, OrderListResponse, ReviewListResponse, ProductQueryParams, CategoryQueryParams, OrderQueryParams, ReviewQueryParams, ProductStatus, OrderStatus, OrderKind, CategoryKind } from '../types/resources';
/**
 * A resource that can run a query and return a paginated list. Implementors
 * (the API resources, wired in PR3) are responsible for running `processQuery`
 * — with their field-type map + context so status/kind strings get translated —
 * before hitting the API. Builders pass their raw query to `query()`.
 */
export interface Queryable<TResponse> {
    query(params?: any): Promise<ApiResponse<TResponse>>;
}
/**
 * Product query builder.
 *
 * @example
 * const products = await sdk.products.createQueryBuilder()
 *   .whereStatus('published')
 *   .wherePriceRange(10, 100)
 *   .whereTitleContains('shirt')
 *   .wherePublic(true)
 *   .paginate(1, 20)
 *   .execute();
 */
export declare class ProductQueryBuilder extends QueryBuilder<Product> {
    private resource;
    constructor(resource: Queryable<ProductListResponse>, initialQuery?: ProductQueryParams);
    execute(): Promise<ApiResponse<ProductListResponse>>;
    whereStatus(status: ProductStatus | ProductStatus[]): this;
    wherePriceRange(min?: number, max?: number): this;
    whereTitleContains(value: string): this;
    wherePublic(isPublic: boolean): this;
    whereCategory(categoryId: number | number[]): this;
    whereUnitsRemainingRange(min?: number, max?: number): this;
    whereUnlimited(isUnlimited: boolean): this;
}
/**
 * Category query builder.
 *
 * @example
 * const cats = await sdk.categories.createQueryBuilder()
 *   .whereParent(7)
 *   .whereNameContains('apparel')
 *   .execute();
 */
export declare class CategoryQueryBuilder extends QueryBuilder<Category> {
    private resource;
    constructor(resource: Queryable<CategoryListResponse>, initialQuery?: CategoryQueryParams);
    execute(): Promise<ApiResponse<CategoryListResponse>>;
    whereKind(kind: CategoryKind | CategoryKind[]): this;
    whereNameContains(value: string): this;
    /** Filter to the children of a given parent category. */
    whereParent(parentId: number | number[]): this;
}
/**
 * Order query builder (customer-scoped; requires an auth token).
 *
 * @example
 * const orders = await sdk.orders.createQueryBuilder()
 *   .whereStatus('completed')
 *   .whereTotalRange(100, 1000)
 *   .orderBy('created_at', 'desc')
 *   .execute();
 */
export declare class OrderQueryBuilder extends QueryBuilder<Order> {
    private resource;
    constructor(resource: Queryable<OrderListResponse>, initialQuery?: OrderQueryParams);
    execute(): Promise<ApiResponse<OrderListResponse>>;
    whereStatus(status: OrderStatus | OrderStatus[]): this;
    whereKind(kind: OrderKind | OrderKind[]): this;
    whereTotalRange(min?: number, max?: number): this;
    whereReferenceContains(value: string): this;
    whereCreatedBetween(after?: string, before?: string): this;
}
/**
 * Review query builder.
 *
 * @example
 * const reviews = await sdk.reviews.createQueryBuilder()
 *   .whereProduct(123)
 *   .whereMinRating(4)
 *   .orderBy('created_at', 'desc')
 *   .execute();
 */
export declare class ReviewQueryBuilder extends QueryBuilder<Review> {
    private resource;
    constructor(resource: Queryable<ReviewListResponse>, initialQuery?: ReviewQueryParams);
    execute(): Promise<ApiResponse<ReviewListResponse>>;
    /** Reviews are attached to a product via `parent_id`. */
    whereProduct(productId: number | number[]): this;
    whereRating(rating: number | number[]): this;
    whereMinRating(min: number): this;
    whereCustomer(customerId: number | number[]): this;
}
//# sourceMappingURL=query-builders.d.ts.map