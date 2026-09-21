/**
 * Cart mutations expressed against the narrow {@link StorefrontLike} interface.
 * Shared by the delegated controller and the `window.inkressCart` global so the
 * stock-clamp rules live in exactly one place.
 *
 * Stock ceilings are preserved through the stored Product's own `unlimited` /
 * `units_remaining`, so there is no separate per-line `max` to keep in sync.
 */
import { productFromHook, toLine, type FleekLine, type HookFields } from './line';
import type { StorefrontLike } from './sdk-like';

/** Add (or top up) a line from flat hook fields, clamped to available stock. */
export function addFromFields(
  sdk: StorefrontLike,
  fields: HookFields,
  qtyRaw: string | number | null,
  currency: string
): void {
  if (!fields.variantId) return;
  const qty = Math.max(1, parseInt(String(qtyRaw ?? '1'), 10) || 1);
  const product = productFromHook(fields, currency);
  const existing = sdk.cart.getItem(product.id);
  let target = (existing ? existing.quantity : 0) + qty;
  if (!product.unlimited && product.units_remaining != null) {
    target = Math.min(target, product.units_remaining);
  }
  if (target < 1) return;
  if (existing) sdk.cart.updateItemQuantity(existing.id, target);
  else sdk.cart.addItem(product, target);
}

/** Increment a line by one, clamped to available stock. */
export function lineInc(sdk: StorefrontLike, variantId: string | number): void {
  const item = sdk.cart.getItem(Number(variantId));
  if (!item) return;
  let q = item.quantity + 1;
  const p = item.product;
  if (!p.unlimited && p.units_remaining != null) q = Math.min(q, p.units_remaining);
  sdk.cart.updateItemQuantity(item.id, q);
}

/** Decrement a line by one; removes it at zero (via `updateItemQuantity`). */
export function lineDec(sdk: StorefrontLike, variantId: string | number): void {
  const item = sdk.cart.getItem(Number(variantId));
  if (!item) return;
  sdk.cart.updateItemQuantity(item.id, item.quantity - 1);
}

/** Set a line's quantity absolutely; a non-positive value removes it. */
export function lineSetQty(
  sdk: StorefrontLike,
  variantId: string | number,
  valueRaw: string | number
): void {
  const item = sdk.cart.getItem(Number(variantId));
  if (!item) return;
  const q = parseInt(String(valueRaw), 10);
  if (!(q > 0)) {
    sdk.cart.removeProduct(Number(variantId));
    return;
  }
  const p = item.product;
  const capped = !p.unlimited && p.units_remaining != null ? Math.min(q, p.units_remaining) : q;
  sdk.cart.updateItemQuantity(item.id, capped);
}

/** Total item count across the cart. */
export function count(sdk: StorefrontLike): number {
  return sdk.cart.get().items.reduce((n, i) => n + i.quantity, 0);
}

/** Cart subtotal in major units. */
export function subtotal(sdk: StorefrontLike): number {
  return sdk.cart.get().subtotal;
}

/** Current cart projected to flat FleekSite lines. */
export function readLines(sdk: StorefrontLike): FleekLine[] {
  return sdk.cart.get().items.map(toLine);
}
