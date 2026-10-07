import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lastSetupKey, readLastSetupId, writeLastSetupId } from '../lastSetup';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('lastSetup', () => {
  it('round-trips per user and removes on null', () => {
    writeLastSetupId('u1', 's1');
    writeLastSetupId('u2', 's2');
    expect(localStorage.getItem(lastSetupKey('u1'))).toBe('s1');
    expect(readLastSetupId('u1')).toBe('s1');
    expect(readLastSetupId('u2')).toBe('s2');
    writeLastSetupId('u1', null);
    expect(readLastSetupId('u1')).toBeNull();
    expect(readLastSetupId('u2')).toBe('s2');
  });

  it('reads and writes nothing without a user id', () => {
    writeLastSetupId(undefined, 's1');
    expect(localStorage.length).toBe(0);
    expect(readLastSetupId(undefined)).toBeNull();
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readLastSetupId('u1')).toBeNull();
    expect(() => writeLastSetupId('u1', 's1')).not.toThrow();
    expect(() => writeLastSetupId('u1', null)).not.toThrow();
  });
});
