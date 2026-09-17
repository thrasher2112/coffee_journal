import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { PreferencesProvider, usePreferences } from '../PreferencesContext';
import type { ReactNode } from 'react';

// Preferences now live on the account, so the provider reads auth and talks to
// the API. Both are stubbed here; the sync behaviour has its own tests below.
const api = vi.hoisted(() => ({
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn()
}));
const auth = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock('../../lib/api', () => ({
  fetchPreferences: api.fetchPreferences,
  savePreferences: api.savePreferences
}));
vi.mock('../AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: auth.isAuthenticated })
}));

const EMPTY = { temperature_unit: null, grinders: null, preferred_grinder: null };

const wrapper = ({ children }: { children: ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe('PreferencesContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    auth.isAuthenticated = false;
    api.fetchPreferences.mockResolvedValue(EMPTY);
    api.savePreferences.mockResolvedValue(EMPTY);
  });

  it('provides default temperature unit as celsius', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.temperatureUnit).toBe('celsius');
  });

  it('allows setting temperature preference', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });

    act(() => {
      result.current.setPreference('temperatureUnit', 'fahrenheit');
    });

    expect(result.current.preferences.temperatureUnit).toBe('fahrenheit');
  });

  it('provides default grinders list', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.preferences.grinders.length).toBeGreaterThan(0);
  });

  it('allows adding a grinder', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    const initialCount = result.current.preferences.grinders.length;

    act(() => {
      result.current.addGrinder('Test Grinder');
    });

    expect(result.current.preferences.grinders.length).toBe(initialCount + 1);
    expect(result.current.preferences.grinders).toContain('Test Grinder');
  });

  it('allows removing a grinder', () => {
    const { result } = renderHook(() => usePreferences(), { wrapper });
    const firstGrinder = result.current.preferences.grinders[0];

    act(() => {
      result.current.removeGrinder(firstGrinder);
    });

    expect(result.current.preferences.grinders).not.toContain(firstGrinder);
  });

  // --- syncing to the account ------------------------------------------------

  it('adopts the account preferences over whatever this device had', async () => {
    localStorage.setItem(
      'coffee-journal-preferences',
      JSON.stringify({ temperatureUnit: 'celsius', grinders: ['Local Only'] })
    );
    auth.isAuthenticated = true;
    api.fetchPreferences.mockResolvedValue({
      temperature_unit: 'fahrenheit',
      grinders: ['From Server'],
      preferred_grinder: 'From Server'
    });

    const { result } = renderHook(() => usePreferences(), { wrapper });

    await waitFor(() => {
      expect(result.current.preferences.grinders).toEqual(['From Server']);
    });
    expect(result.current.preferences.temperatureUnit).toBe('fahrenheit');
  });

  it('does not echo the server values straight back as an update', async () => {
    auth.isAuthenticated = true;
    api.fetchPreferences.mockResolvedValue({
      temperature_unit: 'fahrenheit',
      grinders: ['From Server'],
      preferred_grinder: 'From Server'
    });

    const { result } = renderHook(() => usePreferences(), { wrapper });
    await waitFor(() => {
      expect(result.current.preferences.temperatureUnit).toBe('fahrenheit');
    });

    expect(api.savePreferences).not.toHaveBeenCalled();
  });

  it('seeds a new account from this device', async () => {
    auth.isAuthenticated = true;
    api.fetchPreferences.mockResolvedValue(EMPTY);

    renderHook(() => usePreferences(), { wrapper });

    await waitFor(() => expect(api.savePreferences).toHaveBeenCalled());
  });

  it('pushes a change up', async () => {
    auth.isAuthenticated = true;
    api.fetchPreferences.mockResolvedValue({
      temperature_unit: 'celsius',
      grinders: ['A'],
      preferred_grinder: 'A'
    });

    const { result } = renderHook(() => usePreferences(), { wrapper });
    await waitFor(() => expect(result.current.preferences.grinders).toEqual(['A']));

    act(() => result.current.addGrinder('B'));

    await waitFor(() =>
      expect(api.savePreferences).toHaveBeenCalledWith(
        expect.objectContaining({ grinders: ['A', 'B'] })
      )
    );
  });

  it('keeps working when the server is unreachable', async () => {
    auth.isAuthenticated = true;
    api.fetchPreferences.mockRejectedValue(new Error('offline'));
    api.savePreferences.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => usePreferences(), { wrapper });

    act(() => result.current.setPreference('temperatureUnit', 'fahrenheit'));

    // The local value still applies; nothing throws.
    expect(result.current.preferences.temperatureUnit).toBe('fahrenheit');
    expect(localStorage.getItem('coffee-journal-preferences')).toContain('fahrenheit');
  });

  it('never calls the API while signed out', async () => {
    auth.isAuthenticated = false;

    const { result } = renderHook(() => usePreferences(), { wrapper });
    act(() => result.current.addGrinder('Anon'));

    expect(api.fetchPreferences).not.toHaveBeenCalled();
    expect(api.savePreferences).not.toHaveBeenCalled();
  });
});
