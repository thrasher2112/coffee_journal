import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { User } from '../types';
import { fetchCurrentUser, logoutUser, requestMagicLink, AuthError, NetworkError } from '../lib/api';

// Last known signed-in identity, so launching the installed app with no signal
// opens the journal instead of bouncing to the login screen.
//
// This is a display cache, not a credential: the session itself is the HttpOnly
// cookie, and every API call is still authorised server-side. A tampered value
// buys nothing but a wrong name in the header until the next request fails.
const CACHED_USER_KEY = 'coffee-journal-last-user';

function readCachedUser(): User | null {
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(CACHED_USER_KEY);
    }
  } catch {
    // Private mode or blocked storage - the app still works, just not offline.
  }
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Tracks whether the provider is still mounted so that a state update
  // triggered by an in-flight auth check can't fire after unmount (this
  // also prevents React from warning about updates outside of act() when
  // the component unmounts before checkAuth's promise settles, e.g. in tests).
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const currentUser = await fetchCurrentUser();
      writeCachedUser(currentUser);
      if (isMountedRef.current) setUser(currentUser);
    } catch (err) {
      if (err instanceof NetworkError) {
        // Offline (or the host is still waking). Keep the last known session
        // rather than treating an unreachable API as a signed-out user.
        const cached = readCachedUser();
        if (isMountedRef.current) setUser(cached);
      } else {
        // A real 401, or a malformed response: the session is genuinely gone.
        if (err instanceof AuthError) writeCachedUser(null);
        if (isMountedRef.current) setUser(null);
      }
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string) => {
    await requestMagicLink(email);
  };

  const logout = async () => {
    try {
      await logoutUser();
    } finally {
      writeCachedUser(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
