import { InkressApiError } from '../client';
import type { HttpClient, ApiResponse } from '../client';
import type { PaginatedResponse } from '../types';
import type { CheckoutResource } from './checkout';
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

/** Thrown when a connect is still pending after `maxAttempts` completion polls. */
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
 * Thrown when a `/cards/connect` response doesn't match the `CardConnectStart` contract this SDK
 * targets — today, specifically a missing or malformed `fee_disclosure` (required in the types as
 * the P5 target contract, shipped by Tasks 5/6, but not every server has it yet). Guards the
 * network boundary so a stale/partial server degrades to a clear, typed failure instead of a
 * `TypeError` on `undefined` deep in caller code.
 */
export class CardConnectContractError extends Error {
  public readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = 'CardConnectContractError';
    this.details = details;
  }
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

/**
 * The logged-in shopper's saved cards on this merchant (Ink Pay, INK-438). Requires the shopper
 * `authToken` and `merchantUsername`.
 *
 * Saving a card: `feeDisclosure()` -> show `text` -> `connectIntent({ acceptedDisclosureVersion })`
 * -> mount the hosted card frame with `intent` (your app) -> `completeConnect(reference_id)`.
 */
export class CardsResource {
  constructor(
    private client: HttpClient,
    private checkout: CheckoutResource,
  ) {}

  /** The shopper's saved cards connected to this merchant. */
  async list(params?: { page?: number; page_size?: number }): Promise<ApiResponse<PaginatedResponse<SavedCard>>> {
    return this.client.get<PaginatedResponse<SavedCard>>('/cards', params ? { ...params } : undefined);
  }

  /**
   * Removes this card from every store you saved it with; subscriptions paying with it will need
   * a new card. (Amended R2, 2026-09-25 — the recommended storefront copy for this action.)
   */
  async remove(id: number): Promise<ApiResponse<CardRemovalResult>> {
    return this.client.delete<CardRemovalResult>(`/cards/${id}`);
  }

  /** The fees this merchant's future charges to a saved card may carry. */
  async feeDisclosure(): Promise<ApiResponse<FeeDisclosure>> {
    return this.client.get<FeeDisclosure>('/cards/connect/disclosure');
  }

  /** Open a connect (the accepted disclosure is required) and fetch its mode "store" intent. */
  async connectIntent(input: CardConnectInput): Promise<CardConnectIntent> {
    const body: Record<string, string> = { fee_disclosure_version: input.acceptedDisclosureVersion };
    if (input.returnBase) body.return_base = input.returnBase;

    const started = await this.client.post<CardConnectStart>('/cards/connect', body);
    const start = started.result;
    if (started.state !== 'ok' || !start) {
      throw new InkressApiError('Card connect could not be started', 0, started);
    }
    if (!isFeeDisclosure(start.fee_disclosure)) {
      throw new CardConnectContractError('server did not return a fee disclosure — upgrade the API', start.fee_disclosure);
    }

    const intent = await this.checkout.checkoutIntent(start.payment_link_uid, { mode: 'store' });
    if (intent.state !== 'ok' || !intent.data || typeof intent.data === 'string') {
      throw new InkressApiError('Card connect intent could not be created', 0, intent);
    }

    return { ...start, intent: intent.data };
  }

  /**
   * Finish a connect. Polls while the API answers 202 `{status: "pending"}` (the 3DS result has
   * not arrived yet), with exponential backoff capped at `maxDelayMs`; any error throws at once.
   */
  async completeConnect(referenceId: string, options: CompleteConnectOptions = {}): Promise<ConnectedCard> {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const initialDelay = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    const maxDelay = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
    const sleep = options.sleep ?? defaultSleep;
    const path = `/cards/connect/${encodeURIComponent(referenceId)}/complete`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await this.client.post<CardConnectCompletion>(path, {});
      const outcome = res.result;
      if (outcome && 'account' in outcome) return outcome.account;
      if (attempt < maxAttempts) await sleep(Math.min(initialDelay * 2 ** (attempt - 1), maxDelay));
    }

    throw new CardConnectPendingError(referenceId, maxAttempts);
  }
}
