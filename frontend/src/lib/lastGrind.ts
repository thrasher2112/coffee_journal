import type { LastGrind, LocalBrew } from '../types';

/** A grind suggestion: the value, and when/which brew it came from. */
export interface GrindSuggestion {
  grind: string;
  date: string;
  // ISO timestamp the brew was logged at; the tiebreak between same-day brews.
  createdAt?: string;
}

// Grinder names are free text, so "niche zero " and "Niche Zero" are one grinder
// (the API matches the same way).
export const normalizeGrinder = (name: string | undefined | null): string => (name ?? '').trim().toLowerCase();

/**
 * The newest brew still waiting in the offline queue for this bean on this
 * grinder, with a non-blank grind. Entries marked synced are on the server and
 * are the server lookup's business.
 *
 * The queue is not scoped to an account (a known defect tracked elsewhere), but
 * bean ids are per-user UUIDs, so matching on bean_id cannot surface another
 * account's grind for one of your beans in practice. Do not "fix" the scoping here.
 */
export function localLastGrind(
  queue: readonly LocalBrew[],
  beanId: string,
  grinderKey: string
): GrindSuggestion | null {
  let best: GrindSuggestion | null = null;
  for (const brew of queue) {
    const grind = brew.grind_setting?.trim();
    if (brew.synced || !grind || brew.bean_id !== beanId || normalizeGrinder(brew.grinder_name) !== grinderKey) {
      continue;
    }
    const candidate = { grind, date: brew.date, createdAt: brew.created_at };
    if (!best || isNewer(candidate, best)) best = candidate;
  }
  return best;
}

export const fromServer = (result: LastGrind): GrindSuggestion => ({
  grind: result.grind_setting.trim(),
  date: result.date,
  createdAt: result.created_at,
});

/**
 * Is `a` a later brew than `b`: by brew date, then by when it was logged.
 * A missing or unparseable timestamp on either side leaves a same-day tie
 * undecided, which counts as "not newer".
 */
export function isNewer(a: GrindSuggestion, b: GrindSuggestion): boolean {
  if (a.date !== b.date) return a.date > b.date; // YYYY-MM-DD sorts as text
  const at = Date.parse(a.createdAt ?? '');
  const bt = Date.parse(b.createdAt ?? '');
  return Number.isFinite(at) && Number.isFinite(bt) && at > bt;
}

/**
 * Local queue vs server. A queued brew is logged on this device and not yet on
 * the server, so when the two cannot be ordered (same day, and a timestamp is
 * missing) the queued one is taken as newer. With real timestamps the later wins.
 */
export function pickSuggestion(local: GrindSuggestion | null, server: GrindSuggestion | null): GrindSuggestion | null {
  if (!local || !server) return local ?? server;
  return isNewer(server, local) ? server : local;
}
