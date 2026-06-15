import {
  buildPaymentUrl,
  encodeJSONToB64,
  decodeB64ToJSON,
  validatePaymentOptions,
  generateRandomId,
} from '../utils/payment';
import { Inkress } from '../index';

describe('payment utils', () => {
  it('round-trips JSON through base64', () => {
    const data = { total: 100, currency_code: 'JMD', note: 'héllo ☕' };
    const token = encodeJSONToB64(data);
    expect(typeof token).toBe('string');
    expect(decodeB64ToJSON(token)).toEqual(data);
  });

  it('builds a hosted payment URL with a decodable order_token', () => {
    const url = buildPaymentUrl(
      { username: 'acme', total: 49.99, reference_id: 'ref-1', title: 'Order' },
      'https://inkress.com'
    );
    expect(url.startsWith('https://inkress.com/merchants/acme/order?')).toBe(true);

    const orderToken = new URL(url).searchParams.get('order_token')!;
    const order = decodeB64ToJSON<any>(orderToken);
    expect(order.total).toBe(49.99);
    expect(order.reference_id).toBe('ref-1');
    expect(order.currency_code).toBe('JMD'); // default
    expect(order.customer).toMatchObject({ first_name: '', email: '' });
  });

  it('passes through a payment_link_id as link_token', () => {
    const url = buildPaymentUrl(
      { username: 'acme', total: 10, payment_link_id: 'pl_123' },
      'https://inkress.com/'
    );
    expect(new URL(url).searchParams.get('link_token')).toBe('pl_123');
  });

  it('validates required fields', () => {
    expect(() => validatePaymentOptions({ username: '', total: 10 })).toThrow('username is required');
    expect(() =>
      validatePaymentOptions({ username: 'acme', total: NaN })
    ).toThrow('Valid total amount is required');
  });

  it('generates non-empty random ids', () => {
    const a = generateRandomId();
    const b = generateRandomId();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('legacy Inkress shim still builds a payment URL', () => {
    const inkress = new Inkress({ mode: 'live' });
    const url = inkress.createPaymentUrl({ username: 'acme', total: 5 });
    expect(url).toContain('https://inkress.com/merchants/acme/order?');
  });
});
