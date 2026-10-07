import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to test that fetch is called with credentials: 'include'
// and that 401 responses throw AuthError

describe('api request()', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('includes credentials in fetch calls', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      json: () => Promise.resolve({ items: [], total: 0 }),
    };
    (globalThis.fetch as any).mockResolvedValue(mockResponse);

    // Dynamic import to get functions after mock is set up
    const { fetchBeans } = await import('../api');
    await fetchBeans();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: 'include',
      })
    );
  });

  it('throws AuthError on 401 response', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      json: () => Promise.resolve({ detail: 'Not authenticated' }),
    };
    (globalThis.fetch as any).mockResolvedValue(mockResponse);

    const { fetchBeans, AuthError } = await import('../api');

    await expect(fetchBeans()).rejects.toThrow(AuthError);
  });

  it('returns undefined for 204 responses', async () => {
    const mockResponse = {
      ok: true,
      status: 204,
      json: () => Promise.resolve(undefined),
    };
    (globalThis.fetch as any).mockResolvedValue(mockResponse);

    const { deleteBean } = await import('../api');
    const result = await deleteBean('some-id');
    expect(result).toBeUndefined();
  });

  describe('setups', () => {
    const ok = (status: number, body?: unknown) =>
      (globalThis.fetch as any).mockResolvedValue({
        ok: true,
        status,
        json: () => Promise.resolve(body)
      });

    it('lists, creates, patches and deletes against slash-less relative URLs', async () => {
      const { fetchSetups, createSetup, updateSetup, deleteSetup } = await import('../api');

      ok(200, [{ id: 's1' }]);
      expect(await fetchSetups()).toEqual([{ id: 's1' }]);
      expect((globalThis.fetch as any).mock.calls[0][0]).toBe('/api/setups');

      ok(201, { id: 's2' });
      await createSetup({ name: 'Office', brew_style: 'espresso', ratio: 2.5 });
      let [url, init] = (globalThis.fetch as any).mock.calls[1];
      expect(url).toBe('/api/setups');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({ name: 'Office', brew_style: 'espresso', ratio: 2.5 });

      ok(200, { id: 's2' });
      await updateSetup('s2', { grind_setting: null });
      [url, init] = (globalThis.fetch as any).mock.calls[2];
      expect(url).toBe('/api/setups/s2');
      expect(init.method).toBe('PATCH');
      expect(JSON.parse(init.body)).toEqual({ grind_setting: null });

      ok(204);
      expect(await deleteSetup('s2')).toBeUndefined();
      [url, init] = (globalThis.fetch as any).mock.calls[3];
      expect(url).toBe('/api/setups/s2');
      expect(init.method).toBe('DELETE');
    });

    it('exposes the HTTP status on rejected requests', async () => {
      (globalThis.fetch as any).mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({}) });
      const { createSetup, ApiError } = await import('../api');
      const err = await createSetup({ name: 'x', brew_style: 'espresso', ratio: 2 }).catch((e) => e);
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(409);
    });
  });
});
