/**
 * The isolated DOM ↔ domain boundary.
 *
 * `productFromHook` is the single place a flat set of DOM data attributes becomes
 * a typed SDK `Product`; `toLine` is the inverse, projecting a stored `CartItem`
 * back to the flat FleekSite line shape that theme markup and the `fk:cart` event
 * detail expect. Keeping both here means the rest of the kit speaks only in SDK
 * types or in `FleekLine`, never in raw DOM strings.
 */
import type { CartItem, Product } from '../types';
/** The flat, denormalised cart line the FleekSite kit and themes render from. */
export interface FleekLine {
    variant_id: number;
    post_id: number;
    title: string;
    variant_name: string;
    image: string;
    href: string;
    price: number;
    /** Stock ceiling; `null` when unlimited. */
    max: number | null;
    quantity: number;
    total: number;
}
/** Flat fields read off a buy hook (or a selected `<option>`) in the DOM. */
export interface HookFields {
    variantId: string | null;
    postId?: string | null;
    title?: string | null;
    variantName?: string | null;
    image?: string | null;
    href?: string | null;
    price?: string | null;
    stock?: string | null;
    unlimited?: string | null;
}
/**
 * Build a minimal-but-valid SDK `Product` from flat DOM fields. In V1 the product
 * *is* the buyable unit, so `variant-id` is the product id. Display-only extras that
 * `Product` has no first-class field for (`post_id`, `variant_name`) are stashed in
 * `meta`, where {@link toLine} reads them back. This function is the one sanctioned
 * DOM→domain cast in the kit.
 */
export declare function productFromHook(fields: HookFields, currencyCode?: string): Product;
/** Project a stored cart item back to the flat FleekSite line shape. */
export declare function toLine(item: CartItem): FleekLine;
//# sourceMappingURL=line.d.ts.map