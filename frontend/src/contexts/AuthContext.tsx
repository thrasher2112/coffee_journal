import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { User } from '../types';
import { fetchCurrentUser, logoutUser, requestMagicLink, AuthError } from '../lib/api';

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
      if (isMountedRef.current) setUser(currentUser);
    } catch (err) {
      if (isMountedRef.current) setUser(null);
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
