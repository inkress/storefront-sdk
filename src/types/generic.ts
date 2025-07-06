/**
 * Generic entry from the API - represents a key-value store entry
 */
export interface Generic {
  id: string;
  key: string;
  kind: number;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * Input for creating or updating a generic entry
 */
export interface GenericInput {
  key: string;
  kind: number;
  data: Record<string, any>;
}

/**
 * Parameters for listing generics
 */
export interface ListGenericsParams {
  page?: number;
  limit?: number;
  key?: string;
  kind?: number;
  sort?: 'name' | 'size' | 'created_at' | 'updated_at' | 'content_type';
  order?: 'asc' | 'desc';
}
