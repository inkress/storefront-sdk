/**
 * Cart mutations expressed against the narrow {@link StorefrontLike} interface.
 * Shared by the delegated controller and the `window.inkressCart` global so the
 * stock-clamp rules live in exactly one place.
 *
 * Stock ceilings are preserved through the stored Product's own `unlimited` /
 * `units_remaining`, so there is no separate per-line `max` to keep in sync.
 */
import { type FleekLine, type HookFields } from './line';
import type { StorefrontLike } from './sdk-like';
/** Add (or top up) a line from flat hook fields, clamped to available stock. */
export declare function addFromFields(sdk: StorefrontLike, fields: HookFields, qtyRaw: string | number | null, currency: string): void;
/** Increment a line by one, clamped to available stock. */
export declare function lineInc(sdk: StorefrontLike, variantId: string | number): void;
/** Decrement a line by one; removes it at zero (via `updateItemQuantity`). */
export declare function lineDec(sdk: StorefrontLike, variantId: string | number): void;
/** Set a line's quantity absolutely; a non-positive value removes it. */
export declare function lineSetQty(sdk: StorefrontLike, variantId: string | number, valueRaw: string | number): void;
/** Total item count across the cart. */
export declare function count(sdk: StorefrontLike): number;
/** Cart subtotal in major units. */
export declare function subtotal(sdk: StorefrontLike): number;
/** Current cart projected to flat FleekSite lines. */
export declare function readLines(sdk: StorefrontLike): FleekLine[];
//# sourceMappingURL=cart-ops.d.ts.map