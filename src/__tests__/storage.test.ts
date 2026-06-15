import { BrowserStorage, StorageManager } from '../storage';

describe('BrowserStorage', () => {
  it('round-trips a value through localStorage (jsdom)', () => {
    const s = new BrowserStorage<{ n: number }>('thing', 'inkress-test');
    s.remove();
    expect(s.get()).toBeNull();
    expect(s.set({ n: 42 })).toBe(true);
    expect(s.get()).toEqual({ n: 42 });
    s.remove();
    expect(s.get()).toBeNull();
  });

  it('namespaces by prefix and respects setPrefix', () => {
    const s = new BrowserStorage<number>('k', 'pa');
    s.set(1);
    s.setPrefix('pb');
    expect(s.get()).toBeNull(); // different namespace
    s.set(2);
    expect(s.get()).toBe(2);
    s.setPrefix('pa');
    expect(s.get()).toBe(1); // original namespace still intact
  });

  it('falls back to in-memory storage when localStorage is absent', () => {
    const realWindow = (globalThis as any).window;
    // Simulate a server runtime with no window/localStorage.
    delete (globalThis as any).window;
    try {
      const s = new BrowserStorage<string>('mem', 'srv');
      expect(s.set('hello')).toBe(true); // not a no-op anymore
      expect(s.get()).toBe('hello');
      s.remove();
      expect(s.get()).toBeNull();
    } finally {
      (globalThis as any).window = realWindow;
    }
  });

  it('falls back to memory when localStorage.setItem throws (Safari private mode)', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const real = window.localStorage.setItem;
    (window.localStorage as any).setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    try {
      const s = new BrowserStorage<string>('pm', 'safari');
      expect(s.set('value')).toBe(true); // write didn't silently drop
      expect(s.get()).toBe('value'); // served from the memory fallback
    } finally {
      (window.localStorage as any).setItem = real;
      warn.mockRestore();
    }
  });
});

describe('StorageManager', () => {
  it('setPrefix re-points all created storages in place', () => {
    const mgr = new StorageManager('inkress-acme');
    const cart = mgr.createStorage<number>('cart');
    cart.set(5);
    mgr.setPrefix('inkress-other');
    // Same instance, new namespace — no stale data leaks across merchants.
    expect(cart.get()).toBeNull();
    cart.set(9);
    expect(mgr.getAllKeys()).toContain('cart');
  });

  it('clearAll removes only this manager prefix keys', () => {
    const a = new StorageManager('inkress-a');
    const b = new StorageManager('inkress-b');
    a.createStorage<number>('x').set(1);
    b.createStorage<number>('y').set(2);
    a.clearAll();
    expect(a.getAllKeys()).toHaveLength(0);
    expect(b.getAllKeys()).toContain('y');
  });

  it('in-memory fallback is isolated per manager (no cross-request bleed)', () => {
    const realWindow = (globalThis as any).window;
    delete (globalThis as any).window; // force the in-memory path
    try {
      // Two managers, SAME prefix + key — mimics two concurrent SSR requests
      // for the same merchant. Their carts must not bleed into each other.
      const reqA = new StorageManager('inkress-acme');
      const reqB = new StorageManager('inkress-acme');
      const cartA = reqA.createStorage<{ n: number }>('cart');
      const cartB = reqB.createStorage<{ n: number }>('cart');
      cartA.set({ n: 1 });
      cartB.set({ n: 2 });
      expect(cartA.get()).toEqual({ n: 1 });
      expect(cartB.get()).toEqual({ n: 2 });
    } finally {
      (globalThis as any).window = realWindow;
    }
  });
});
