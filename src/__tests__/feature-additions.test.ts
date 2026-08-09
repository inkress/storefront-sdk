/**
 * Feature additions (1.1.2): saved addresses, product variants/options, stock, faceted search.
 */
import { HttpClient } from '../client';
import { AddressesResource } from '../resources/addresses';
import { ProductsResource } from '../resources/products';
import {
  getProductCustomFields,
  getProductAttributes,
  getProductCustomerInputs,
  computeProductUnitPrice,
  isProductInStock,
  getProductAvailableStock,
} from '../utils/variants';
import type { Product, ProductCustomField } from '../types';

const fetchMock = fetch as unknown as jest.Mock & {
  mockResponseOnce: (body: string) => void;
  resetMocks: () => void;
};
const calls = () => fetchMock.mock.calls;
const lastUrl = () => calls()[calls().length - 1][0] as string;
const lastInit = () => calls()[calls().length - 1][1] as RequestInit;
const ok = (result: any) => JSON.stringify({ state: 'ok', result });
const okList = (entries: any[]) => JSON.stringify({ state: 'ok', result: { pagination: {}, entries } });

let client: HttpClient;
beforeEach(() => {
  fetchMock.resetMocks();
  client = new HttpClient({ merchantUsername: 'acme', authToken: 'tok' });
});

// --- test product factory -------------------------------------------------
const OPT_FIELD: ProductCustomField = {
  name: 'Size',
  type: 'options',
  options: [
    { label: 'Small', price: 0 },
    { label: 'Large', price: 5 },
  ],
};
const GIFT_INPUT: ProductCustomField = { name: 'Gift note', type: 'text', price: 2 };
const MATERIAL_ATTR: ProductCustomField = { name: 'Material', type: 'text', value: 'Cotton' };

const makeProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: 1,
    title: 'Tee',
    price: 20,
    permalink: 'tee',
    status: 2,
    public: true,
    unlimited: false,
    units_remaining: 3,
    tag_ids: [],
    currency: {} as any,
    merchant: {} as any,
    created_at: '',
    updated_at: '',
    ...overrides,
  }) as Product;

describe('AddressesResource', () => {
  it('CRUD hits /addresses and /addresses/:id', async () => {
    fetchMock.mockResponseOnce(okList([]));
    await new AddressesResource(client).list();
    expect(lastUrl()).toContain('/api/v1/addresses');

    fetchMock.mockResponseOnce(ok({ id: 9 }));
    await new AddressesResource(client).get(9);
    expect(lastUrl()).toContain('/api/v1/addresses/9');

    fetchMock.mockResponseOnce(ok({ id: 10 }));
    await new AddressesResource(client).create({
      kind: 1, kind_id: 42, street: '1 Main', city: 'Kingston', state: 'KSA', country: 'JM',
    });
    expect(lastUrl()).toContain('/api/v1/addresses');
    expect(lastInit().method).toBe('POST');

    fetchMock.mockResponseOnce(ok({ id: 10 }));
    await new AddressesResource(client).update(10, { city: 'Montego Bay' });
    expect(lastUrl()).toContain('/api/v1/addresses/10');
    expect(lastInit().method).toBe('PUT');

    fetchMock.mockResponseOnce(ok(null));
    await new AddressesResource(client).delete(10);
    expect(lastInit().method).toBe('DELETE');
  });

  it('listForCustomer scopes by kind_id', async () => {
    fetchMock.mockResponseOnce(okList([]));
    await new AddressesResource(client).listForCustomer(42);
    expect(lastUrl()).toContain('kind_id=42');
  });
});

describe('product custom fields (variants/options)', () => {
  it('reads custom_fields from top-level, data.custom_fields, or data.attributes+customer_inputs', () => {
    const top = makeProduct({ custom_fields: [OPT_FIELD] });
    expect(getProductCustomFields(top)).toHaveLength(1);

    const nested = makeProduct({ data: { custom_fields: [OPT_FIELD, GIFT_INPUT] } });
    expect(getProductCustomFields(nested)).toHaveLength(2);

    const legacy = makeProduct({ data: { attributes: [MATERIAL_ATTR], customer_inputs: [OPT_FIELD] } });
    expect(getProductCustomFields(legacy)).toHaveLength(2);
  });

  it('reads the canonical marketplace shape (data.attributes / data.customer_inputs) directly', () => {
    // This is exactly what commerce-web's marketplace loader consumes.
    const p = makeProduct({ data: { attributes: [MATERIAL_ATTR], customer_inputs: [OPT_FIELD, GIFT_INPUT] } });
    expect(getProductAttributes(p).map((f) => f.name)).toEqual(['Material']);
    expect(getProductCustomerInputs(p).map((f) => f.name)).toEqual(['Size', 'Gift note']);
    expect(getProductCustomFields(p)).toHaveLength(3);
  });

  it('falls back to splitting a merged custom_fields array (write payload) like the form', () => {
    const p = makeProduct({ custom_fields: [MATERIAL_ATTR, OPT_FIELD, GIFT_INPUT] });
    expect(getProductAttributes(p).map((f) => f.name)).toEqual(['Material']);
    // options-type OR no value -> customer inputs
    expect(getProductCustomerInputs(p).map((f) => f.name)).toEqual(['Size', 'Gift note']);
  });

  it('computes unit price from base + selected option + filled add-on', () => {
    const p = makeProduct({ price: 20, custom_fields: [OPT_FIELD, GIFT_INPUT] });
    expect(computeProductUnitPrice(p, [])).toBe(20);
    expect(computeProductUnitPrice(p, [{ name: 'Size', option: 'Large' }])).toBe(25);
    expect(
      computeProductUnitPrice(p, [
        { name: 'Size', option: 'Large' },
        { name: 'Gift note', filled: true },
      ]),
    ).toBe(27);
    // unknown field + unfilled input contribute nothing
    expect(computeProductUnitPrice(p, [{ name: 'Nope', option: 'x' }, { name: 'Gift note' }])).toBe(20);
  });
});

describe('stock helpers', () => {
  it('isInStock / getAvailableStock respect unlimited and units_remaining', () => {
    expect(isProductInStock(makeProduct({ units_remaining: 3 }))).toBe(true);
    expect(isProductInStock(makeProduct({ units_remaining: 0 }))).toBe(false);
    expect(isProductInStock(makeProduct({ unlimited: true, units_remaining: 0 }))).toBe(true);

    expect(getProductAvailableStock(makeProduct({ units_remaining: 3 }))).toBe(3);
    expect(getProductAvailableStock(makeProduct({ unlimited: true }))).toBeNull();
  });

  it('checkStock re-fetches the product and derives a snapshot', async () => {
    fetchMock.mockResponseOnce(ok({ id: 5, unlimited: false, units_remaining: 7 }));
    const res = await new ProductsResource(client).checkStock(5);
    expect(lastUrl()).toContain('/api/v1/products/5');
    expect(res.result).toEqual({ inStock: true, unlimited: false, unitsRemaining: 7 });
  });
});

describe('faceted search', () => {
  it('facets() sends group_by and normalizes buckets', async () => {
    fetchMock.mockResponseOnce(
      okList([
        { category_id: 3, id_count: 5, price_min: 10, price_max: 99 },
        { category_id: 4, id_count: 2, price_min: 5, price_max: 20 },
      ]),
    );
    const res = await new ProductsResource(client).facets({ status: 'published' }, { groupBy: 'category_id' });
    const url = lastUrl();
    expect(url).toContain('group_by=category_id');
    expect(url).toContain('status=2'); // published -> 2 via translation
    expect(res.result).toEqual([
      expect.objectContaining({ field: 'category_id', value: 3, count: 5, priceMin: 10, priceMax: 99 }),
      expect.objectContaining({ field: 'category_id', value: 4, count: 2 }),
    ]);
  });

  it('facets() rejects a non-whitelisted group_by field', async () => {
    await expect(
      new ProductsResource(client).facets({}, { groupBy: 'title' as any }),
    ).rejects.toThrow(/Unsupported facet group_by/);
  });
});
