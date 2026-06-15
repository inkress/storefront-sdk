/**
 * Typed query system — fluent builders and plain-object queries.
 * Mirrors the @inkress/admin-sdk query API.
 */
import { InkressStorefrontSDK } from '@inkress/storefront-sdk';

const sdk = InkressStorefrontSDK.forMerchant('acme');

async function browse() {
  // Fluent builder
  const builtin = await sdk.products
    .createQueryBuilder()
    .whereStatus('published') // contextual string -> numeric API code
    .wherePriceRange(20, 200) // -> price_min / price_max
    .whereTitleContains('shirt') // -> contains.title
    .whereCategory([3, 4]) // -> category_id_in
    .orderBy('created_at', 'desc')
    .paginate(1, 24)
    .execute();
  console.log(builtin.result?.entries.length);

  // Equivalent plain-object query (same transform + translation)
  const plain = await sdk.products.query({
    status: 'published',
    price: { min: 20, max: 200 },
    public: true,
    page: 1,
    page_size: 24,
  });
  console.log(plain.result?.pagination);

  // Reviews for a product, 4 stars and up
  const reviews = await sdk.reviews.createQueryBuilder().whereProduct(123).whereMinRating(4).execute();
  console.log(reviews.result?.entries);

  // Customer's completed orders (requires auth)
  const orders = await sdk.orders.query({ status: 'completed', total: { min: 50 } });
  console.log(orders.result?.entries);
}

void browse;
