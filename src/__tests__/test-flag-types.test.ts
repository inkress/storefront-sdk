import type { CheckoutSession, CreateCheckoutSessionInput, Order, OrderCreateRequest } from '../index';

type HasKey<T, K extends PropertyKey> = K extends keyof T ? true : false;

describe('test flag (INK-1591)', () => {
  test('read types carry test', () => {
    const present: [HasKey<Order, 'test'>, HasKey<CheckoutSession, 'test'>] = [true, true];
    expect(present).toEqual([true, true]);
  });

  test('a storefront key can never ask for a test: create inputs have no test field', () => {
    const absent: [HasKey<OrderCreateRequest, 'test'>, HasKey<CreateCheckoutSessionInput, 'test'>] = [false, false];
    // @ts-expect-error OrderCreateRequest has no test field
    const order: OrderCreateRequest = { kind: 'online', currency_code: 'JMD', test: true };
    // @ts-expect-error CreateCheckoutSessionInput has no test field
    const session: CreateCheckoutSessionInput = { currency_code: 'JMD', test: true };
    expect([absent, order, session]).toHaveLength(3);
  });
});
