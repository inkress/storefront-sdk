/**
 * The cart controller: delegated DOM hooks → the existing `inkress.cart`, plus the
 * cart view (count / total / lines / empty / filled), the drawer, the buy-box stepper
 * and variant `<select>`, and the checkout submit. Every attribute is read
 * `ik-*`-first via {@link ./prefix}, so `data-ik-add` and `data-fk-add` both work.
 */
import { attr, closestHook, firstEl, allEls, hasHook, hookValue } from './prefix';
import { money } from './format';
import { toLine, type FleekLine, type HookFields } from './line';
import { addFromFields, lineInc, lineDec, lineSetQty } from './cart-ops';
import type { StorefrontLike } from './sdk-like';

export interface ResolvedControllerOptions {
  /** Node the view is queried from (usually `document`). */
  root: Document | HTMLElement;
  /** Owning document, for body class + focus. */
  doc: Document;
  currency: string;
  locale: string;
  /** Open the cart drawer after a plain add. Default: true. */
  autoOpenDrawerOnAdd: boolean;
  /** Follow the payment redirect after checkout. Default: true. */
  checkoutRedirect: boolean;
  /** Where `buy-now` sends the shopper. Default: `/checkout`. */
  checkoutPath: string;
  /** Navigation seam (overridable for tests). */
  navigate: (url: string) => void;
}

export interface CartController {
  paint(): void;
  open(): void;
  close(): void;
  unmount(): void;
}

const EMPTY_LINE_HTML = '<li class="fk-cart__empty"><p>Nothing in the bag yet.</p></li>';

function esc(s: unknown): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function readFields(el: Element): HookFields {
  return {
    variantId: attr(el, 'variant-id'),
    postId: attr(el, 'post-id'),
    title: attr(el, 'title'),
    variantName: attr(el, 'variant-name'),
    image: attr(el, 'image'),
    href: attr(el, 'href'),
    price: attr(el, 'price'),
    stock: attr(el, 'stock'),
    unlimited: attr(el, 'unlimited'),
  };
}

export function mountCartController(
  sdk: StorefrontLike,
  opts: ResolvedControllerOptions
): CartController {
  const { root, doc, currency, locale } = opts;

  /* ── view ─────────────────────────────────────────────────────────── */
  function lineHTML(l: FleekLine): string {
    const id = esc(String(l.variant_id));
    const img = l.image
      ? `<img class="fk-cline__img" src="${esc(l.image)}" alt="" loading="lazy">`
      : '<span class="fk-cline__img fk-cline__img--none" aria-hidden="true"></span>';
    const titleInner = l.href ? `<a href="${esc(l.href)}">${esc(l.title)}</a>` : esc(l.title);
    const variant =
      l.variant_name && l.variant_name !== l.title
        ? `<p class="fk-cline__variant">${esc(l.variant_name)}</p>`
        : '';
    return (
      `<li class="fk-cline">${img}` +
      `<div class="fk-cline__body">` +
      `<p class="fk-cline__title">${titleInner}</p>${variant}` +
      `<div class="fk-stepper" data-ik-stepper>` +
      `<button type="button" class="fk-stepper__btn" data-ik-dec="${id}" aria-label="Reduce quantity">−</button>` +
      `<input class="fk-stepper__input" type="number" min="0" inputmode="numeric" value="${Number(l.quantity)}" data-ik-qty="${id}" aria-label="Quantity">` +
      `<button type="button" class="fk-stepper__btn" data-ik-inc="${id}" aria-label="Increase quantity">+</button>` +
      `</div></div>` +
      `<div class="fk-cline__side">` +
      `<p class="fk-cline__price">${money(l.price * l.quantity, currency, locale)}</p>` +
      `<button type="button" class="fk-cline__remove" data-ik-remove="${id}">Remove</button>` +
      `</div></li>`
    );
  }

  function paint(): void {
    const cart = sdk.cart.get();
    const lines = cart.items.map(toLine);
    const n = lines.reduce((s, l) => s + l.quantity, 0);

    allEls(root, 'cart-count').forEach((el) => {
      el.textContent = String(n);
      (el as HTMLElement).hidden = n === 0;
    });
    allEls(root, 'cart-total').forEach((el) => {
      el.textContent = money(cart.subtotal, currency, locale);
    });
    allEls(root, 'cart-lines').forEach((el) => {
      el.innerHTML = lines.length ? lines.map(lineHTML).join('') : EMPTY_LINE_HTML;
    });
    allEls(root, 'cart-empty').forEach((el) => {
      (el as HTMLElement).hidden = lines.length > 0;
    });
    allEls(root, 'cart-filled').forEach((el) => {
      (el as HTMLElement).hidden = lines.length === 0;
    });
  }

  /* ── drawer ───────────────────────────────────────────────────────── */
  function open(): void {
    const d = firstEl(root, 'drawer');
    if (!d) return;
    d.hidden = false;
    const raf =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0);
    raf(() => d.classList.add('is-open'));
    if (doc.body) doc.body.classList.add('fk-noscroll');
    const close = firstEl(d, 'drawer-close');
    if (close) close.focus();
  }

  function close(): void {
    const d = firstEl(root, 'drawer');
    if (!d) return;
    d.classList.remove('is-open');
    if (doc.body) doc.body.classList.remove('fk-noscroll');
    setTimeout(() => {
      d.hidden = true;
    }, 240);
  }

  /* ── checkout ─────────────────────────────────────────────────────── */
  async function doCheckout(form: HTMLFormElement): Promise<void> {
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    const status = firstEl(form, 'checkout-status');
    const btn = form.querySelector('[type=submit]') as HTMLButtonElement | null;
    if (btn) {
      btn.disabled = true;
      btn.dataset.idle = btn.textContent || '';
      btn.textContent = 'Working…';
    }
    if (status) {
      (status as HTMLElement).hidden = false;
      status.className = 'fk-note';
      status.textContent = 'Placing your order…';
    }

    const name = (data.name || '').trim();
    const customer = {
      email: data.email,
      first_name: data.first_name || name.split(/\s+/)[0] || undefined,
      last_name: data.last_name || name.split(/\s+/).slice(1).join(' ') || undefined,
      phone: data.phone || undefined,
    };

    // Map the checkout form's address fields to the SDK Address shape; sent as
    // data.shipping_address so the session persists a ship-to for fulfilment.
    const shipping = {
      street: data.line1 || data.street || undefined,
      street_optional: data.line2 || undefined,
      city: data.city || undefined,
      region: data.region || undefined,
      state: data.state || data.region || undefined,
      country: data.country || undefined,
      postal_code: data.postcode || data.postal_code || undefined,
    };
    const hasShipping = Object.values(shipping).some(Boolean);

    try {
      const res = await sdk.cart.checkout(
        hasShipping ? { customer, data: { shipping_address: shipping } } : { customer }
      );
      if (res.state !== 'ok' || !res.result) {
        throw new Error('We could not place the order.');
      }
      sdk.cart.clear();
      const to = res.result.frame_url;
      if (opts.checkoutRedirect && to) opts.navigate(to);
    } catch (err) {
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.idle || 'Place order';
      }
      if (status) {
        (status as HTMLElement).hidden = false;
        status.className = 'fk-note fk-note--bad';
        status.textContent = err instanceof Error ? err.message : 'Something went wrong.';
      }
    }
  }

  /* ── delegated listeners ──────────────────────────────────────────── */
  function onClick(e: Event): void {
    const target = e.target as Element;

    const addBtn = closestHook(target, 'add');
    if (addBtn) {
      e.preventDefault();
      const box = closestHook(addBtn, 'buy') || root;
      const sel = firstEl(box as ParentNode, 'variant') as HTMLSelectElement | null;
      const opt = sel && sel.options ? sel.options[sel.selectedIndex] : null;
      const qtyEl = firstEl(box as ParentNode, 'buy-qty') as HTMLInputElement | null;
      const fields = readFields(opt || addBtn);
      addFromFields(sdk, fields, qtyEl ? qtyEl.value : '1', currency);
      if (hasHook(addBtn, 'buynow')) {
        opts.navigate(opts.checkoutPath);
        return;
      }
      if (opts.autoOpenDrawerOnAdd) open();
      return;
    }

    if (closestHook(target, 'drawer-open')) {
      e.preventDefault();
      paint();
      open();
      return;
    }
    if (closestHook(target, 'drawer-close') || hasHook(target, 'drawer-scrim')) {
      close();
      return;
    }

    const buyStep = closestHook(target, 'buy-inc') || closestHook(target, 'buy-dec');
    if (buyStep) {
      const isInc = hasHook(buyStep, 'buy-inc');
      const box = closestHook(buyStep, 'buy') || root;
      const q = firstEl(box as ParentNode, 'buy-qty') as HTMLInputElement | null;
      if (q) {
        const next = Math.max(1, (parseInt(q.value, 10) || 1) + (isInc ? 1 : -1));
        const max = q.getAttribute('max');
        q.value = String(max ? Math.min(next, Number(max)) : next);
      }
      return;
    }

    const rm = closestHook(target, 'remove');
    if (rm) {
      const id = hookValue(rm, 'remove');
      if (id != null) sdk.cart.removeProduct(Number(id));
      return;
    }
    const inc = closestHook(target, 'inc');
    if (inc) {
      const id = hookValue(inc, 'inc');
      if (id != null) lineInc(sdk, id);
      return;
    }
    const dec = closestHook(target, 'dec');
    if (dec) {
      const id = hookValue(dec, 'dec');
      if (id != null) lineDec(sdk, id);
      return;
    }
  }

  function onChange(e: Event): void {
    const target = e.target as Element;

    const q = closestHook(target, 'qty');
    if (q) {
      const id = hookValue(q, 'qty');
      if (id != null) lineSetQty(sdk, id, (q as HTMLInputElement).value);
      return;
    }

    const sel = closestHook(target, 'variant') as HTMLSelectElement | null;
    if (sel && sel.options) {
      const o = sel.options[sel.selectedIndex];
      const box = closestHook(sel, 'buy');
      if (!box || !o) return;
      const priceEl = firstEl(box, 'buy-price');
      if (priceEl) priceEl.textContent = money(Number(attr(o, 'price') || 0), currency, locale);
      const stockEl = firstEl(box, 'buy-stock');
      if (stockEl) stockEl.textContent = attr(o, 'stock-label') || '';
      const btn = firstEl(box, 'add') as HTMLButtonElement | null;
      if (btn) {
        const out = attr(o, 'sold-out') === '1';
        btn.disabled = out;
        btn.textContent = out ? 'Sold out' : attr(btn, 'label') || btn.textContent || 'Add to bag';
      }
    }
  }

  function onSubmit(e: Event): void {
    const target = e.target as Element;
    const form = closestHook(target, 'checkout') as HTMLFormElement | null;
    if (form) {
      e.preventDefault();
      void doCheckout(form);
    }
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') close();
  }

  doc.addEventListener('click', onClick);
  doc.addEventListener('change', onChange);
  doc.addEventListener('submit', onSubmit);
  doc.addEventListener('keydown', onKeydown);

  return {
    paint,
    open,
    close,
    unmount(): void {
      doc.removeEventListener('click', onClick);
      doc.removeEventListener('change', onChange);
      doc.removeEventListener('submit', onSubmit);
      doc.removeEventListener('keydown', onKeydown);
    },
  };
}
