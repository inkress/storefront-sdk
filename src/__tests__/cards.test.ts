/**
 * Ink Pay saved cards (INK-438): list/remove, the fee disclosure, connectIntent (a mode "store"
 * checkout-intent) and completeConnect's bounded polling of the 202 "pending" completion.
 */
import { HttpClient, InkressApiError } from '../client';
import { CheckoutResource } from '../resources/checkout';
import {
  CardsResource,
  CardConnectPendingError,
  CardConnectContractError,
  CardConnectError,
  CardOwnerSessionRequiredError,
  CardAlreadyRemovedError,
  CardConnectIntentFailedError,
} from '../resources/cards';
import { InkressStorefrontSDK } from '../index';
import type { FeeDisclosure } from '../types/cards';

const fetchMock = fetch as unknown as jest.Mock & {
  mockResponseOnce: (body: string, init?: { status?: number }) => void;
  mockRejectOnce: (error: Error) => void;
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
    // m-S1 (final-review fix): the server (Paginate.page_map) never sends total_pages on a
    // last/only page (more: false) - this fixture used to send total_pages: 0, a combination the
    // real server can't produce.
    fetchMock.mockResponseOnce(
      envelope('ok', { entries: [], pagination: { page: 1, page_size: 25, total_entries: 0, more: false, next_pages: [], last_pages: [] } }),
    );

    const res = await cards.list();

    expect(urlAt(0)).toContain('/api/v1/cards');
    const headers = initAt(0).headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer shopper-token');
    expect(headers['Client-Id']).toBe('m-acme');
    expect(res.result?.entries).toEqual([]);
    expect(res.result?.pagination.total_pages).toBeUndefined();
  });

  // I-S2 (final-review fix, round 3): the server now answers this exact 403 for list/get/remove
  // AND connect/2 under any non-shopper-session principal - typed the same way everywhere.
  it('list maps the owner-session 403 to CardOwnerSessionRequiredError', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        state: 'error',
        data: { result: 'Saved cards require a logged-in shopper session.' },
        result: 'Saved cards require a logged-in shopper session.',
      }),
      { status: 403 },
    );

    await expect(cards.list()).rejects.toBeInstanceOf(CardOwnerSessionRequiredError);
  });

  it('remove DELETEs /cards/:id', async () => {
    fetchMock.mockResponseOnce(envelope('ok', { id: 9, action: 'removed', active_subscriptions: 0 }));

    const res = await cards.remove(9);

    expect(urlAt(0)).toContain('/api/v1/cards/9');
    expect(initAt(0).method).toBe('DELETE');
    expect(res.result?.action).toBe('removed');
  });

  it('remove maps the owner-session 403 to CardOwnerSessionRequiredError', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        state: 'error',
        data: { result: 'Saved cards require a logged-in shopper session.' },
        result: 'Saved cards require a logged-in shopper session.',
      }),
      { status: 403 },
    );

    await expect(cards.remove(9)).rejects.toBeInstanceOf(CardOwnerSessionRequiredError);
  });

  // m-S5 (final-review fix, shared decision with the admin SDK): the SDK's own retry after a
  // lost response must report a subsequent 404 as already-removed, not a generic not-found. A
  // first-attempt 404 (no retry involved) is unaffected - see the next test.
  it('remove reports a retried 404 (after a transient failure) as CardAlreadyRemovedError', async () => {
    fetchMock.mockRejectOnce(new TypeError('Network request failed'));
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'error', data: { result: 'Not Found' }, result: 'Not Found' }),
      { status: 404 },
    );

    const promise = cards.remove(9);

    await expect(promise).rejects.toBeInstanceOf(CardAlreadyRemovedError);
    await expect(promise).rejects.toMatchObject({ id: 9, status: 404 });
    expect(calls()).toHaveLength(2);
  });

  // Round 2 (final-review re-review, Minor #3): the retry's own catch used to check only for
  // 404, unlike the first attempt's catch (which already checked owner-session first) - a 403
  // owner-session-required arising only on the retry (e.g. the session was invalidated between
  // the two attempts) must be rewrapped the same way, not left as a plain InkressApiError.
  it('remove rewraps a 403 owner-session refusal on the RETRY the same way as the first attempt', async () => {
    fetchMock.mockRejectOnce(new TypeError('Network request failed'));
    fetchMock.mockResponseOnce(
      JSON.stringify({
        state: 'error',
        data: { result: 'Saved cards require a logged-in shopper session.' },
        result: 'Saved cards require a logged-in shopper session.',
      }),
      { status: 403 },
    );

    const promise = cards.remove(9);

    await expect(promise).rejects.toBeInstanceOf(CardOwnerSessionRequiredError);
    expect(calls()).toHaveLength(2);
  });

  it('remove leaves a first-attempt 404 as the plain InkressApiError', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'error', data: { result: 'Not Found' }, result: 'Not Found' }), { status: 404 });

    const promise = cards.remove(9);

    await expect(promise).rejects.toBeInstanceOf(InkressApiError);
    await expect(promise).rejects.not.toBeInstanceOf(CardAlreadyRemovedError);
    expect(calls()).toHaveLength(1);
  });

  it('feeDisclosure GETs /cards/connect/disclosure', async () => {
    fetchMock.mockResponseOnce(envelope('ok', disclosure));

    const res = await cards.feeDisclosure();

    expect(urlAt(0)).toContain('/api/v1/cards/connect/disclosure');
    expect(res.result?.version).toBe(disclosure.version);
  });

  // m-S2 (final-review fix): feeDisclosure() was unguarded, unlike connectIntent's own check with
  // the same isFeeDisclosure predicate.
  it('feeDisclosure throws CardConnectContractError on a malformed body', async () => {
    fetchMock.mockResponseOnce(envelope('ok', { version: 'fd1-x' })); // missing components/example/text

    await expect(cards.feeDisclosure()).rejects.toBeInstanceOf(CardConnectContractError);
  });

  // I-S2 (final-review fix): the cheap client-side guard - refuses BEFORE any network call when
  // the configured token is obviously a merchant key, never a shopper session.
  describe('connectIntent refuses a merchant key client-side (I-S2)', () => {
    it('refuses a pk_ public key without calling fetch', async () => {
      const pkClient = new HttpClient({ merchantUsername: 'acme', authToken: 'pk_test_abc123' });
      const pkCards = new CardsResource(pkClient, new CheckoutResource(pkClient));

      await expect(pkCards.connectIntent({ acceptedDisclosureVersion: disclosure.version })).rejects.toThrow(/shopper session JWT/);
      expect(calls()).toHaveLength(0);
    });

    it('refuses an sk_ secret key without calling fetch', async () => {
      const skClient = new HttpClient({ merchantUsername: 'acme', authToken: 'sk_test_abc123' });
      const skCards = new CardsResource(skClient, new CheckoutResource(skClient));

      await expect(skCards.connectIntent({ acceptedDisclosureVersion: disclosure.version })).rejects.toThrow(/shopper session JWT/);
      expect(calls()).toHaveLength(0);
    });

    it('allows a session token through to the network call', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({ state: 'error', data: { result: 'Merchant context required' }, result: 'Merchant context required' }),
        { status: 403 },
      );

      await expect(cards.connectIntent({ acceptedDisclosureVersion: disclosure.version })).rejects.toMatchObject({ status: 403 });
      expect(calls()).toHaveLength(1);
    });
  });

  // m-S8 (final-review fix): the server silently DROPS an invalid returnBase rather than
  // answering an error, so this validates client-side instead of failing quietly after 3DS.
  describe('connectIntent validates returnBase client-side (m-S8)', () => {
    it('rejects a non-https returnBase without calling fetch', async () => {
      await expect(
        cards.connectIntent({ acceptedDisclosureVersion: disclosure.version, returnBase: 'http://shop.example.com' }),
      ).rejects.toThrow(/https/);
      expect(calls()).toHaveLength(0);
    });

    it('rejects a returnBase with userinfo (credential-trick host) without calling fetch', async () => {
      await expect(
        cards.connectIntent({ acceptedDisclosureVersion: disclosure.version, returnBase: 'https://evil@good.com' }),
      ).rejects.toThrow(/userinfo/);
      expect(calls()).toHaveLength(0);
    });

    it('rejects a junk returnBase without calling fetch', async () => {
      await expect(
        cards.connectIntent({ acceptedDisclosureVersion: disclosure.version, returnBase: 'javascript:alert(1)' }),
      ).rejects.toThrow();
      expect(calls()).toHaveLength(0);
    });
  });

  // I-S2 (round 3): the server now answers this exact 403 for connect/2 too, under any
  // non-shopper-session principal (e.g. a merchant key whose CLIENT-SIDE guard was somehow
  // bypassed, or a future credential kind this SDK doesn't special-case).
  it('connectIntent maps the owner-session 403 to CardOwnerSessionRequiredError', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        state: 'error',
        data: { result: 'Saved cards require a logged-in shopper session.' },
        result: 'Saved cards require a logged-in shopper session.',
      }),
      { status: 403 },
    );

    await expect(cards.connectIntent({ acceptedDisclosureVersion: disclosure.version })).rejects.toBeInstanceOf(
      CardOwnerSessionRequiredError,
    );
  });

  // connect/2's anonymous case (no resolved session at all) is a 401 this SDK does not have a
  // specific reason for - left as the plain InkressApiError (m-S9: covering the case with a test).
  it('connectIntent leaves a 401 (no session) as the plain InkressApiError', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'error', data: { result: 'You must be logged in.' }, result: 'You must be logged in.' }),
      { status: 401 },
    );

    const promise = cards.connectIntent({ acceptedDisclosureVersion: disclosure.version });

    await expect(promise).rejects.toBeInstanceOf(InkressApiError);
    await expect(promise).rejects.not.toBeInstanceOf(CardOwnerSessionRequiredError);
    await expect(promise).rejects.toMatchObject({ status: 401 });
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

  // I-S1 (final-review fix): the new disclosure used to be reachable only as untyped
  // err.details.data.fee_disclosure - now surfaced typed on CardConnectError.feeDisclosure so the
  // caller can re-show it without re-parsing the error body by hand.
  it('connectIntent surfaces a stale disclosure (409) as CardConnectError with the new disclosure typed', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'error', data: { result: 'fee_disclosure_changed', fee_disclosure: disclosure }, result: 'fee_disclosure_changed' }),
      { status: 409 },
    );

    const promise = cards.connectIntent({ acceptedDisclosureVersion: 'fd1-stale' });

    await expect(promise).rejects.toBeInstanceOf(CardConnectError);
    await expect(promise).rejects.toMatchObject({ reason: 'fee_disclosure_changed', status: 409, feeDisclosure: disclosure });
    expect(calls()).toHaveLength(1);
  });

  it('connectIntent types a missing acceptedDisclosureVersion (422) with the current disclosure', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({
        state: 'error',
        data: { result: 'fee_disclosure_version is required', fee_disclosure: disclosure },
        result: 'fee_disclosure_version is required',
      }),
      { status: 422 },
    );

    const promise = cards.connectIntent({ acceptedDisclosureVersion: '' });

    await expect(promise).rejects.toBeInstanceOf(CardConnectError);
    await expect(promise).rejects.toMatchObject({ reason: 'fee_disclosure_version_required', feeDisclosure: disclosure });
  });

  it('connectIntent types an unavailable fee disclosure (422) with no disclosure attached', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'error', data: { result: 'Fee disclosure unavailable' }, result: 'Fee disclosure unavailable' }),
      { status: 422 },
    );
    expect.assertions(3);

    try {
      await cards.connectIntent({ acceptedDisclosureVersion: disclosure.version });
    } catch (error) {
      expect(error).toBeInstanceOf(CardConnectError);
      expect((error as CardConnectError).reason).toBe('fee_disclosure_unavailable');
      expect((error as CardConnectError).feeDisclosure).toBeUndefined();
    }
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

  // m-S7 (final-review fix): a checkout-intent failure AFTER /cards/connect succeeded used to
  // lose reference_id/payment_link_uid entirely - a retry would then open a SECOND connect order
  // and write a second consent audit row. CardConnectIntentFailedError.start carries them.
  it('connectIntent attaches the connect start to CardConnectIntentFailedError when checkout-intent fails', async () => {
    fetchMock.mockResponseOnce(
      envelope('ok', {
        reference_id: 'cardconn-v1-7-abc',
        payment_link_uid: 'plu_123',
        checkout_intent: { path: '/api/v1/payments/link/plu_123/checkout-intent', mode: 'store' },
        fee_disclosure: disclosure,
      }),
    );
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'error', data: { result: 'Risk declined' }, result: 'Risk declined' }),
      { status: 402 },
    );
    expect.assertions(4);

    try {
      await cards.connectIntent({ acceptedDisclosureVersion: disclosure.version });
    } catch (error) {
      expect(error).toBeInstanceOf(CardConnectIntentFailedError);
      const failure = error as CardConnectIntentFailedError;
      expect(failure.status).toBe(402);
      expect(failure.start.reference_id).toBe('cardconn-v1-7-abc');
      expect(failure.start.payment_link_uid).toBe('plu_123');
    }
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

    const promise = cards.completeConnect('ref-y', { sleep: record([]) });

    await expect(promise).rejects.toBeInstanceOf(InkressApiError);
    await expect(promise).rejects.toBeInstanceOf(CardConnectError);
    await expect(promise).rejects.toMatchObject({ reason: 'fee_consent_missing' });
    expect(calls()).toHaveLength(1);
  });

  // I-S1 (final-review fix): C1's new 409 contract - a replay of an already-completed connect
  // whose account is no longer safely reportable as connected (owner REMOVE, or this merchant's
  // own DISCONNECT, happened since). Grepping the pre-fix SDK found 0 references to this reason.
  it('completeConnect types the new 409 card_removed', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'error', data: { result: 'card_removed' }, result: 'card_removed' }), { status: 409 });

    const promise = cards.completeConnect('ref-removed', { sleep: record([]) });

    await expect(promise).rejects.toBeInstanceOf(CardConnectError);
    await expect(promise).rejects.toMatchObject({ reason: 'card_removed', status: 409 });
  });

  it('completeConnect types 422 connect_order_captured (the shopper was charged the $1)', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'error', data: { result: 'connect_order_captured' }, result: 'connect_order_captured' }),
      { status: 422 },
    );

    const promise = cards.completeConnect('ref-captured', { sleep: record([]) });

    await expect(promise).rejects.toBeInstanceOf(CardConnectError);
    await expect(promise).rejects.toMatchObject({ reason: 'connect_order_captured' });
  });

  it.each([
    ['owner_mismatch', 403],
    ['reference_mismatch', 403],
  ] as const)('completeConnect types 403 %s', async (reason, status) => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'error', data: { result: reason }, result: reason }), { status });

    const promise = cards.completeConnect('ref-z', { sleep: record([]) });

    await expect(promise).rejects.toBeInstanceOf(CardConnectError);
    await expect(promise).rejects.toMatchObject({ reason, status: 403 });
  });

  it('completeConnect types a 404 as order_not_found', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'error', data: { result: 'Not Found' }, result: 'Not Found' }), { status: 404 });

    const promise = cards.completeConnect('ref-missing', { sleep: record([]) });

    await expect(promise).rejects.toBeInstanceOf(CardConnectError);
    await expect(promise).rejects.toMatchObject({ reason: 'order_not_found', status: 404 });
  });

  // m-S9: the read-only replay of an already-completed connect when the completer isn't the
  // confirmed owner - {account: {id}} alone, no brand/last_4/display (privacy gate, see
  // ConnectedCard's doc). Still resolves normally; it's not an error case.
  it('completeConnect resolves the non-owner read-only replay ({account: {id}} alone)', async () => {
    fetchMock.mockResponseOnce(envelope('ok', { account: { id: 91 } }));

    const account = await cards.completeConnect('ref-replay', { sleep: record([]) });

    expect(account).toEqual({ id: 91 });
  });

  // m-S3 (final-review fix): an unrecognised 2xx body (neither {account} nor {status: "pending"})
  // used to be silently polled to exhaustion and reported as CardConnectPendingError - now throws
  // immediately, and a malformed `account` (missing id) is caught by the isConnectedCard guard.
  it('completeConnect throws CardConnectContractError on an unrecognised 2xx body instead of polling to exhaustion', async () => {
    fetchMock.mockResponseOnce(envelope('ok', { something: 'unexpected' }));

    const promise = cards.completeConnect('ref-weird', { sleep: record([]) });

    await expect(promise).rejects.toBeInstanceOf(CardConnectContractError);
    expect(calls()).toHaveLength(1);
  });

  it('completeConnect throws CardConnectContractError on a malformed account body', async () => {
    fetchMock.mockResponseOnce(envelope('ok', { account: { brand: 'visa' } })); // no id

    const promise = cards.completeConnect('ref-bad-account', { sleep: record([]) });

    await expect(promise).rejects.toBeInstanceOf(CardConnectContractError);
    expect(calls()).toHaveLength(1);
  });

  it('is wired on the SDK as `cards`', () => {
    expect(new InkressStorefrontSDK({ merchantUsername: 'acme' }).cards).toBeInstanceOf(CardsResource);
  });
});
