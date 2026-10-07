import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSetups } from '../useSetups';

const api = vi.hoisted(() => ({ fetchSetups: vi.fn() }));
vi.mock('../../lib/api', () => api);

const setup = { id: 's1', name: 'Home', brew_style: 'aeropress', ratio: 8 };

beforeEach(() => {
  api.fetchSetups.mockReset();
});

describe('useSetups', () => {
  it('is empty until the fetch lands, then the list', async () => {
    api.fetchSetups.mockResolvedValue([setup]);
    const { result } = renderHook(() => useSetups());
    expect(result.current).toEqual([]);
    await waitFor(() => expect(result.current).toEqual([setup]));
  });

  it('stays empty when the fetch rejects', async () => {
    api.fetchSetups.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSetups());
    await act(async () => {});
    expect(api.fetchSetups).toHaveBeenCalled();
    expect(result.current).toEqual([]);
  });

  it('stays empty for a non-array response', async () => {
    api.fetchSetups.mockResolvedValue({ detail: 'nope' });
    const { result } = renderHook(() => useSetups());
    await waitFor(() => expect(api.fetchSetups).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toEqual([]);
  });

  it('does not set state after unmount, on resolve or on reject', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolve!: (v: unknown) => void;
    api.fetchSetups.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const first = renderHook(() => useSetups());
    first.unmount();
    resolve([setup]);
    let reject!: (e: unknown) => void;
    api.fetchSetups.mockReturnValueOnce(new Promise((_, r) => (reject = r)));
    const second = renderHook(() => useSetups());
    second.unmount();
    reject(new Error('late'));
    await new Promise((r) => setTimeout(r, 0));
    expect(first.result.current).toEqual([]);
    expect(second.result.current).toEqual([]);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
