import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Beans')).toBeInTheDocument();
    expect(screen.getByText('All Cups')).toBeInTheDocument();
    expect(screen.getByText('Best Cups')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
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
