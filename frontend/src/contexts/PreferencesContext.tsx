import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { fetchPreferences, savePreferences, type ServerPreferences } from '../lib/api';
import { useAuth } from './AuthContext';

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

function toServer(prefs: Preferences): ServerPreferences {
  return {
    temperature_unit: prefs.temperatureUnit,
    grinders: prefs.grinders,
    preferred_grinder: prefs.preferredGrinder ?? null
  };
}

function fromServer(stored: ServerPreferences): Preferences {
  const grinders =
    stored.grinders && stored.grinders.length > 0
      ? Array.from(new Set(stored.grinders))
      : [...DEFAULT_GRINDERS];
  const preferredGrinder =
    stored.preferred_grinder && grinders.includes(stored.preferred_grinder)
      ? stored.preferred_grinder
      : grinders[0];
  return {
    temperatureUnit: stored.temperature_unit === 'fahrenheit' ? 'fahrenheit' : 'celsius',
    grinders,
    preferredGrinder
  };
}

/** Whether the account has ever stored preferences, as opposed to being new. */
function serverHasPreferences(stored: ServerPreferences): boolean {
  return (
    stored.temperature_unit !== null ||
    stored.grinders !== null ||
    stored.preferred_grinder !== null
  );
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  // localStorage is still read first, so preferences are correct on the very
  // first paint and keep working with no connection. The server is the source
  // of truth once it answers.
  const [preferences, setPreferences] = useState<Preferences>(() => readPreferences());
  const [hydrated, setHydrated] = useState(false);
  // JSON of the last payload the server is known to hold, so the push effect
  // can tell a real change from a re-render.
  const lastSyncedRef = useRef<string | null>(null);
  const pendingPushRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  // Adopt the account's preferences on sign-in.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;

    fetchPreferences()
      .then((stored) => {
        if (cancelled) return;
        if (serverHasPreferences(stored)) {
          // Remember what the server holds so this does not bounce straight
          // back as an update.
          lastSyncedRef.current = JSON.stringify(stored);
          setPreferences(fromServer(stored));
        } else {
          // First device to sign in seeds the account from its local values.
          lastSyncedRef.current = null;
        }
      })
      .catch(() => {
        // Offline, or the host is still waking: keep what this device has.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Push changes up. Gated on `hydrated` so a local value cannot overwrite the
  // account's before it has been read.
  useEffect(() => {
    if (!isAuthenticated || !hydrated) return;
    const payload = toServer(preferences);
    const serialized = JSON.stringify(payload);
    if (serialized === lastSyncedRef.current) return;

    savePreferences(payload)
      .then(() => {
        lastSyncedRef.current = serialized;
        pendingPushRef.current = false;
      })
      .catch(() => {
        // Changed offline. Retried when the connection returns.
        pendingPushRef.current = true;
      });
  }, [preferences, hydrated, isAuthenticated]);

  useEffect(() => {
    const retry = () => {
      if (!pendingPushRef.current) return;
      lastSyncedRef.current = null;
      // New object identity re-runs the push effect with the same values.
      setPreferences((prev) => ({ ...prev }));
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

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
