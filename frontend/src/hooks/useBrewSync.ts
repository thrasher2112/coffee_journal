import { useCallback, useEffect, useRef } from 'react';
import { syncBrews } from '../lib/api';
import { useLocalBrewStore } from './useLocalBrewStore';
import type { BrewDraft } from '../types';

export interface SyncOutcome {
  /** Brews accepted by the API and marked synced locally. */
  synced: number;
  /** Queued brews held back because they still have no bean assigned. */
  needsBean: number;
  /** The push was attempted and failed (offline, or the API rejected it). */
  failed: boolean;
}

/**
 * Flush locally queued brews to the API.
 *
 * Shared by the manual "Sync now" button and the automatic flush below so both
 * paths apply the same rules - notably that a draft with no bean is reported
 * rather than silently dropped from the queue forever.
 */
export function useBrewSync() {
  const { unsynced, markSynced } = useLocalBrewStore();
  const inFlight = useRef(false);

  const syncNow = useCallback(async (): Promise<SyncOutcome> => {
    const ready = unsynced.filter((brew) => Boolean(brew.bean_id));
    const needsBean = unsynced.length - ready.length;

    if (!ready.length || inFlight.current) {
      return { synced: 0, needsBean, failed: false };
    }

    inFlight.current = true;
    try {
      const queue = ready.map(({ local_id, synced, created_at, ...rest }) => ({
        localId: local_id,
        payload: { ...rest, bean_id: rest.bean_id! } as BrewDraft
      }));
      await syncBrews(queue.map((item) => item.payload));
      markSynced(queue.map((item) => item.localId));
      return { synced: queue.length, needsBean, failed: false };
    } catch {
      return { synced: 0, needsBean, failed: true };
    } finally {
      inFlight.current = false;
    }
  }, [unsynced, markSynced]);

  return { syncNow, unsyncedCount: unsynced.length };
}

/**
 * Drain the queue on its own, so a brew logged in a basement cafe lands as soon
 * as signal returns. Previously this only ever happened if you remembered to
 * open Settings and press "Sync now".
 */
export function useAutoSync() {
  const { syncNow } = useBrewSync();

  useEffect(() => {
    const flush = () => {
      if (navigator.onLine) void syncNow();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush();
    };

    // Also runs on mount, which picks up anything left over from last session.
    flush();
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncNow]);
}
