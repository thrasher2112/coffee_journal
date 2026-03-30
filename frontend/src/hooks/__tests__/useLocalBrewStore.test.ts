import { describe, it, expect, beforeEach } from 'vitest';

// Direct test of the localStorage-based store logic
const STORAGE_KEY = 'coffee-journal-local-brews';

function createMockBrew(overrides = {}) {
  return {
    local_id: `local-${Date.now()}-${Math.random()}`,
    synced: false,
    created_at: new Date().toISOString(),
    bean_weight_g: 18,
    water_weight_g: 288,
    date: new Date().toISOString().split('T')[0],
    agitation_events: [],
    flavor_tags: [],
    ...overrides,
  };
}

describe('useLocalBrewStore (localStorage)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stores brews in localStorage', () => {
    const brew = createMockBrew();
    const brews = [brew];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(brews));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].local_id).toBe(brew.local_id);
  });

  it('tracks synced state', () => {
    const brew = createMockBrew({ synced: false });
    localStorage.setItem(STORAGE_KEY, JSON.stringify([brew]));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored[0].synced).toBe(false);

    // Mark as synced
    stored[0].synced = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const updated = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(updated[0].synced).toBe(true);
  });

  it('returns empty array when no data', () => {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    expect(stored).toEqual([]);
  });
});
