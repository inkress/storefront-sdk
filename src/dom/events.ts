/**
 * Bridge the SDK's programmatic `EventEmitter` to the DOM.
 *
 * The SDK already emits typed `cart:item:added` / `cart:cleared` / … events. Themes,
 * though, listen on the DOM. On mount we subscribe once and re-dispatch:
 *
 *   - `ik:cart`            — aggregate, native. detail: { type, cart, lines, count, subtotal }
 *   - `ik:cart:item:added` — granular, native. detail: the emitter payload
 *   - `fk:cart`            — compat. detail: { items: FleekLine[] } (FleekSite shape)
 *
 * This is a bridge over the existing emitter, not a second event system.
 */
import type { Cart } from '../types';
import type { StorefrontLike } from './sdk-like';
import { toLine, type FleekLine } from './line';

/** The cart emitter events the DOM bridge mirrors. */
const CART_EVENTS = [
  'cart:item:added',
  'cart:item:removed',
  'cart:item:updated',
  'cart:cleared',
] as const;

export interface IkCartDetail {
  /** The emitter event that triggered this dispatch, e.g. `cart:item:added`. */
  type: string;
  cart: Cart;
  lines: FleekLine[];
  count: number;
  subtotal: number;
}

function summarise(cart: Cart, type: string): IkCartDetail {
  return {
    type,
    cart,
    lines: cart.items.map(toLine),
    count: cart.items.reduce((n, i) => n + i.quantity, 0),
    subtotal: cart.subtotal,
  };
}

export interface CartEventBridgeOptions {
  /** Where DOM events are dispatched. Default: `document`. */
  target: EventTarget;
  /** Also dispatch legacy `fk:cart`. Default: true. */
  emitLegacy: boolean;
  /** Called after every cart change so the view can repaint. */
  onChange?: (cart: Cart) => void;
}

/**
 * Wire the emitter→DOM bridge. Returns an unbind function that removes every
 * subscription.
 */
export function bindCartEvents(
  sdk: StorefrontLike,
  options: CartEventBridgeOptions
): () => void {
  const { target, emitLegacy, onChange } = options;
  const unsubs: Array<() => void> = [];

  for (const name of CART_EVENTS) {
    const unsub = sdk.on(name, () => {
      const cart = sdk.cart.get();
      const detail = summarise(cart, name);

      if (onChange) onChange(cart);

      target.dispatchEvent(new CustomEvent('ik:cart', { bubbles: true, detail }));
      target.dispatchEvent(
        new CustomEvent(`ik:${name}`, { bubbles: true, detail })
      );
      if (emitLegacy) {
        // FleekSite themes read `event.detail.items`.
        target.dispatchEvent(
          new CustomEvent('fk:cart', { bubbles: true, detail: { items: detail.lines } })
        );
      }
    });
    unsubs.push(unsub);
  }

  return () => {
    unsubs.forEach((fn) => fn());
    unsubs.length = 0;
  };
}
