import { HttpClient } from '../client';
import { CheckoutResource } from '../resources/checkout';
import { InkressStorefrontSDK } from '../index';
import { decodeB64ToJSON } from '../utils/payment';

const fetchMock = fetch as unknown as jest.Mock & {
  mockResponseOnce: (body: string) => void;
  resetMocks: () => void;
};
const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];

beforeEach(() => fetchMock.resetMocks());

describe('CheckoutResource.createPaymentUrl', () => {
  it('uses the configured merchant + live site origin', () => {
    const checkout = new CheckoutResource(new HttpClient({ merchantUsername: 'acme', mode: 'live' }));
    const url = checkout.createPaymentUrl({ total: 49.99, title: 'Order' });
    expect(url.startsWith('https://inkress.com/merchants/acme/order?')).toBe(true);
    const token = new URL(url).searchParams.get('order_token')!;
    expect(decodeB64ToJSON<any>(token).total).toBe(49.99);
  });

  it('uses the sandbox site origin in sandbox mode', () => {
    const checkout = new CheckoutResource(new HttpClient({ merchantUsername: 'acme', mode: 'sandbox' }));
    const url = checkout.createPaymentUrl({ total: 10 });
    expect(url.startsWith('https://dev.inkress.com/merchants/acme/order?')).toBe(true);
  });

  it('throws when no merchant is configured or passed', () => {
    const checkout = new CheckoutResource(new HttpClient());
    expect(() => checkout.createPaymentUrl({ total: 10 })).toThrow(/merchant username is required/i);
  });

  it('rejects a zero or negative total', () => {
    const checkout = new CheckoutResource(new HttpClient({ merchantUsername: 'acme' }));
    expect(() => checkout.createPaymentUrl({ total: 0 })).toThrow(/positive total/i);
    expect(() => checkout.createPaymentUrl({ total: -5 })).toThrow(/positive total/i);
  });
});

describe('CheckoutResource sessions', () => {
  it('createSession POSTs /checkout/sessions with kind defaulting to online', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { session_id: 'S.1', frame_url: 'https://pay/x' } }));
    const checkout = new CheckoutResource(new HttpClient({ merchantUsername: 'acme' }));
    const res = await checkout.createSession({ currency_code: 'JMD', total: 100 });
    expect(lastCall()[0]).toContain('/api/v1/checkout/sessions');
    expect((lastCall()[1] as RequestInit).method).toBe('POST');
    expect(JSON.parse((lastCall()[1] as RequestInit).body as string)).toMatchObject({ kind: 'online', currency_code: 'JMD', total: 100 });
    expect(res.result?.frame_url).toBe('https://pay/x');
  });

  it('getSession GETs /checkout/sessions/:id', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { session_id: 'S.1', status: 'awaiting_payment' } }));
    await new CheckoutResource(new HttpClient({ merchantUsername: 'acme' })).getSession('S.1');
    expect(lastCall()[0]).toContain('/api/v1/checkout/sessions/S.1');
  });

  it('cancelSession DELETEs /checkout/sessions/:id', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { status: 'cancelled', session_id: 'S.1' } }));
    const res = await new CheckoutResource(new HttpClient({ merchantUsername: 'acme' })).cancelSession('S.1');
    expect(lastCall()[0]).toContain('/api/v1/checkout/sessions/S.1');
    expect((lastCall()[1] as RequestInit).method).toBe('DELETE');
    expect(res.result?.status).toBe('cancelled');
  });
});

describe('CheckoutResource.redirectToCheckout', () => {
  it('no-ops and returns false under SSR (no window)', () => {
    const realWindow = (globalThis as any).window;
    delete (globalThis as any).window;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const checkout = new CheckoutResource(new HttpClient());
      expect(checkout.redirectToCheckout('https://pay/x')).toBe(false);
    } finally {
      (globalThis as any).window = realWindow;
      warn.mockRestore();
    }
  });

  it('redirects via window.location.assign in the browser', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'location');
    const assign = jest.fn();
    Object.defineProperty(window, 'location', { value: { assign }, writable: true, configurable: true });
    try {
      const checkout = new CheckoutResource(new HttpClient());
      expect(checkout.redirectToCheckout({ frame_url: 'https://pay/y' })).toBe(true);
      expect(assign).toHaveBeenCalledWith('https://pay/y');
    } finally {
      if (original) Object.defineProperty(window, 'location', original);
    }
  });

  it('rejects a non-navigational (javascript:) URL', () => {
    const checkout = new CheckoutResource(new HttpClient());
    expect(() => checkout.redirectToCheckout('javascript:alert(1)')).toThrow(/absolute http/i);
  });
});

describe('cart.checkout() via the SDK facade', () => {
  function product(id: number, price: number) {
    return {
      id, title: `P${id}`, price, permalink: `p${id}`, status: 2, public: true, unlimited: true,
      tag_ids: [], currency: { id: 1, code: 'USD', symbol: '$', name: 'US Dollar' },
      merchant: { id: 1, name: 'Acme', username: 'acme' }, created_at: '', updated_at: '',
    } as any;
  }

  it('builds the order payload from cart items and opens a session', async () => {
    const sdk = InkressStorefrontSDK.forMerchant('acme');
    sdk.cart.clear();
    sdk.cart.addItem(product(1, 30), 2);
    sdk.cart.addItem(product(2, 10), 1);

    let started = false;
    sdk.on('checkout:started', () => (started = true));

    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { session_id: 'S.2', frame_url: 'https://pay/z' } }));
    const res = await sdk.cart.checkout({ customer: { email: 'c@x.com' } });

    expect(started).toBe(true);
    expect(lastCall()[0]).toContain('/checkout/sessions');
    const body = JSON.parse((lastCall()[1] as RequestInit).body as string);
    expect(body.currency_code).toBe('USD'); // from first item
    expect(body.total).toBe(70); // 30*2 + 10
    expect(body.products).toEqual([{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }]);
    expect(body.customer).toEqual({ email: 'c@x.com' });
    expect(res.result?.session_id).toBe('S.2');
  });

  it('throws when checking out an empty cart', async () => {
    const sdk = InkressStorefrontSDK.forMerchant('acme');
    sdk.cart.clear();
    await expect(sdk.cart.checkout()).rejects.toThrow(/empty cart/i);
  });

  it('throws on a mixed-currency cart unless currency_code is given', async () => {
    const sdk = InkressStorefrontSDK.forMerchant('acme');
    sdk.cart.clear();
    const usd = product(1, 30);
    const jmd = { ...product(2, 10), currency: { id: 2, code: 'JMD', symbol: '$', name: 'Jamaican Dollar' } };
    sdk.cart.addItem(usd, 1);
    sdk.cart.addItem(jmd, 1);
    await expect(sdk.cart.checkout()).rejects.toThrow(/multiple currencies/i);

    // Explicit currency_code resolves the ambiguity.
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { session_id: 'S.3' } }));
    const res = await sdk.cart.checkout({ currency_code: 'USD' });
    expect(res.result?.session_id).toBe('S.3');
  });
});

describe('CheckoutResource order-first money path', () => {
  const checkout = () => new CheckoutResource(new HttpClient({ merchantUsername: 'acme' }));

  it('invoice() POSTs the payment-link uid and returns the data payload', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: { id: 'L.1', order: { id: 9 }, merchant: { username: 'acme' } } }));
    const res = await checkout().invoice('L.1');
    expect(lastCall()[0]).toContain('/api/v1/payments/link/L.1');
    expect((lastCall()[1] as RequestInit).method).toBe('POST');
    expect((res.data as any).order.id).toBe(9);
  });

  it('fees() GETs the public fees endpoint with the query and defaults to the configured merchant', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: { sub_total: 100, discount_total: 0, total: 105 } }));
    const res = await checkout().fees({ currency_code: 'JMD', total: 100, fulfillment_total: 5 });
    const url = lastCall()[0] as string;
    expect(url).toContain('/api/v1/public/m/acme/fees');
    expect(url).toContain('currency_code=JMD');
    expect(url).toContain('total=100');
    expect(url).toContain('fulfillment_total=5');
    expect((res.data as any).sub_total).toBe(100);
  });

  it('fees() uses an explicit username over the configured merchant', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: {} }));
    await checkout().fees({ currency_code: 'JMD', total: 10 }, 'other-shop');
    expect(lastCall()[0]).toContain('/api/v1/public/m/other-shop/fees');
  });

  it('validateDiscount() resolves (not throws) for both accepted and rejected codes', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: { valid: true, discount_code: 'SAVE10', discount_total: 10 } }));
    const ok = await checkout().validateDiscount({ code: 'SAVE10', currency_code: 'JMD', total: 100 });
    expect(lastCall()[0]).toContain('/api/v1/public/m/acme/discount');
    expect(lastCall()[0]).toContain('code=SAVE10');
    expect((ok.data as any).valid).toBe(true);

    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: { valid: false, discount_code: 'NOPE', reason: 'expired', message: 'That code has expired.' } }));
    const rejected = await checkout().validateDiscount({ code: 'NOPE', currency_code: 'JMD', total: 100 });
    expect((rejected.data as any).valid).toBe(false);
    expect((rejected.data as any).reason).toBe('expired');
  });

  it('validateDiscount() POSTs cart lines (id + per-line cost) for a product-scoped code', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: { valid: true, discount_code: 'ITEMS5', discount_total: 5 } }));
    await checkout().validateDiscount({
      code: 'ITEMS5',
      currency_code: 'JMD',
      total: 100,
      products: [{ id: 42, cost: 60 }, { id: 7, cost: 40 }],
    });
    expect(lastCall()[0]).toContain('/api/v1/public/m/acme/discount');
    expect((lastCall()[1] as RequestInit).method).toBe('POST');
    const body = JSON.parse((lastCall()[1] as RequestInit).body as string);
    expect(body.code).toBe('ITEMS5');
    expect(body.products).toEqual([{ id: 42, cost: 60 }, { id: 7, cost: 40 }]);
  });

  it('merchantTokens() reads data[0].public_key', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: [{ public_key: 'pk_live_123' }] }));
    const res = await checkout().merchantTokens();
    expect(lastCall()[0]).toContain('/api/v1/public/m/acme/tokens');
    expect((res.data as any)[0].public_key).toBe('pk_live_123');
  });

  it('createOrder() POSTs /orders with a flat dot-keyed body (JM delivery → town)', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { id: 'O.1', payment_urls: { short_link: 'https://inkress.com/payments/link/PL.1/fac' } } }));
    const res = await checkout().createOrder({
      reference_id: 'ref-1',
      currency_code: 'JMD',
      discount_code: 'SAVE10',
      customer: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@x.com', phone: '8761234567' },
      products: [{ id: 42, quantity: 2, properties: { size: 'L' } }],
      payment_link_id: 7,
      fulfillment_type: 'delivery',
      fulfillment_total: 500,
      shipping_address: { country: 'JM', state: 'Kingston', street: '1 King St', town: 'Kingston' },
      note: 'leave at door',
      meta_data: { order_source: 'checkouts' },
    });
    expect(lastCall()[0]).toContain('/api/v1/orders');
    expect((lastCall()[1] as RequestInit).method).toBe('POST');
    const body = JSON.parse((lastCall()[1] as RequestInit).body as string);
    expect(body).toMatchObject({
      reference_id: 'ref-1',
      kind: 'online',
      currency_code: 'JMD',
      discount_code: 'SAVE10',
      'customer.first_name': 'Ada',
      'customer.email': 'ada@x.com',
      'customer.phone': '8761234567',
      payment_link_id: 7,
      fulfillment_total: 500,
      'data.fulfillment_type': 'delivery',
      'data.shipping_address.town': 'Kingston',
      'data.shipping_address.street': '1 King St',
      'data.fulfillment_total': 500,
      'data.note': 'leave at door',
      'meta_data.order_source': 'checkouts',
    });
    expect(body.products).toEqual([{ id: 42, quantity: 2, properties: { size: 'L' } }]);
    expect(body['data.shipping_address.city']).toBeUndefined();
    expect(res.result?.payment_urls?.short_link).toContain('/PL.1/fac');
  });

  it('createOrder() maps a pickup fulfilment and a non-JM city', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { id: 'O.2' } }));
    await checkout().createOrder({
      reference_id: 'ref-2',
      currency_code: 'USD',
      customer: { first_name: 'Al', last_name: 'Turing', email: 'al@x.com' },
      products: [{ id: 1, quantity: 1 }],
      fulfillment_type: 'pickup',
      pickup_location: 'Main St store',
    });
    const body = JSON.parse((lastCall()[1] as RequestInit).body as string);
    expect(body['data.fulfillment_type']).toBe('pickup');
    expect(body['data.pickup_location']).toBe('Main St store');
    expect(body['data.shipping_address.town']).toBeUndefined();
  });

  it('checkoutIntent / chargeCard / complete3ds hit the payment-link 3DS routes', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: { amount: 105, currency: 388, sig: 'abc', ref: 'PL.1', exp: 1 } }));
    const intent = await checkout().checkoutIntent('PL.1', { mode: 'card' });
    expect(lastCall()[0]).toContain('/api/v1/payments/link/PL.1/checkout-intent');
    expect((intent.data as any).amount).toBe(105);

    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: { requires_3ds: true, spi_token: 'spi.1' } }));
    await checkout().chargeCard('PL.1', { card_ref: 'card.1' });
    expect(lastCall()[0]).toContain('/api/v1/payments/link/PL.1/charge-card');
    expect(JSON.parse((lastCall()[1] as RequestInit).body as string).card_ref).toBe('card.1');

    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', data: { paid: true } }));
    await checkout().complete3ds('PL.1', { spi_token: 'spi.1' });
    expect(lastCall()[0]).toContain('/api/v1/payments/link/PL.1/complete-3ds');
    expect(JSON.parse((lastCall()[1] as RequestInit).body as string).spi_token).toBe('spi.1');
  });

  it('a public read throws when no merchant is configured or passed', async () => {
    await expect(new CheckoutResource(new HttpClient()).fees({ currency_code: 'JMD', total: 10 })).rejects.toThrow(
      /merchant username is required/i,
    );
  });
});
