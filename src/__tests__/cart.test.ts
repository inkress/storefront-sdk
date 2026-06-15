import { HttpClient } from '../client';
import { StorageManager } from '../storage';
import { EventEmitter } from '../events';
import { CartResource } from '../resources/cart';
import type { Product } from '../types';

function product(id: number, price: number): Product {
  return {
    id,
    title: `Product ${id}`,
    price,
    permalink: `p-${id}`,
    status: 2,
    public: true,
    unlimited: true,
    tag_ids: [],
    currency: { id: 1, code: 'JMD', symbol: '$', name: 'Jamaican Dollar' },
    merchant: { id: 1, name: 'Acme', username: 'acme' },
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
}

function makeCart() {
  const events = new EventEmitter();
  const storage = new StorageManager('inkress-test').createStorage<any>('cart');
  storage.remove(); // start clean
  const client = new HttpClient();
  return { cart: new CartResource(storage, events, client), events, storage };
}

describe('CartResource', () => {
  it('starts empty', () => {
    const { cart } = makeCart();
    expect(cart.isEmpty()).toBe(true);
    expect(cart.getItemCount()).toBe(0);
    expect(cart.getSubtotal()).toBe(0);
  });

  it('adds an item, updates totals, and emits cart:item:added', () => {
    const { cart, events } = makeCart();
    const added: any[] = [];
    events.on('cart:item:added', (e) => added.push(e));

    const result = cart.addItem(product(1, 25), 2);
    expect(result.total_items).toBe(2);
    expect(result.subtotal).toBe(50);
    expect(added).toHaveLength(1);
    expect(added[0].cart.subtotal).toBe(50);
  });

  it('merges quantities when the same product is added twice', () => {
    const { cart } = makeCart();
    cart.addItem(product(1, 10), 1);
    cart.addItem(product(1, 10), 3);
    expect(cart.getUniqueItemCount()).toBe(1);
    expect(cart.getItemCount()).toBe(4);
    expect(cart.getSubtotal()).toBe(40);
  });

  it('updates a line quantity and recomputes totals', () => {
    const { cart } = makeCart();
    cart.addItem(product(1, 10), 1);
    const item = cart.getItem(1)!;
    const updated = cart.updateItemQuantity(item.id, 5);
    expect(updated.total_items).toBe(5);
    expect(updated.subtotal).toBe(50);
  });

  it('removing the last unit (qty<=0) drops the line', () => {
    const { cart } = makeCart();
    cart.addItem(product(1, 10), 1);
    const item = cart.getItem(1)!;
    cart.updateItemQuantity(item.id, 0);
    expect(cart.hasProduct(1)).toBe(false);
    expect(cart.isEmpty()).toBe(true);
  });

  it('removeProduct emits cart:item:removed', () => {
    const { cart, events } = makeCart();
    cart.addItem(product(7, 10), 1);
    const removed: any[] = [];
    events.on('cart:item:removed', (e) => removed.push(e));
    cart.removeProduct(7);
    expect(removed).toHaveLength(1);
    expect(cart.hasProduct(7)).toBe(false);
  });

  it('clear empties the cart and emits cart:cleared', () => {
    const { cart, events } = makeCart();
    cart.addItem(product(1, 10), 2);
    let cleared = false;
    events.on('cart:cleared', () => (cleared = true));
    const empty = cart.clear();
    expect(empty.items).toHaveLength(0);
    expect(empty.subtotal).toBe(0);
    expect(cleared).toBe(true);
  });

  it('persists across resource instances sharing the same storage', () => {
    const events = new EventEmitter();
    const storage = new StorageManager('inkress-persist').createStorage<any>('cart');
    storage.remove();
    const client = new HttpClient();
    new CartResource(storage, events, client).addItem(product(1, 15), 2);
    // A fresh resource over the same storage key sees the persisted cart.
    const reopened = new CartResource(storage, events, client);
    expect(reopened.getSubtotal()).toBe(30);
    expect(reopened.getItemCount()).toBe(2);
  });
});
