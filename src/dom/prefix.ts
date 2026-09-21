/**
 * Dual-convention attribute access for the storefront DOM kit.
 *
 * Every hook and data attribute is read `ik-*` first, then `fk-*`, then bare
 * `data-*`. This lets a new Inkress theme author `data-ik-add` / `data-ik-price`
 * while every ported FleekSite theme (`data-fk-add`, `data-price`) keeps working
 * with no change. This module is the ONLY place the prefix precedence lives.
 */

/** Native prefix used for new markup and dispatched events. */
export const IK = 'ik';
/** Legacy FleekSite prefix kept for backward compatibility. */
export const FK = 'fk';

/**
 * Read a hook/data attribute by its logical (un-prefixed) name, e.g. `'add'`,
 * `'cart-count'`, `'variant-id'`, `'price'`. Returns the first of
 * `data-ik-<name>`, `data-fk-<name>`, `data-<name>` that is present, or `null`.
 */
export function attr(el: Element | null | undefined, name: string): string | null {
  if (!el) return null;
  const ik = el.getAttribute(`data-${IK}-${name}`);
  if (ik !== null) return ik;
  const fk = el.getAttribute(`data-${FK}-${name}`);
  if (fk !== null) return fk;
  return el.getAttribute(`data-${name}`);
}

/** True when the element itself carries the hook under either prefix. */
export function hasHook(el: Element | null | undefined, name: string): boolean {
  if (!el) return false;
  return (
    el.hasAttribute(`data-${IK}-${name}`) || el.hasAttribute(`data-${FK}-${name}`)
  );
}

/** CSS selector matching a behavioural hook under either prefix. */
export function selector(name: string): string {
  return `[data-${IK}-${name}],[data-${FK}-${name}]`;
}

/** Nearest ancestor-or-self carrying the hook (delegated-event helper). */
export function closestHook(el: Element | null | undefined, name: string): HTMLElement | null {
  if (!el) return null;
  return el.closest(selector(name)) as HTMLElement | null;
}

/** All elements under `root` carrying the hook. */
export function allEls(root: ParentNode, name: string): HTMLElement[] {
  return Array.prototype.slice.call(root.querySelectorAll(selector(name))) as HTMLElement[];
}

/** First element under `root` carrying the hook, or `null`. */
export function firstEl(root: ParentNode, name: string): HTMLElement | null {
  return root.querySelector(selector(name)) as HTMLElement | null;
}

/** The value of a hook attribute on a specific element (e.g. `data-ik-remove="42"`). */
export function hookValue(el: Element | null | undefined, name: string): string | null {
  return attr(el, name);
}
