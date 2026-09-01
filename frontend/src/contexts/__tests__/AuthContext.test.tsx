import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthProvider, useAuth } from '../AuthContext';

// Hoisted so the classes exist by the time the mock factory runs.
const api = vi.hoisted(() => {
  class NetworkError extends Error {
    constructor() {
      super('Network request failed');
      this.name = 'NetworkError';
    }
  }
  class AuthError extends Error {
    constructor() {
      super('Not authenticated');
      this.name = 'AuthError';
    }
  }
  return { NetworkError, AuthError, fetchCurrentUser: vi.fn(), logoutUser: vi.fn() };
});

vi.mock('../../lib/api', () => ({
  fetchCurrentUser: api.fetchCurrentUser,
  logoutUser: api.logoutUser,
  requestMagicLink: vi.fn(),
  AuthError: api.AuthError,
  NetworkError: api.NetworkError
}));

const CACHE_KEY = 'coffee-journal-last-user';
const user = { id: '1', email: 'me@example.com', display_name: 'Me', created_at: '' };

function Probe() {
  const { isAuthenticated, isLoading, user: current } = useAuth();
  if (isLoading) return <p>loading</p>;
  return <p>{isAuthenticated ? `in:${current?.email}` : 'out'}</p>;
}

const renderProbe = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );

describe('AuthContext offline behaviour', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('keeps the last known session when the API is unreachable', async () => {
    // The whole point of the installed app: launching it in airplane mode must
    // open the journal, not bounce to the login screen.
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    api.fetchCurrentUser.mockRejectedValue(new api.NetworkError());

    renderProbe();

    expect(await screen.findByText('in:me@example.com')).toBeInTheDocument();
  });

  it('signs out on a real 401 and forgets the cached identity', async () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify(user));
    api.fetchCurrentUser.mockRejectedValue(new api.AuthError());

    renderProbe();

    expect(await screen.findByText('out')).toBeInTheDocument();
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('caches the identity after a successful check', async () => {
    api.fetchCurrentUser.mockResolvedValue(user);

    renderProbe();

    expect(await screen.findByText('in:me@example.com')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(CACHE_KEY)!)).toEqual(user);
  });

  it('stays signed out offline when there is no cached identity', async () => {
    api.fetchCurrentUser.mockRejectedValue(new api.NetworkError());

    renderProbe();

    expect(await screen.findByText('out')).toBeInTheDocument();
  });
});
