/**
 * Dual-convention attribute access for the storefront DOM kit.
 *
 * Every hook and data attribute is read `ik-*` first, then `fk-*`, then bare
 * `data-*`. This lets a new Inkress theme author `data-ik-add` / `data-ik-price`
 * while every ported FleekSite theme (`data-fk-add`, `data-price`) keeps working
 * with no change. This module is the ONLY place the prefix precedence lives.
 */
/** Native prefix used for new markup and dispatched events. */
export declare const IK = "ik";
/** Legacy FleekSite prefix kept for backward compatibility. */
export declare const FK = "fk";
/**
 * Read a hook/data attribute by its logical (un-prefixed) name, e.g. `'add'`,
 * `'cart-count'`, `'variant-id'`, `'price'`. Returns the first of
 * `data-ik-<name>`, `data-fk-<name>`, `data-<name>` that is present, or `null`.
 */
export declare function attr(el: Element | null | undefined, name: string): string | null;
/** True when the element itself carries the hook under either prefix. */
export declare function hasHook(el: Element | null | undefined, name: string): boolean;
/** CSS selector matching a behavioural hook under either prefix. */
export declare function selector(name: string): string;
/** Nearest ancestor-or-self carrying the hook (delegated-event helper). */
export declare function closestHook(el: Element | null | undefined, name: string): HTMLElement | null;
/** All elements under `root` carrying the hook. */
export declare function allEls(root: ParentNode, name: string): HTMLElement[];
/** First element under `root` carrying the hook, or `null`. */
export declare function firstEl(root: ParentNode, name: string): HTMLElement | null;
/** The value of a hook attribute on a specific element (e.g. `data-ik-remove="42"`). */
export declare function hookValue(el: Element | null | undefined, name: string): string | null;
//# sourceMappingURL=prefix.d.ts.map