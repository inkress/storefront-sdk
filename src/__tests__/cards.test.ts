/**
 * Ink Pay saved cards (INK-438): list/remove, the fee disclosure, connectIntent (a mode "store"
 * checkout-intent) and completeConnect's bounded polling of the 202 "pending" completion.
 */
import { HttpClient, InkressApiError } from '../client';
import { CheckoutResource } from '../resources/checkout';
import { CardsResource, CardConnectPendingError, CardConnectContractError } from '../resources/cards';
import { InkressStorefrontSDK } from '../index';
import type { FeeDisclosure } from '../types/cards';

const fetchMock = fetch as unknown as jest.Mock & {
  mockResponseOnce: (body: string, init?: { status?: number }) => void;
  resetMocks: () => void;
};
const calls = () => fetchMock.mock.calls;
const urlAt = (i: number) => calls()[i][0] as string;
const initAt = (i: number) => calls()[i][1] as RequestInit;
const envelope = (state: string, payload: unknown) => JSON.stringify({ state, data: payload, result: payload });
const record = (sleeps: number[]) => async (ms: number): Promise<void> => {
  sleeps.push(ms);
};

const disclosure: FeeDisclosure = {
  version: 'fd1-0123456789abcdef',
  customer_pays_fees: true,
  components: [
    { kind: 'platform', payer: 'customer' },
    { kind: 'processing', payer: 'customer' },
  ],
  example: { amount: 100, fee: 5.51, total: 105.51, currency: 'USD' },
  text: 'Charges Acme makes to this saved card when you are not present may include a fee.',
};

let client: HttpClient;
let cards: CardsResource;

beforeEach(() => {
  fetchMock.resetMocks();
  client = new HttpClient({ merchantUsername: 'acme', authToken: 'shopper-token' });
  cards = new CardsResource(client, new CheckoutResource(client));
});

describe('CardsResource', () => {
  it('list GETs /cards with the shopper token and the merchant client id', async () => {
    fetchMock.mockResponseOnce(
      envelope('ok', { entries: [], pagination: { page: 1, page_size: 25, total_entries: 0, total_pages: 0, more: false, next_pages: [], last_pages: [] } }),
    );

    const res = await cards.list();

    expect(urlAt(0)).toContain('/api/v1/cards');
    const headers = initAt(0).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer shopper-token');
    expect(headers['Client-Id']).toBe('m-acme');
    expect(res.result?.entries).toEqual([]);
  });

  it('remove DELETEs /cards/:id', async () => {
    fetchMock.mockResponseOnce(envelope('ok', { id: 9, action: 'removed', active_subscriptions: 0 }));

    const res = await cards.remove(9);

    expect(urlAt(0)).toContain('/api/v1/cards/9');
    expect(initAt(0).method).toBe('DELETE');
    expect(res.result?.action).toBe('removed');
  });

  it('feeDisclosure GETs /cards/connect/disclosure', async () => {
    fetchMock.mockResponseOnce(envelope('ok', disclosure));

    const res = await cards.feeDisclosure();

    expect(urlAt(0)).toContain('/api/v1/cards/connect/disclosure');
    expect(res.result?.version).toBe(disclosure.version);
  });

  it('connectIntent sends the accepted version, then asks for a mode "store" checkout-intent', async () => {
    fetchMock.mockResponseOnce(
      envelope('ok', {
        reference_id: 'cardconn-v1-7-abc',
        payment_link_uid: 'plu_123',
        checkout_intent: { path: '/api/v1/payments/link/plu_123/checkout-intent', mode: 'store' },
        fee_disclosure: disclosure,
      }),
    );
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'ok', data: { amount: 1, currency: 840, exp: 1, sig: 's', ref: 'cardconn-v1-7-abc', mode: 'store', recurring: true } }),
    );

    const intent = await cards.connectIntent({ acceptedDisclosureVersion: disclosure.version, returnBase: 'https://shop.example.com' });

    expect(urlAt(0)).toContain('/api/v1/cards/connect');
    expect(JSON.parse(initAt(0).body as string)).toEqual({ fee_disclosure_version: disclosure.version, return_base: 'https://shop.example.com' });
    expect(urlAt(1)).toContain('/api/v1/payments/link/plu_123/checkout-intent');
    expect(JSON.parse(initAt(1).body as string)).toEqual({ mode: 'store' });
    expect(intent.reference_id).toBe('cardconn-v1-7-abc');
    expect(intent.intent.mode).toBe('store');
    expect(intent.fee_disclosure.version).toBe(disclosure.version);
  });

  it('connectIntent surfaces a stale disclosure (409) and stops', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'error', data: { result: 'fee_disclosure_changed', fee_disclosure: disclosure }, result: 'fee_disclosure_changed' }),
      { status: 409 },
    );

    await expect(cards.connectIntent({ acceptedDisclosureVersion: 'fd1-stale' })).rejects.toMatchObject({ status: 409 });
    expect(calls()).toHaveLength(1);
  });

  it('connectIntent throws CardConnectContractError when the server omits fee_disclosure', async () => {
    fetchMock.mockResponseOnce(
      envelope('ok', {
        reference_id: 'cardconn-v1-7-abc',
        payment_link_uid: 'plu_123',
        checkout_intent: { path: '/api/v1/payments/link/plu_123/checkout-intent', mode: 'store' },
        // fee_disclosure omitted — today's live server (pre Task 5/6) doesn't send it yet.
      }),
    );

    await expect(
      cards.connectIntent({ acceptedDisclosureVersion: disclosure.version }),
    ).rejects.toBeInstanceOf(CardConnectContractError);
    expect(calls()).toHaveLength(1);
  });

  it('completeConnect polls the 202 pending response with backoff, then resolves the account', async () => {
    fetchMock.mockResponseOnce(envelope('pending', { status: 'pending' }), { status: 202 });
    fetchMock.mockResponseOnce(envelope('pending', { status: 'pending' }), { status: 202 });
    fetchMock.mockResponseOnce(envelope('ok', { account: { id: 91, brand: 'visa', last_4: '4242', display: 'Visa ****4242' } }));
    const sleeps: number[] = [];

    const account = await cards.completeConnect('cardconn-v1-7-abc', { sleep: record(sleeps) });

    expect(account).toEqual({ id: 91, brand: 'visa', last_4: '4242', display: 'Visa ****4242' });
    expect(sleeps).toEqual([500, 1000]);
    expect(urlAt(0)).toContain('/api/v1/cards/connect/cardconn-v1-7-abc/complete');
    expect(initAt(0).method).toBe('POST');
  });

  it('completeConnect gives up after maxAttempts with CardConnectPendingError (delays capped)', async () => {
    for (let i = 0; i < 3; i++) fetchMock.mockResponseOnce(envelope('pending', { status: 'pending' }), { status: 202 });
    const sleeps: number[] = [];

    await expect(
      cards.completeConnect('ref-x', { maxAttempts: 3, initialDelayMs: 100, maxDelayMs: 150, sleep: record(sleeps) }),
    ).rejects.toBeInstanceOf(CardConnectPendingError);
    expect(sleeps).toEqual([100, 150]);
    expect(calls()).toHaveLength(3);
  });

  it('completeConnect never retries a hard error', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'error', data: { result: 'fee_consent_missing' }, result: 'fee_consent_missing' }), { status: 409 });

    await expect(cards.completeConnect('ref-y', { sleep: record([]) })).rejects.toBeInstanceOf(InkressApiError);
    expect(calls()).toHaveLength(1);
  });

  it('is wired on the SDK as `cards`', () => {
    expect(new InkressStorefrontSDK({ merchantUsername: 'acme' }).cards).toBeInstanceOf(CardsResource);
  });
});
