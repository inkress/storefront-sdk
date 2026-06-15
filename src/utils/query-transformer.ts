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

import { StatusTranslator, KindTranslator } from './translators';

// Range queries for numeric/date fields
export type RangeQuery<T> = {
  min?: T;  // SDK adds _min suffix
  max?: T;  // SDK adds _max suffix
};

// String-specific queries
export type StringQuery = {
  contains?: string;  // SDK adds contains. prefix
};

// Date-specific queries
export type DateQuery = {
  before?: string;  // SDK adds before. prefix
  after?: string;   // SDK adds after. prefix
  on?: string;      // SDK adds on. prefix
  min?: string;     // SDK adds _min suffix
  max?: string;     // SDK adds _max suffix
};

// JSON field queries
export type JsonQueryParams = {
  [key: string]: any | {
    in?: any;        // SDK adds in_ prefix
    not?: any;       // SDK adds not_ prefix
    null?: boolean;  // SDK adds null_ prefix
    not_null?: boolean;  // SDK adds not_null_ prefix
    min?: any;       // SDK adds _min suffix
    max?: any;       // SDK adds _max suffix
  };
};

// Simplified query parameters for better compatibility
export type QueryParams<T> = {
  [K in keyof T]?: any; // Simplified to avoid TypeScript complexity issues
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
export function validateQueryParams<T>(
  query: any, 
  fieldTypes?: Partial<Record<keyof T, 'string' | 'number' | 'boolean' | 'date' | 'array'>>
): string[] {
  const errors: string[] = [];
  
  if (!query || typeof query !== 'object') {
    return errors;
  }

  for (const [key, value] of Object.entries(query)) {
    // Skip special fields and undefined/null values
    if (isSpecialField(key) || value === undefined || value === null) {
      continue;
    }

    // Skip data field (JSON queries have their own validation)
    if (key === 'data') {
      continue;
    }

    const fieldType = fieldTypes?.[key as keyof T];
    
    // Validate based on field type
    if (fieldType) {
      const validationError = validateFieldValue(key, value, fieldType);
      if (validationError) {
        errors.push(validationError);
      }
    }
  }

  return errors;
}

/**
 * Validate a single field value against its expected type
 */
function validateFieldValue(fieldName: string, value: any, expectedType: string): string | null {
  // Handle array values (for _in operations)
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isValueOfType(item, expectedType)) {
        return `Field "${fieldName}" array contains invalid type. Expected all items to be ${expectedType}, but found ${typeof item}`;
      }
    }
    return null;
  }

  // Handle range objects
  if (typeof value === 'object' && value !== null && ('min' in value || 'max' in value)) {
    if (expectedType !== 'number' && expectedType !== 'date' && expectedType !== 'string') {
      return `Field "${fieldName}" cannot use range queries. Range queries are only supported for number, date, and string fields.`;
    }
    
    if ('min' in value && value.min !== undefined && !isValueOfType(value.min, expectedType)) {
      return `Field "${fieldName}" range min value has wrong type. Expected ${expectedType}, got ${typeof value.min}`;
    }
    
    if ('max' in value && value.max !== undefined && !isValueOfType(value.max, expectedType)) {
      return `Field "${fieldName}" range max value has wrong type. Expected ${expectedType}, got ${typeof value.max}`;
    }
    
    return null;
  }

  // Handle string contains queries
  if (typeof value === 'object' && value !== null && 'contains' in value) {
    if (expectedType !== 'string') {
      return `Field "${fieldName}" cannot use contains queries. Contains queries are only supported for string fields.`;
    }
    
    if (typeof value.contains !== 'string') {
      return `Field "${fieldName}" contains value must be a string. Got ${typeof value.contains}`;
    }
    
    return null;
  }

  // Handle date queries
  if (typeof value === 'object' && value !== null && ('before' in value || 'after' in value || 'on' in value || 'min' in value || 'max' in value)) {
    if ('before' in value && value.before !== undefined && typeof value.before !== 'string') {
      return `Field "${fieldName}" before value must be a string. Got ${typeof value.before}`;
    }
    
    if ('after' in value && value.after !== undefined && typeof value.after !== 'string') {
      return `Field "${fieldName}" after value must be a string. Got ${typeof value.after}`;
    }
    
    if ('on' in value && value.on !== undefined && typeof value.on !== 'string') {
      return `Field "${fieldName}" on value must be a string. Got ${typeof value.on}`;
    }
    
    if ('min' in value && value.min !== undefined && typeof value.min !== 'string') {
      return `Field "${fieldName}" min value must be a string. Got ${typeof value.min}`;
    }
    
    if ('max' in value && value.max !== undefined && typeof value.max !== 'string') {
      return `Field "${fieldName}" max value must be a string. Got ${typeof value.max}`;
    }
    
    return null;
  }

  // Handle direct values
  if (!isValueOfType(value, expectedType)) {
    return `Field "${fieldName}" has wrong type. Expected ${expectedType}, got ${typeof value}`;
  }

  return null;
}

/**
 * Check if a value matches the expected type
 */
function isValueOfType(value: any, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return value instanceof Date || (typeof value === 'string' && !isNaN(Date.parse(value)));
    case 'array':
      return Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Transform a clean user query into Elixir-compatible format
 */
export function transformQuery(query: any): Record<string, any> {
  if (!query || typeof query !== 'object') {
    return {};
  }

  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(query)) {
    // Skip undefined/null values
    if (value === undefined || value === null) {
      continue;
    }

    // Pass through special fields unchanged
    if (isSpecialField(key)) {
      result[key] = value;
      continue;
    }
    
    // Handle data field specially for JSON queries
    if (key === 'data' && typeof value === 'object') {
      result.data = transformJsonQuery(value as JsonQueryParams);
      continue;
    }
    
    // Transform based on value type
    const transformedValue = transformFieldValue(key, value);
    // Skip null values (e.g., from empty objects)
    if (transformedValue !== null) {
      result[key] = transformedValue;
    }
  }
  
  return result;
}

/**
 * Check if a field is a special field that should pass through unchanged
 */
function isSpecialField(key: string): boolean {
  const specialFields = [
    'exclude', 'distinct', 'order_by', 'page', 'page_size', 'per_page',
    'limit', 'override_page', 'q', 'search', 'sort', 'order'
  ];
  return specialFields.includes(key);
}

/**
 * Transform a field value based on its type
 */
function transformFieldValue(key: string, value: any): any {
  if (Array.isArray(value)) {
    // Array → add _in suffix
    return { [`${key}_in`]: value };
  } 
  
  if (typeof value === 'object' && value !== null) {
    const transformedObject: Record<string, any> = {};
    
    // Handle range queries (min/max)
    if ('min' in value && value.min !== undefined) {
      transformedObject[`${key}_min`] = value.min;
    }
    if ('max' in value && value.max !== undefined) {
      transformedObject[`${key}_max`] = value.max;
    }
    
    // Handle range queries (gte/lte/gt/lt)
    if ('gte' in value && value.gte !== undefined) {
      transformedObject[`${key}_gte`] = value.gte;
    }
    if ('lte' in value && value.lte !== undefined) {
      transformedObject[`${key}_lte`] = value.lte;
    }
    if ('gt' in value && value.gt !== undefined) {
      transformedObject[`${key}_gt`] = value.gt;
    }
    if ('lt' in value && value.lt !== undefined) {
      transformedObject[`${key}_lt`] = value.lt;
    }
    
    // Handle string queries
    if ('contains' in value && value.contains !== undefined) {
      transformedObject[`contains.${key}`] = value.contains;
    }
    
    // Handle date queries
    if ('before' in value && value.before !== undefined) {
      transformedObject[`before.${key}`] = value.before;
    }
    if ('after' in value && value.after !== undefined) {
      transformedObject[`after.${key}`] = value.after;
    }
    if ('on' in value && value.on !== undefined) {
      transformedObject[`on.${key}`] = value.on;
    }
    
    // If we found any transformations, return them
    if (Object.keys(transformedObject).length > 0) {
      return transformedObject;
    }
    
    // Empty object with no transformation keys - return null to skip it
    if (Object.keys(value).length === 0) {
      return null;
    }
  }
  
  // Direct value → wrap for consistent structure that will be flattened later
  return { [key]: value };
}

/**
 * Transform JSON field queries with special operators
 */
function transformJsonQuery(data: JsonQueryParams): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip undefined/null values
    if (value === undefined || value === null) {
      continue;
    }

    // Nested paths (e.g., "settings->theme") stay as-is
    if (key.includes('->')) {
      result[key] = value;
      continue;
    }
    
    if (typeof value === 'object' && value !== null) {
      // Check if this is a JSON query operation (has special keys)
      const hasJsonQueryOps = 'in' in value || 'not' in value || 'null' in value || 
                              'not_null' in value || 'min' in value || 'max' in value;
      
      if (hasJsonQueryOps) {
        // Transform JSON-specific operations
        if ('in' in value && value.in !== undefined) {
          result[`in_${key}`] = value.in;
        }
        if ('not' in value && value.not !== undefined) {
          result[`not_${key}`] = value.not;
        }
        if ('null' in value && value.null !== undefined) {
          result[`null_${key}`] = value.null;
        }
        if ('not_null' in value && value.not_null !== undefined) {
          result[`not_null_${key}`] = value.not_null;
        }
        if ('min' in value && value.min !== undefined) {
          result[`${key}_min`] = value.min;
        }
        if ('max' in value && value.max !== undefined) {
          result[`${key}_max`] = value.max;
        }
      } else {
        // Complex object without query operators - pass through as-is
        result[key] = value;
      }
    } else {
      // Direct value in JSON field
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Flatten the transformed query object for API consumption
 */
export function flattenTransformedQuery(transformed: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(transformed)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // If it's a transformation object with special keys, merge its properties
      if (hasTransformationKeys(value)) {
        Object.assign(result, value);
      } else if (isWrappedDirectValue(key, value)) {
        // Unwrap direct values like { id: { id: 5 } } → { id: 5 }
        result[key] = value[key];
      } else {
        // Regular object (like data field)
        result[key] = value;
      }
    } else {
      // Direct value or array
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Check if a value is a wrapped direct value (e.g., { id: { id: 5 } })
 * This happens when transformFieldValue wraps a direct value for consistency
 */
function isWrappedDirectValue(key: string, obj: Record<string, any>): boolean {
  const keys = Object.keys(obj);
  return keys.length === 1 && keys[0] === key;
}

/**
 * Check if an object contains transformation keys
 */
function hasTransformationKeys(obj: Record<string, any>): boolean {
  const keys = Object.keys(obj);
  return keys.some(key => 
    key.includes('_min') || 
    key.includes('_max') || 
    key.includes('_gte') ||
    key.includes('_lte') ||
    key.includes('_gt') ||
    key.includes('_lt') ||
    key.includes('_in') ||
    key.includes('contains.') ||
    key.includes('before.') ||
    key.includes('after.') ||
    key.includes('on.')
  );
}

/**
 * Main function to transform and flatten a query in one step
 * Handles translation of contextual strings to integers before transformation
 */
export function processQuery<T>(
  query: any, 
  fieldTypes?: Partial<Record<keyof T, 'string' | 'number' | 'boolean' | 'date' | 'array'>>,
  options: { validate?: boolean; context?: string } = { validate: false }
): Record<string, any> {
  // Translate contextual strings to integers BEFORE validation and transformation
  const translatedQuery = { ...query };
  
  if (fieldTypes && options.context) {
    for (const [key, value] of Object.entries(translatedQuery)) {
      const fieldType = fieldTypes[key as keyof T];
      
      // Skip special fields
      if (isSpecialField(key)) continue;
      
      // Translate status fields (contextual strings to integers)
      if (key === 'status' && fieldType === 'number') {
        translatedQuery[key] = translateValue(value, StatusTranslator, options.context);
      }
      
      // Translate kind fields (contextual strings to integers)
      if (key === 'kind' && fieldType === 'number') {
        translatedQuery[key] = translateValue(value, KindTranslator, options.context);
      }
    }
  }

  // Transform AFTER translation so that range objects are properly handled
  const transformed = transformQuery(translatedQuery);
  const flattened = flattenTransformedQuery(transformed);

  // Runtime validation AFTER transformation if enabled and field types provided
  if (options.validate && fieldTypes) {
    const validationErrors = validateQueryParams(flattened, fieldTypes);
    if (validationErrors.length > 0) {
      console.warn(`Query validation warnings: ${validationErrors.join(', ')}`);
    }
  }

  return flattened;
}

/**
 * Helper to translate a value (string, array of strings, or object with strings)
 */
function translateValue(value: any, translator: any, context: string): any {
  if (value === undefined || value === null) {
    return value;
  }
  
  // Handle arrays (for _in operations)
  if (Array.isArray(value)) {
    return value.map(item => {
      // If it's already a number, pass it through
      if (typeof item === 'number') {
        return item;
      }
      // If it's a string, it MUST be translatable
      if (typeof item === 'string') {
        return context 
          ? translator.toIntegerWithContext(item, context)
          : translator.toInteger(item);
      }
      return item;
    });
  }
  
  // Handle range objects (e.g., { gte: 'paid', lte: 'confirmed' })
  if (typeof value === 'object' && value !== null) {
    const translated: any = {};
    for (const [k, v] of Object.entries(value)) {
      // If it's already a number, pass it through
      if (typeof v === 'number') {
        translated[k] = v;
      }
      // If it's a string, it MUST be translatable
      else if (typeof v === 'string') {
        translated[k] = context
          ? translator.toIntegerWithContext(v, context)
          : translator.toInteger(v);
      } else {
        translated[k] = v;
      }
    }
    return translated;
  }
  
  // Handle direct string values
  if (typeof value === 'string') {
    return context
      ? translator.toIntegerWithContext(value, context)
      : translator.toInteger(value);
  }
  
  // Already a number, pass through
  return value;
}

/**
 * Type-safe query builder for specific entity types
 */
export class QueryBuilder<T> {
  private query: any = {};

  constructor(initialQuery?: any) {
    if (initialQuery) {
      this.query = { ...initialQuery };
    }
  }

  /**
   * Add a field equality condition
   */
  where<K extends keyof T>(field: K, value: any): this {
    this.query[field] = value;
    return this;
  }

  /**
   * Add a field IN condition (array of values)
   */
  whereIn<K extends keyof T>(field: K, values: any[]): this {
    this.query[field] = values;
    return this;
  }

  /**
   * Add a range condition (min/max)
   */
  whereRange<K extends keyof T>(field: K, min?: any, max?: any): this {
    const range: any = {};
    if (min !== undefined) range.min = min;
    if (max !== undefined) range.max = max;
    this.query[field] = range;
    return this;
  }

  /**
   * Add a string contains condition
   */
  whereContains<K extends keyof T>(field: K, value: string): this {
    this.query[field] = { contains: value };
    return this;
  }

  /**
   * Add a date range condition
   */
  whereDateRange<K extends keyof T>(field: K, after?: string, before?: string, on?: string): this {
    const dateQuery: any = {};
    if (after !== undefined) dateQuery.after = after;
    if (before !== undefined) dateQuery.before = before;
    if (on !== undefined) dateQuery.on = on;
    this.query[field] = dateQuery;
    return this;
  }

  /**
   * Add pagination
   */
  paginate(page: number, pageSize: number): this {
    this.query.page = page;
    this.query.page_size = pageSize;
    return this;
  }

  /**
   * Add ordering
   */
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc'): this {
    this.query.order_by = `${field} ${direction}`;
    return this;
  }

  /**
   * Add general search
   */
  search(term: string): this {
    this.query.q = term;
    return this;
  }

  /**
   * Build and return the transformed query
   */
  build(): Record<string, any> {
    return processQuery(this.query);
  }

  /**
   * Get the raw query (before transformation)
   */
  getRawQuery(): any {
    return { ...this.query };
  }
}
