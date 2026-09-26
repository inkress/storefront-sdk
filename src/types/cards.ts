import type { CheckoutIntent } from './checkout';

/** Who pays a fee component on the merchant's future merchant-initiated charges. */
export type FeePayer =
  | 'customer'
  | 'merchant'
  // m-S4 (final-review fix, shared forward-compat decision with the admin SDK): the runtime
  // guard (`isFeeDisclosureComponent` below) only ever checked `typeof === 'string'`, never the
  // literal members, so an unrecognised value already passed through at runtime - this widens
  // the TYPE to match, rather than tightening the guard to reject a value the server documents
  // as extensible.
  // eslint-disable-next-line @typescript-eslint/ban-types -- forward-compat idiom, not "empty object".
  | (string & {});

export type FeeComponentKind =
  | 'platform'
  | 'processing'
  // eslint-disable-next-line @typescript-eslint/ban-types -- see FeePayer above.
  | (string & {});

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
  /**
   * The card network's OWN casing, stored raw (`card_connect.ex`'s `vault_connected_card/1` — the
   * processor sends e.g. "Visa" / "VISA" / "visa" depending on the card and hasn't been
   * normalised). Compare case-insensitively; do not assume a fixed casing.
   */
  brand: string | null;
  last_4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  display: string;
  active: boolean;
  /**
   * True only when the card holds a LIVE vaulted credential AND this merchant has a recorded
   * on-demand (MIT) fee consent for it — a display hint, not the enforcement (the server
   * re-checks both, plus its own KYC/profile gates, wherever it actually charges on demand).
   */
  chargeable: boolean;
  /** Always `null` here — the storefront SDK only ever reads the OWNER audience (your own cards). */
  owner_id: number | null;
  inserted_at: string;
}

export type CardRemovalAction = 'removed' | 'disconnected';

export interface CardRemovalResult {
  id: number;
  action: CardRemovalAction;
  /**
   * Non-cancelled subscriptions still pointing at this card — counted ONLY over THIS store's own
   * billing plans (Ruling D-16 / amended R2): a cross-merchant count would leak which other
   * merchants you use. Their renewals will fail closed and enter dunning until updated with a
   * new card.
   */
  active_subscriptions: number;
}

export interface CardConnectInput {
  /** `FeeDisclosure.version` the shopper accepted. Required — connect is refused without it. */
  acceptedDisclosureVersion: string;
  /**
   * https:// base for the post-3DS return URL. Validated client-side before any network call:
   * must be an absolute `https://` URL with a non-empty host and no userinfo
   * (`user:pass@host`) — the server (`CardConnect.safe_return_base/1`) silently DROPS anything
   * else rather than answering an error, so an invalid value would otherwise fail quietly at the
   * very end of the 3DS flow instead of here.
   */
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
  /**
   * Omitted unless the completing session is the card's confirmed owner — i.e. also omitted on
   * the read-only replay of an already-completed connect when the completer isn't confirmed as
   * the owner (server: `CardController.complete_account_payload/2`). `{ id }` alone still means
   * the card IS connected; it's a privacy gate on the DISPLAY fields, not a different outcome.
   */
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
