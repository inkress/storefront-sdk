import { HttpClient } from '../client';

const fetchMock = fetch as unknown as jest.Mock & {
  mockResponseOnce: (body: string | (() => Promise<any>), init?: any) => void;
  resetMocks: () => void;
};

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
const lastInit = () => lastCall()[1] as RequestInit;
const lastHeaders = () => lastInit().headers as Record<string, string>;

describe('HttpClient', () => {
  beforeEach(() => fetchMock.resetMocks());

  it('resolves the live endpoint by default', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: {} }));
    const client = new HttpClient();
    await client.get('/merchants');
    expect(lastCall()[0]).toBe('https://api.inkress.com/api/v1/merchants');
  });

  it('resolves the sandbox endpoint in sandbox mode', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: {} }));
    const client = new HttpClient({ mode: 'sandbox' });
    await client.get('/merchants');
    expect(lastCall()[0]).toBe('https://api-dev.inkress.com/api/v1/merchants');
  });

  it('sends Client-Id for a merchant username', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: {} }));
    const client = new HttpClient({ merchantUsername: 'acme' });
    await client.get('/products');
    expect(lastHeaders()['Client-Id']).toBe('m-acme');
    expect(lastHeaders()['Authorization']).toBeUndefined();
  });

  it('sends a Bearer token when authenticated', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: {} }));
    const client = new HttpClient({ authToken: 'tok_abc' });
    await client.get('/orders');
    expect(lastHeaders()['Authorization']).toBe('Bearer tok_abc');
  });

  it('serializes query params and skips null/undefined', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: {} }));
    const client = new HttpClient();
    await client.get('/products', { q: 'shoes', page: 2, empty: undefined, none: null });
    const url = lastCall()[0] as string;
    expect(url).toContain('q=shoes');
    expect(url).toContain('page=2');
    expect(url).not.toContain('empty');
    expect(url).not.toContain('none');
  });

  it('unwraps the ApiResponse envelope', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: { id: 7 } }));
    const client = new HttpClient();
    const res = await client.get<{ id: number }>('/products/7');
    expect(res.state).toBe('ok');
    expect(res.result).toEqual({ id: 7 });
  });

  it('throws InkressApiError on non-2xx', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ message: 'nope' }), { status: 404 });
    const client = new HttpClient();
    await expect(client.get('/missing')).rejects.toMatchObject({
      name: 'InkressApiError',
      status: 404,
    });
  });

  it('getConfig strips the auth token but exposes resolved endpoints', () => {
    const client = new HttpClient({ authToken: 'secret', mode: 'sandbox' });
    const cfg = client.getConfig() as any;
    expect(cfg.authToken).toBeUndefined();
    expect(cfg.endpoint).toBe('https://api-dev.inkress.com');
    expect(cfg.siteUrl).toBe('https://dev.inkress.com');
  });

  it('updateConfig recomputes endpoints on a mode switch', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: {} }));
    const client = new HttpClient({ mode: 'live' });
    client.updateConfig({ mode: 'sandbox' });
    await client.get('/ping');
    expect(lastCall()[0]).toBe('https://api-dev.inkress.com/api/v1/ping');
    expect(client.getSiteUrl()).toBe('https://dev.inkress.com');
  });

  it('preserves a custom endpoint across a non-mode updateConfig', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: {} }));
    const client = new HttpClient({ endpoint: 'https://self.example.com' });
    client.updateConfig({ authToken: 'tok' });
    await client.get('/ping');
    expect(lastCall()[0]).toBe('https://self.example.com/api/v1/ping');
  });

  it('preserves a custom endpoint when the same mode is passed explicitly', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ state: 'ok', result: {} }));
    const client = new HttpClient({ mode: 'live', endpoint: 'https://self.example.com' });
    client.updateConfig({ mode: 'live' }); // same mode — must NOT discard the override
    await client.get('/ping');
    expect(lastCall()[0]).toBe('https://self.example.com/api/v1/ping');
  });

  it('rejects with InkressApiError(status 0) when the request times out', async () => {
    // Respond slower than the 5ms timeout so the timer wins the race.
    fetchMock.mockResponseOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(JSON.stringify({ state: 'ok' })), 80))
    );
    const client = new HttpClient({ timeout: 5 });
    await expect(client.get('/slow')).rejects.toMatchObject({
      name: 'InkressApiError',
      status: 0,
    });
  });
});
