import type { Address } from '../types';
export interface CheckoutCustomer {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
}
/** Order data used to open a checkout session (same shape as order creation). */
export interface CreateCheckoutSessionInput {
    /** Auto-generated when omitted. */
    reference_id?: string;
    /** 'online' | 'cart' | ... — defaults to 'online' for hosted checkout. */
    kind?: string;
    total?: number;
    currency_code: string;
    customer?: CheckoutCustomer;
    products?: Array<{
        id: number;
        quantity: number;
        [key: string]: any;
    }>;
    method_id?: string;
    title?: string;
    data?: {
        shipping_address?: Address;
        fulfillment_type?: 'delivery' | 'pickup';
        pickup_location?: string;
    };
    payment_link_id?: string;
}
export interface CheckoutSessionFeeMapping {
    charged_party: number;
    computed_value: number;
    currency: string;
    fee_id: number;
    group: number;
    is_compounded: boolean;
    recipient_merchant_id: number;
    sequence: number;
    unit: number;
    value: number;
}
export interface CheckoutSessionFees {
    after_tax_fee_total: number;
    before_tax_fee_total: number;
    customer_total: number;
    discount_total: number;
    fee_ids: number[];
    fee_mappings: CheckoutSessionFeeMapping[];
    merchant_total: number;
    platform_total: number;
    provider_total: number;
    shipping_total: number;
    sub_total: number;
    tax_total: number;
}
export interface CheckoutSessionTotals {
    sub_total: number;
    customer_total: number;
    merchant_total: number;
    platform_total: number;
    provider_total: number;
    shipping_total: number;
    tax_total: number;
    discount_total: number;
    before_tax_fee_total: number;
    after_tax_fee_total: number;
}
export interface CheckoutSessionCurrency {
    code: string;
    id: number;
}
export interface CheckoutSessionCustomer {
    id: number | null;
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
}
export type CheckoutSessionStatus = 'pending' | 'awaiting_payment' | 'completed' | 'cancelled' | 'expired';
/** Response from creating a checkout session — carries the hosted-frame fields. */
export interface CreateCheckoutSessionResponseData {
    session_id: string;
    reference_id: string;
    status: string;
    order_id: string;
    currency: string;
    currency_code: string;
    created_at: string;
    payment_initiated_at: string;
    completed_at: string | null;
    expires: number;
    totals: CheckoutSessionTotals;
    customer: CheckoutSessionCustomer;
    title: string;
    products: any[];
    /** URL of the hosted payment frame to embed or redirect to. */
    frame_url: string;
    /** Provider redirect payload (PowerTranz SPI), when applicable. */
    redirect_data: string;
    spi_token: string;
    transaction_id: string;
    amount: number;
    transaction_type: string | null;
    three_d_secure: any | null;
    is_subscription: boolean;
}
/** Response from fetching an existing checkout session. */
export interface CheckoutSession {
    status: CheckoutSessionStatus;
    title: string;
    currency: CheckoutSessionCurrency;
    customer: CheckoutSessionCustomer;
    session_id: string;
    order_id: number | null;
    reference_id: string;
    fees: CheckoutSessionFees;
    products: any[];
    created_at: string;
    completed_at: string | null;
    payment_initiated_at: string | null;
}
export interface DeleteCheckoutSessionResponseData {
    status: 'cancelled';
    session_id: string;
}
/**
 * Envelope for Inkress "public" storefront reads (fees/discount/invoice/tokens),
 * which return their payload under `data` rather than `result`. On a hard error
 * the endpoint may return `data` as a human-readable message string; the HTTP
 * client throws {@link InkressApiError} for non-2xx responses, so a resolved
 * value with `state: 'ok'` always carries a payload object in `data`.
 */
export interface PublicDataResponse<T> {
    state: 'ok' | 'error';
    data: T | string;
    result?: T;
}
/** A merchant fee/price quote (`GET public/m/:username/fees` → `data`). Major units. */
export interface FeesQuote {
    shipping_fee: number;
    sub_total: number;
    total: number;
    transaction_total: number;
    provider_fee: number;
    platform_fee: number;
    tax: number;
    discount: number;
    discount_total: number;
    discount_code: string | null;
    currency: string;
    /** Raw TransactionCalculator fields are also present (customer_total, merchant_total, …). */
    customer_total?: number;
    [key: string]: unknown;
}
/** Why a discount code was refused — the machine-readable `reason` slug (Service.Discount). */
export type DiscountRejectReason = 'not_found' | 'inactive' | 'expired' | 'usage_limit_reached' | 'per_customer_limit_reached' | 'not_valid_for_items' | 'currency_mismatch' | 'min_spend_not_met';
/** One cart line for a product-scoped discount quote. */
export interface DiscountLineInput {
    /** Product id — matches order-line freezing + scope eligibility (== variant_id today). */
    id: number;
    /** Per-LINE total (quantity already factored in), in major units. */
    cost: number;
}
/**
 * Result of quoting a discount code (`public/m/:username/discount` → `data`).
 * Both acceptance and rejection resolve with HTTP 200 — branch on `valid`, never
 * on a thrown error. A valid quote also carries the {@link FeesQuote} fields.
 */
export interface DiscountQuote extends Partial<FeesQuote> {
    valid: boolean;
    discount_code?: string;
    /** Machine-readable rejection reason when `valid` is false. */
    reason?: DiscountRejectReason;
    /** Human-readable message to show the buyer (includes the amount for min_spend_not_met). */
    message?: string;
}
export interface FeesQuoteParams {
    currency_code: string;
    total: number;
    fulfillment_total?: number;
    discount_code?: string;
}
export interface DiscountQuoteParams {
    code: string;
    currency_code: string;
    total: number;
    fulfillment_total?: number;
    /**
     * Cart lines — REQUIRED for a product-scoped code (drives eligibility + the
     * scoped amount). When present the quote is sent as a POST body, since a
     * products[] cannot be querystring-encoded.
     */
    products?: DiscountLineInput[];
}
/** One of the merchant's public keys — used as the order-create bearer token. */
export interface MerchantToken {
    public_key: string;
    [key: string]: unknown;
}
export type OrderFulfillmentType = 'delivery' | 'pickup';
export interface OrderContact {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
}
/**
 * A delivery address. The backend keys Jamaica addresses by `town` and every
 * other country by `city`; set whichever your caller resolved (the SDK passes
 * through both — it does not itself remap by country).
 */
export interface OrderShippingAddress {
    country: string;
    state: string;
    street: string;
    postal_code?: string;
    city?: string;
    town?: string;
}
export interface OrderLineInput {
    /** Product id — the buyable unit in Inkress (no separate variant id today). */
    id: number;
    quantity: number;
    /** Per-line selected options / custom-field values, frozen onto the order line. */
    properties?: Record<string, unknown>;
}
/**
 * Structured input for {@link CheckoutResource.createOrder}. The resource
 * flattens this to the backend's dot-keyed body — callers never build dot-keys.
 */
export interface CreateOrderInput {
    reference_id: string;
    /** Defaults to 'online' (card/online — discount-eligible). */
    kind?: 'online';
    currency_code: string;
    /** Optional hint; the server recomputes from products + shipping regardless. */
    total?: number;
    discount_code?: string;
    customer: OrderContact;
    products: OrderLineInput[];
    method_id?: string;
    /** Reuse the checkout's payment link so the order is linked to it. */
    payment_link_id?: number | string;
    /** Shipping cost the caller computed for the selected zone (server re-validates). */
    fulfillment_total?: number;
    fulfillment_type?: OrderFulfillmentType;
    shipping_address?: OrderShippingAddress;
    pickup_location?: string;
    note?: string;
    /** Extra order metadata; flattened to `meta_data.<key>` dot-keys (e.g. `order_source`). */
    meta_data?: Record<string, string | number>;
}
export interface OrderPaymentUrls {
    short_link?: string;
    payment_url?: string;
}
/** Result of order creation (`result`). Carries the hosted payment-link urls. */
export interface CreateOrderResult {
    id: number | string;
    payment_urls?: OrderPaymentUrls;
    [key: string]: unknown;
}
/** The invoice/order a checkout is built from (`POST payments/link/:uid` → `data`). */
export interface InvoiceDisplay {
    id: number | string;
    order?: Record<string, unknown>;
    merchant?: Record<string, unknown>;
    [key: string]: unknown;
}
/** Server-signed charge intent (`POST payments/link/:uid/checkout-intent` → `data`). */
export interface CheckoutIntent {
    amount: number;
    /** Numeric ISO currency code. */
    currency: number;
    exp: number;
    sig: string;
    ref: string;
    mode?: string;
    recurring?: boolean;
}
export interface CheckoutIntentInput {
    risk_ref?: string;
    mode?: string;
}
export interface ChargeCardInput {
    /** Token minted by the hosted card iframe (CDE) for the entered card. */
    card_ref: string;
    risk_ref?: string;
    browser_info?: Record<string, unknown>;
}
export interface Complete3dsInput {
    spi_token: string;
    preprocessing_3ds?: unknown;
}
//# sourceMappingURL=checkout.d.ts.map