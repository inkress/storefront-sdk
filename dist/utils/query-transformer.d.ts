/**
 * Type-Based Query System
 *
 * This module provides a clean, type-safe query API where users write intuitive queries
 * and the SDK automatically transforms them into the Elixir-compatible format.
 *
 * Features:
 * - Array values → _in suffix (id: [1,2,3] → id_in: [1,2,3])
 * - Range objects → _min/_max suffixes (age: {min: 18, max: 65} → age_min: 18, age_max: 65)
 * - String operations → contains. prefix (name: {contains: "john"} → "contains.name": "john")
 * - Date operations → before./after./on. prefixes
 * - JSON field operations → in_, not_, null_, not_null_ prefixes
 * - Direct values → equality check (no transformation)
 */
export type RangeQuery<T> = {
    min?: T;
    max?: T;
};
export type StringQuery = {
    contains?: string;
};
export type DateQuery = {
    before?: string;
    after?: string;
    on?: string;
    min?: string;
    max?: string;
};
export type JsonQueryParams = {
    [key: string]: any | {
        in?: any;
        not?: any;
        null?: boolean;
        not_null?: boolean;
        min?: any;
        max?: any;
    };
};
export type QueryParams<T> = {
    [K in keyof T]?: any;
} & {
    exclude?: string | number;
    distinct?: string;
    order_by?: string;
    data?: JsonQueryParams;
    page?: number;
    page_size?: number;
    per_page?: number;
    limit?: number;
    override_page?: string | boolean;
    q?: string;
    search?: string;
    sort?: string;
    order?: 'asc' | 'desc';
};
/**
 * Runtime validation for query parameters
 */
export declare function validateQueryParams<T>(query: any, fieldTypes?: Partial<Record<keyof T, 'string' | 'number' | 'boolean' | 'date' | 'array'>>): string[];
/**
 * Transform a clean user query into Elixir-compatible format
 */
export declare function transformQuery(query: any): Record<string, any>;
/**
 * Flatten the transformed query object for API consumption
 */
export declare function flattenTransformedQuery(transformed: Record<string, any>): Record<string, any>;
/**
 * Main function to transform and flatten a query in one step
 * Handles translation of contextual strings to integers before transformation
 */
export declare function processQuery<T>(query: any, fieldTypes?: Partial<Record<keyof T, 'string' | 'number' | 'boolean' | 'date' | 'array'>>, options?: {
    validate?: boolean;
    context?: string;
}): Record<string, any>;
/**
 * Type-safe query builder for specific entity types
 */
export declare class QueryBuilder<T> {
    private query;
    constructor(initialQuery?: any);
    /**
     * Add a field equality condition
     */
    where<K extends keyof T>(field: K, value: any): this;
    /**
     * Add a field IN condition (array of values)
     */
    whereIn<K extends keyof T>(field: K, values: any[]): this;
    /**
     * Add a range condition (min/max)
     */
    whereRange<K extends keyof T>(field: K, min?: any, max?: any): this;
    /**
     * Add a string contains condition
     */
    whereContains<K extends keyof T>(field: K, value: string): this;
    /**
     * Add a date range condition
     */
    whereDateRange<K extends keyof T>(field: K, after?: string, before?: string, on?: string): this;
    /**
     * Add pagination
     */
    paginate(page: number, pageSize: number): this;
    /**
     * Add ordering
     */
    orderBy(field: string, direction?: 'asc' | 'desc'): this;
    /**
     * Add general search
     */
    search(term: string): this;
    /**
     * Build and return the transformed query
     */
    build(): Record<string, any>;
    /**
     * Get the raw query (before transformation)
     */
    getRawQuery(): any;
}
//# sourceMappingURL=query-transformer.d.ts.map