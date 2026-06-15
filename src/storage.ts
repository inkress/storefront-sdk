/**
 * Browser storage utility for cart, wishlist, and other persisted SDK data.
 *
 * SSR-safe: when `localStorage` is unavailable OR a write throws (e.g. Safari
 * private mode, quota/security errors) it transparently falls back to an
 * in-memory store, so a cart still works within a single runtime instead of
 * silently no-op'ing.
 *
 * The in-memory store is **per `StorageManager` instance** (not a module-level
 * singleton), so concurrent server-side requests that each construct their own
 * SDK never share cart/wishlist state.
 */

function localStorageAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      window.localStorage !== null &&
      typeof window.localStorage.getItem === 'function'
    );
  } catch {
    return false;
  }
}

export class BrowserStorage<T> {
  private key: string;
  private prefix: string;
  /** In-memory fallback; owned by the StorageManager when created via one. */
  private memory: Map<string, string>;

  constructor(key: string, prefix = 'inkress', memory?: Map<string, string>) {
    this.key = key;
    this.prefix = prefix;
    this.memory = memory ?? new Map<string, string>();
  }

  /** Update the namespace prefix (e.g. when the active merchant changes). */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  private getStorageKey(): string {
    return `${this.prefix}:${this.key}`;
  }

  private parse(raw: string | null | undefined): T | null {
    if (raw === null || raw === undefined) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  get(): T | null {
    const k = this.getStorageKey();
    if (localStorageAvailable()) {
      try {
        const raw = window.localStorage.getItem(k);
        if (raw !== null) return this.parse(raw);
      } catch (error) {
        console.warn(`Error reading localStorage for key ${k}:`, error);
      }
    }
    // Fallback (and home for any write that couldn't reach localStorage).
    return this.parse(this.memory.get(k) ?? null);
  }

  set(value: T): boolean {
    const k = this.getStorageKey();
    const raw = JSON.stringify(value);
    if (localStorageAvailable()) {
      try {
        window.localStorage.setItem(k, raw);
        this.memory.delete(k); // avoid split-brain: localStorage is source of truth
        return true;
      } catch (error) {
        console.warn(`localStorage write failed for ${k}, using in-memory fallback:`, error);
      }
    }
    this.memory.set(k, raw);
    return true;
  }

  remove(): boolean {
    const k = this.getStorageKey();
    if (localStorageAvailable()) {
      try {
        window.localStorage.removeItem(k);
      } catch (error) {
        console.warn(`Error removing localStorage for key ${k}:`, error);
      }
    }
    this.memory.delete(k);
    return true;
  }

  clear(): boolean {
    return this.remove();
  }
}

/**
 * Manages a family of namespaced storage instances under a shared prefix.
 *
 * Owns the in-memory fallback Map shared by the storages it creates, and tracks
 * those instances so the prefix can be re-pointed (e.g. on a merchant switch)
 * without invalidating references consumers already captured.
 *
 * Note: switching prefix orphans the previous prefix's keys rather than deleting
 * them — this is intentional so a per-merchant cart is restored if the merchant
 * is selected again. Call {@link clearAll} first if you want them gone.
 */
export class StorageManager {
  private prefix: string;
  private created: BrowserStorage<unknown>[] = [];
  private memory = new Map<string, string>();

  constructor(prefix = 'inkress') {
    this.prefix = prefix;
  }

  createStorage<T>(key: string): BrowserStorage<T> {
    const storage = new BrowserStorage<T>(key, this.prefix, this.memory);
    this.created.push(storage as BrowserStorage<unknown>);
    return storage;
  }

  /** Re-point this manager and all storages it created at a new prefix. */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
    this.created.forEach((s) => s.setPrefix(prefix));
  }

  /** All fully-qualified keys under this prefix, across localStorage + memory. */
  private qualifiedKeys(): string[] {
    const prefixPattern = `${this.prefix}:`;
    const set = new Set<string>();
    if (localStorageAvailable()) {
      const ls = window.localStorage;
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k !== null) set.add(k);
      }
    }
    this.memory.forEach((_v, k) => set.add(k));
    return Array.from(set).filter((k) => k.startsWith(prefixPattern));
  }

  clearAll(): boolean {
    try {
      const usesLocal = localStorageAvailable();
      for (const k of this.qualifiedKeys()) {
        if (usesLocal) {
          try {
            window.localStorage.removeItem(k);
          } catch {
            /* ignore individual removal errors */
          }
        }
        this.memory.delete(k);
      }
      return true;
    } catch (error) {
      console.warn('Error clearing storage:', error);
      return false;
    }
  }

  getAllKeys(): string[] {
    const prefixLen = `${this.prefix}:`.length;
    try {
      return this.qualifiedKeys().map((k) => k.slice(prefixLen));
    } catch (error) {
      console.warn('Error reading storage keys:', error);
      return [];
    }
  }
}
