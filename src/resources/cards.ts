import { InkressApiError } from '../client';
import type { HttpClient, ApiResponse } from '../client';
import type { PaginatedResponse } from '../types';
import type { CheckoutResource } from './checkout';
import type { PublicDataResponse, CheckoutIntent } from '../types/checkout';
import type {
  CardConnectCompletion,
  CardConnectInput,
  CardConnectIntent,
  CardConnectStart,
  CardRemovalResult,
  CompleteConnectOptions,
  ConnectedCard,
  FeeDisclosure,
  FeeDisclosureComponent,
  FeeDisclosureExample,
  SavedCard,
} from '../types/cards';

const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 4000;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Thrown when a connect is still pending after `maxAttempts` completion polls. Safe to call
 * `completeConnect` again with the SAME `referenceId` — polling is idempotent (a completed
 * connect answers with the read-only replay instead of re-vaulting; see `ConnectedCard`). */
export class CardConnectPendingError extends Error {
  public readonly referenceId: string;
  public readonly attempts: number;

  constructor(referenceId: string, attempts: number) {
    super(`Card connect ${referenceId} is still pending after ${attempts} attempts`);
    this.name = 'CardConnectPendingError';
    this.referenceId = referenceId;
    this.attempts = attempts;
  }
}

/**
 * Thrown when a `/cards/connect` or `/cards/connect/:ref/complete` response doesn't match the
 * contract this SDK targets — a missing/malformed `fee_disclosure`, or (m-S3, final-review fix)
 * an unrecognised 2xx completion body (neither `{account}` nor `{status: "pending"}`, and not a
 * primitive that would otherwise throw a raw `TypeError` from the `in` operator). Guards the
 * network boundary so a stale/partial server degrades to a clear, typed failure instead of a
 * `TypeError` deep in caller code, or (m-S3) being silently polled to exhaustion as if pending.
 */
export class CardConnectContractError extends Error {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'CardConnectContractError';
    this.details = details;
  }
}

/**
 * Why `connectIntent()` or `completeConnect()` refused a request with a `403`/`404`/`409`/`422`
 * (server: `CardController.connect/2`, `complete/2`, `CardConnect.complete_connect/2`). Each
 * reason needs different UX:
 *
 * | `reason` | Meaning | Action |
 * |---|---|---|
 * | `card_removed` | Replay of an already-completed connect whose account is no longer safely reportable (owner REMOVE, or this merchant's own DISCONNECT, happened since). | Tell the shopper this card was removed; have them add it again. |
 * | `fee_consent_missing` | The connect order completed but the merchant's fee consent wasn't recorded. | Restart the connect flow from `feeDisclosure()`. |
 * | `fee_disclosure_changed` | The disclosure changed since `connectIntent` was called. `feeDisclosure` on this error carries the NEW terms. | Re-show `feeDisclosure` and restart with its `version`. |
 * | `fee_disclosure_version_required` | `acceptedDisclosureVersion` was missing/empty. `feeDisclosure` carries the current terms. | Show the disclosure, then retry with its `version`. |
 * | `fee_disclosure_unavailable` | The merchant's fee terms can't be computed right now (configuration issue). | Not caller-fixable; surface a generic error. |
 * | `owner_mismatch` / `reference_mismatch` | This session isn't the connect's owner, or the reference doesn't belong to this merchant. | Not retryable with the same reference; start a new connect. |
 * | `order_not_found` | The reference doesn't resolve to a connect order at all. | Not retryable; start a new connect. |
 * | `connect_order_captured` | The shopper was CHARGED the $1 verification instead of it being voided. | Surface to support — do not silently retry. |
 * | `unknown` | A refusal this SDK doesn't have a specific reason for yet. | `message`/`status` still carry the server's text. |
 *
 * The reason is read from the server body (`error.details.result`), never from `error.message`
 * (the HTTP layer always sets that to the generic `"HTTP <status>"`).
 */
export type CardConnectRefusalReason =
  | 'card_removed'
  | 'fee_consent_missing'
  | 'fee_disclosure_changed'
  | 'fee_disclosure_version_required'
  | 'fee_disclosure_unavailable'
  | 'owner_mismatch'
  | 'reference_mismatch'
  | 'order_not_found'
  | 'connect_order_captured'
  | 'unknown';

export class CardConnectError extends InkressApiError {
  public readonly reason: CardConnectRefusalReason;
  /** Present only for `fee_disclosure_changed` / `fee_disclosure_version_required` — re-show this. */
  public readonly feeDisclosure?: FeeDisclosure;

  constructor(reason: CardConnectRefusalReason, message: string, status: number, details?: unknown, feeDisclosure?: FeeDisclosure) {
    super(message, status, details);
    this.name = 'CardConnectError';
    this.reason = reason;
    if (feeDisclosure !== undefined) this.feeDisclosure = feeDisclosure;
  }
}

const OWNER_SESSION_REQUIRED_MESSAGE = 'Saved cards require a logged-in shopper session.';

/**
 * Thrown by `list()`, `remove()` and `connectIntent()` on the `403` the server answers for any
 * caller that isn't an embedded shopper JWT (`CardManagement.owner_audience/2`, and — since round
 * 3 of the final review, I-S2 — `CardController.connect/2` too, closing what used to be a live
 * seam). There is no separate machine-readable code on the wire for this: the server reuses the
 * EXACT SAME `403` body `owner_audience/2` already sent for list/get/remove
 * (`{state, data: {result}, result}` with this literal text), so this class is assigned
 * CLIENT-SIDE from that status + exact text, not read off a server-sent reason string.
 *
 * `cards.*` needs the shopper session JWT from `auth.login`/`register` — never the merchant
 * `public_key` (`pk_`) or a secret key (`sk_`); see the class doc on {@link CardsResource}.
 */
export class CardOwnerSessionRequiredError extends InkressApiError {
  constructor(details?: unknown) {
    super(OWNER_SESSION_REQUIRED_MESSAGE, 403, details);
    this.name = 'CardOwnerSessionRequiredError';
  }
}

/**
 * Thrown by `remove()` when the SDK's OWN retry of the DELETE — issued only after the first
 * attempt's response was lost to a network/timeout error or a `5xx` — comes back `404`. Owner
 * REMOVE sets `active: false` (`card_management.ex`), which every scoped list/get/delete query
 * filters on, so a `404` on a RETRY of the SAME delete means the first attempt already succeeded
 * — not that the card was never connected. A first attempt that gets `404` immediately (no prior
 * transient failure) is unaffected — `remove()` still throws the plain `InkressApiError` `404`
 * for that.
 */
export class CardAlreadyRemovedError extends InkressApiError {
  public readonly id: number;

  constructor(id: number, details?: unknown) {
    super(
      `Card ${id} was already removed — an earlier request likely succeeded and its response was lost.`,
      404,
      details,
    );
    this.name = 'CardAlreadyRemovedError';
    this.id = id;
  }
}

/**
 * Thrown when `/cards/connect` succeeded (the connect order is open, `start` is real) but the
 * follow-up mode `"store"` checkout-intent request then failed — a thrown error (402 risk, 422)
 * or a malformed response (m-S7, final-review fix). `start` carries `reference_id` /
 * `payment_link_uid` / `fee_disclosure`, which the caller would otherwise lose: retry the
 * checkout-intent call for THIS SAME order (`start.payment_link_uid`) rather than starting a new
 * connect, which would open a second connect order and write a second consent audit row.
 */
export class CardConnectIntentFailedError extends InkressApiError {
  public readonly start: CardConnectStart;

  constructor(start: CardConnectStart, cause: unknown) {
    const [message, status, details] =
      cause instanceof InkressApiError ? [cause.message, cause.status, cause.details] : ['Card connect intent could not be created', 0, cause];
    super(message, status, details);
    this.name = 'CardConnectIntentFailedError';
    this.start = start;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** The plain-string `result` from a card-controller error body (`{state, data: {result}, result}`). */
function refusalText(details: unknown): string | undefined {
  return isRecord(details) && typeof details.result === 'string' ? details.result : undefined;
}

// Takes an already-narrowed InkressApiError (never `unknown`): a type PREDICATE here would
// collapse `error` to `never` in the false branch wherever the caller already knows `error` is an
// InkressApiError (e.g. after its own `instanceof` check) - the negation of "is InkressApiError"
// is `never` once the type is already that. Callers starting from `unknown` narrow with their own
// `instanceof InkressApiError` check first.
function isOwnerSessionRequiredRefusal(error: InkressApiError): boolean {
  return error.status === 403 && refusalText(error.details) === OWNER_SESSION_REQUIRED_MESSAGE;
}

function isTransientError(error: unknown): boolean {
  return error instanceof InkressApiError && (error.status === 0 || error.status >= 500);
}

const isFeeDisclosureComponent = (value: unknown): value is FeeDisclosureComponent => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.kind === 'string' && typeof v.payer === 'string';
};

const isFeeDisclosureExample = (value: unknown): value is FeeDisclosureExample => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.amount === 'number' && typeof v.fee === 'number' && typeof v.total === 'number' && typeof v.currency === 'string'
  );
};

/** Runtime type-guard for the network boundary: `fee_disclosure` is required in {@link FeeDisclosure}
 * but must still be validated, since a server that hasn't shipped it yet can send it missing or malformed. */
const isFeeDisclosure = (value: unknown): value is FeeDisclosure => {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.version === 'string' &&
    v.version.length > 0 &&
    typeof v.customer_pays_fees === 'boolean' &&
    Array.isArray(v.components) &&
    v.components.every(isFeeDisclosureComponent) &&
    isFeeDisclosureExample(v.example) &&
    typeof v.text === 'string' &&
    v.text.length > 0
  );
};

// m-S3 (final-review fix): completeConnect used to narrow only on `'account' in outcome`, with no
// check on `account` itself and no guard against a primitive `outcome` (which throws a raw
// TypeError from `in`). isRecord (above) covers the primitive case; this covers the shape.
function isConnectedCard(value: unknown): value is ConnectedCard {
  return isRecord(value) && typeof value.id === 'number';
}

function isPendingCompletion(value: unknown): value is { status: 'pending' } {
  return isRecord(value) && value.status === 'pending';
}

/** Extracts the fee disclosure a 409 `fee_disclosure_changed` / 422 version-required body carries
 * at `details.data.fee_disclosure` (`CardController.fee_disclosure_error/4`), validated the same
 * way a successful response is. `undefined` if it's missing or malformed. */
function extractFeeDisclosure(details: unknown): FeeDisclosure | undefined {
  if (!isRecord(details) || !isRecord(details.data)) return undefined;
  return isFeeDisclosure(details.data.fee_disclosure) ? details.data.fee_disclosure : undefined;
}

const FEE_DISCLOSURE_VERSION_REQUIRED_TEXT = 'fee_disclosure_version is required';
const FEE_DISCLOSURE_UNAVAILABLE_TEXT = 'Fee disclosure unavailable';

/** Maps a `connectIntent()` (the `/cards/connect` step only) failure to a typed error. Always throws. */
function mapConnectStartError(error: unknown): never {
  if (!(error instanceof InkressApiError)) throw error;
  if (isOwnerSessionRequiredRefusal(error)) throw new CardOwnerSessionRequiredError(error.details);

  const message = refusalText(error.details);
  if (message === 'fee_disclosure_changed') {
    throw new CardConnectError('fee_disclosure_changed', message, error.status, error.details, extractFeeDisclosure(error.details));
  }
  if (message === FEE_DISCLOSURE_VERSION_REQUIRED_TEXT) {
    throw new CardConnectError('fee_disclosure_version_required', message, error.status, error.details, extractFeeDisclosure(error.details));
  }
  if (message === FEE_DISCLOSURE_UNAVAILABLE_TEXT) {
    throw new CardConnectError('fee_disclosure_unavailable', message, error.status, error.details);
  }
  throw error;
}

const COMPLETE_CONNECT_REASONS: Readonly<Record<string, CardConnectRefusalReason>> = {
  card_removed: 'card_removed',
  fee_consent_missing: 'fee_consent_missing',
  owner_mismatch: 'owner_mismatch',
  reference_mismatch: 'reference_mismatch',
  connect_order_captured: 'connect_order_captured',
};

/** Maps a `completeConnect()` failure to a typed error. Always throws. */
function mapCompleteConnectError(error: unknown): never {
  if (!(error instanceof InkressApiError)) throw error;

  if (error.status === 404) {
    throw new CardConnectError('order_not_found', refusalText(error.details) ?? 'Not Found', 404, error.details);
  }

  const message = refusalText(error.details);
  const known = message !== undefined ? COMPLETE_CONNECT_REASONS[message] : undefined;
  if (known !== undefined) {
    throw new CardConnectError(known, message as string, error.status, error.details);
  }

  if (error.status === 403 || error.status === 409 || error.status === 422) {
    throw new CardConnectError('unknown', message ?? error.message, error.status, error.details);
  }
  throw error;
}

/**
 * Mirrors the server's own rule (`CardConnect.safe_return_base/1`): `https://` with a non-empty
 * host and no userinfo. An invalid `returnBase` is silently DROPPED server-side (never a 4xx), so
 * this fails fast client-side instead of the return URL quietly not working after 3DS.
 */
function validateReturnBase(returnBase: string): void {
  let parsed: URL;
  try {
    parsed = new URL(returnBase);
  } catch {
    throw new Error(`returnBase must be an absolute https:// URL with a host (got ${JSON.stringify(returnBase)})`);
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username !== '' || parsed.password !== '') {
    throw new Error(`returnBase must be https://<host> with no userinfo (got ${JSON.stringify(returnBase)})`);
  }
}

/**
 * I-S2 (final-review fix), cheap pre-flight: refuses BEFORE any network call when the configured
 * token is obviously a merchant API key, never a shopper session. The server enforces the real
 * rule (`owner_audience/2`'s `source: :embedded_jwt` check — see {@link CardOwnerSessionRequiredError}),
 * but failing fast here catches the common mistake of reusing checkout's
 * `setAuthToken(public_key)` for `cards.*` without an extra round trip.
 */
function guardShopperSessionToken(client: HttpClient): void {
  const kind = client.getAuthTokenKind();
  if (kind === 'public_key' || kind === 'secret_key') {
    const keyLabel = kind === 'public_key' ? 'public key (pk_)' : 'secret key (sk_)';
    throw new Error(
      `cards.connectIntent requires the shopper session JWT from auth.login/register, never a merchant ${keyLabel}. ` +
        'Set it with sdk.setAuthToken(shopperJwt) — see CardsResource\'s class doc.',
    );
  }
}

/**
 * The logged-in shopper's saved cards on this merchant (Ink Pay, INK-438).
 *
 * REQUIRES the shopper SESSION JWT (from {@link AuthResource.login}/{@link AuthResource.register})
 * as `authToken` — never the merchant `public_key` (`pk_`) that {@link CheckoutResource.merchantTokens}
 * hands you for {@link CheckoutResource.createOrder}, and never a secret key (`sk_`). Those are
 * merchant credentials: `Context.Auth.is_token_valid?/1` resolves them to their OWNER user, so
 * using one here would vault the shopper's card (plus fee consent and an audit row) onto the
 * MERCHANT KEY OWNER's account instead of the shopper's — a card the shopper could never list or
 * remove, that the merchant could still charge on demand (I-S2). `list`/`remove` are refused
 * server-side for anything else with `403` ({@link CardOwnerSessionRequiredError}); `connectIntent`
 * also refuses a `pk_`/`sk_` token client-side, before any network call.
 *
 * Saving a card: `feeDisclosure()` -> show `text` -> `connectIntent({ acceptedDisclosureVersion })`
 * -> mount the hosted card frame with `intent` (your app) -> `completeConnect(reference_id)`.
 */
export class CardsResource {
  constructor(
    private client: HttpClient,
    private checkout: CheckoutResource,
  ) {}

  /**
   * The shopper's saved cards connected to this merchant. Requires the shopper session JWT (see
   * the class doc) — throws {@link CardOwnerSessionRequiredError} for anything else.
   */
  async list(params?: { page?: number; page_size?: number }): Promise<ApiResponse<PaginatedResponse<SavedCard>>> {
    try {
      return await this.client.get<PaginatedResponse<SavedCard>>('/cards', params ? { ...params } : undefined);
    } catch (error) {
      if (error instanceof InkressApiError && isOwnerSessionRequiredRefusal(error)) {
        throw new CardOwnerSessionRequiredError(error.details);
      }
      throw error;
    }
  }

  /**
   * Removes this card from every store you saved it with; subscriptions paying with it will need
   * a new card. (Amended R2, 2026-09-25 — the recommended storefront copy for this action.)
   * Requires the shopper session JWT — throws {@link CardOwnerSessionRequiredError} for anything
   * else.
   *
   * m-S5 (final-review fix): if the SDK's own retry (after the first attempt's response was lost
   * to a network/timeout error or a `5xx`) then sees `404`, throws {@link CardAlreadyRemovedError}
   * instead of a plain not-found — REMOVE already dropped the card out of every scoped query, so a
   * `404` on a retry of the SAME delete means the first attempt succeeded. A single, first-attempt
   * `404` is unaffected.
   */
  async remove(id: number): Promise<ApiResponse<CardRemovalResult>> {
    try {
      return await this.client.delete<CardRemovalResult>(`/cards/${id}`);
    } catch (error) {
      if (error instanceof InkressApiError && isOwnerSessionRequiredRefusal(error)) {
        throw new CardOwnerSessionRequiredError(error.details);
      }
      if (!isTransientError(error)) throw error;
      try {
        return await this.client.delete<CardRemovalResult>(`/cards/${id}`);
      } catch (retryError) {
        // Round 2 (final-review re-review, Minor #3): the retry's own catch used to check only
        // for 404 - a 403 owner-session-required arising only on the retry (e.g. the session was
        // invalidated between the two attempts) surfaced as a plain InkressApiError instead of
        // this typed error, unlike the identical check the FIRST attempt's catch already ran.
        if (retryError instanceof InkressApiError && isOwnerSessionRequiredRefusal(retryError)) {
          throw new CardOwnerSessionRequiredError(retryError.details);
        }
        if (retryError instanceof InkressApiError && retryError.status === 404) {
          throw new CardAlreadyRemovedError(id, retryError.details);
        }
        throw retryError;
      }
    }
  }

  /**
   * The fees this merchant's future charges to a saved card may carry. Validated before it's
   * returned (m-S2, final-review fix) — throws {@link CardConnectContractError} on a malformed
   * body instead of handing back an unusable disclosure.
   */
  async feeDisclosure(): Promise<ApiResponse<FeeDisclosure>> {
    const response = await this.client.get<FeeDisclosure>('/cards/connect/disclosure');
    if (!isFeeDisclosure(response.result)) {
      throw new CardConnectContractError('server did not return a valid fee disclosure', response.result);
    }
    return response;
  }

  /**
   * Open a connect (the accepted disclosure is required) and fetch its mode "store" intent.
   *
   * Refuses client-side, before any network call, when the configured token is a merchant `pk_`/
   * `sk_` key (I-S2 — see the class doc) or `returnBase` is malformed. Server refusals are typed:
   * {@link CardOwnerSessionRequiredError} (403, any non-shopper-session principal — round 3 of the
   * final review closed this server-side too), {@link CardConnectError} (`fee_disclosure_changed`
   * / `fee_disclosure_version_required` / `fee_disclosure_unavailable`, I-S1). If the connect order
   * opens but the follow-up checkout-intent request fails, throws {@link CardConnectIntentFailedError}
   * carrying the connect's own `reference_id`/`payment_link_uid` (m-S7) so it isn't lost.
   */
  async connectIntent(input: CardConnectInput): Promise<CardConnectIntent> {
    guardShopperSessionToken(this.client);
    if (input.returnBase !== undefined) validateReturnBase(input.returnBase);

    const body: Record<string, string> = { fee_disclosure_version: input.acceptedDisclosureVersion };
    if (input.returnBase) body.return_base = input.returnBase;

    let started: ApiResponse<CardConnectStart>;
    try {
      started = await this.client.post<CardConnectStart>('/cards/connect', body);
    } catch (error) {
      mapConnectStartError(error);
    }
    const start = started.result;
    if (started.state !== 'ok' || !start) {
      throw new InkressApiError('Card connect could not be started', 0, started);
    }
    if (!isFeeDisclosure(start.fee_disclosure)) {
      throw new CardConnectContractError('server did not return a fee disclosure — upgrade the API', start.fee_disclosure);
    }

    let intent: PublicDataResponse<CheckoutIntent>;
    try {
      intent = await this.checkout.checkoutIntent(start.payment_link_uid, { mode: 'store' });
    } catch (error) {
      throw new CardConnectIntentFailedError(start, error);
    }
    if (intent.state !== 'ok' || !intent.data || typeof intent.data === 'string') {
      throw new CardConnectIntentFailedError(start, intent);
    }

    return { ...start, intent: intent.data };
  }

  /**
   * Finish a connect. Polls while the API answers 202 `{status: "pending"}` (the 3DS result has
   * not arrived yet), with exponential backoff capped at `maxDelayMs`. Any hard error throws at
   * once, typed as {@link CardConnectError} for the refusals I-S1 covers — `card_removed` (a
   * replay after the account was removed/disconnected since), `fee_consent_missing`,
   * `owner_mismatch`, `reference_mismatch`, `order_not_found`, `connect_order_captured` (the
   * shopper was charged the $1 instead of it being voided — surface to support) — or `unknown`
   * for anything else. An unrecognised 2xx body (m-S3) throws {@link CardConnectContractError}
   * immediately rather than being polled to exhaustion as if it were pending.
   */
  async completeConnect(referenceId: string, options: CompleteConnectOptions = {}): Promise<ConnectedCard> {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const initialDelay = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const maxDelay = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    const sleep = options.sleep ?? defaultSleep;
    const path = `/cards/connect/${encodeURIComponent(referenceId)}/complete`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let res: ApiResponse<CardConnectCompletion>;
      try {
        res = await this.client.post<CardConnectCompletion>(path, {});
      } catch (error) {
        mapCompleteConnectError(error);
      }
      const outcome = res.result;

      if (isRecord(outcome) && 'account' in outcome) {
        const account = (outcome as { account: unknown }).account;
        if (!isConnectedCard(account)) {
          throw new CardConnectContractError('completeConnect returned an unrecognised connected-card body', outcome);
        }
        return account;
      }

      if (!isPendingCompletion(outcome)) {
        throw new CardConnectContractError('completeConnect returned an unrecognised response', outcome);
      }

      if (attempt < maxAttempts) await sleep(Math.min(initialDelay * 2 ** (attempt - 1), maxDelay));
    }

    throw new CardConnectPendingError(referenceId, maxAttempts);
  }
}
