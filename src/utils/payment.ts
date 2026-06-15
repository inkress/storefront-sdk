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

/**
 * Encode an arbitrary JSON-serialisable value to a base64 string. Works in the
 * browser (btoa) and on the server (Buffer) without statically referencing
 * Node globals (so bundlers targeting the browser don't choke).
 */
export function encodeJSONToB64(data: unknown): string {
  const jsonStr = JSON.stringify(data);
  const isBrowser = typeof window !== 'undefined' && typeof window.btoa === 'function';

  if (!isBrowser) {
    // Server: use Buffer if present, resolved indirectly to avoid bundler issues.
    const BufferRef = new Function(
      'return typeof Buffer !== "undefined" ? Buffer : null'
    )() as { from(s: string): { toString(enc: string): string } } | null;
    if (BufferRef) {
      return BufferRef.from(jsonStr).toString('base64');
    }
  }

  // Browser / fallback. unescape(encodeURIComponent(...)) makes btoa UTF-8 safe.
  return btoa(unescape(encodeURIComponent(jsonStr)));
}

/**
 * Decode a base64 order token back into its JSON value. Mainly used by tests
 * and consumers that want to inspect a token they generated.
 */
export function decodeB64ToJSON<T = unknown>(token: string): T {
  let jsonStr: string;
  const isBrowser = typeof window !== 'undefined' && typeof window.atob === 'function';

  if (!isBrowser) {
    const BufferRef = new Function(
      'return typeof Buffer !== "undefined" ? Buffer : null'
    )() as { from(s: string, enc: string): { toString(enc: string): string } } | null;
    if (BufferRef) {
      jsonStr = BufferRef.from(token, 'base64').toString('utf-8');
      return JSON.parse(jsonStr) as T;
    }
  }

  jsonStr = decodeURIComponent(escape(atob(token)));
  return JSON.parse(jsonStr) as T;
}

/** Generate a random alphanumeric reference id. */
export function generateRandomId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

/** Throw if the minimum fields required to build a payment URL are missing. */
export function validatePaymentOptions(options: PaymentURLOptions): void {
  if (!options || !options.username) {
    throw new Error('Merchant username is required');
  }
  const { total } = options;
  if (total === undefined || total === null || isNaN(Number(total))) {
    throw new Error('Valid total amount is required');
  }
}

/**
 * Build a hosted-order payment URL for a merchant storefront.
 *
 * @param options  payment details (username + total required)
 * @param siteBaseUrl  the public site origin, e.g. `https://inkress.com`
 *                     (NOT the API endpoint). The order page lives at
 *                     `/merchants/:username/order`.
 */
export function buildPaymentUrl(options: PaymentURLOptions, siteBaseUrl: string): string {
  validatePaymentOptions(options);

  const {
    username,
    total,
    currency_code = 'JMD',
    title = `Payment to ${username}`,
    reference_id = generateRandomId(),
    customer = {},
    payment_link_id,
  } = options;

  const orderData = {
    total: Number(total),
    currency_code,
    title,
    reference_id,
    customer: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      ...customer,
    },
  };

  const orderToken = encodeJSONToB64(orderData);
  const base = siteBaseUrl.replace(/\/+$/, '');
  return `${base}/merchants/${encodeURIComponent(username)}/order?link_token=${payment_link_id || ''}&order_token=${orderToken}`;
}
