import type { HttpClient, ApiResponse } from '../client';
import { buildPaymentUrl, type PaymentURLOptions } from '../utils/payment';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResponseData,
  CheckoutSession,
} from '../types/checkout';

/**
 * Checkout resource — the storefront money path.
 *
 * Two ways to take payment:
 *  - `createPaymentUrl()` — a hosted-order URL the customer opens (no card data
 *    ever touches the SDK).
 *  - `createSession()` / `getSession()` — a checkout session that returns a
 *    hosted-payment `frame_url` (PowerTranz SPI). Settlement and the strict 3DS
 *    gate live server-side; the SDK only *initiates*.
 */
export class CheckoutResource {
  constructor(private client: HttpClient) {}

  /**
   * Build a hosted-order payment URL. `username` defaults to the SDK's
   * configured merchant; the site origin is derived from `mode`.
   *
   * @example
   * const url = sdk.checkout.createPaymentUrl({ total: 49.99, title: 'Order #1' });
   * sdk.checkout.redirectToCheckout(url);
   */
  createPaymentUrl(options: Omit<PaymentURLOptions, 'username'> & { username?: string }): string {
    const username = options.username || this.client.getMerchantUsername();
    if (!username) {
      throw new Error('A merchant username is required (set merchantUsername on the SDK or pass options.username)');
    }
    return buildPaymentUrl({ ...options, username }, this.client.getSiteUrl());
  }

  /**
   * Open a checkout session. Returns the hosted-frame fields (`frame_url`,
   * `redirect_data`) used to complete payment.
   */
  async createSession(input: CreateCheckoutSessionInput): Promise<ApiResponse<CreateCheckoutSessionResponseData>> {
    const body: CreateCheckoutSessionInput = { kind: 'online', ...input };
    return this.client.post<CreateCheckoutSessionResponseData>('/checkout/sessions', body);
  }

  /** Fetch a checkout session's current state. */
  async getSession(sessionId: string): Promise<ApiResponse<CheckoutSession>> {
    return this.client.get<CheckoutSession>(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
  }

  /** Cancel a checkout session. */
  async cancelSession(sessionId: string): Promise<ApiResponse<string>> {
    return this.client.delete<string>(`/checkout/sessions/${encodeURIComponent(sessionId)}`);
  }

  /**
   * Redirect the browser to a hosted-checkout target. Accepts a URL string or a
   * created-session object (uses its `frame_url`). No-ops with a warning under
   * SSR (no `window`), so it is safe to call from isomorphic code.
   *
   * @returns true if a redirect was issued, false under SSR.
   */
  redirectToCheckout(target: string | { frame_url?: string }): boolean {
    const url = typeof target === 'string' ? target : target?.frame_url;
    if (!url) {
      throw new Error('redirectToCheckout: no URL (or frame_url) to redirect to');
    }
    if (typeof window === 'undefined' || !window.location) {
      console.warn('redirectToCheckout called in a non-browser environment; skipping redirect.');
      return false;
    }
    window.location.assign(url);
    return true;
  }
}
