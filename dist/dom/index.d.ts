/**
 * Storefront DOM kit — the opt-in layer that gives the SDK FleekSite's two
 * declarative conventions: `data-ik-*` / `data-fk-*` hooks and DOM cart events
 * (`ik:cart`, `fk:cart`). It is a controller/view over the existing `inkress.cart`
 * and emitter — importing the SDK still touches nothing until `mountStorefront` runs.
 *
 * @example
 * ```ts
 * import { InkressStorefrontSDK, mountStorefront } from '@inkress/storefront-sdk';
 * const inkress = new InkressStorefrontSDK({ merchantUsername: 'island-vibes' });
 * mountStorefront(inkress); // binds hooks + events, exposes window.inkressCart
 * ```
 */
import type { Product } from '../types';
import type { StorefrontLike } from './sdk-like';
import type { FleekLine } from './line';
export type { FleekLine, HookFields } from './line';
export type { IkCartDetail } from './events';
export { money, toMinor, toMajor } from './format';
export { attr, selector, IK, FK } from './prefix';
/** Options for {@link mountStorefront}. Every flag defaults to the safe/common value. */
export interface StorefrontDomOptions {
    /** Root queried for hooks. Default: `document`. */
    root?: Document | HTMLElement;
    /** Where DOM cart events are dispatched. Default: the root's document. */
    eventTarget?: EventTarget;
    /** Currency code. Default: `<html data-currency>` → `USD`. */
    currencyCode?: string;
    /** Locale for money formatting. Default: `<html lang>` → `en`. */
    locale?: string;
    /** Also dispatch legacy `fk:cart`. Default: true. */
    emitLegacyFkEvents?: boolean;
    /** Publish `window.inkressCart` (+ `window.fkCart` alias). Default: true. */
    exposeGlobals?: boolean;
    /** Open the drawer after a plain add-to-cart. Default: true. */
    autoOpenDrawerOnAdd?: boolean;
    /** Follow the payment redirect after checkout. Default: true. */
    checkoutRedirect?: boolean;
    /** Destination for `buy-now`. Default: `/checkout`. */
    checkoutPath?: string;
    /** Navigation seam (overridable for tests/SSR). Default: `window.location.href = url`. */
    navigate?: (url: string) => void;
    /** Paint the cart view once on mount. Default: true. */
    paintOnMount?: boolean;
}
/** Imperative cart surface, published as `window.inkressCart`. Mirrors `window.fkCart`. */
export interface StorefrontCartApi {
    /** The cart as flat FleekSite lines (compat shape). */
    read(): {
        items: FleekLine[];
    };
    /** Add from flat fields (camelCase hook fields or the legacy `fkCart` snake shape). */
    add(fields: CartAddInput, qty?: number | string): void;
    /** Add a fully-formed SDK `Product` (SDK-native path). */
    addProduct(product: Product, qty?: number): void;
    /** Set a line's quantity by variant id; a non-positive value removes it. */
    setQty(variantId: string | number, qty: string | number): void;
    /** Remove a line by variant id. */
    remove(variantId: string | number): void;
    /** Empty the cart. */
    clear(): void;
    /** Total item count. */
    count(): number;
    /** Subtotal in major units. */
    subtotal(): number;
    /** Format a major-unit amount in the mounted currency/locale. */
    money(amountMajor: number): string;
    /** Open the cart drawer. */
    open(): void;
    /** Close the cart drawer. */
    close(): void;
}
/** Permissive add input: accepts hook camelCase, or the legacy `fkCart` snake shape. */
export interface CartAddInput {
    variantId?: string | number;
    variant_id?: string | number;
    postId?: string | number;
    post_id?: string | number;
    title?: string;
    variantName?: string;
    variant_name?: string;
    image?: string;
    href?: string;
    price?: string | number;
    /** Legacy `fkCart` ceiling: `null` = unlimited. */
    max?: number | null;
    stock?: string | number;
    unlimited?: string | boolean;
}
/** Handle returned by {@link mountStorefront}. */
export interface StorefrontDomHandle {
    paint(): void;
    open(): void;
    close(): void;
    cart: StorefrontCartApi;
    unmount(): void;
}
/**
 * Mount the DOM kit onto an SDK instance. Wires delegated hooks and the
 * emitter→DOM event bridge, publishes globals, paints the cart once, and returns a
 * handle whose `unmount()` removes everything.
 */
export declare function mountStorefront(sdk: StorefrontLike, options?: StorefrontDomOptions): StorefrontDomHandle;
//# sourceMappingURL=index.d.ts.map