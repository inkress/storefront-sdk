// ============================================================================
// Per-resource query parameter & list-response types for the storefront SDK.
// Mirrors the @inkress/admin-sdk types/resources convention so the two SDKs
// share one query mental model.
// ============================================================================

import type { PaginatedResponse, Product, Category, Order, Review } from '../types';

// ---------------------------------------------------------------------------
// Contextual value unions (the API also accepts the raw numeric codes)
// ---------------------------------------------------------------------------
export type ProductStatus = 'draft' | 'published' | 'archived';
// Storefront orders carry string statuses (Order.status is a string). The API
// also accepts raw numeric codes, so OrderQueryParams.status permits both.
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'cancelled'
  | 'refunded';
export type OrderKind = 'offline' | 'online' | 'subscription';
/** Storefront categories use a numeric `kind` discriminator. */
export type CategoryKind = number;

// ---------------------------------------------------------------------------
// List responses (paginated envelopes carried inside ApiResponse.result)
// ---------------------------------------------------------------------------
export type ProductListResponse = PaginatedResponse<Product>;
export type CategoryListResponse = PaginatedResponse<Category>;
export type OrderListResponse = PaginatedResponse<Order>;
export type ReviewListResponse = PaginatedResponse<Review>;

// ---------------------------------------------------------------------------
// Query params. Range/contains/date filters are expressed as nested objects
// (e.g. price: { min, max }) and flattened by processQuery; an index signature
// keeps room for the API's full filter grammar.
// ---------------------------------------------------------------------------
type RangeFilter = number | { min?: number; max?: number };
type StringFilter = string | { contains: string };
type DateFilter = string | { after?: string; before?: string; on?: string };

interface BaseListParams {
  page?: number;
  page_size?: number;
  /** "field direction", e.g. "created_at desc". */
  order_by?: string;
  /** Free-text search. */
  q?: string;
}

export interface ProductQueryParams extends BaseListParams {
  status?: ProductStatus | ProductStatus[] | number | number[];
  price?: RangeFilter;
  title?: StringFilter;
  category_id?: number | number[];
  public?: boolean;
  unlimited?: boolean;
  units_remaining?: RangeFilter;
  created_at?: DateFilter;
  [key: string]: unknown;
}

export interface CategoryQueryParams extends BaseListParams {
  kind?: CategoryKind | CategoryKind[];
  name?: StringFilter;
  parent_id?: number | number[] | null;
  [key: string]: unknown;
}

export interface OrderQueryParams extends BaseListParams {
  status?: OrderStatus | OrderStatus[] | number | number[];
  kind?: OrderKind | OrderKind[] | number | number[];
  total?: RangeFilter;
  reference_id?: StringFilter;
  customer_id?: number | number[];
  created_at?: DateFilter;
  [key: string]: unknown;
}

export interface ReviewQueryParams extends BaseListParams {
  parent_id?: number | number[];
  customer_id?: number | number[];
  rating?: number | number[] | { min?: number; max?: number };
  created_at?: DateFilter;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Field-type maps. Passed to processQuery with a context so contextual string
// values for numeric `status`/`kind` fields are translated to the API's codes.
// Order `status` is intentionally omitted — storefront orders carry string
// statuses, so they pass through untranslated.
// ---------------------------------------------------------------------------
type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array';

export const PRODUCT_FIELD_TYPES: Record<string, FieldType> = {
  status: 'number',
  price: 'number',
  public: 'boolean',
  unlimited: 'boolean',
  category_id: 'number',
  units_remaining: 'number',
  title: 'string',
  created_at: 'date',
};

export const ORDER_FIELD_TYPES: Record<string, FieldType> = {
  kind: 'number',
  total: 'number',
  customer_id: 'number',
  reference_id: 'string',
  created_at: 'date',
};

export const CATEGORY_FIELD_TYPES: Record<string, FieldType> = {
  kind: 'number',
  parent_id: 'number',
  name: 'string',
};

export const REVIEW_FIELD_TYPES: Record<string, FieldType> = {
  parent_id: 'number',
  customer_id: 'number',
  rating: 'number',
  created_at: 'date',
};

/** Context strings used for contextual status/kind translation. */
export const QUERY_CONTEXT = {
  product: 'product',
  order: 'order',
  category: 'category',
  review: 'review',
} as const;
