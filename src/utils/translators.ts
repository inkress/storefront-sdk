// Translation utilities for converting between string representations and integer values
import { mappings } from '../data-mappings';

// Type definitions for the mappings
export type FeeStructureKey = keyof typeof mappings.FeeStructure;
export type KindKey = keyof typeof mappings.Kind;
export type StatusKey = keyof typeof mappings.Status;
export type AccessKey = keyof typeof mappings.Access;

export type FeeStructureValue = typeof mappings.FeeStructure[FeeStructureKey];
export type KindValue = typeof mappings.Kind[KindKey];
export type StatusValue = typeof mappings.Status[StatusKey];
export type AccessValue = typeof mappings.Access[AccessKey];

// Create reverse mappings for integer to string conversion
const createReverseMapping = <T extends Record<string, number>>(mapping: T): Record<number, keyof T> => {
  const reversed: Record<number, keyof T> = {};
  for (const [key, value] of Object.entries(mapping)) {
    reversed[value] = key as keyof T;
  }
  return reversed;
};

const reverseFeeStructure = createReverseMapping(mappings.FeeStructure);
const reverseKind = createReverseMapping(mappings.Kind);
const reverseStatus = createReverseMapping(mappings.Status);
const reverseAccess = createReverseMapping(mappings.Access);

// Helper to find a key by value and prefix, useful when multiple keys map to the same value
const findKeyByValueAndPrefix = <T extends Record<string, number>>(
  mapping: T, 
  value: number, 
  prefix: string
): keyof T | undefined => {
  for (const [key, val] of Object.entries(mapping)) {
    if (val === value && key.startsWith(prefix)) {
      return key as keyof T;
    }
  }
  return undefined;
};

/**
 * Translation functions for Fee Structures
 */
export const FeeStructureTranslator = {
  /**
   * Convert string to integer for API calls
   */
  toInteger(key: FeeStructureKey): FeeStructureValue {
    return mappings.FeeStructure[key];
  },

  /**
   * Convert integer to string for user display
   */
  toString(value: FeeStructureValue): FeeStructureKey {
    const key = reverseFeeStructure[value];
    if (!key) {
      throw new Error(`Unknown fee structure value: ${value}`);
    }
    return key;
  },

  /**
   * Get all available options as string keys
   */
  getOptions(): FeeStructureKey[] {
    return Object.keys(mappings.FeeStructure) as FeeStructureKey[];
  }
};

/**
 * Translation functions for Kinds with context-aware prefixing
 */
export const KindTranslator = {
  /**
   * Convert string to integer for API calls
   */
  toInteger(key: KindKey): KindValue {
    return mappings.Kind[key];
  },

  /**
   * Convert string to integer with context prefix
   */
  toIntegerWithContext(key: string, context: string): KindValue {
    // If key already has a context prefix, use as-is
    const fullKey = key.includes('_') ? key as KindKey : `${context}_${key}` as KindKey;
    
    if (mappings.Kind[fullKey] !== undefined) {
      return mappings.Kind[fullKey];
    }
    
    // Fallback: try the key as-is if it's a valid kind
    if (mappings.Kind[key as KindKey] !== undefined) {
      return mappings.Kind[key as KindKey];
    }
    
    throw new Error(`Unknown kind value: ${key} (tried with context: ${fullKey})`);
  },

  /**
   * Convert integer to string for user display
   */
  toString(value: KindValue): KindKey {
    const key = reverseKind[value];
    if (!key) {
      throw new Error(`Unknown kind value: ${value}`);
    }
    return key;
  },

  /**
   * Convert integer to string and remove context prefix
   */
  toStringWithoutContext(value: KindValue, context: string): string {
    const prefix = `${context}_`;
    
    // Try to find a key that matches the value and starts with the prefix
    const contextKey = findKeyByValueAndPrefix(mappings.Kind, value, prefix);
    
    if (contextKey) {
      return (contextKey as string).substring(prefix.length);
    }

    // Fallback to the global reverse mapping if no context-specific key is found
    const fullKey = this.toString(value);
    
    if (fullKey.startsWith(prefix)) {
      return fullKey.substring(prefix.length);
    }
    
    return fullKey;
  },

  /**
   * Get all available options as string keys
   */
  getOptions(): KindKey[] {
    return Object.keys(mappings.Kind) as KindKey[];
  },

  /**
   * Get options filtered by prefix (e.g., 'order_', 'product_')
   */
  getOptionsByPrefix(prefix: string): KindKey[] {
    return this.getOptions().filter(key => key.startsWith(prefix));
  },

  /**
   * Get options without context prefix for a specific context
   */
  getContextualOptions(context: string): string[] {
    const prefix = `${context}_`;
    return this.getOptions()
      .filter(key => key.startsWith(prefix))
      .map(key => key.substring(prefix.length));
  }
};

/**
 * Translation functions for Statuses with context-aware prefixing
 */
export const StatusTranslator = {
  /**
   * Convert string to integer for API calls
   */
  toInteger(key: StatusKey): StatusValue {
    return mappings.Status[key];
  },

  /**
   * Convert string to integer with context prefix
   */
  toIntegerWithContext(key: string, context: string): StatusValue {
    // If key already has the context prefix, use as-is
    const fullKey = key.includes('_') ? key as StatusKey : `${context}_${key}` as StatusKey;
    
    if (mappings.Status[fullKey] !== undefined) {
      return mappings.Status[fullKey];
    }
    
    // Fallback: try the key as-is if it's a valid status
    if (mappings.Status[key as StatusKey] !== undefined) {
      return mappings.Status[key as StatusKey];
    }
    
    throw new Error(`Unknown status value: ${key} (tried with context: ${fullKey})`);
  },

  /**
   * Convert integer to string for user display
   */
  toString(value: StatusValue): StatusKey {
    const key = reverseStatus[value];
    if (!key) {
      throw new Error(`Unknown status value: ${value}`);
    }
    return key;
  },

  /**
   * Convert integer to string and remove context prefix
   */
  toStringWithoutContext(value: StatusValue, context: string): string {
    const prefix = `${context}_`;
    
    // Try to find a key that matches the value and starts with the prefix
    const contextKey = findKeyByValueAndPrefix(mappings.Status, value, prefix);
    
    if (contextKey) {
      return (contextKey as string).substring(prefix.length);
    }

    // Fallback to the global reverse mapping if no context-specific key is found
    const fullKey = this.toString(value);
    
    if (fullKey.startsWith(prefix)) {
      return fullKey.substring(prefix.length);
    }
    
    return fullKey;
  },

  /**
   * Get all available options as string keys
   */
  getOptions(): StatusKey[] {
    return Object.keys(mappings.Status) as StatusKey[];
  },

  /**
   * Get options filtered by prefix (e.g., 'order_', 'product_', 'account_')
   */
  getOptionsByPrefix(prefix: string): StatusKey[] {
    return this.getOptions().filter(key => key.startsWith(prefix));
  },

  /**
   * Get options without context prefix for a specific context
   */
  getContextualOptions(context: string): string[] {
    const prefix = `${context}_`;
    return this.getOptions()
      .filter(key => key.startsWith(prefix))
      .map(key => key.substring(prefix.length));
  }
};

/**
 * Translation functions for Access levels
 */
export const AccessTranslator = {
  /**
   * Convert string to integer for API calls
   */
  toInteger(key: AccessKey): AccessValue {
    return mappings.Access[key];
  },

  /**
   * Convert integer to string for user display
   */
  toString(value: AccessValue): AccessKey {
    const key = reverseAccess[value];
    if (!key) {
      throw new Error(`Unknown access value: ${value}`);
    }
    return key;
  },

  /**
   * Get all available options as string keys
   */
  getOptions(): AccessKey[] {
    return Object.keys(mappings.Access) as AccessKey[];
  }
};

/**
 * Generic translator for any mapping
 */
export const createTranslator = <T extends Record<string, number>>(mapping: T) => {
  const reverse = createReverseMapping(mapping);
  
  return {
    toInteger: (key: keyof T): T[keyof T] => mapping[key],
    toString: (value: T[keyof T]): keyof T => {
      const key = reverse[value];
      if (!key) {
        throw new Error(`Unknown value: ${value}`);
      }
      return key;
    },
    getOptions: (): (keyof T)[] => Object.keys(mapping) as (keyof T)[],
  };
};

/**
 * Helper function to safely convert values with fallback
 */
export const safeTranslate = {
  feeStructureToString: (value: number): FeeStructureKey | null => {
    try {
      return FeeStructureTranslator.toString(value as FeeStructureValue);
    } catch {
      return null;
    }
  },
  
  kindToString: (value: number): KindKey | null => {
    try {
      return KindTranslator.toString(value as KindValue);
    } catch {
      return null;
    }
  },
  
  statusToString: (value: number): StatusKey | null => {
    try {
      return StatusTranslator.toString(value as StatusValue);
    } catch {
      return null;
    }
  }
};
