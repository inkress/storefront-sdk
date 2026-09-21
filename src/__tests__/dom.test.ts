/**
 * Storefront DOM kit — jsdom coverage for the `ik-*`/`fk-*` hooks, the `ik:cart` /
 * `fk:cart` event bridge, stock clamping, the drawer, checkout, and globals.
 *
 * Cart mutations run against the REAL CartResource so we test the shipped cart, not
 * a fake. Only the checkout network call is stubbed.
 */
import { HttpClient } from '../client';
import { StorageManager } from '../storage';
import { EventEmitter } from '../events';
import { CartResource } from '../resources/cart';
import { mountStorefront, type StorefrontDomHandle } from '../dom';
import { attr, selector, hasHook } from '../dom/prefix';
import { money } from '../dom/format';
import { productFromHook, toLine } from '../dom/line';
import type { StorefrontLike } from '../dom/sdk-like';
import type { Cart } from '../types';

function makeSdk() {
  const events = new EventEmitter();
  const storage = new StorageManager('inkress-dom-test').createStorage<Cart>('cart');
  storage.remove();
  const client = new HttpClient();
  const cart = new CartResource(storage, events, client);
  const sdk: StorefrontLike = {
    cart: cart as unknown as StorefrontLike['cart'],
    on: (event, handler) => events.on(event, handler),
  };
  return { sdk, cart, events };
}

function click(el: Element) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}
function change(el: Element) {
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const tick = () => new Promise((r) => setTimeout(r, 0));

let handle: StorefrontDomHandle | null = null;
afterEach(() => {
  if (handle) handle.unmount();
  handle = null;
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-currency');
});

describe('prefix precedence', () => {
  it('reads ik-*, then fk-*, then bare', () => {
    const el = document.createElement('div');
    el.setAttribute('data-fk-price', '5');
    expect(attr(el, 'price')).toBe('5'); // fk fallback
    el.setAttribute('data-price', '9');
    expect(attr(el, 'price')).toBe('5'); // fk still wins over bare
    el.setAttribute('data-ik-price', '7');
    expect(attr(el, 'price')).toBe('7'); // ik wins
  });
  it('selector and hasHook match either prefix', () => {
    expect(selector('add')).toBe('[data-ik-add],[data-fk-add]');
    const el = document.createElement('button');
    el.setAttribute('data-fk-add', '');
    expect(hasHook(el, 'add')).toBe(true);
  });
});

describe('money + line mapping', () => {
  it('formats major units as currency', () => {
    expect(money(4.3, 'USD', 'en')).toBe('$4.30');
  });
  it('round-trips fields → product → line', () => {
    const p = productFromHook(
      { variantId: '42', title: 'Tee', price: '19.99', image: 'a.jpg', href: '/tee', stock: '3', unlimited: '0' },
      'USD'
    );
    expect(p.id).toBe(42);
    expect(p.units_remaining).toBe(3);
    const line = toLine({ id: 'x', product: p, quantity: 2, price: p.price });
    expect(line).toMatchObject({ variant_id: 42, title: 'Tee', href: '/tee', max: 3, quantity: 2, total: 39.98 });
  });
});

describe('add-to-cart hook', () => {
  function buyMarkup(prefix: 'ik' | 'fk') {
    document.body.innerHTML =
      `<div data-${prefix}-buy>` +
      `<button data-${prefix}-add data-variant-id="7" data-post-id="7" data-title="Hat" data-price="12.50" data-href="/hat" data-stock="10" data-unlimited="0">Add</button>` +
      `<input data-${prefix}-buy-qty value="2">` +
      `</div>` +
      `<span data-ik-cart-count hidden></span><span data-ik-cart-total></span>`;
  }

  it('adds via data-ik-add and repaints count/total', () => {
    const { sdk, cart } = makeSdk();
    handle = mountStorefront(sdk, { currencyCode: 'USD', locale: 'en' });
    buyMarkup('ik');
    click(document.querySelector('[data-ik-add]')!);
    expect(cart.getItemCount()).toBe(2);
    expect(cart.getItem(7)!.price).toBe(12.5);
    expect(document.querySelector('[data-ik-cart-count]')!.textContent).toBe('2');
    expect((document.querySelector('[data-ik-cart-count]') as HTMLElement).hidden).toBe(false);
    expect(document.querySelector('[data-ik-cart-total]')!.textContent).toBe('$25.00');
  });

  it('adds via legacy data-fk-add (fallback)', () => {
    const { sdk, cart } = makeSdk();
    handle = mountStorefront(sdk, { currencyCode: 'USD', locale: 'en' });
    buyMarkup('fk');
    click(document.querySelector('[data-fk-add]')!);
    expect(cart.getItemCount()).toBe(2);
  });

  it('clamps the added quantity to available stock', () => {
    const { sdk, cart } = makeSdk();
    handle = mountStorefront(sdk, { currencyCode: 'USD', locale: 'en' });
    document.body.innerHTML =
      `<button data-ik-add data-variant-id="9" data-title="Cap" data-price="5" data-stock="3" data-unlimited="0">Add</button>`;
    const btn = document.querySelector('[data-ik-add]')!;
    click(btn);
    click(btn);
    click(btn); // 3 clicks × qty 1 = 3
    click(btn); // 4th would exceed stock of 3
    expect(cart.getItem(9)!.quantity).toBe(3);
  });
});

describe('line controls + cart view', () => {
  function seed() {
    const ctx = makeSdk();
    handle = mountStorefront(ctx.sdk, { currencyCode: 'USD', locale: 'en' });
    document.body.innerHTML =
      `<ul data-ik-cart-lines></ul>` +
      `<div data-ik-cart-empty></div><div data-ik-cart-filled></div>` +
      `<button data-ik-add data-variant-id="3" data-title="Bag" data-price="20" data-unlimited="1">Add</button>`;
    click(document.querySelector('[data-ik-add]')!);
    return ctx;
  }

  it('renders a line and toggles empty/filled', () => {
    const { cart } = seed();
    expect(cart.getItemCount()).toBe(1);
    const lines = document.querySelector('[data-ik-cart-lines]')!;
    expect(lines.querySelectorAll('.fk-cline').length).toBe(1);
    expect((document.querySelector('[data-ik-cart-empty]') as HTMLElement).hidden).toBe(true);
    expect((document.querySelector('[data-ik-cart-filled]') as HTMLElement).hidden).toBe(false);
  });

  it('inc/dec/remove from the rendered line drive the cart', () => {
    const { cart } = seed();
    click(document.querySelector('[data-ik-inc]')!);
    expect(cart.getItem(3)!.quantity).toBe(2);
    click(document.querySelector('[data-ik-dec]')!);
    expect(cart.getItem(3)!.quantity).toBe(1);
    click(document.querySelector('[data-ik-remove]')!);
    expect(cart.hasProduct(3)).toBe(false);
    expect((document.querySelector('[data-ik-cart-empty]') as HTMLElement).hidden).toBe(false);
  });

  it('qty input change sets the quantity; zero removes', () => {
    const { cart } = seed();
    const qty = document.querySelector('[data-ik-qty]') as HTMLInputElement;
    qty.value = '4';
    change(qty);
    expect(cart.getItem(3)!.quantity).toBe(4);
    const qty2 = document.querySelector('[data-ik-qty]') as HTMLInputElement;
    qty2.value = '0';
    change(qty2);
    expect(cart.hasProduct(3)).toBe(false);
  });
});

describe('event bridge', () => {
  it('dispatches ik:cart and fk:cart on add', () => {
    const { sdk } = makeSdk();
    handle = mountStorefront(sdk, { currencyCode: 'USD', locale: 'en' });
    document.body.innerHTML =
      `<button data-ik-add data-variant-id="5" data-title="Mug" data-price="8" data-unlimited="1">Add</button>`;

    const ik: CustomEvent[] = [];
    const fk: CustomEvent[] = [];
    const onIk = (e: Event) => ik.push(e as CustomEvent);
    const onFk = (e: Event) => fk.push(e as CustomEvent);
    document.addEventListener('ik:cart', onIk);
    document.addEventListener('fk:cart', onFk);

    click(document.querySelector('[data-ik-add]')!);

    document.removeEventListener('ik:cart', onIk);
    document.removeEventListener('fk:cart', onFk);

    expect(ik.length).toBe(1);
    expect(ik[0].detail.type).toBe('cart:item:added');
    expect(ik[0].detail.count).toBe(1);
    expect(fk.length).toBe(1);
    expect(fk[0].detail.items[0].variant_id).toBe(5); // FleekSite-shaped detail
  });
});

describe('drawer', () => {
  it('opens on drawer-open and closes on Escape', () => {
    const { sdk } = makeSdk();
    handle = mountStorefront(sdk, { currencyCode: 'USD', locale: 'en' });
    document.body.innerHTML =
      `<button data-ik-drawer-open>Bag</button>` +
      `<aside data-ik-drawer hidden><button data-ik-drawer-close>x</button></aside>`;
    const drawer = document.querySelector('[data-ik-drawer]') as HTMLElement;
    expect(drawer.hidden).toBe(true);
    click(document.querySelector('[data-ik-drawer-open]')!);
    expect(drawer.hidden).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(drawer.classList.contains('is-open')).toBe(false);
  });
});

describe('globals', () => {
  it('exposes window.inkressCart and aliases window.fkCart', () => {
    const { sdk, cart } = makeSdk();
    handle = mountStorefront(sdk, { currencyCode: 'USD', locale: 'en' });
    const w = window as unknown as Record<string, any>;
    expect(w.inkressCart).toBeDefined();
    expect(w.fkCart).toBe(w.inkressCart);
    // legacy fkCart snake-shape add (max=null → unlimited)
    w.fkCart.add({ variant_id: 11, title: 'Pin', price: 3, max: null }, 2);
    expect(cart.getItem(11)!.quantity).toBe(2);
    expect(w.fkCart.read().items[0].variant_id).toBe(11);
    expect(w.fkCart.count()).toBe(2);
  });

  it('unmount removes listeners and globals', () => {
    const { sdk, cart } = makeSdk();
    handle = mountStorefront(sdk, { currencyCode: 'USD', locale: 'en' });
    document.body.innerHTML =
      `<button data-ik-add data-variant-id="1" data-title="X" data-price="1" data-unlimited="1">Add</button>`;
    handle.unmount();
    handle = null;
    click(document.querySelector('[data-ik-add]')!);
    expect(cart.isEmpty()).toBe(true);
    expect((window as unknown as Record<string, any>).inkressCart).toBeUndefined();
  });
});

describe('checkout hook', () => {
  it('submits, redirects to frame_url, and clears the cart', async () => {
    const emptyCart: Cart = {
      id: 'c', items: [], subtotal: 0, total_items: 0, created_at: '', updated_at: '',
    };
    const checkout = jest.fn(async (_opts?: unknown) => ({
      state: 'ok' as const,
      result: { frame_url: 'https://pay.example/session/1' },
    }));
    const clear = jest.fn(() => emptyCart);
    const fakeSdk = {
      cart: {
        get: () => emptyCart,
        getItem: () => undefined,
        addItem: () => emptyCart,
        updateItemQuantity: () => emptyCart,
        removeProduct: () => emptyCart,
        clear,
        checkout,
      },
      on: () => () => undefined,
    } as unknown as StorefrontLike;

    const navigate = jest.fn();
    handle = mountStorefront(fakeSdk, { currencyCode: 'USD', navigate, exposeGlobals: false });
    document.body.innerHTML =
      `<form data-ik-checkout>` +
      `<input name="email" value="a@b.com"><input name="name" value="Jane Roe">` +
      `<button type="submit">Place order</button><p data-ik-checkout-status hidden></p>` +
      `</form>`;
    const form = document.querySelector('[data-ik-checkout]') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await tick();

    expect(checkout).toHaveBeenCalledTimes(1);
    expect(checkout.mock.calls[0][0]).toMatchObject({
      customer: { email: 'a@b.com', first_name: 'Jane', last_name: 'Roe' },
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('https://pay.example/session/1');
  });
});
