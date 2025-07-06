import type { HttpClient } from '../client';
import type {
  ApiResponse,
  Product,
  Merchant,
} from '../types';

export interface PublicMerchantFees {
  currency_code: string;
  subtotal: number;
  fees: {
    platform_fee: number;
    payment_processing_fee: number;
    total_fees: number;
  };
  total: number;
}

export interface PublicMerchantTokens {
  publishable_key?: string;
  client_id?: string;
}

export interface MerchantProductsParams {
  page?: number;
  limit?: number;
}

export interface PaymentMethod {
  id: number;
  name: string;
  type: string;
  enabled: boolean;
  config?: Record<string, any>;
}

/**
 * Merchants resource for accessing public merchant information
 */
export class MerchantsResource {
  constructor(private client: HttpClient) {}

  /**
   * Get merchant public profile information
   */
  async getByUsername(merchantUsername: string): Promise<ApiResponse<Merchant>> {
    return this.client.get<Merchant>('/public/m', { username: merchantUsername });
  }

  /**
   * Get merchant by domain
   */
  async getByDomain(domain: string): Promise<ApiResponse<Merchant>> {
    return this.client.get<Merchant>('/public/m', { 'domain.cname': domain });
  }

  /**
   * Get merchant fee calculation
   */
  async getFees(merchantUsername: string): Promise<ApiResponse<PublicMerchantFees>> {
    return this.client.get<PublicMerchantFees>(`/public/m/${merchantUsername}/fees`);
  }

  /**
   * Get merchant's public products
   */
  async getProducts(
    merchantUsername: string,
    params?: MerchantProductsParams
  ): Promise<ApiResponse<Product[]>> {
    return this.client.get<Product[]>(
      `/public/m/${merchantUsername}/products`,
      params
    );
  }

  /**
   * Get merchant public tokens/keys
   */
  async getTokens(merchantUsername: string): Promise<ApiResponse<PublicMerchantTokens>> {
    return this.client.get<PublicMerchantTokens>(`/public/m/${merchantUsername}/tokens`);
  }

  /**
   * Get merchant payment methods
   */
  async getPaymentMethods(merchantUsername: string): Promise<ApiResponse<PaymentMethod[]>> {
    return this.client.get<PaymentMethod[]>(`/public/m/${merchantUsername}/payment_methods`);
  }
}
