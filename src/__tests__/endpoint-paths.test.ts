/**
 * Regression guards for endpoint paths that were previously wrong:
 *  - auth profile/password hit `/users/profile` + `/users/password` (no such routes)
 *  - files.upload hit `/files/upload` (real path is `/files/pubload`)
 *  - wishlist remote sync hit `/generis` (typo for `/generics`)
 * See CHANGELOG 1.1.1.
 */
import { HttpClient } from '../client';
import { AuthResource } from '../resources/auth';
import { FilesResource } from '../resources/files';
import { GenericsResource } from '../resources/generics';
import { WishlistResource } from '../resources/wishlist';
import { StorageManager } from '../storage';
import { EventEmitter } from '../events';
import type { Wishlist } from '../types';

const fetchMock = fetch as unknown as jest.Mock & {
  mockResponseOnce: (body: string, init?: { status?: number }) => void;
  resetMocks: () => void;
};

const calls = () => fetchMock.mock.calls;
const urls = () => calls().map((c) => c[0] as string);
const lastUrl = () => urls()[urls().length - 1];
const lastInit = () => calls()[calls().length - 1][1] as RequestInit;
const okItem = (item: any) => JSON.stringify({ state: 'ok', result: item });
const okList = () => JSON.stringify({ state: 'ok', result: { pagination: {}, entries: [] } });

let client: HttpClient;
beforeEach(() => {
  fetchMock.resetMocks();
  client = new HttpClient({ merchantUsername: 'acme', authToken: 'tok' });
});

describe('AuthResource endpoint paths', () => {
  it('getProfile(id) hits GET /users/:id (not /users/profile)', async () => {
    fetchMock.mockResponseOnce(okItem({ id: 42, email: 'a@b.com' }));
    await new AuthResource(client).getProfile(42);
    expect(lastUrl()).toContain('/api/v1/users/42');
    expect(lastUrl()).not.toContain('/users/profile');
    expect(lastInit().method).toBe('GET');
  });

  it('updateProfile(id, updates) PUTs /users/:id', async () => {
    fetchMock.mockResponseOnce(okItem({ id: 42 }));
    await new AuthResource(client).updateProfile(42, { first_name: 'Jane' });
    expect(lastUrl()).toContain('/api/v1/users/42');
    expect(lastInit().method).toBe('PUT');
    expect(JSON.parse(lastInit().body as string)).toEqual({ first_name: 'Jane' });
  });

  it('changePassword(id, pw) PUTs the new password to /users/:id (no current_password)', async () => {
    fetchMock.mockResponseOnce(okItem({ id: 42 }));
    await new AuthResource(client).changePassword(42, 'new-secret');
    expect(lastUrl()).toContain('/api/v1/users/42');
    expect(lastInit().method).toBe('PUT');
    expect(JSON.parse(lastInit().body as string)).toEqual({ password: 'new-secret' });
  });

  it('validateToken() resolves true on 200 and false on 401', async () => {
    fetchMock.mockResponseOnce('', { status: 200 });
    await expect(new AuthResource(client).validateToken()).resolves.toBe(true);
    expect(lastUrl()).toContain('/api/v1/auth/valid');

    fetchMock.mockResponseOnce('', { status: 401 });
    await expect(new AuthResource(client).validateToken()).resolves.toBe(false);
  });
});

describe('FilesResource endpoint paths', () => {
  it('upload() POSTs to /files/pubload with the file field', async () => {
    fetchMock.mockResponseOnce(okItem({ id: 'f1' }));
    await new FilesResource(client).upload(new Blob(['x'], { type: 'text/plain' }), { filename: 'a.txt' });
    expect(lastUrl()).toContain('/api/v1/files/pubload');
    expect(lastUrl()).not.toContain('/files/upload');
    expect(lastInit().method).toBe('POST');
    expect(lastInit().body).toBeInstanceOf(FormData);
  });
});

describe('WishlistResource remote sync', () => {
  const makeWishlist = () => {
    const storage = new StorageManager('inkress-test').createStorage<Wishlist>('wishlist');
    return new WishlistResource(storage, new EventEmitter(), new GenericsResource(client), 7);
  };

  it('saveToRemote upserts through /generics (never /generis)', async () => {
    fetchMock.mockResponseOnce(okList()); // getByKey -> list (no existing)
    fetchMock.mockResponseOnce(okItem({ id: 'g1' })); // create
    await makeWishlist().syncToRemote();
    const all = urls().join(' | ');
    expect(all).toContain('/api/v1/generics');
    expect(all).not.toContain('/generis');
    expect(all).toContain('key=wishlist_7');
  });

  it('syncFromRemote reads the stored wishlist via /generics', async () => {
    const stored = { items: [], total_items: 0, updated_at: '2026-01-01T00:00:00Z' };
    fetchMock.mockResponseOnce(
      JSON.stringify({ state: 'ok', result: { pagination: {}, entries: [{ id: 'g1', key: 'wishlist_7', kind: 2, data: stored }] } })
    );
    const result = await makeWishlist().syncFromRemote();
    expect(lastUrl()).toContain('/api/v1/generics');
    expect(result).toMatchObject({ total_items: 0 });
  });
});
