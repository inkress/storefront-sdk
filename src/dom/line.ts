/**
 * The isolated DOM ↔ domain boundary.
 *
 * `productFromHook` is the single place a flat set of DOM data attributes becomes
 * a typed SDK `Product`; `toLine` is the inverse, projecting a stored `CartItem`
 * back to the flat FleekSite line shape that theme markup and the `fk:cart` event
 * detail expect. Keeping both here means the rest of the kit speaks only in SDK
 * types or in `FleekLine`, never in raw DOM strings.
 */
import type { CartItem, Product } from '../types';

/** The flat, denormalised cart line the FleekSite kit and themes render from. */
export interface FleekLine {
  variant_id: number;
  post_id: number;
  title: string;
  variant_name: string;
  image: string;
  href: string;
  price: number;
  /** Stock ceiling; `null` when unlimited. */
  max: number | null;
  quantity: number;
  total: number;
}

/** Flat fields read off a buy hook (or a selected `<option>`) in the DOM. */
export interface HookFields {
  variantId: string | null;
  postId?: string | null;
  title?: string | null;
  variantName?: string | null;
  image?: string | null;
  href?: string | null;
  price?: string | null;
  stock?: string | null;
  unlimited?: string | null;
}

/**
 * Build a minimal-but-valid SDK `Product` from flat DOM fields. In V1 the product
 * *is* the buyable unit, so `variant-id` is the product id. Display-only extras that
 * `Product` has no first-class field for (`post_id`, `variant_name`) are stashed in
 * `meta`, where {@link toLine} reads them back. This function is the one sanctioned
 * DOM→domain cast in the kit.
 */
export function productFromHook(fields: HookFields, currencyCode = 'USD'): Product {
  const id = Number(fields.variantId);
  const unlimited = fields.unlimited === '1' || fields.unlimited === 'true';
  const stock = fields.stock == null || fields.stock === '' ? null : Number(fields.stock);
  const now = new Date().toISOString();

  const product = {
    id,
    title: fields.title || '',
    price: Number(fields.price || 0),
    permalink: fields.href || '',
    image: fields.image || null,
    status: 1,
    public: true,
    unlimited,
    units_remaining: unlimited ? null : stock,
    tag_ids: [] as number[],
    currency: { id: 0, code: currencyCode, symbol: '', name: currencyCode },
    meta: {
      post_id: fields.postId != null && fields.postId !== '' ? Number(fields.postId) : id,
      variant_name: fields.variantName || '',
    },
    created_at: now,
    updated_at: now,
    // merchant is required by the Product type but never read by the cart at
    // runtime; the DOM has no merchant data, so it is left minimal.
    merchant: {} as Product['merchant'],
  };

  // Single sanctioned cast at the untyped DOM edge (see file header).
  return product as Product;
}

/** Project a stored cart item back to the flat FleekSite line shape. */
export function toLine(item: CartItem): FleekLine {
  const p = item.product;
  const meta = (p.meta || {}) as Record<string, unknown>;
  const max = p.unlimited ? null : p.units_remaining ?? null;
  return {
    variant_id: p.id,
    post_id: typeof meta.post_id === 'number' ? (meta.post_id as number) : p.id,
    title: p.title,
    variant_name: typeof meta.variant_name === 'string' ? (meta.variant_name as string) : '',
    image: p.image || '',
    href: p.permalink || '',
    price: item.price,
    max,
    quantity: item.quantity,
    total: item.price * item.quantity,
  };
}
