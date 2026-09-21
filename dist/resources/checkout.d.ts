import type { HttpClient, ApiResponse } from '../client';
import { type PaymentURLOptions } from '../utils/payment';
import type { CreateCheckoutSessionInput, CreateCheckoutSessionResponseData, CheckoutSession, DeleteCheckoutSessionResponseData, PublicDataResponse, InvoiceDisplay, FeesQuote, FeesQuoteParams, DiscountQuote, DiscountQuoteParams, MerchantToken, CreateOrderInput, CreateOrderResult, CheckoutIntent, CheckoutIntentInput, ChargeCardInput, Complete3dsInput } from '../types/checkout';
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
export declare class CheckoutResource {
    private client;
    constructor(client: HttpClient);
    /**
     * Build a hosted-order payment URL. `username` defaults to the SDK's
     * configured merchant; the site origin is derived from `mode`.
     *
     * @example
     * const url = sdk.checkout.createPaymentUrl({ total: 49.99, title: 'Order #1' });
     * sdk.checkout.redirectToCheckout(url);
     */
    createPaymentUrl(options: Omit<PaymentURLOptions, 'username'> & {
        username?: string;
    }): string;
    /**
     * Open a checkout session. Returns the hosted-frame fields (`frame_url`,
     * `redirect_data`) used to complete payment.
     */
    createSession(input: CreateCheckoutSessionInput): Promise<ApiResponse<CreateCheckoutSessionResponseData>>;
    /** Fetch a checkout session's current state. */
    getSession(sessionId: string): Promise<ApiResponse<CheckoutSession>>;
    /** Cancel a checkout session. */
    cancelSession(sessionId: string): Promise<ApiResponse<DeleteCheckoutSessionResponseData>>;
    /**
     * Load the invoice/order behind a payment-link uid (the `/checkouts/:id` token).
     * The payload is under `data`, embedding `order` and `merchant`.
     */
    invoice(uid: string): Promise<PublicDataResponse<InvoiceDisplay>>;
    /**
     * Quote merchant fees for a cart total (display + discount-inclusive). Payload
     * under `data`. Lenient on a bad `discount_code` (prices it at 0 rather than
     * failing) — use {@link validateDiscount} to check a code. `username` defaults
     * to the SDK's configured merchant.
     */
    fees(params: FeesQuoteParams, username?: string): Promise<PublicDataResponse<FeesQuote>>;
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
    validateDiscount(params: DiscountQuoteParams, username?: string): Promise<PublicDataResponse<DiscountQuote>>;
    /**
     * Fetch the merchant's public keys. `data[0].public_key` is the bearer token
     * that authorizes {@link createOrder} — set it via `sdk.setAuthToken(...)`
     * before creating the order.
     */
    merchantTokens(username?: string): Promise<PublicDataResponse<MerchantToken[]>>;
    /**
     * Create an order (order-first path). Requires the merchant public key as the
     * SDK auth token (see {@link merchantTokens}). The server re-prices, re-resolves
     * the discount (under a lock), and re-validates shipping. On success
     * `result.payment_urls` carries the hosted payment-link urls used to drive the
     * card/3DS flow. A `discount_code` that passed {@link validateDiscount} can still
     * be refused here if a usage cap filled in between — surface `state:'error'` with
     * the `data` message rather than assuming the discount held.
     */
    createOrder(input: CreateOrderInput): Promise<ApiResponse<CreateOrderResult>>;
    /**
     * Begin the PowerTranz card flow for a fresh order's payment-link uid (strip a
     * trailing `/fac` off `result.payment_urls.short_link` to get the uid). Returns
     * a server-signed intent (amount + sig) under `data` that the hosted card iframe
     * uses as the authoritative charge amount.
     */
    checkoutIntent(uid: string, input?: CheckoutIntentInput): Promise<PublicDataResponse<CheckoutIntent>>;
    /**
     * Charge the tokenized card (`card_ref` minted by the hosted iframe) against a
     * payment-link uid. If a 3DS challenge is issued, settle it with {@link complete3ds}
     * once the ACS result is stored server-side.
     */
    chargeCard(uid: string, input: ChargeCardInput): Promise<ApiResponse<Record<string, unknown>>>;
    /**
     * Settle a 3DS challenge for a payment-link uid, keyed by `spi_token`. The
     * server runs a fail-closed strength gate (authentication Y + CAVV present)
     * before settling and marking the order paid.
     */
    complete3ds(uid: string, input: Complete3dsInput): Promise<ApiResponse<Record<string, unknown>>>;
    /** Resolve the merchant username: explicit arg, else the SDK's configured merchant. */
    private requireUsername;
    /** Reshape a client response into the `data`-envelope {@link PublicDataResponse}. */
    private publicRead;
    /** Flatten {@link CreateOrderInput} to the backend's allow-listed, dot-keyed body. */
    private toOrderArgs;
    /**
     * Redirect the browser to a hosted-checkout target. Accepts a URL string or a
     * created-session object (uses its `frame_url`). No-ops with a warning under
     * SSR (no `window`), so it is safe to call from isomorphic code.
     *
     * @returns true if a redirect was issued, false under SSR.
     */
    redirectToCheckout(target: string | {
        frame_url?: string;
    }): boolean;
}
//# sourceMappingURL=checkout.d.ts.map