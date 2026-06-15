import { HttpClient } from '../client';
import { ProductsResource } from '../resources/products';
import { CategoriesResource } from '../resources/categories';
import { OrdersResource } from '../resources/orders';
import { ReviewsResource } from '../resources/reviews';
import { MerchantsResource } from '../resources/merchants';
import { ShippingResource } from '../resources/shipping';
import { AuthResource } from '../resources/auth';

const fetchMock = fetch as unknown as jest.Mock & {
  mockResponseOnce: (body: string) => void;
  resetMocks: () => void;
};

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
const lastUrl = () => lastCall()[0] as string;
const lastInit = () => lastCall()[1] as RequestInit;
const okList = () => JSON.stringify({ state: 'ok', result: { pagination: {}, entries: [] } });
const okItem = (item: any) => JSON.stringify({ state: 'ok', result: item });

let client: HttpClient;
beforeEach(() => {
  fetchMock.resetMocks();
  client = new HttpClient({ merchantUsername: 'acme' });
});

describe('ProductsResource', () => {
  it('query() transforms ranges and translates status to its numeric code', async () => {
    fetchMock.mockResponseOnce(okList());
    await new ProductsResource(client).query({ status: 'published', price: { min: 20 }, page: 1 });
    const url = lastUrl();
    expect(url).toContain('/api/v1/products?');
    expect(url).toContain('status=2'); // product_published -> 2 (contextual translation)
    expect(url).toContain('price_min=20');
    expect(url).toContain('page=1');
  });

  it('createQueryBuilder().execute() applies the same transform + translation', async () => {
    fetchMock.mockResponseOnce(okList());
    await new ProductsResource(client)
      .createQueryBuilder()
      .whereStatus('published')
      .wherePriceRange(10, 100)
      .whereTitleContains('shirt')
      .execute();
    const url = lastUrl();
    expect(url).toContain('status=2');
    expect(url).toContain('price_min=10');
    expect(url).toContain('price_max=100');
    expect(url).toContain('contains.title=shirt');
  });

  it('get() hits /products/:id', async () => {
    fetchMock.mockResponseOnce(okItem({ id: 7 }));
    const res = await new ProductsResource(client).get(7);
    expect(lastUrl()).toContain('/api/v1/products/7');
    expect(res.result).toEqual({ id: 7 });
  });

  it('query() rejects on an unmapped status string (translation throws)', async () => {
    await expect(new ProductsResource(client).query({ status: 'live' as any })).rejects.toThrow(/Unknown status value/);
  });
});

describe('CategoriesResource', () => {
  it('query() hits /categories and flattens contains filters', async () => {
    fetchMock.mockResponseOnce(okList());
    await new CategoriesResource(client).query({ name: { contains: 'apparel' } });
    const url = decodeURIComponent(lastUrl());
    expect(url).toContain('/api/v1/categories?');
    expect(url).toContain('contains.name=apparel');
  });

  it('createQueryBuilder().whereParent + whereNameContains builds the query', async () => {
    fetchMock.mockResponseOnce(okList());
    await new CategoriesResource(client).createQueryBuilder().whereParent(7).whereNameContains('shoes').execute();
    const url = decodeURIComponent(lastUrl());
    expect(url).toContain('parent_id=7');
    expect(url).toContain('contains.name=shoes');
  });
});

describe('OrdersResource', () => {
  it('query() translates kind but leaves the string status untouched', async () => {
    fetchMock.mockResponseOnce(okList());
    await new OrdersResource(client).query({ status: 'completed', kind: 'online', total: { min: 100 } });
    const url = lastUrl();
    expect(url).toContain('status=completed'); // string status passes through
    expect(url).toContain('kind=1'); // order_online -> 1
    expect(url).toContain('total_min=100');
  });

  it('query() rejects on an unmapped kind string (translation throws)', async () => {
    await expect(new OrdersResource(client).query({ kind: 'teleport' as any })).rejects.toThrow(/Unknown kind value/);
  });

  it('getByReference() unwraps the first entry', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { pagination: {}, entries: [{ id: 9, reference_id: 'R9' }] } }));
    const res = await new OrdersResource(client).getByReference('R9');
    expect(res.result).toMatchObject({ id: 9, reference_id: 'R9' });
  });
});

describe('ReviewsResource', () => {
  it('getByProduct() filters by parent_id', async () => {
    fetchMock.mockResponseOnce(okList());
    await new ReviewsResource(client).getByProduct(123);
    expect(lastUrl()).toContain('/api/v1/reviews?parent_id=123');
  });

  it('createQueryBuilder().whereMinRating builds rating_min', async () => {
    fetchMock.mockResponseOnce(okList());
    await new ReviewsResource(client).createQueryBuilder().whereProduct(123).whereMinRating(4).execute();
    const url = lastUrl();
    expect(url).toContain('parent_id=123');
    expect(url).toContain('rating_min=4');
  });
});

describe('MerchantsResource', () => {
  it('getByUsername() hits the public merchant endpoint', async () => {
    fetchMock.mockResponseOnce(okItem({ username: 'acme' }));
    await new MerchantsResource(client).getByUsername('acme');
    expect(lastUrl()).toContain('/api/v1/public/m?username=acme');
  });
});

describe('ShippingResource', () => {
  it('getCheapestMethod() lists methods and returns the first', async () => {
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'ok', result: { pagination: {}, entries: [{ id: 1, name: 'Standard' }, { id: 2, name: 'Express' }] } })
    );
    const res = await new ShippingResource(client).getCheapestMethod();
    expect(lastUrl()).toContain('/api/v1/shipping_methods');
    expect(res.result).toMatchObject({ id: 1 });
  });
});

describe('AuthResource', () => {
  it('login() POSTs credentials to /auth/login', async () => {
    fetchMock.mockResponseOnce(okItem({ token: 't', customer: { id: 1, email: 'a@b.com' } }));
    await new AuthResource(client).login({ email: 'a@b.com', password: 'pw' });
    expect(lastUrl()).toContain('/api/v1/auth/login');
    expect(lastInit().method).toBe('POST');
    expect(JSON.parse(lastInit().body as string)).toEqual({ email: 'a@b.com', password: 'pw' });
  });
});
