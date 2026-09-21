import type { HttpClient, ApiResponse } from '../client';
import { buildPaymentUrl, type PaymentURLOptions } from '../utils/payment';
import type {
  CreateCheckoutSessionInput,
  CreateCheckoutSessionResponseData,
  CheckoutSession,
  DeleteCheckoutSessionResponseData,
  PublicDataResponse,
  InvoiceDisplay,
  FeesQuote,
  FeesQuoteParams,
  DiscountQuote,
  DiscountQuoteParams,
  MerchantToken,
  CreateOrderInput,
  CreateOrderResult,
  CheckoutIntent,
  CheckoutIntentInput,
  ChargeCardInput,
  Complete3dsInput,
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
  async cancelSession(sessionId: string): Promise<ApiResponse<DeleteCheckoutSessionResponseData>> {
    return this.client.delete<DeleteCheckoutSessionResponseData>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Order-first money path
  //
  // The discount-preserving, 3DS-hardened path the LIVE /checkouts/:id page uses:
  //   invoice(uid) → fees()/validateDiscount() quote → createOrder() → then the
  //   PowerTranz sequence checkoutIntent → chargeCard → complete3ds against the
  //   NEW order's own payment-link uid. Prefer this over createSession(), which
  //   cannot apply discounts server-side today. Money amounts are in major units.
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Load the invoice/order behind a payment-link uid (the `/checkouts/:id` token).
   * The payload is under `data`, embedding `order` and `merchant`.
   */
  async invoice(uid: string): Promise<PublicDataResponse<InvoiceDisplay>> {
    return this.publicRead(this.client.post<InvoiceDisplay>(`/payments/link/${encodeURIComponent(uid)}`));
  }

  /**
   * Quote merchant fees for a cart total (display + discount-inclusive). Payload
   * under `data`. Lenient on a bad `discount_code` (prices it at 0 rather than
   * failing) — use {@link validateDiscount} to check a code. `username` defaults
   * to the SDK's configured merchant.
   */
  async fees(params: FeesQuoteParams, username?: string): Promise<PublicDataResponse<FeesQuote>> {
    const u = this.requireUsername(username);
    return this.publicRead(this.client.get<FeesQuote>(`/public/m/${encodeURIComponent(u)}/fees`, params));
  }

  /**
   * Validate + quote a discount code (server-authoritative — the client sends the
   * code, never a price). Both acceptance and rejection resolve with HTTP 200;
   * branch on `data.valid`, not on a thrown error (a rejected quote carries a
   * {@link DiscountRejectReason} in `data.reason`). Pass `params.products` for a
   * product-scoped code. Rate-limited per (IP, merchant): a 429 throws
   * {@link InkressApiError}. `username` defaults to the configured merchant.
   *
   * The quote is ADVISORY: order creation re-resolves and re-checks the code under
   * a lock, so a code that quotes valid can still be refused by {@link createOrder}
   * if a usage cap fills in between — always handle a rejection there too.
   */
  async validateDiscount(params: DiscountQuoteParams, username?: string): Promise<PublicDataResponse<DiscountQuote>> {
    const u = this.requireUsername(username);
    const path = `/public/m/${encodeURIComponent(u)}/discount`;
    // A products[] can't be querystring-encoded, so a product-scoped quote POSTs a
    // JSON body; an order-level quote GETs (matching the live checkout).
    const request =
      params.products && params.products.length > 0
        ? this.client.post<DiscountQuote>(path, params)
        : this.client.get<DiscountQuote>(path, params);
    return this.publicRead(request);
  }

  /**
   * Fetch the merchant's public keys. `data[0].public_key` is the bearer token
   * that authorizes {@link createOrder} — set it via `sdk.setAuthToken(...)`
   * before creating the order.
   */
  async merchantTokens(username?: string): Promise<PublicDataResponse<MerchantToken[]>> {
    const u = this.requireUsername(username);
    return this.publicRead(this.client.get<MerchantToken[]>(`/public/m/${encodeURIComponent(u)}/tokens`));
  }

  /**
   * Create an order (order-first path). Requires the merchant public key as the
   * SDK auth token (see {@link merchantTokens}). The server re-prices, re-resolves
   * the discount (under a lock), and re-validates shipping. On success
   * `result.payment_urls` carries the hosted payment-link urls used to drive the
   * card/3DS flow. A `discount_code` that passed {@link validateDiscount} can still
   * be refused here if a usage cap filled in between — surface `state:'error'` with
   * the `data` message rather than assuming the discount held.
   */
  async createOrder(input: CreateOrderInput): Promise<ApiResponse<CreateOrderResult>> {
    return this.client.post<CreateOrderResult>('/orders', this.toOrderArgs(input));
  }

  /**
   * Begin the PowerTranz card flow for a fresh order's payment-link uid (strip a
   * trailing `/fac` off `result.payment_urls.short_link` to get the uid). Returns
   * a server-signed intent (amount + sig) under `data` that the hosted card iframe
   * uses as the authoritative charge amount.
   */
  async checkoutIntent(uid: string, input: CheckoutIntentInput = {}): Promise<PublicDataResponse<CheckoutIntent>> {
    return this.publicRead(
      this.client.post<CheckoutIntent>(`/payments/link/${encodeURIComponent(uid)}/checkout-intent`, input),
    );
  }

  /**
   * Charge the tokenized card (`card_ref` minted by the hosted iframe) against a
   * payment-link uid. If a 3DS challenge is issued, settle it with {@link complete3ds}
   * once the ACS result is stored server-side.
   */
  async chargeCard(uid: string, input: ChargeCardInput): Promise<ApiResponse<Record<string, unknown>>> {
    return this.client.post<Record<string, unknown>>(`/payments/link/${encodeURIComponent(uid)}/charge-card`, input);
  }

  /**
   * Settle a 3DS challenge for a payment-link uid, keyed by `spi_token`. The
   * server runs a fail-closed strength gate (authentication Y + CAVV present)
   * before settling and marking the order paid.
   */
  async complete3ds(uid: string, input: Complete3dsInput): Promise<ApiResponse<Record<string, unknown>>> {
    return this.client.post<Record<string, unknown>>(`/payments/link/${encodeURIComponent(uid)}/complete-3ds`, input);
  }

  /** Resolve the merchant username: explicit arg, else the SDK's configured merchant. */
  private requireUsername(username?: string): string {
    const u = username || this.client.getMerchantUsername();
    if (!u) {
      throw new Error(
        'A merchant username is required (set merchantUsername on the SDK or pass it to this method).',
      );
    }
    return u;
  }

  /** Reshape a client response into the `data`-envelope {@link PublicDataResponse}. */
  private async publicRead<T>(promise: Promise<ApiResponse<T>>): Promise<PublicDataResponse<T>> {
    const res = await promise;
    return { state: res.state, data: res.data as T | string, result: res.result };
  }

  /** Flatten {@link CreateOrderInput} to the backend's allow-listed, dot-keyed body. */
  private toOrderArgs(input: CreateOrderInput): Record<string, unknown> {
    const args: Record<string, unknown> = {
      reference_id: input.reference_id,
      kind: input.kind ?? 'online',
      currency_code: input.currency_code,
      'customer.first_name': input.customer.first_name,
      'customer.last_name': input.customer.last_name,
      'customer.email': input.customer.email,
      products: input.products,
    };
    if (input.customer.phone) args['customer.phone'] = input.customer.phone;
    if (input.note) args['data.note'] = input.note;
    if (input.total != null) args['total'] = input.total;
    if (input.method_id) args['method_id'] = input.method_id;
    if (input.payment_link_id != null) args['payment_link_id'] = input.payment_link_id;
    if (input.discount_code) args['discount_code'] = input.discount_code;
    if (input.fulfillment_total != null) args['fulfillment_total'] = input.fulfillment_total;

    if (input.fulfillment_type === 'delivery' && input.shipping_address) {
      const a = input.shipping_address;
      args['data.fulfillment_type'] = 'delivery';
      args['data.shipping_address.country'] = a.country;
      args['data.shipping_address.state'] = a.state;
      args['data.shipping_address.street'] = a.street;
      if (a.postal_code) args['data.shipping_address.postal_code'] = a.postal_code;
      if (a.town) args['data.shipping_address.town'] = a.town;
      if (a.city) args['data.shipping_address.city'] = a.city;
      if (input.fulfillment_total != null) args['data.fulfillment_total'] = input.fulfillment_total;
    } else if (input.fulfillment_type === 'pickup') {
      args['data.fulfillment_type'] = 'pickup';
      if (input.pickup_location) args['data.pickup_location'] = input.pickup_location;
    }

    for (const [key, value] of Object.entries(input.meta_data ?? {})) {
      args[`meta_data.${key}`] = value;
    }
    return args;
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
    // Guard against javascript:/data: and other non-navigational schemes — this
    // is a public method and the URL may originate from caller-controlled input.
    if (!/^(https?:\/\/|\/)/i.test(url)) {
      throw new Error('redirectToCheckout: URL must be an absolute http(s) URL or a root-relative path');
    }
    if (typeof window === 'undefined' || !window.location) {
      console.warn('redirectToCheckout called in a non-browser environment; skipping redirect.');
      return false;
    }
    window.location.assign(url);
    return true;
  }
}
