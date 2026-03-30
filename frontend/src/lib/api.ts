import type { Bean, Brew, BrewDraft, MetricsOverview, User } from '../types';

const API_URL = import.meta.env.VITE_API_URL || (globalThis as any).__API_URL__ || 'http://localhost:8000';

class AuthError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'AuthError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  });
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

// ---- Data ----

export async function exportData() {
  return request(`/api/export`);
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
