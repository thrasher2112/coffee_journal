import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

export type TemperatureUnit = 'celsius' | 'fahrenheit';

type Preferences = {
  temperatureUnit: TemperatureUnit;
  grinders: string[];
  preferredGrinder?: string;
};

type PreferencesContextValue = {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  addGrinder: (name: string) => void;
  removeGrinder: (name: string) => void;
  setPreferredGrinder: (name: string) => void;
};

const DEFAULT_GRINDERS = [
  'Baratza Encore',
  'Fellow Opus',
  '1Zpresso JX-Pro',
  'Eureka Mignon Specialita',
  'Niche Zero'
];

const STORAGE_KEY = 'coffee-journal-preferences';

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

const buildDefaults = (): Preferences => ({
  temperatureUnit: 'celsius',
  grinders: [...DEFAULT_GRINDERS],
  preferredGrinder: DEFAULT_GRINDERS[0]
});

function readPreferences(): Preferences {
  if (typeof window === 'undefined') {
    return buildDefaults();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaults();
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    const grinders =
      Array.isArray(parsed.grinders) && parsed.grinders.length > 0
        ? Array.from(new Set(parsed.grinders.filter((item): item is string => typeof item === 'string')))
        : [...DEFAULT_GRINDERS];
    const preferredGrinder =
      parsed.preferredGrinder && grinders.includes(parsed.preferredGrinder)
        ? parsed.preferredGrinder
        : grinders[0];
    return {
      temperatureUnit: parsed.temperatureUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
      grinders,
      preferredGrinder
    };
  } catch {
    return buildDefaults();
  }
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => readPreferences());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const value = useMemo<PreferencesContextValue>(
    () => ({
      preferences,
      setPreference: (key, value) => {
        setPreferences((prev) => ({ ...prev, [key]: value }));
      },
      addGrinder: (name) => {
        setPreferences((prev) => {
          if (!name.trim()) return prev;
          if (prev.grinders.some((item) => item.toLowerCase() === name.trim().toLowerCase())) {
            return prev;
          }
          const grinders = [...prev.grinders, name.trim()];
          return {
            ...prev,
            grinders,
            preferredGrinder: prev.preferredGrinder ?? grinders[0]
          };
        });
      },
      removeGrinder: (name) => {
        setPreferences((prev) => {
          const grinders = prev.grinders.filter((item) => item !== name);
          const nextGrinders = grinders.length ? grinders : [...DEFAULT_GRINDERS];
          const preferredGrinder =
            prev.preferredGrinder && nextGrinders.includes(prev.preferredGrinder)
              ? prev.preferredGrinder
              : nextGrinders[0];
          return {
            ...prev,
            grinders: nextGrinders,
            preferredGrinder
          };
        });
      },
      setPreferredGrinder: (name) => {
        setPreferences((prev) => {
          if (!prev.grinders.includes(name)) {
            return prev;
          }
          return { ...prev, preferredGrinder: name };
        });
      }
    }),
    [preferences]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
