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
export declare class BrowserStorage<T> {
    private key;
    private prefix;
    /** In-memory fallback; owned by the StorageManager when created via one. */
    private memory;
    constructor(key: string, prefix?: string, memory?: Map<string, string>);
    /** Update the namespace prefix (e.g. when the active merchant changes). */
    setPrefix(prefix: string): void;
    private getStorageKey;
    private parse;
    get(): T | null;
    set(value: T): boolean;
    remove(): boolean;
    clear(): boolean;
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
export declare class StorageManager {
    private prefix;
    private created;
    private memory;
    constructor(prefix?: string);
    createStorage<T>(key: string): BrowserStorage<T>;
    /** Re-point this manager and all storages it created at a new prefix. */
    setPrefix(prefix: string): void;
    /** All fully-qualified keys under this prefix, across localStorage + memory. */
    private qualifiedKeys;
    clearAll(): boolean;
    getAllKeys(): string[];
}
//# sourceMappingURL=storage.d.ts.map