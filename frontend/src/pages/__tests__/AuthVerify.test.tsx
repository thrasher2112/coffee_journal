import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthVerifyPage } from '../AuthVerify';

const api = vi.hoisted(() => ({ verifyMagicLink: vi.fn() }));

vi.mock('../../lib/api', () => ({
  verifyMagicLink: api.verifyMagicLink,
  fetchCurrentUser: vi.fn().mockResolvedValue({ id: '1', email: 'me@example.com' }),
  logoutUser: vi.fn(),
  requestMagicLink: vi.fn(),
  AuthError: class extends Error {},
  NetworkError: class extends Error {}
}));

const checkAuth = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ checkAuth, user: null, isAuthenticated: false, isLoading: false })
}));

function renderAt(hash: string) {
  window.location.hash = hash;
  return render(
    <MemoryRouter>
      <AuthVerifyPage />
    </MemoryRouter>
  );
}

describe('AuthVerifyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.verifyMagicLink.mockResolvedValue(undefined);
    window.location.hash = '';
  });

  // The token moved out of the query string so it stops being written into the
  // API's access log. If this reads the wrong place, sign-in breaks entirely.
  it('reads the token from the URL fragment', async () => {
    renderAt('#token=abc123');

    await waitFor(() => expect(api.verifyMagicLink).toHaveBeenCalledWith('abc123'));
  });

  it('clears the token from the address bar after verifying', async () => {
    renderAt('#token=abc123');

    await waitFor(() => expect(api.verifyMagicLink).toHaveBeenCalled());
    await waitFor(() => expect(window.location.hash).toBe(''));
  });

  it('does not fall back to the query string', async () => {
    window.history.replaceState(null, '', '/auth/verify?token=fromquery');
    renderAt('');

    expect(await screen.findByText(/verification failed/i)).toBeInTheDocument();
    expect(api.verifyMagicLink).not.toHaveBeenCalled();
  });

  it('reports a missing token rather than calling the API', async () => {
    renderAt('');

    expect(await screen.findByText(/no verification token found/i)).toBeInTheDocument();
    expect(api.verifyMagicLink).not.toHaveBeenCalled();
  });
});
