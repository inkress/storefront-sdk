import type { HttpClient } from '../client';
import type { ApiResponse, Order, OrderCreateRequest, PaginationParams, PaginatedResponse } from '../types';
import { OrderQueryBuilder, type Queryable } from '../utils/query-builders';
import { type OrderQueryParams, type OrderListResponse } from '../types/resources';
export interface OrderListParams extends PaginationParams {
    status?: string;
    from_date?: string;
    to_date?: string;
    reference_id?: string;
}
/**
 * Orders resource for managing customer orders (requires an auth token for
 * customer-scoped reads).
 */
export declare class OrdersResource implements Queryable<OrderListResponse> {
    private client;
    constructor(client: HttpClient);
    /**
     * Get customer's orders (requires authentication)
     */
    list(params?: OrderListParams): Promise<ApiResponse<PaginatedResponse<Order>>>;
    /**
     * Run a typed order query (range/contains/date filters; `kind` is translated
     * to API codes, `status` passes through as a string).
     *
     * @example await orders.query({ status: 'completed', total: { min: 100 }, page: 1 })
     */
    query(params?: OrderQueryParams): Promise<ApiResponse<OrderListResponse>>;
    /** Start a fluent order query. */
    createQueryBuilder(initialQuery?: OrderQueryParams): OrderQueryBuilder;
    /**
     * Get a specific order by ID (requires authentication)
     */
    get(orderId: number): Promise<ApiResponse<Order>>;
    /**
     * Create a new order
     */
    create(orderData: OrderCreateRequest): Promise<ApiResponse<Order>>;
    /**
     * Get order by reference ID (searches by reference and returns single order like get response)
     */
    getByReference(referenceId: string): Promise<ApiResponse<Order>>;
    /**
     * Cancel an order by updating status to cancelled (requires authentication)
     */
    cancel(orderId: number, reason?: string): Promise<ApiResponse<Order>>;
    /**
     * Get recent orders (last 5 by default)
     */
    getRecent(limit?: number): Promise<ApiResponse<PaginatedResponse<Order>>>;
    /**
     * Get orders by status
     */
    getByStatus(status: string, params?: Omit<OrderListParams, 'status'>): Promise<ApiResponse<PaginatedResponse<Order>>>;
}
//# sourceMappingURL=orders.d.ts.map