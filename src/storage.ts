/**
 * Browser storage utility for cart, wishlist, and other persisted SDK data.
 *
 * SSR-safe: when `localStorage` is unavailable (server, Node, locked-down
 * browser) it transparently falls back to a process-wide in-memory store, so a
 * cart still works within a single runtime instead of silently no-op'ing.
 */

// Shared in-memory fallback, keyed by the fully-qualified storage key.
const memoryStore = new Map<string, string>();

function localStorageAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      window.localStorage !== null
    );
  } catch {
    return false;
  }
}

export class BrowserStorage<T> {
  private key: string;
  private prefix: string;

  constructor(key: string, prefix = 'inkress') {
    this.key = key;
    this.prefix = prefix;
  }

  /** Update the namespace prefix (e.g. when the active merchant changes). */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  private getStorageKey(): string {
    return `${this.prefix}:${this.key}`;
  }

  get(): T | null {
    const storageKey = this.getStorageKey();
    try {
      const raw = localStorageAvailable()
        ? window.localStorage.getItem(storageKey)
        : memoryStore.get(storageKey) ?? null;
      return raw === null || raw === undefined ? null : (JSON.parse(raw) as T);
    } catch (error) {
      console.warn(`Error reading storage for key ${storageKey}:`, error);
      return null;
    }
  }

  set(value: T): boolean {
    const storageKey = this.getStorageKey();
    try {
      const raw = JSON.stringify(value);
      if (localStorageAvailable()) {
        window.localStorage.setItem(storageKey, raw);
      } else {
        memoryStore.set(storageKey, raw);
      }
      return true;
    } catch (error) {
      console.warn(`Error writing storage for key ${storageKey}:`, error);
      return false;
    }
  }

  remove(): boolean {
    const storageKey = this.getStorageKey();
    try {
      if (localStorageAvailable()) {
        window.localStorage.removeItem(storageKey);
      } else {
        memoryStore.delete(storageKey);
      }
      return true;
    } catch (error) {
      console.warn(`Error removing storage for key ${storageKey}:`, error);
      return false;
    }
  }

  clear(): boolean {
    return this.remove();
  }
}

/**
 * Manages a family of namespaced storage instances under a shared prefix.
 * Tracks the instances it creates so the prefix can be re-pointed (e.g. on a
 * merchant switch) without invalidating references consumers already captured.
 */
export class StorageManager {
  private prefix: string;
  private created: BrowserStorage<unknown>[] = [];

  constructor(prefix = 'inkress') {
    this.prefix = prefix;
  }

  createStorage<T>(key: string): BrowserStorage<T> {
    const storage = new BrowserStorage<T>(key, this.prefix);
    this.created.push(storage as BrowserStorage<unknown>);
    return storage;
  }

  /** Re-point this manager and all storages it created at a new prefix. */
  setPrefix(prefix: string): void {
    this.prefix = prefix;
    this.created.forEach((s) => s.setPrefix(prefix));
  }

  private eachKey(fn: (key: string) => void): void {
    const prefixPattern = `${this.prefix}:`;
    let keys: string[];
    if (localStorageAvailable()) {
      // Enumerate via the Web Storage API (length + key(i)) rather than
      // Object.keys, which isn't reliable across Storage implementations.
      const ls = window.localStorage;
      keys = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k !== null) keys.push(k);
      }
    } else {
      keys = Array.from(memoryStore.keys());
    }
    keys.filter((k) => k.startsWith(prefixPattern)).forEach(fn);
  }

  clearAll(): boolean {
    try {
      const toRemove: string[] = [];
      this.eachKey((k) => toRemove.push(k));
      toRemove.forEach((k) => {
        if (localStorageAvailable()) {
          window.localStorage.removeItem(k);
        } else {
          memoryStore.delete(k);
        }
      });
      return true;
    } catch (error) {
      console.warn('Error clearing storage:', error);
      return false;
    }
  }

  getAllKeys(): string[] {
    const prefixPattern = `${this.prefix}:`;
    try {
      const keys: string[] = [];
      this.eachKey((k) => keys.push(k.replace(prefixPattern, '')));
      return keys;
    } catch (error) {
      console.warn('Error reading storage keys:', error);
      return [];
    }
  }
}
