/**
 * Browser storage utility for managing cart, wishlist, and other data
 * Gracefully handles server-side rendering and missing localStorage
 */
export class BrowserStorage<T> {
  private key: string;
  private prefix: string;

  constructor(key: string, prefix = 'inkress') {
    this.key = key;
    this.prefix = prefix;
  }

  private getStorageKey(): string {
    return `${this.prefix}:${this.key}`;
  }

  private isStorageAvailable(): boolean {
    try {
      return typeof window !== 'undefined' && 
             typeof window.localStorage !== 'undefined' &&
             window.localStorage !== null;
    } catch {
      return false;
    }
  }

  get(): T | null {
    if (!this.isStorageAvailable()) {
      return null;
    }

    try {
      const item = localStorage.getItem(this.getStorageKey());
      if (item === null) {
        return null;
      }
      return JSON.parse(item) as T;
    } catch (error) {
      console.warn(`Error reading from localStorage for key ${this.getStorageKey()}:`, error);
      return null;
    }
  }

  set(value: T): boolean {
    if (!this.isStorageAvailable()) {
      return false;
    }

    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Error writing to localStorage for key ${this.getStorageKey()}:`, error);
      return false;
    }
  }

  remove(): boolean {
    if (!this.isStorageAvailable()) {
      return false;
    }

    try {
      localStorage.removeItem(this.getStorageKey());
      return true;
    } catch (error) {
      console.warn(`Error removing from localStorage for key ${this.getStorageKey()}:`, error);
      return false;
    }
  }

  clear(): boolean {
    return this.remove();
  }
}

/**
 * Storage manager for handling multiple storage instances
 */
export class StorageManager {
  private prefix: string;

  constructor(prefix = 'inkress') {
    this.prefix = prefix;
  }

  createStorage<T>(key: string): BrowserStorage<T> {
    return new BrowserStorage<T>(key, this.prefix);
  }

  clearAll(): boolean {
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }

    try {
      const keys = Object.keys(localStorage);
      const prefixPattern = `${this.prefix}:`;
      
      keys.forEach(key => {
        if (key.startsWith(prefixPattern)) {
          localStorage.removeItem(key);
        }
      });
      
      return true;
    } catch (error) {
      console.warn('Error clearing localStorage:', error);
      return false;
    }
  }

  getAllKeys(): string[] {
    if (typeof window === 'undefined' || !window.localStorage) {
      return [];
    }

    try {
      const keys = Object.keys(localStorage);
      const prefixPattern = `${this.prefix}:`;
      
      return keys
        .filter(key => key.startsWith(prefixPattern))
        .map(key => key.replace(prefixPattern, ''));
    } catch (error) {
      console.warn('Error getting localStorage keys:', error);
      return [];
    }
  }
}
