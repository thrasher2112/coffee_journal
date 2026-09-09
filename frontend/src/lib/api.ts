import type { Bean, Brew, BrewDraft, MetricsOverview, User } from '../types';

// Empty string = same-origin. Every path below already starts with `/api`, so an
// empty base produces a relative request that follows whatever host the app was
// loaded from. Set VITE_API_URL only when the API lives on a different origin.
// `??` (not `||`) so an intentional empty string is not replaced by the fallback.
const API_URL = import.meta.env.VITE_API_URL ?? (globalThis as any).__API_URL__ ?? '';

class AuthError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'AuthError';
  }
}

/**
 * The request never reached the API - offline, DNS failure, server asleep.
 *
 * Distinct from a request that arrived and was rejected: only this one means
 * "try again later", so it is the only failure that should queue a brew for
 * offline sync or keep a cached session alive. A 422 queued as if it were an
 * outage would retry forever.
 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Network request failed');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      ...init
    });
  } catch (err) {
    // fetch only rejects when the request could not be made at all.
    throw new NetworkError(err);
  }
  if (res.status === 401) {
    throw new AuthError();
  }
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

// ---- Auth ----

export async function requestMagicLink(email: string): Promise<{ message: string }> {
  return request('/api/auth/magic-link', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

export async function verifyMagicLink(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/verify`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (res.ok) return;
  const body = await res.json().catch(() => ({}));
  throw new Error((body as any).detail || 'Verification failed');
}

export async function fetchCurrentUser(): Promise<User> {
  return request<User>('/api/auth/me');
}

export async function logoutUser(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' });
}

export { AuthError };

// ---- Beans ----

type BeanFilters = {
  q?: string;
  firstUsedAfter?: string;
  lastUsedBefore?: string;
};

export async function fetchBeans(filters?: BeanFilters): Promise<Bean[]> {
  const params = new URLSearchParams();
  if (filters?.q) params.set('q', filters.q);
  if (filters?.firstUsedAfter) params.set('first_used_after', filters.firstUsedAfter);
  if (filters?.lastUsedBefore) params.set('last_used_before', filters.lastUsedBefore);
  const query = params.toString();
  const data = await request<{ items: Bean[]; total: number }>(`/api/beans/${query ? `?${query}` : ''}`);
  return data.items;
}

export async function createBean(bean: Partial<Bean>) {
  return request<Bean>(`/api/beans/`, {
    method: 'POST',
    body: JSON.stringify(bean)
  });
}

export async function updateBean(beanId: string, bean: Partial<Bean>) {
  return request<Bean>(`/api/beans/${beanId}`, {
    method: 'PUT',
    body: JSON.stringify(bean)
  });
}

export async function deleteBean(beanId: string) {
  return request<void>(`/api/beans/${beanId}`, {
    method: 'DELETE'
  });
}

export async function copyBean(beanId: string) {
  return request<Bean>(`/api/beans/${beanId}/copy`, {
    method: 'POST'
  });
}

// ---- Brews ----

export async function fetchBrews(): Promise<Brew[]> {
  const data = await request<{ items: Brew[]; total: number }>(`/api/brews/`);
  return data.items;
}

export async function createBrew(brew: BrewDraft): Promise<Brew> {
  return request<Brew>(`/api/brews/`, {
    method: 'POST',
    body: JSON.stringify(brew)
  });
}

// ---- Metrics ----

export async function fetchMetrics(): Promise<MetricsOverview> {
  return request<MetricsOverview>(`/api/metrics/overview`);
}

// ---- Preferences ----

/** Server shape (snake_case). `null` means the user has never set that value. */
export interface ServerPreferences {
  temperature_unit: 'celsius' | 'fahrenheit' | null;
  grinders: string[] | null;
  preferred_grinder: string | null;
}

export async function fetchPreferences(): Promise<ServerPreferences> {
  return request<ServerPreferences>(`/api/preferences`);
}

export async function savePreferences(
  prefs: ServerPreferences
): Promise<ServerPreferences> {
  return request<ServerPreferences>(`/api/preferences`, {
    method: 'PUT',
    body: JSON.stringify(prefs)
  });
}

// ---- Data ----

/** Everything the server holds for this account. */
export interface ServerExport {
  beans: Bean[];
  brews: Brew[];
  preferences: ServerPreferences | null;
}

export async function exportData(): Promise<ServerExport> {
  return request<ServerExport>(`/api/export`);
}

export async function importData(payload: unknown) {
  return request(`/api/import`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export async function syncBrews(pending: BrewDraft[]) {
  const syncedIds: string[] = [];
  for (const brew of pending) {
    try {
      await createBrew(brew);
      if (brew.id) {
        syncedIds.push(brew.id);
      }
    } catch (error) {
      console.warn('Sync failed for brew', brew, error);
      throw error;
    }
  }
  return syncedIds;
}
