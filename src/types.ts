// Re-export payment helper types so consumers can import them from the root.
export type { PaymentURLOptions, PaymentCustomer } from './utils/payment';

// Common interfaces
export interface PaginationParams {
  page?: number;
  page_size?: number; // Note: API uses "page_size", not "per_page"
  sort?: string; // Format: "field_name direction" (e.g., "created_at desc")
  order?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  page_size: number;
  total_entries: number;
  total_pages: number;
  more: boolean;
  next_page?: number;
  last_page?: number;
  next_pages: number[];
  last_pages: number[];
}

export interface PaginatedResponse<T> {
  pagination: PaginationMeta;
  entries: T[];
}

// Note: API response structure:
// Single items: { "state": "ok", "result": <item> }
// Lists: { "state": "ok", "result": { "pagination": {...}, "entries": [...] } }

export interface ValidationError {
  state: 'error';
  data: Record<string, string[]>;
}

// Merchant types
export interface Merchant {
  id: number;
  name: string;
  username: string;
  about?: string;
  logo?: string;
  sector?: string;
  business_type?: string;
  theme_colour?: string;
  data?: any;
  domain?: {
    cname?: string;
  };
}

// Product types
export interface Product {
  id: number;
  title: string;
  teaser?: string;
  price: number;
  permalink: string;
  image?: string | null;
  status: number;
  public: boolean;
  unlimited: boolean;
  units_remaining?: number | null;
  units_sold?: number | null;
  rating_sum?: number | null;
  rating_count?: number | null;
  tag_ids: number[];
  data?: Record<string, any>;
  meta?: Record<string, any>;
  /**
   * Variant/option/attribute fields as the merchant form's *write* payload.
   * On read, the API serves these under `data.attributes` + `data.customer_inputs`
   * (what the marketplace consumes); use `products.getCustomFields(product)`.
   */
  custom_fields?: ProductCustomField[];
  currency: Currency;
  category_id?: number | null;
  category?: Category;
  merchant: Merchant;
  created_at: string;
  updated_at: string;
}

// Currency type
export interface Currency {
  id: number;
  code: string;
  symbol: string;
  name: string;
}

// Category types  
export interface Category {
  id: number;
  name: string;
  description?: string | null;
  kind: number;
  kind_id?: number | null;
  parent_id?: number | null;
  merchant_id: number | null;
  merchant?: Merchant | null;
  parent?: {
    id: number;
    name: string;
  } | null;
  children?: {
    id: number;
    name: string;
  }[];
  created_at: string;
  updated_at: string;
}

export interface CategoryInput {
  name: string;
  description?: string;
  kind: number;
  kind_id?: number;
  parent_id?: number;
}

export interface CategoryListParams extends PaginationParams {
  parent_id?: number;
  kind?: number;
  q?: string;
}

export interface SortingParams {
  sort?: 'name' | 'kind' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}

export interface CategoryTree extends Category {
  children: CategoryTree[];
}

// Customer types
export interface Customer {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  data?: Record<string, any>;
}

export interface CustomerAuthResponse {
  token: string;
  customer: Customer;
  expires_at?: string;
}

export interface CustomerLoginRequest {
  email: string;
  password: string;
}

export interface CustomerRegisterRequest {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

// Order types
export interface OrderLineItem {
  id: number;
  order_id: number;
  product_id: number;
  product?: Product;
  product_variant_name_frozen: string; // Frozen variant name for consistency
  product_variant_total_frozen: number; // Frozen total for variant
  quantity: number;
}

export interface Order {
  id: number;
  reference_id: string;
  total: number;
  kind: number; // 1=online, 2=cart, 3=subscription, 4=invoice, 5=offline
  status: string;
  status_on: number;
  uid: string; // Unique identifier for the order
  currency: Currency;
  customer?: Customer;
  billing_plan?: any | null;
  order_detail?: Record<string, any>;
  transactions?: any[];
  order_lines: OrderLineItem[];
  merchant: Merchant;
  created_at: string;
  updated_at: string;
}

export interface Address {
  street?: string;
  street_optional?: string;
  town?: string;
  city?: string;
  state?: string;
  region?: string;
  country?: string;
  postal_code?: string;
}

// TypeScript Interface for Order Create API Request

interface OrderProduct {
  id: number;
  quantity: number;
  [key: string]: any; // Allow other product properties from cart
}

export interface OrderCreateRequest {
  // Core fields
  reference_id?: string; // Auto-generated if not provided
  kind: string;
  total?: number;
  currency_code: string; // Required

  // Customer information
  customer?: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
  };

  // Products
  products?: OrderProduct[];

  // Payment
  method_id?: string;

  data?: {
    // Shipping address (for delivery)
    shipping_address?: Address;
    // Fulfillment
    fulfillment_type?: 'delivery' | 'pickup';
    pickup_location?: string;
  };

  // Optional payment link reference
  payment_link_id?: string;
}

// Local cart types (for SDK storage)
export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  total_items: number;
  created_at: string;
  updated_at: string;
}

export interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  price: number;
}

// Cart types (updated to match OpenAPI spec)
export interface RemoteCart {
  id: string;
  user_id: number;
  session_id?: string;
  data: CartData;
  created_at: string;
  updated_at: string;
}

export interface CartData {
  total: number;
  items: CartLineItem[];
  quantity: number;
}

export interface CartLineItem {
  product_id: number;
  variant_id?: number;
  quantity: number;
  unit_price: number;
  product?: Partial<Product>;
}

export interface CartInput {
  user_id: number;
  data: CartDataInput;
}

export interface CartDataInput {
  total: number;
  items: CartLineInput[];
  quantity: number;
}

export interface CartLineInput {
  product_id: number;
  variant_id?: number;
  quantity: number;
  unit_price: number;
}

// Wishlist types (for local storage)
export interface WishlistItem {
  id: string;
  product: Product;
  added_at: string;
}

export interface Wishlist {
  items: WishlistItem[];
  total_items: number;
  updated_at: string;
}

// Event types for SDK event system
export interface StorefrontEvents {
  'cart:item:added': { item: CartItem; cart: Cart };
  'cart:item:removed': { itemId: string; cart: Cart };
  'cart:item:updated': { item: CartItem; cart: Cart };
  'cart:cleared': { cart: Cart };
  'checkout:started': { cart: Cart };
  'wishlist:item:added': { item: WishlistItem; wishlist: Wishlist };
  'wishlist:item:removed': { itemId: string; wishlist: Wishlist };
  'wishlist:cleared': { wishlist: Wishlist };
  'customer:authenticated': { customer: Customer; token: string };
  'customer:logout': Record<string, never>;
}

// Search and filter types
export interface ProductSearchParams extends PaginationParams {
  search?: string;
  q?: string;
  category_id?: number;
  min_price?: number;
  max_price?: number;
  in_stock?: boolean;
  [key: string]: any; // Allow additional filters
}

// Configuration & error types (re-exported from client).
// InkressApiError is a class and is value-exported from the package root.
export type { StorefrontConfig, ApiResponse, ErrorResponse, SdkMode } from './client';

// Generic types for key-value store
export interface Generic {
  id: string;
  key: string;
  kind: number;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface GenericInput {
  key: string;
  kind: number;
  data: Record<string, any>;
}

export interface ListGenericsParams extends PaginationParams {
  key?: string;
  kind?: number;
  sort?: 'name' | 'size' | 'created_at' | 'updated_at' | 'content_type';
  order?: 'asc' | 'desc';
}

// Review types
export interface Review {
  id: number;
  parent_id: number;
  customer_id: number;
  rating: number;
  body?: string;
  created_at: string;
  updated_at: string;
}

export interface ReviewInput {
  parent_id: number;
  rating: number;
  body?: string;
}

export interface ReviewListParams extends PaginationParams {
  parent_id?: number;
  customer_id?: number;
  rating?: number;
  sort?: 'rating' | 'helpful_count' | 'created_at' | 'updated_at';
  order?: 'asc' | 'desc';
}

export interface ReviewStats {
  total_reviews: number;
  average_rating: number;
  rating_distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

// Shipping/Delivery types (based on actual API schema)
export interface ShippingMethod {
  id: number;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface ShippingMethodInput {
  name: string;
  description?: string;
}

export interface ShippingArea {
  id: number;
  name: string;
  hour_end?: number;
  hour_start?: number;
  parent_id?: number; // Shipping Method Id
  postal_code?: string;
  created_at: string;
  updated_at: string;
}

export interface ShippingAreaInput {
  name: string;
  hour_end?: number;
  hour_start?: number;
  parent_id?: number;
  postal_code?: string;
}


export interface ShippingMethodArea {
  id: number;
  eta: number; // Estimated time of arrival in minutes
  exclude?: boolean; // Optional, used for exclusions
  price?: number; // Optional price for the area
 
  shipping_method_id: number;
  shipping_method: ShippingMethod;

  shipping_area_id: number;
  shipping_area: ShippingArea;

  created_at: string;
  updated_at: string;

}

export interface ShippingMethodAreaInput {
  eta?: number;
  exclude?: boolean;
  price?: number;
}


export interface ShippingMethodDay {
  id: number;
  day: number;
  exclude: boolean;
  shipping_method_id: number;
  shipping_method: ShippingMethod;
  created_at: string;
  updated_at: string;

}

export interface ShippingMethodDayInput {
  day?: number;
  exclude: boolean;
  shipping_method_id?: number;
}


export interface ShippingMethodsParams extends PaginationParams {
  name?: string;
  description?: string;
  status?: number;
}


// Note: Query parameter capabilities based on filters.ex analysis:
// - Range filters: field_min, field_max
// - Array filters: field_in (comma-separated values)
// - Substring filters: contains.field (searches within text fields)
// - Date filters: before.field, after.field, on.field
// - JSON field queries: Complex nested filtering on JSON fields
// - Exclusion: exclude parameter
// - Exact match: Direct field name equals value
// - Ordering: "field_name direction" format (e.g., "created_at desc")

// ---------------------------------------------------------------------------
// Addresses (saved customer addresses — `/addresses` resource)
// ---------------------------------------------------------------------------

/**
 * A persisted address record from the `/addresses` resource. (Distinct from the
 * loose {@link Address} value object used inline in order/checkout payloads.)
 * The owner is polymorphic via `kind` (owner type) + `kind_id` (owner id) — for
 * a storefront customer, `kind_id` is their customer id.
 */
export interface SavedAddress {
  id: number;
  hash?: string;
  kind: number;
  kind_id: number;
  street: string;
  street_optional?: string;
  city: string;
  state: string;
  country: string;
  region?: string;
  town?: string;
  postal_code?: string;
  lat?: number;
  /** Longitude (the API field is misnamed `lang`). */
  lang?: number;
  inserted_at?: string;
  updated_at?: string;
}

export interface AddressInput {
  kind: number;
  kind_id: number;
  street: string;
  street_optional?: string;
  city: string;
  state: string;
  country: string;
  region?: string;
  town?: string;
  postal_code?: string;
  lat?: number;
  lang?: number;
}

export interface AddressListParams extends PaginationParams {
  kind?: number;
  kind_id?: number;
  country?: string;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Product custom fields (variants / options / attributes)
// ---------------------------------------------------------------------------

export type ProductCustomFieldType = 'text' | 'number' | 'options' | 'image' | 'file';

export interface ProductCustomFieldOption {
  label: string;
  price: number;
}

/**
 * A product custom field as authored in the merchant product form and stored in
 * `product.data`. `type: 'options'` carries a list of `{ label, price }`
 * choices; other types carry a single add-on `price` charged when filled.
 */
export interface ProductCustomField {
  name: string;
  type: ProductCustomFieldType;
  value?: string;
  price?: number;
  options?: ProductCustomFieldOption[];
}

/**
 * A customer's selection for one custom field, used by unit-price calculation.
 * For `type: 'options'` set `option` to the chosen option's label; for other
 * input types set `filled: true` when the customer provided a value (which
 * triggers the field's add-on `price`).
 */
export interface CustomFieldSelection {
  name: string;
  option?: string;
  filled?: boolean;
}

/** A fresh stock snapshot for a product. */
export interface ProductStock {
  inStock: boolean;
  unlimited: boolean;
  /** `null` when the product is unlimited. */
  unitsRemaining: number | null;
}

// ---------------------------------------------------------------------------
// Faceted search (server-side `group_by` on `/products`)
// ---------------------------------------------------------------------------

export type ProductGroupByField =
  | 'category_id'
  | 'currency_id'
  | 'status'
  | 'public'
  | 'unlimited';

/** Product fields the API allows `group_by` faceting on (see product.ex). */
export const PRODUCT_GROUP_BY_FIELDS: ProductGroupByField[] = [
  'category_id',
  'currency_id',
  'status',
  'public',
  'unlimited',
];

/** One row of a faceted (`group_by`) product query. */
export interface FacetBucket {
  /** The group-by field this bucket is keyed on (the first requested field). */
  field: ProductGroupByField;
  /** The distinct value of `field` for this bucket. */
  value: string | number | boolean | null;
  /** Number of products in the bucket (the `id` count aggregate). */
  count: number;
  priceMin?: number;
  priceMax?: number;
  priceAvg?: number;
  unitsRemainingSum?: number;
  /** All aggregate/group columns exactly as returned by the API. */
  raw: Record<string, any>;
}

export interface ProductFacetsOptions {
  /** One or more whitelisted group-by fields (see {@link PRODUCT_GROUP_BY_FIELDS}). */
  groupBy: ProductGroupByField | ProductGroupByField[];
}
