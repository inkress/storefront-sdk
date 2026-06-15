import { processQuery } from '../utils/query-transformer';
import {
  ProductQueryBuilder,
  CategoryQueryBuilder,
  OrderQueryBuilder,
  ReviewQueryBuilder,
  type Queryable,
} from '../utils/query-builders';

// A fake resource that records the params it was queried with.
function makeResource<T>() {
  const calls: any[] = [];
  const resource: Queryable<T> = {
    query: async (params?: any) => {
      calls.push(params);
      return { state: 'ok', result: { pagination: {}, entries: [] } as any };
    },
  };
  return { resource, calls };
}

describe('processQuery transform', () => {
  it('expands range objects to _min/_max', () => {
    expect(processQuery({ price: { min: 10, max: 100 } })).toEqual({ price_min: 10, price_max: 100 });
  });

  it('expands arrays to _in', () => {
    expect(processQuery({ category_id: [1, 2, 3] })).toEqual({ category_id_in: [1, 2, 3] });
  });

  it('expands contains to contains.<field>', () => {
    expect(processQuery({ title: { contains: 'shirt' } })).toEqual({ 'contains.title': 'shirt' });
  });

  it('expands date ranges to after./before.<field>', () => {
    expect(processQuery({ created_at: { after: '2026-01-01', before: '2026-02-01' } })).toEqual({
      'after.created_at': '2026-01-01',
      'before.created_at': '2026-02-01',
    });
  });

  it('passes special fields (page/page_size/order_by/q) through untouched', () => {
    expect(processQuery({ page: 2, page_size: 20, order_by: 'created_at desc', q: 'red' })).toEqual({
      page: 2,
      page_size: 20,
      order_by: 'created_at desc',
      q: 'red',
    });
  });

  it('drops null/undefined values', () => {
    expect(processQuery({ a: null, b: undefined, c: 5 })).toEqual({ c: 5 });
  });
});

describe('query builders', () => {
  it('ProductQueryBuilder builds the expected transformed query', () => {
    const { resource } = makeResource();
    const built = new ProductQueryBuilder(resource as any)
      .whereStatus('published')
      .wherePriceRange(10, 100)
      .whereTitleContains('shirt')
      .wherePublic(true)
      .paginate(1, 20)
      .orderBy('created_at', 'desc')
      .build();

    expect(built).toMatchObject({
      status: 'published',
      price_min: 10,
      price_max: 100,
      'contains.title': 'shirt',
      public: true,
      page: 1,
      page_size: 20,
      order_by: 'created_at desc',
    });
  });

  it('ProductQueryBuilder.execute passes the RAW query to the resource', async () => {
    const { resource, calls } = makeResource();
    await new ProductQueryBuilder(resource as any).whereCategory([1, 2]).execute();
    // execute() passes the raw (pre-transform) query; the resource transforms it.
    expect(calls[0]).toEqual({ category_id: [1, 2] });
  });

  it('CategoryQueryBuilder.whereRootOnly filters parent_id = null', () => {
    const { resource } = makeResource();
    const built = new CategoryQueryBuilder(resource as any).whereRootOnly().build();
    // null is dropped by the transform — root filter relies on the API default.
    expect(built.parent_id).toBeUndefined();
    expect(new CategoryQueryBuilder(resource as any).whereRootOnly().getRawQuery()).toEqual({
      parent_id: null,
    });
  });

  it('OrderQueryBuilder builds status_in + total range + date range', () => {
    const { resource } = makeResource();
    const built = new OrderQueryBuilder(resource as any)
      .whereStatus(['completed', 'refunded'])
      .whereTotalRange(100, 1000)
      .whereCreatedBetween('2026-01-01', '2026-03-01')
      .build();
    expect(built).toMatchObject({
      status_in: ['completed', 'refunded'],
      total_min: 100,
      total_max: 1000,
      'after.created_at': '2026-01-01',
      'before.created_at': '2026-03-01',
    });
  });

  it('ReviewQueryBuilder builds product + min-rating filters', () => {
    const { resource } = makeResource();
    const built = new ReviewQueryBuilder(resource as any).whereProduct(123).whereMinRating(4).build();
    expect(built).toMatchObject({ parent_id: 123, rating_min: 4 });
  });
});
