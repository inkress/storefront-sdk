import { mappings } from '../data-mappings';
export type FeeStructureKey = keyof typeof mappings.FeeStructure;
export type KindKey = keyof typeof mappings.Kind;
export type StatusKey = keyof typeof mappings.Status;
export type AccessKey = keyof typeof mappings.Access;
export type FeeStructureValue = typeof mappings.FeeStructure[FeeStructureKey];
export type KindValue = typeof mappings.Kind[KindKey];
export type StatusValue = typeof mappings.Status[StatusKey];
export type AccessValue = typeof mappings.Access[AccessKey];
/**
 * Translation functions for Fee Structures
 */
export declare const FeeStructureTranslator: {
    /**
     * Convert string to integer for API calls
     */
    toInteger(key: FeeStructureKey): FeeStructureValue;
    /**
     * Convert integer to string for user display
     */
    toString(value: FeeStructureValue): FeeStructureKey;
    /**
     * Get all available options as string keys
     */
    getOptions(): FeeStructureKey[];
};
/**
 * Translation functions for Kinds with context-aware prefixing
 */
export declare const KindTranslator: {
    /**
     * Convert string to integer for API calls
     */
    toInteger(key: KindKey): KindValue;
    /**
     * Convert string to integer with context prefix
     */
    toIntegerWithContext(key: string, context: string): KindValue;
    /**
     * Convert integer to string for user display
     */
    toString(value: KindValue): KindKey;
    /**
     * Convert integer to string and remove context prefix
     */
    toStringWithoutContext(value: KindValue, context: string): string;
    /**
     * Get all available options as string keys
     */
    getOptions(): KindKey[];
    /**
     * Get options filtered by prefix (e.g., 'order_', 'product_')
     */
    getOptionsByPrefix(prefix: string): KindKey[];
    /**
     * Get options without context prefix for a specific context
     */
    getContextualOptions(context: string): string[];
};
/**
 * Translation functions for Statuses with context-aware prefixing
 */
export declare const StatusTranslator: {
    /**
     * Convert string to integer for API calls
     */
    toInteger(key: StatusKey): StatusValue;
    /**
     * Convert string to integer with context prefix
     */
    toIntegerWithContext(key: string, context: string): StatusValue;
    /**
     * Convert integer to string for user display
     */
    toString(value: StatusValue): StatusKey;
    /**
     * Convert integer to string and remove context prefix
     */
    toStringWithoutContext(value: StatusValue, context: string): string;
    /**
     * Get all available options as string keys
     */
    getOptions(): StatusKey[];
    /**
     * Get options filtered by prefix (e.g., 'order_', 'product_', 'account_')
     */
    getOptionsByPrefix(prefix: string): StatusKey[];
    /**
     * Get options without context prefix for a specific context
     */
    getContextualOptions(context: string): string[];
};
/**
 * Translation functions for Access levels
 */
export declare const AccessTranslator: {
    /**
     * Convert string to integer for API calls
     */
    toInteger(key: AccessKey): AccessValue;
    /**
     * Convert integer to string for user display
     */
    toString(value: AccessValue): AccessKey;
    /**
     * Get all available options as string keys
     */
    getOptions(): AccessKey[];
};
/**
 * Generic translator for any mapping
 */
export declare const createTranslator: <T extends Record<string, number>>(mapping: T) => {
    toInteger: (key: keyof T) => T[keyof T];
    toString: (value: T[keyof T]) => keyof T;
    getOptions: () => (keyof T)[];
};
/**
 * Helper function to safely convert values with fallback
 */
export declare const safeTranslate: {
    feeStructureToString: (value: number) => FeeStructureKey | null;
    kindToString: (value: number) => KindKey | null;
    statusToString: (value: number) => StatusKey | null;
};
//# sourceMappingURL=translators.d.ts.map