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
import { money } from './format';
import type { FleekLine, HookFields } from './line';
import { bindCartEvents } from './events';
import { mountCartController } from './controller';
import {
  addFromFields,
  lineSetQty,
  count as cartCount,
  subtotal as cartSubtotal,
  readLines,
} from './cart-ops';

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
  read(): { items: FleekLine[] };
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

function toHookFields(input: CartAddInput): HookFields {
  const variantId = input.variantId ?? input.variant_id;
  const postId = input.postId ?? input.post_id;
  const variantName = input.variantName ?? input.variant_name;

  let unlimited: string | null;
  let stock: string | null;
  if ('max' in input && input.stock == null) {
    // Legacy fkCart shape: `max === null` means unlimited.
    unlimited = input.max == null ? '1' : '0';
    stock = input.max == null ? null : String(input.max);
  } else {
    const u = input.unlimited;
    unlimited = u == null ? null : u === true || u === '1' || u === 'true' ? '1' : '0';
    stock = input.stock == null ? null : String(input.stock);
  }

  return {
    variantId: variantId != null ? String(variantId) : null,
    postId: postId != null ? String(postId) : null,
    title: input.title ?? null,
    variantName: variantName ?? null,
    image: input.image ?? null,
    href: input.href ?? null,
    price: input.price != null ? String(input.price) : null,
    stock,
    unlimited,
  };
}

/**
 * Mount the DOM kit onto an SDK instance. Wires delegated hooks and the
 * emitter→DOM event bridge, publishes globals, paints the cart once, and returns a
 * handle whose `unmount()` removes everything.
 */
export function mountStorefront(
  sdk: StorefrontLike,
  options: StorefrontDomOptions = {}
): StorefrontDomHandle {
  const root: Document | HTMLElement =
    options.root || (typeof document !== 'undefined' ? document : (undefined as never));
  const doc: Document =
    root.nodeType === 9
      ? (root as Document)
      : (root as HTMLElement).ownerDocument || document;
  const eventTarget: EventTarget = options.eventTarget || doc;

  const currency =
    options.currencyCode || doc.documentElement.getAttribute('data-currency') || 'USD';
  const locale = options.locale || doc.documentElement.getAttribute('lang') || 'en';
  const emitLegacy = options.emitLegacyFkEvents !== false;
  const exposeGlobals = options.exposeGlobals !== false;

  const navigate =
    options.navigate ||
    ((url: string) => {
      if (typeof window !== 'undefined' && window.location) {
        try {
          window.location.href = url;
        } catch (_e) {
          /* jsdom / SSR — navigation is a no-op */
        }
      }
    });

  const controller = mountCartController(sdk, {
    root,
    doc,
    currency,
    locale,
    autoOpenDrawerOnAdd: options.autoOpenDrawerOnAdd !== false,
    checkoutRedirect: options.checkoutRedirect !== false,
    checkoutPath: options.checkoutPath || '/checkout',
    navigate,
  });

  const unbindEvents = bindCartEvents(sdk, {
    target: eventTarget,
    emitLegacy,
    onChange: () => controller.paint(),
  });

  const cart: StorefrontCartApi = {
    read: () => ({ items: readLines(sdk) }),
    add: (fields, qty) => addFromFields(sdk, toHookFields(fields), qty ?? 1, currency),
    addProduct: (product, qty) => {
      sdk.cart.addItem(product, qty ?? 1);
    },
    setQty: (id, qty) => lineSetQty(sdk, id, qty),
    remove: (id) => {
      sdk.cart.removeProduct(Number(id));
    },
    clear: () => {
      sdk.cart.clear();
    },
    count: () => cartCount(sdk),
    subtotal: () => cartSubtotal(sdk),
    money: (amountMajor) => money(amountMajor, currency, locale),
    open: () => controller.open(),
    close: () => controller.close(),
  };

  const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null;
  if (exposeGlobals && win) {
    win.inkressCart = cart;
    if (emitLegacy && win.fkCart == null) win.fkCart = cart;
  }

  if (options.paintOnMount !== false) controller.paint();

  return {
    paint: () => controller.paint(),
    open: () => controller.open(),
    close: () => controller.close(),
    cart,
    unmount() {
      unbindEvents();
      controller.unmount();
      if (exposeGlobals && win) {
        if (win.inkressCart === cart) delete win.inkressCart;
        if (win.fkCart === cart) delete win.fkCart;
      }
    },
  };
}
