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
import { type FleekLine } from './line';
export interface IkCartDetail {
    /** The emitter event that triggered this dispatch, e.g. `cart:item:added`. */
    type: string;
    cart: Cart;
    lines: FleekLine[];
    count: number;
    subtotal: number;
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
export declare function bindCartEvents(sdk: StorefrontLike, options: CartEventBridgeOptions): () => void;
//# sourceMappingURL=events.d.ts.map