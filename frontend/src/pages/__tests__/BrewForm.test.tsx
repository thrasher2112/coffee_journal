import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrewFormPage } from '../BrewForm';
import type { DraftForm } from '../../components/QuickLogBar';

vi.mock('../../lib/api', () => ({
  fetchBeans: vi.fn().mockResolvedValue([{ id: 'bean-1', name: 'Ethiopia', created_at: '', updated_at: '' }]),
  createBrew: vi.fn(),
}));

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
  quick_notes: 'Carried over from the quick form',
  rating: 9,
};

describe('BrewFormPage', () => {
  it('never mentions "quick" anywhere on the page', () => {
    render(
      <MemoryRouter initialEntries={['/brew']}>
        <BrewFormPage />
      </MemoryRouter>
    );
    expect(screen.queryByText(/quick/i)).not.toBeInTheDocument();
  });

  it('starts with advanced fields already visible', () => {
    render(
      <MemoryRouter initialEntries={['/brew']}>
        <BrewFormPage />
      </MemoryRouter>
    );
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
});
