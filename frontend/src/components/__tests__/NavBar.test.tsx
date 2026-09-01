import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { NavBar } from '../NavBar';

const mockUser = { id: '1', email: 'test@example.com', display_name: 'Test', created_at: '' };

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn(),
    login: vi.fn(),
    checkAuth: vi.fn(),
  }),
}));

function renderNavBar() {
  return render(
    <BrowserRouter>
      <NavBar />
    </BrowserRouter>
  );
}

describe('NavBar', () => {
  it('renders navigation links', () => {
    renderNavBar();
    const primary = within(screen.getByRole('navigation', { name: 'Primary' }));
    expect(primary.getByText('Home')).toBeInTheDocument();
    expect(primary.getByText('Beans')).toBeInTheDocument();
    expect(primary.getByText('All Cups')).toBeInTheDocument();
    expect(primary.getByText('Best Cups')).toBeInTheDocument();
    expect(primary.getByText('Settings')).toBeInTheDocument();
  });

  // Below `md` the header nav is display:none and this bar is the only way to
  // reach anything. Before it existed, a phone had no navigation at all.
  it('renders a bottom tab bar reaching every section', () => {
    renderNavBar();
    const bottom = within(screen.getByRole('navigation', { name: 'Bottom navigation' }));
    for (const [label, href] of [
      ['Home', '/'],
      ['Beans', '/beans'],
      ['All', '/all-cups'],
      ['Best', '/best-cups'],
      ['Settings', '/settings']
    ]) {
      expect(bottom.getByRole('link', { name: label })).toHaveAttribute('href', href);
    }
  });

  it('shows user display name when authenticated', () => {
    renderNavBar();
    expect(screen.getByText('Test')).toBeInTheDocument();
  });

  it('shows sign out button', () => {
    renderNavBar();
    expect(screen.getByText('Sign out')).toBeInTheDocument();
  });
});
