import type { Bean, Brew, BrewDraft, MetricsOverview } from '../types';

const API_URL = import.meta.env.VITE_API_URL || (globalThis as any).__API_URL__ || 'http://localhost:8000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...init
  });
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchBeans(): Promise<Bean[]> {
  const data = await request<{ items: Bean[]; total: number }>(`/api/beans/`);
  return data.items;
}

export async function createBean(bean: Partial<Bean>) {
  return request<Bean>(`/api/beans/`, {
    method: 'POST',
    body: JSON.stringify(bean)
  });
}

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

export async function fetchMetrics(): Promise<MetricsOverview> {
  return request<MetricsOverview>(`/api/metrics/overview`);
}

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
