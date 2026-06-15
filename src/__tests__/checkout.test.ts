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
