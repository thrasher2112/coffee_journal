import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { PreferencesProvider, usePreferences } from '../PreferencesContext';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe('PreferencesContext', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
