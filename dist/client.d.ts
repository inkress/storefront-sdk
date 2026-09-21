export type SdkMode = 'live' | 'sandbox';
export interface StorefrontConfig {
    /** Environment mode. Resolves the API + site endpoints. Default: 'live'. */
    mode?: SdkMode;
    /** Override the API endpoint origin (advanced). Normally derived from `mode`. */
    endpoint?: string;
    /** Override the public site origin used for hosted-checkout URLs. Derived from `mode`. */
    siteUrl?: string;
    /** API version path segment. Default: 'v1'. */
    apiVersion?: string;
    /** Merchant username for public endpoints. Sent as `Client-Id: m-<username>`. */
    merchantUsername?: string;
    /** Customer auth token (Bearer) for authenticated endpoints. */
    authToken?: string;
    /** Request timeout in milliseconds. Default: 30000. */
    timeout?: number;
    /** Number of retry attempts on 5xx/timeout. Default: 0. */
    retries?: number;
    /** Custom headers merged into every request. */
    headers?: Record<string, string>;
}
export interface RequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    body?: any;
    headers?: Record<string, string>;
    timeout?: number;
}
export interface ApiResponse<T = any> {
    state: 'ok' | 'error';
    /** Present on some endpoints; may be simple data or null. */
    data?: any;
    /** The actual payload — a single item or a paginated list. */
    result?: T;
}
export interface ErrorResponse {
    state: 'error';
    data: {
        result: string;
    } | {
        reason: string;
    } | string | Record<string, string[]>;
}
export declare class InkressApiError extends Error {
    readonly status: number;
    readonly code?: string;
    readonly details?: any;
    constructor(message: string, status: number, details?: any);
}
export declare class HttpClient {
    private config;
    constructor(config?: StorefrontConfig);
    private static resolveConfig;
    private getBaseUrl;
    /** Public site origin (for hosted checkout URLs), not the API endpoint. */
    getSiteUrl(): string;
    getMerchantUsername(): string;
    private getHeaders;
    private makeRequest;
    private retryRequest;
    private shouldRetry;
    private delay;
    get<T>(path: string, params?: Record<string, any>, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>>;
    post<T>(path: string, body?: any, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>>;
    put<T>(path: string, body?: any, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>>;
    delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>>;
    patch<T>(path: string, body?: any, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>>;
    updateConfig(newConfig: Partial<StorefrontConfig>): void;
    /** Current config with the auth token stripped. */
    getConfig(): Omit<StorefrontConfig, 'authToken'>;
}
//# sourceMappingURL=client.d.ts.map