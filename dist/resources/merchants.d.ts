import type { HttpClient } from '../client';
import type { ApiResponse, Product, Merchant } from '../types';
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
export declare class MerchantsResource {
    private client;
    constructor(client: HttpClient);
    /**
     * Get merchant public profile information
     */
    getByUsername(merchantUsername: string): Promise<ApiResponse<Merchant>>;
    /**
     * Get merchant by domain
     */
    getByDomain(domain: string): Promise<ApiResponse<Merchant>>;
    /**
     * Get merchant fee calculation
     */
    getFees(merchantUsername: string): Promise<ApiResponse<PublicMerchantFees>>;
    /**
     * Get merchant's public products
     */
    getProducts(merchantUsername: string, params?: MerchantProductsParams): Promise<ApiResponse<Product[]>>;
    /**
     * Get merchant public tokens/keys
     */
    getTokens(merchantUsername: string): Promise<ApiResponse<PublicMerchantTokens>>;
    /**
     * Get merchant payment methods
     */
    getPaymentMethods(merchantUsername: string): Promise<ApiResponse<PaymentMethod[]>>;
}
//# sourceMappingURL=merchants.d.ts.map