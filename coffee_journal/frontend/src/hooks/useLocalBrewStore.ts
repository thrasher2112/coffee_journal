import { useMemo, useSyncExternalStore } from 'react';
import type { BrewDraft, LocalBrew } from '../types';

const STORAGE_KEY = 'coffee-journal-local-brews';

function load(): LocalBrew[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalBrew[];
  } catch (error) {
    console.error('Failed to parse local brews', error);
    return [];
  }
}

function persist(data: LocalBrew[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let store: LocalBrew[] = load();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const emit = () => {
  persist(store);
  listeners.forEach((listener) => listener());
};

function updateStore(updater: (current: LocalBrew[]) => LocalBrew[]) {
  store = updater(store);
  emit();
}

export function useLocalBrewStore() {
  const brews = useSyncExternalStore(subscribe, () => store, () => []);
  const unsynced = useMemo(() => brews.filter((brew) => !brew.synced), [brews]);

  const addBrew = (draft: BrewDraft) => {
    const entry: LocalBrew = {
      ...draft,
      local_id: crypto.randomUUID(),
      synced: false,
      created_at: new Date().toISOString()
    };
    updateStore((prev) => [entry, ...prev]);
    return entry;
  };

  const markSynced = (localIds: string[]) => {
    updateStore((prev) =>
      prev.map((brew) => (localIds.includes(brew.local_id) ? { ...brew, synced: true } : brew))
    );
  };

  const importLocal = (payload: LocalBrew[]) => {
    updateStore((prev) => {
      const existingKeys = new Set(prev.map((brew) => brew.local_id ?? brew.created_at));
      const incoming = payload.map((brew) => ({
        ...brew,
        local_id: brew.local_id ?? crypto.randomUUID()
      }));
      const deduped = incoming.filter((brew) => !existingKeys.has(brew.local_id ?? brew.created_at));
      return [...deduped, ...prev];
    });
  };

  return {
    brews,
    unsynced,
    addBrew,
    markSynced,
    importLocal
  };
}
