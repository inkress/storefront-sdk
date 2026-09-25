import type { CheckoutIntent } from './checkout';

/** Who pays a fee component on the merchant's future merchant-initiated charges. */
export type FeePayer = 'customer' | 'merchant';
export type FeeComponentKind = 'platform' | 'processing';

export interface FeeDisclosureComponent {
  kind: FeeComponentKind;
  payer: FeePayer;
}

export interface FeeDisclosureExample {
  amount: number;
  fee: number;
  total: number;
  currency: string;
}

/**
 * The fees the merchant's future charges to a saved card may carry. Show `text` before the
 * shopper saves a card; send `version` back as `acceptedDisclosureVersion`.
 */
export interface FeeDisclosure {
  version: string;
  customer_pays_fees: boolean;
  components: FeeDisclosureComponent[];
  example: FeeDisclosureExample;
  text: string;
}

/** A saved card (display metadata only — the vaulted credential never leaves the API). */
export interface SavedCard {
  id: number;
  brand: string | null;
  last_4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  display: string;
  active: boolean;
  chargeable: boolean;
  owner_id: number | null;
  inserted_at: string;
}

export type CardRemovalAction = 'removed' | 'disconnected';

export interface CardRemovalResult {
  id: number;
  action: CardRemovalAction;
  active_subscriptions: number;
}

export interface CardConnectInput {
  /** `FeeDisclosure.version` the shopper accepted. Required — connect is refused without it. */
  acceptedDisclosureVersion: string;
  /** https:// base for the post-3DS return URL. */
  returnBase?: string;
}

export interface CardConnectStart {
  reference_id: string;
  payment_link_uid: string;
  checkout_intent: { path: string; mode: 'store' };
  fee_disclosure: FeeDisclosure;
}

export interface CardConnectIntent extends CardConnectStart {
  /** Server-signed mode "store" intent — hand it to the hosted card frame. */
  intent: CheckoutIntent;
}

export interface ConnectedCard {
  id: number;
  /** Omitted unless the completing session is the card's confirmed owner. */
  brand?: string | null;
  last_4?: string | null;
  display?: string;
}

export type CardConnectCompletion = { account: ConnectedCard } | { status: 'pending' };

export interface CompleteConnectOptions {
  /** Default 8. */
  maxAttempts?: number;
  /** Default 500 ms, doubling per attempt. */
  initialDelayMs?: number;
  /** Default 4000 ms. */
  maxDelayMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
}
