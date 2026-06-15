import fetch from 'cross-fetch';

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
  data:
    | { result: string }
    | { reason: string }
    | string
    | Record<string, string[]>;
}

const LIVE_API = 'https://api.inkress.com';
const SANDBOX_API = 'https://api-dev.inkress.com';
const LIVE_SITE = 'https://inkress.com';
const SANDBOX_SITE = 'https://dev.inkress.com';

export class InkressApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'InkressApiError';
    this.status = status;
    this.details = details;
    if (details?.code) {
      this.code = details.code;
    }
  }
}

/** Resolved, fully-defaulted config including derived endpoints. */
type ResolvedConfig = Required<Omit<StorefrontConfig, 'endpoint' | 'siteUrl'>> & {
  endpoint: string;
  siteUrl: string;
};

export class HttpClient {
  private config: ResolvedConfig;

  constructor(config: StorefrontConfig = {}) {
    this.config = HttpClient.resolveConfig(config);
  }

  private static resolveConfig(config: StorefrontConfig): ResolvedConfig {
    const mode: SdkMode = config.mode || 'live';
    const endpoint = config.endpoint || (mode === 'sandbox' ? SANDBOX_API : LIVE_API);
    const siteUrl = config.siteUrl || (mode === 'sandbox' ? SANDBOX_SITE : LIVE_SITE);
    return {
      mode,
      endpoint,
      siteUrl,
      apiVersion: config.apiVersion || 'v1',
      merchantUsername: config.merchantUsername || '',
      authToken: config.authToken || '',
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 0,
      headers: config.headers || {},
    };
  }

  private getBaseUrl(): string {
    return `${this.config.endpoint}/api/${this.config.apiVersion}`;
  }

  /** Public site origin (for hosted checkout URLs), not the API endpoint. */
  getSiteUrl(): string {
    return this.config.siteUrl;
  }

  getMerchantUsername(): string {
    return this.config.merchantUsername;
  }

  private getHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...additionalHeaders,
    };
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }
    if (this.config.merchantUsername) {
      headers['Client-Id'] = `m-${this.config.merchantUsername}`;
    }
    return headers;
  }

  private async makeRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const url = `${this.getBaseUrl()}${path}`;
    const { method = 'GET', body, headers: requestHeaders, timeout } = options;

    const headers = this.getHeaders(requestHeaders);
    const requestTimeout = timeout || this.config.timeout;

    const requestInit: RequestInit = { method, headers };

    // Let FormData set its own multipart boundary; only JSON-encode plain bodies.
    if (body && method !== 'GET') {
      const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
      if (isFormData) {
        delete headers['Content-Type'];
        requestInit.body = body;
      } else {
        requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new InkressApiError('Request timeout', 0)), requestTimeout);
    });

    try {
      const response = await Promise.race([fetch(url, requestInit), timeoutPromise]);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: any;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || `HTTP ${response.status}` };
        }
        throw new InkressApiError(
          errorData.message || errorData.reason || `HTTP ${response.status}`,
          response.status,
          errorData
        );
      }

      const responseText = await response.text();
      if (!responseText) {
        return { state: 'ok', result: undefined as unknown as T };
      }
      return JSON.parse(responseText) as ApiResponse<T>;
    } catch (error) {
      if (error instanceof InkressApiError) {
        throw error;
      }
      throw new InkressApiError(error instanceof Error ? error.message : 'Unknown error', 0, { error });
    }
  }

  private async retryRequest<T>(
    path: string,
    options: RequestOptions = {},
    retries: number = this.config.retries
  ): Promise<ApiResponse<T>> {
    try {
      return await this.makeRequest<T>(path, options);
    } catch (error) {
      if (retries > 0 && this.shouldRetry(error)) {
        await this.delay(1000 * (this.config.retries - retries + 1));
        return this.retryRequest<T>(path, options, retries - 1);
      }
      throw error;
    }
  }

  private shouldRetry(error: any): boolean {
    if (error instanceof InkressApiError) {
      return error.status >= 500 || error.status === 0;
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async get<T>(
    path: string,
    params?: Record<string, any>,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    let url = path;
    if (params) {
      const searchParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    return this.retryRequest<T>(url, { ...options, method: 'GET' });
  }

  async post<T>(path: string, body?: any, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.retryRequest<T>(path, { ...options, method: 'POST', body });
  }

  async put<T>(path: string, body?: any, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.retryRequest<T>(path, { ...options, method: 'PUT', body });
  }

  async delete<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.retryRequest<T>(path, { ...options, method: 'DELETE' });
  }

  async patch<T>(path: string, body?: any, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>> {
    return this.retryRequest<T>(path, { ...options, method: 'PATCH', body });
  }

  updateConfig(newConfig: Partial<StorefrontConfig>): void {
    // Re-resolve so a mode change recomputes derived endpoints, while explicit
    // overrides already present are preserved unless overridden again.
    const merged: StorefrontConfig = {
      mode: newConfig.mode ?? this.config.mode,
      endpoint: newConfig.endpoint ?? (newConfig.mode ? undefined : this.config.endpoint),
      siteUrl: newConfig.siteUrl ?? (newConfig.mode ? undefined : this.config.siteUrl),
      apiVersion: newConfig.apiVersion ?? this.config.apiVersion,
      merchantUsername: newConfig.merchantUsername ?? this.config.merchantUsername,
      authToken: newConfig.authToken ?? this.config.authToken,
      timeout: newConfig.timeout ?? this.config.timeout,
      retries: newConfig.retries ?? this.config.retries,
      headers: newConfig.headers ?? this.config.headers,
    };
    this.config = HttpClient.resolveConfig(merged);
  }

  /** Current config with the auth token stripped. */
  getConfig(): Omit<StorefrontConfig, 'authToken'> {
    const { authToken: _authToken, ...rest } = this.config;
    return rest;
  }
}
