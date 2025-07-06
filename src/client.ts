import fetch from 'cross-fetch';

export interface StorefrontConfig {
  /** API endpoint URL */
  endpoint?: string;
  /** API version */
  apiVersion?: string;
  /** Merchant username for public endpoints */
  merchantUsername?: string;
  /** Customer auth token for authenticated endpoints */
  authToken?: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts */
  retries?: number;
  /** Custom headers to include with requests */
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
  data?: any; // May contain simple data or be null
  result?: T; // Contains the actual response data (single item or paginated list)
}

export interface ErrorResponse {
  state: 'error';
  data: 
    | { result: string }
    | { reason: string }
    | string
    | Record<string, string[]>; // validation errors
}

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

export class HttpClient {
  private config: Required<StorefrontConfig>;

  constructor(config: StorefrontConfig) {
    this.config = {
      endpoint: 'https://api.inkress.com',
      apiVersion: 'v1',
      merchantUsername: '',
      authToken: '',
      timeout: 30000,
      retries: 0,
      headers: {},
      ...config,
    };
  }

  private getBaseUrl(): string {
    const { endpoint, apiVersion } = this.config;
    return `${endpoint}/api/${apiVersion}`;
  }

  private getHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
      ...additionalHeaders,
    };

    // Add auth header if token is available
    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    // Add auth header if token is available
    if (this.config.merchantUsername) {
      headers['client-id'] = `m-${this.config.merchantUsername}`;
    }

    return headers;
  }

  private async makeRequest<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.getBaseUrl()}${path}`;
    const { method = 'GET', body, headers: requestHeaders, timeout } = options;

    const headers = this.getHeaders(requestHeaders);
    const requestTimeout = timeout || this.config.timeout;

    // eslint-disable-next-line no-undef
    const requestInit: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Request timeout')), requestTimeout);
    });

    try {
      const response = await Promise.race([
        fetch(url, requestInit),
        timeoutPromise,
      ]);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: any;
        
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || `HTTP ${response.status}` };
        }

        throw new InkressApiError(
          errorData.message || `HTTP ${response.status}`,
          response.status,
          errorData
        );
      }

      const responseText = await response.text();
      if (!responseText) {
        return { state: 'ok', data: undefined as T };
      }

      const data = JSON.parse(responseText);
      return data as ApiResponse<T>;
    } catch (error) {
      if (error instanceof InkressApiError) {
        throw error;
      }
      throw new InkressApiError(
        error instanceof Error ? error.message : 'Unknown error',
        0,
        { error }
      );
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
      // Retry on 5xx errors and timeouts
      return error.status >= 500 || error.status === 0;
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async get<T>(path: string, params?: Record<string, any>, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>> {
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
    this.config = { ...this.config, ...newConfig };
  }

  getConfig(): Omit<StorefrontConfig, 'authToken'> {
    const { authToken: _authToken, ...config } = this.config;
    return config;
  }
}
