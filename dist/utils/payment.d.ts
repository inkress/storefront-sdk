/**
 * Isomorphic payment helpers shared by the checkout resource and the legacy
 * `Inkress` shim. No DOM or Node-only globals are referenced directly so the
 * same code runs in the browser and on the server (Remix/RR7 loaders).
 */
export interface PaymentCustomer {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
}
export interface PaymentURLOptions {
    /** Merchant username (the storefront owner). Required. */
    username: string;
    /** Order total in major currency units. Required. */
    total: number;
    /** Optional pre-created payment link id. */
    payment_link_id?: string;
    /** ISO currency code. Defaults to 'JMD'. */
    currency_code?: string;
    /** Human-readable order title. */
    title?: string;
    /** Caller-supplied reference id. Auto-generated when omitted. */
    reference_id?: string;
    /** Customer details prefilled on the hosted order page. */
    customer?: PaymentCustomer;
}
export declare function encodeJSONToB64(data: unknown): string;
/**
 * Decode a base64 order token back into its JSON value. Mainly used by tests
 * and consumers that want to inspect a token they generated.
 */
export declare function decodeB64ToJSON<T = unknown>(token: string): T;
/** Generate a random alphanumeric reference id. */
export declare function generateRandomId(): string;
/** Throw if the minimum fields required to build a payment URL are missing. */
export declare function validatePaymentOptions(options: PaymentURLOptions): void;
/**
 * Build a hosted-order payment URL for a merchant storefront.
 *
 * @param options  payment details (username + total required)
 * @param siteBaseUrl  the public site origin, e.g. `https://inkress.com`
 *                     (NOT the API endpoint). The order page lives at
 *                     `/merchants/:username/order`.
 */
export declare function buildPaymentUrl(options: PaymentURLOptions, siteBaseUrl: string): string;
//# sourceMappingURL=payment.d.ts.map