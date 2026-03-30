import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { LoginPage } from '../Login';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the API module
vi.mock('../../lib/api', () => ({
  requestMagicLink: vi.fn().mockResolvedValue({ message: 'Check your email' }),
  fetchCurrentUser: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  logoutUser: vi.fn(),
  AuthError: class AuthError extends Error {
    constructor() { super('Not authenticated'); this.name = 'AuthError'; }
  },
}));

function renderLogin() {
  return render(
    <AuthProvider>
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    </AuthProvider>
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email input and submit button', () => {
    renderLogin();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send sign-in link/i })).toBeInTheDocument();
  });

  it('shows check your email message after submit', async () => {
    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send sign-in link/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('shows error on API failure', async () => {
    const { requestMagicLink } = await import('../../lib/api');
    (requestMagicLink as any).mockRejectedValueOnce(new Error('Network error'));

    renderLogin();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
    await user.click(screen.getByRole('button', { name: /send sign-in link/i }));

    expect(await screen.findByText('Network error')).toBeInTheDocument();
  });
});
