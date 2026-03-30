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
});
