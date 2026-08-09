import type {
  Product,
  ProductCustomField,
  ProductGroupByField,
  CustomFieldSelection,
  ProductStock,
  FacetBucket,
} from '../types';

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
export function getProductAttributes(product: Product): ProductCustomField[] {
  const data = (product.data ?? {}) as Record<string, unknown>;
  if (Array.isArray(data.attributes)) {
    return data.attributes as ProductCustomField[];
  }
  return mergedCustomFields(product).filter((f) => f.type !== 'options' && hasValue(f));
}

/**
 * Customer-fillable inputs (`options` choices + other prompts).
 *
 * Canonical read shape is `product.data.customer_inputs` (what the marketplace
 * reads). Falls back to deriving from a merged `custom_fields` array.
 */
export function getProductCustomerInputs(product: Product): ProductCustomField[] {
  const data = (product.data ?? {}) as Record<string, unknown>;
  if (Array.isArray(data.customer_inputs)) {
    return data.customer_inputs as ProductCustomField[];
  }
  return mergedCustomFields(product).filter((f) => f.type === 'options' || !hasValue(f));
}

/**
 * All of a product's custom fields (attributes + customer inputs).
 *
 * Prefers the canonical marketplace shape (`data.attributes` +
 * `data.customer_inputs`); falls back to the write-payload `custom_fields` array.
 */
export function getProductCustomFields(product: Product): ProductCustomField[] {
  const data = (product.data ?? {}) as Record<string, unknown>;
  const attributes = Array.isArray(data.attributes) ? (data.attributes as ProductCustomField[]) : undefined;
  const customerInputs = Array.isArray(data.customer_inputs)
    ? (data.customer_inputs as ProductCustomField[])
    : undefined;
  if (attributes || customerInputs) {
    return [...(attributes ?? []), ...(customerInputs ?? [])];
  }
  return mergedCustomFields(product);
}

function hasValue(field: ProductCustomField): boolean {
  return field.value != null && field.value !== '';
}

/**
 * The merchant form's write payload: a single `custom_fields` array, found
 * top-level or under `data`. Used only as a fallback for records that carry the
 * write shape rather than the marketplace read shape.
 */
function mergedCustomFields(product: Product): ProductCustomField[] {
  if (Array.isArray(product.custom_fields)) {
    return product.custom_fields;
  }
  const data = (product.data ?? {}) as Record<string, unknown>;
  if (Array.isArray(data.custom_fields)) {
    return data.custom_fields as ProductCustomField[];
  }
  return [];
}

/**
 * Compute a product's unit price for a set of customer selections.
 *
 * Starts from `product.price` and adds: the chosen option's price for each
 * `type: 'options'` field, and the field's add-on `price` for each other input
 * the customer filled (`filled: true`). Unknown field names are ignored.
 */
export function computeProductUnitPrice(
  product: Product,
  selections: CustomFieldSelection[] = [],
): number {
  const fields = getProductCustomFields(product);
  let total = product.price || 0;

  for (const selection of selections) {
    const field = fields.find((f) => f.name === selection.name);
    if (!field) continue;

    if (field.type === 'options') {
      const option = (field.options ?? []).find((o) => o.label === selection.option);
      if (option) total += option.price || 0;
    } else if (selection.filled) {
      total += field.price || 0;
    }
  }

  return total;
}

/** Whether a product is purchasable: unlimited, or has remaining units. */
export function isProductInStock(product: Product): boolean {
  return Boolean(product.unlimited) || (product.units_remaining ?? 0) > 0;
}

/** Available units, or `null` when the product is unlimited. */
export function getProductAvailableStock(product: Product): number | null {
  if (product.unlimited) return null;
  return product.units_remaining ?? 0;
}

/** Derive a {@link ProductStock} snapshot from a product record. */
export function toProductStock(product: Product): ProductStock {
  return {
    inStock: isProductInStock(product),
    unlimited: Boolean(product.unlimited),
    unitsRemaining: getProductAvailableStock(product),
  };
}

/**
 * Normalize one grouped-query row into a {@link FacetBucket}. Aggregate columns
 * come back named `"<column>_<fn>"` (e.g. `id_count`, `price_min`).
 */
export function normalizeFacetRow(
  row: Record<string, any>,
  field: ProductGroupByField,
): FacetBucket {
  const num = (v: unknown): number | undefined =>
    v == null || v === '' ? undefined : Number(v);

  return {
    field,
    value: row[field] ?? null,
    count: Number(row.id_count ?? row.count ?? 0),
    priceMin: num(row.price_min),
    priceMax: num(row.price_max),
    priceAvg: num(row.price_avg),
    unitsRemainingSum: num(row.units_remaining_sum),
    raw: row,
  };
}
