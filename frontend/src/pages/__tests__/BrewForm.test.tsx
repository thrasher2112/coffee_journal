import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrewFormPage } from '../BrewForm';
import type { DraftForm } from '../../lib/brewDraft';

const api = vi.hoisted(() => ({
  fetchBeans: vi.fn(),
  fetchSetups: vi.fn(),
  createBrew: vi.fn(),
  fetchLastGrind: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/api', () => api);

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'me@example.com' } }),
}));

const office = {
  id: 'office',
  name: 'Office · Espresso',
  brew_style: 'espresso',
  ratio: 3,
  dose_g: 18,
  machine_profile: 'Extractamundo Dos!',
};

beforeEach(() => {
  localStorage.clear();
  api.fetchBeans.mockResolvedValue([{ id: 'bean-1', name: 'Ethiopia', created_at: '', updated_at: '' }]);
  api.fetchSetups.mockResolvedValue([]);
});

vi.mock('../../contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: { temperatureUnit: 'celsius', grinders: [], preferredGrinder: undefined },
    setPreferredGrinder: vi.fn(),
  }),
}));

const carriedDraft: DraftForm = {
  bean_id: 'bean-1',
  bean_weight_g: 20,
  water_weight_g: 320,
  brew_style: 'aeropress',
  date: '2026-01-01',
  agitation_events: [],
  flavor_tags: [],
  aroma_tags: [],
  tasting_notes: 'Carried over from the quick form',
  rating: 9,
};

describe('BrewFormPage', () => {
  it('never mentions "quick" anywhere on the page', async () => {
    render(
      <MemoryRouter initialEntries={['/brew']}>
        <BrewFormPage />
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: /Ethiopia/ }); // let the beans load
    expect(screen.queryByText(/quick/i)).not.toBeInTheDocument();
  });

  it('starts with advanced fields already visible', async () => {
    render(
      <MemoryRouter initialEntries={['/brew']}>
        <BrewFormPage />
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: /Ethiopia/ }); // let the beans load
    expect(screen.getByText('Bloom time')).toBeInTheDocument();
  });

  it('seeds the form from a draft carried over via navigation state', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/brew', state: { draft: carriedDraft } }]}>
        <BrewFormPage />
      </MemoryRouter>
    );
    expect(await screen.findByDisplayValue('Carried over from the quick form')).toBeInTheDocument();
    expect(screen.getByDisplayValue('20')).toBeInTheDocument();
    expect(screen.getByDisplayValue('320')).toBeInTheDocument();
  });

  it('shows setup chips once they load', async () => {
    api.fetchSetups.mockResolvedValue([office]);
    render(
      <MemoryRouter initialEntries={['/brew']}>
        <BrewFormPage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: 'Office · Espresso · 1:3' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('a failed setups fetch means no chips, and beans still load', async () => {
    api.fetchSetups.mockRejectedValue(new Error('offline'));
    render(
      <MemoryRouter initialEntries={['/brew']}>
        <BrewFormPage />
      </MemoryRouter>
    );
    await screen.findByRole('option', { name: /Ethiopia/ });
    expect(api.fetchSetups).toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: 'Brew setups' })).not.toBeInTheDocument();
  });

  it('a failed beans fetch does not stop the chips', async () => {
    api.fetchBeans.mockRejectedValue(new Error('offline'));
    api.fetchSetups.mockResolvedValue([office]);
    render(
      <MemoryRouter initialEntries={['/brew']}>
        <BrewFormPage />
      </MemoryRouter>
    );
    expect(await screen.findByRole('button', { name: /Office · Espresso/ })).toBeInTheDocument();
  });

  it('shows the carried draft\'s setup chip selected without re-applying it', async () => {
    api.fetchSetups.mockResolvedValue([office]);
    localStorage.setItem('coffee-journal-last-setup:u1', 'office');
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/brew',
            state: { draft: { ...carriedDraft, setup_name: 'Office · Espresso', machine_profile: 'Extractamundo Dos!' } },
          },
        ]}
      >
        <BrewFormPage />
      </MemoryRouter>
    );
    const chip = await screen.findByRole('button', { name: 'Office · Espresso · 1:3' });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    // the carried values stand: not replaced by the setup's 18 g -> 54 g
    expect(screen.getByDisplayValue('320')).toBeInTheDocument();
  });
});
