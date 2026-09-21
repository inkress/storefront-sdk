import type { PaginatedResponse, Product, Category, Order, Review } from '../types';
export type ProductStatus = 'draft' | 'published' | 'archived';
export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'refunded';
export type OrderKind = 'offline' | 'online' | 'subscription';
/** Storefront categories use a numeric `kind` discriminator. */
export type CategoryKind = number;
export type ProductListResponse = PaginatedResponse<Product>;
export type CategoryListResponse = PaginatedResponse<Category>;
export type OrderListResponse = PaginatedResponse<Order>;
export type ReviewListResponse = PaginatedResponse<Review>;
type RangeFilter = number | {
    min?: number;
    max?: number;
};
type StringFilter = string | {
    contains: string;
};
type DateFilter = string | {
    after?: string;
    before?: string;
    on?: string;
};
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
    rating?: number | number[] | {
        min?: number;
        max?: number;
    };
    created_at?: DateFilter;
    [key: string]: unknown;
}
type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'array';
export declare const PRODUCT_FIELD_TYPES: Record<string, FieldType>;
export declare const ORDER_FIELD_TYPES: Record<string, FieldType>;
export declare const CATEGORY_FIELD_TYPES: Record<string, FieldType>;
export declare const REVIEW_FIELD_TYPES: Record<string, FieldType>;
/** Context strings used for contextual status/kind translation. */
export declare const QUERY_CONTEXT: {
    readonly product: "product";
    readonly order: "order";
    readonly category: "category";
    readonly review: "review";
};
export {};
//# sourceMappingURL=resources.d.ts.map