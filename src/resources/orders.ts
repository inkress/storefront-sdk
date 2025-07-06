import type { HttpClient } from '../client';
import type {
  ApiResponse,
  Order,
  OrderCreateRequest,
  PaginationParams,
  PaginatedResponse,
} from '../types';

export interface OrderListParams extends PaginationParams {
  status?: string;
  from_date?: string;
  to_date?: string;
  reference_id?: string;
}

/**
 * Orders resource for managing customer orders
 */
export class OrdersResource {
  constructor(private client: HttpClient) {}

  /**
   * Get customer's orders (requires authentication)
   */
  async list(params?: OrderListParams): Promise<ApiResponse<PaginatedResponse<Order>>> {
    return this.client.get<PaginatedResponse<Order>>('/orders', params);
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
    
    if (response.state === 'ok' && response.result && (response.result as any).entries.length > 0) {
      // Return the first order in the same format as get()
      return {
        state: response.state,
        result: (response.result as any).entries[0]
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
