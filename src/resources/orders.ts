import type { HttpClient } from '../client';
import type {
  ApiResponse,
  Order,
  OrderCreateRequest,
  PaginationParams,
  PaginatedResponse,
} from '../types';
import { processQuery } from '../utils/query-transformer';
import { OrderQueryBuilder, type Queryable } from '../utils/query-builders';
import {
  ORDER_FIELD_TYPES,
  QUERY_CONTEXT,
  type OrderQueryParams,
  type OrderListResponse,
} from '../types/resources';

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
export class OrdersResource implements Queryable<OrderListResponse> {
  constructor(private client: HttpClient) {}

  /**
   * Get customer's orders (requires authentication)
   */
  async list(params?: OrderListParams): Promise<ApiResponse<PaginatedResponse<Order>>> {
    return this.client.get<PaginatedResponse<Order>>('/orders', params);
  }

  /**
   * Run a typed order query (range/contains/date filters; `kind` is translated
   * to API codes, `status` passes through as a string).
   *
   * @example await orders.query({ status: 'completed', total: { min: 100 }, page: 1 })
   */
  async query(params?: OrderQueryParams): Promise<ApiResponse<OrderListResponse>> {
    const processed = processQuery(params || {}, ORDER_FIELD_TYPES, { context: QUERY_CONTEXT.order });
    return this.client.get<OrderListResponse>('/orders', processed);
  }

  /** Start a fluent order query. */
  createQueryBuilder(initialQuery?: OrderQueryParams): OrderQueryBuilder {
    return new OrderQueryBuilder(this, initialQuery);
  }

  /**
   * Get a specific order by ID (requires authentication)
   */
  async get(orderId: number): Promise<ApiResponse<Order>> {
    return this.client.get<Order>(`/orders/${orderId}`, {});
  }

  /**
   * Create a new order
   */
  async create(orderData: OrderCreateRequest): Promise<ApiResponse<Order>> {
    // Auto-generate reference_id if not provided
    const orderWithReference = {
      total: orderData.total || 0,
      ...orderData,
      reference_id: orderData.reference_id || `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    return this.client.post<Order>('/orders', orderWithReference);
  }

  /**
   * Get order by reference ID (searches by reference and returns single order like get response)
   */
  async getByReference(referenceId: string): Promise<ApiResponse<Order>> {
    const response = await this.list({ reference_id: referenceId, page_size: 1 });

    if (response.state === 'ok' && response.result && response.result.entries.length > 0) {
      // Return the first order in the same format as get()
      return {
        state: response.state,
        result: response.result.entries[0]
      };
    } else {
      // Return not found response
      return {
        state: 'error',
        result: undefined
      };
    }
  }

  /**
   * Cancel an order by updating status to cancelled (requires authentication)
   */
  async cancel(orderId: number, reason?: string): Promise<ApiResponse<Order>> {
    return this.client.put<Order>(`/orders/${orderId}`, { 
      status: 'cancelled',
      cancellation_reason: reason 
    });
  }

  /**
   * Get recent orders (last 5 by default)
   */
  async getRecent(limit = 5): Promise<ApiResponse<PaginatedResponse<Order>>> {
    return this.list({ 
      page_size: limit, 
      sort: 'created_at', 
      order: 'desc' 
    });
  }

  /**
   * Get orders by status
   */
  async getByStatus(status: string, params?: Omit<OrderListParams, 'status'>): Promise<ApiResponse<PaginatedResponse<Order>>> {
    return this.list({ ...params, status });
  }
}
