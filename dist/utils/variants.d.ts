import type { Product, ProductCustomField, ProductGroupByField, CustomFieldSelection, ProductStock, FacetBucket } from '../types';
/**
 * Pure helpers for product custom fields (variants/options/attributes), stock,
 * and faceted-search parsing. Kept free of the HTTP client so they are easy to
 * test and tree-shake; `ProductsResource` exposes thin wrappers over them.
 */
/**
 * Static product attributes/specs.
 *
 * Canonical read shape — the one `commerce-web`'s marketplace consumes — is
 * `product.data.attributes`. Falls back to deriving from a merged `custom_fields`
 * array (the merchant form's write payload) only when that isn't present.
 */
export declare function getProductAttributes(product: Product): ProductCustomField[];
/**
 * Customer-fillable inputs (`options` choices + other prompts).
 *
 * Canonical read shape is `product.data.customer_inputs` (what the marketplace
 * reads). Falls back to deriving from a merged `custom_fields` array.
 */
export declare function getProductCustomerInputs(product: Product): ProductCustomField[];
/**
 * All of a product's custom fields (attributes + customer inputs).
 *
 * Prefers the canonical marketplace shape (`data.attributes` +
 * `data.customer_inputs`); falls back to the write-payload `custom_fields` array.
 */
export declare function getProductCustomFields(product: Product): ProductCustomField[];
/**
 * Compute a product's unit price for a set of customer selections.
 *
 * Starts from `product.price` and adds: the chosen option's price for each
 * `type: 'options'` field, and the field's add-on `price` for each other input
 * the customer filled (`filled: true`). Unknown field names are ignored.
 */
export declare function computeProductUnitPrice(product: Product, selections?: CustomFieldSelection[]): number;
/** Whether a product is purchasable: unlimited, or has remaining units. */
export declare function isProductInStock(product: Product): boolean;
/** Available units, or `null` when the product is unlimited. */
export declare function getProductAvailableStock(product: Product): number | null;
/** Derive a {@link ProductStock} snapshot from a product record. */
export declare function toProductStock(product: Product): ProductStock;
/**
 * Normalize one grouped-query row into a {@link FacetBucket}. Aggregate columns
 * come back named `"<column>_<fn>"` (e.g. `id_count`, `price_min`).
 */
export declare function normalizeFacetRow(row: Record<string, any>, field: ProductGroupByField): FacetBucket;
//# sourceMappingURL=variants.d.ts.map