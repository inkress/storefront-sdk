// ============================================================================
// Fluent, type-safe query builders for the storefront's list-bearing resources.
// Ported from @inkress/admin-sdk and scoped to products, categories, orders,
// and reviews. Each builder extends the shared QueryBuilder<T> and resolves via
// a resource that implements Queryable.
// ============================================================================

import { QueryBuilder } from './query-transformer';
import type { ApiResponse } from '../types';
import type { Product, Category, Order, Review } from '../types';
import type {
  ProductListResponse,
  CategoryListResponse,
  OrderListResponse,
  ReviewListResponse,
  ProductQueryParams,
  CategoryQueryParams,
  OrderQueryParams,
  ReviewQueryParams,
  ProductStatus,
  OrderStatus,
  OrderKind,
  CategoryKind,
} from '../types/resources';

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
export class ProductQueryBuilder extends QueryBuilder<Product> {
  constructor(
    private resource: Queryable<ProductListResponse>,
    initialQuery?: ProductQueryParams
  ) {
    super(initialQuery);
  }

  execute(): Promise<ApiResponse<ProductListResponse>> {
    return this.resource.query(this.getRawQuery());
  }

  whereStatus(status: ProductStatus | ProductStatus[]): this {
    return Array.isArray(status) ? this.whereIn('status', status as any) : this.where('status', status as any);
  }

  wherePriceRange(min?: number, max?: number): this {
    return this.whereRange('price', min, max);
  }

  whereTitleContains(value: string): this {
    return this.whereContains('title', value);
  }

  wherePublic(isPublic: boolean): this {
    return this.where('public', isPublic);
  }

  whereCategory(categoryId: number | number[]): this {
    return Array.isArray(categoryId) ? this.whereIn('category_id', categoryId) : this.where('category_id', categoryId);
  }

  whereUnitsRemainingRange(min?: number, max?: number): this {
    return this.whereRange('units_remaining', min, max);
  }

  whereUnlimited(isUnlimited: boolean): this {
    return this.where('unlimited', isUnlimited);
  }
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
export class CategoryQueryBuilder extends QueryBuilder<Category> {
  constructor(
    private resource: Queryable<CategoryListResponse>,
    initialQuery?: CategoryQueryParams
  ) {
    super(initialQuery);
  }

  execute(): Promise<ApiResponse<CategoryListResponse>> {
    return this.resource.query(this.getRawQuery());
  }

  whereKind(kind: CategoryKind | CategoryKind[]): this {
    return Array.isArray(kind) ? this.whereIn('kind', kind as any) : this.where('kind', kind as any);
  }

  whereNameContains(value: string): this {
    return this.whereContains('name', value);
  }

  /** Filter to the children of a given parent category. */
  whereParent(parentId: number | number[]): this {
    return Array.isArray(parentId) ? this.whereIn('parent_id', parentId) : this.where('parent_id', parentId);
  }
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
export class OrderQueryBuilder extends QueryBuilder<Order> {
  constructor(
    private resource: Queryable<OrderListResponse>,
    initialQuery?: OrderQueryParams
  ) {
    super(initialQuery);
  }

  execute(): Promise<ApiResponse<OrderListResponse>> {
    return this.resource.query(this.getRawQuery());
  }

  whereStatus(status: OrderStatus | OrderStatus[]): this {
    return Array.isArray(status) ? this.whereIn('status', status as any) : this.where('status', status as any);
  }

  whereKind(kind: OrderKind | OrderKind[]): this {
    return Array.isArray(kind) ? this.whereIn('kind', kind as any) : this.where('kind', kind as any);
  }

  whereTotalRange(min?: number, max?: number): this {
    return this.whereRange('total', min, max);
  }

  whereReferenceContains(value: string): this {
    return this.whereContains('reference_id', value);
  }

  whereCreatedBetween(after?: string, before?: string): this {
    return this.whereDateRange('created_at', after, before);
  }
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
export class ReviewQueryBuilder extends QueryBuilder<Review> {
  constructor(
    private resource: Queryable<ReviewListResponse>,
    initialQuery?: ReviewQueryParams
  ) {
    super(initialQuery);
  }

  execute(): Promise<ApiResponse<ReviewListResponse>> {
    return this.resource.query(this.getRawQuery());
  }

  /** Reviews are attached to a product via `parent_id`. */
  whereProduct(productId: number | number[]): this {
    return Array.isArray(productId) ? this.whereIn('parent_id', productId) : this.where('parent_id', productId);
  }

  whereRating(rating: number | number[]): this {
    return Array.isArray(rating) ? this.whereIn('rating', rating) : this.where('rating', rating);
  }

  whereMinRating(min: number): this {
    return this.whereRange('rating', min, undefined);
  }

  whereCustomer(customerId: number | number[]): this {
    return Array.isArray(customerId) ? this.whereIn('customer_id', customerId) : this.where('customer_id', customerId);
  }
}
