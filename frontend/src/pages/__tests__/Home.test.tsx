import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from '../Home';
import { BrewFormPage } from '../BrewForm';

const api = vi.hoisted(() => {
  class NetworkError extends Error {}
  return {
    NetworkError,
    fetchBeans: vi.fn(),
    fetchBrews: vi.fn(),
    fetchMetrics: vi.fn(),
    fetchSetups: vi.fn(),
    createBrew: vi.fn(),
  };
});

vi.mock('../../lib/api', () => api);

vi.mock('react-chartjs-2', () => ({ Line: () => null, Bar: () => null }));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@example.com' } }),
}));

vi.mock('../../hooks/useLocalBrewStore', () => ({
  useLocalBrewStore: () => ({ brews: [], addBrew: vi.fn(), unsynced: [] }),
}));

vi.mock('../../contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: { temperatureUnit: 'celsius', grinders: [], preferredGrinder: undefined },
    setPreferredGrinder: vi.fn(),
  }),
}));

const office = {
  id: 'office',
  name: 'Office · Espresso',
  brew_style: 'espresso',
  ratio: 3,
  dose_g: 18,
  machine_profile: 'Extractamundo Dos!',
};

const bean = { id: 'bean-1', name: 'Ethiopia', created_at: '', updated_at: '' };

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/brew" element={<BrewFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  api.fetchBeans.mockResolvedValue([bean]);
  api.fetchBrews.mockResolvedValue([]);
  api.fetchMetrics.mockResolvedValue({ rating_trends: [], top_beans: [] });
  api.fetchSetups.mockResolvedValue([]);
});

describe('HomePage setups', () => {
  it('shows chips for the loaded setups', async () => {
    api.fetchSetups.mockResolvedValue([office]);
    renderHome();
    expect(await screen.findByRole('button', { name: 'Office · Espresso · 1:3' })).toBeInTheDocument();
  });

  it('a failed setups fetch means no chips, no banner, and beans still render', async () => {
    api.fetchSetups.mockRejectedValue(new Error('boom'));
    renderHome();
    await screen.findByRole('option', { name: /Ethiopia/ });
    expect(screen.queryByRole('group', { name: 'Brew setups' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Offline/)).not.toBeInTheDocument();
  });

  it('a failed beans load keeps the offline banner and does not touch the setups', async () => {
    api.fetchBeans.mockRejectedValue(new api.NetworkError('down'));
    api.fetchSetups.mockResolvedValue([office]);
    renderHome();
    expect(await screen.findByText(/Offline — showing demo data/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Office · Espresso/ })).toBeInTheDocument();
  });

  it('carries the picked setup to the full form, where its chip shows selected', async () => {
    api.fetchSetups.mockResolvedValue([office]);
    renderHome();
    fireEvent.click(await screen.findByRole('button', { name: 'Office · Espresso · 1:3' }));
    fireEvent.click(screen.getByText('Full Brew Log'));
    const chip = await screen.findByRole('button', { name: 'Office · Espresso · 1:3' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect((screen.getByLabelText('Style') as HTMLSelectElement).value).toBe('espresso');
    expect((screen.getByLabelText('Yield (g)') as HTMLInputElement).value).toBe('54');
    expect(screen.getByText('Advanced mode')).toBeInTheDocument();
  });
});
