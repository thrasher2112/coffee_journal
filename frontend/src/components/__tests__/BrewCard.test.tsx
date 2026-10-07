import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { BrewCard } from '../BrewCard';
import type { Brew } from '../../types';

vi.mock('../../contexts/PreferencesContext', () => ({
  usePreferences: () => ({ preferences: { temperatureUnit: 'celsius', grinders: [], preferredGrinder: undefined } }),
}));

const baseBrew: Brew = {
  id: '1',
  date: '2026-01-01',
  bean_id: 'bean-1',
  bean_name: 'Ethiopia Yirgacheffe',
  bean_weight_g: 18,
  water_weight_g: 288,
  created_at: '',
  updated_at: '',
};

describe('BrewCard', () => {
  it('shows the brew style as a badge when set', () => {
    render(<BrewCard brew={{ ...baseBrew, brew_style: 'pour-over' }} />);
    expect(screen.getByText('Pour over')).toBeInTheDocument();
  });

  it('falls back to the raw value for an unrecognized brew style', () => {
    render(<BrewCard brew={{ ...baseBrew, brew_style: 'siphon' }} />);
    expect(screen.getByText('siphon')).toBeInTheDocument();
  });

  it('renders no badge when brew_style is unset', () => {
    render(<BrewCard brew={baseBrew} />);
    expect(screen.queryByText('Pour over')).not.toBeInTheDocument();
  });

  it('shows the setup name and machine profile when present', () => {
    render(<BrewCard brew={{ ...baseBrew, setup_name: 'Office · Espresso', machine_profile: 'Extractamundo Dos!' }} />);
    expect(screen.getByText('Office · Espresso')).toBeInTheDocument();
    expect(screen.getByText('Profile: Extractamundo Dos!')).toBeInTheDocument();
  });

  it('shows just the setup name when there is no profile, and the reverse', () => {
    const { rerender } = render(<BrewCard brew={{ ...baseBrew, setup_name: 'Home · AeroPress' }} />);
    expect(screen.getByText('Home · AeroPress')).toBeInTheDocument();
    expect(screen.queryByText(/Profile:/)).not.toBeInTheDocument();
    rerender(<BrewCard brew={{ ...baseBrew, machine_profile: 'Blooming espresso' }} />);
    expect(screen.getByText('Profile: Blooming espresso')).toBeInTheDocument();
    expect(screen.queryByText('Home · AeroPress')).not.toBeInTheDocument();
  });

  it('lets a long setup name and profile wrap', () => {
    render(<BrewCard brew={{ ...baseBrew, setup_name: 'Office · Espresso', machine_profile: 'Extractamundo Dos!' }} />);
    expect(screen.getByText('Office · Espresso')).toHaveClass('break-words');
    expect(screen.getByText('Profile: Extractamundo Dos!')).toHaveClass('break-words');
  });

  it('adds nothing for provenance when absent or null', () => {
    const { container } = render(<BrewCard brew={{ ...baseBrew, setup_name: null, machine_profile: null }} />);
    expect(screen.queryByText(/Profile:/)).not.toBeInTheDocument();
    const plain = render(<BrewCard brew={baseBrew} />);
    expect(container.innerHTML).toBe(plain.container.innerHTML);
  });

  it('shows brew time and bloom time as minutes:seconds', () => {
    render(<BrewCard brew={{ ...baseBrew, total_brew_time_s: 185, bloom_time_s: 45 }} />);
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('3:05')).toBeInTheDocument();
    expect(screen.getByText('0:45')).toBeInTheDocument();
  });

  it('shows grinder name and grind setting as separate rows', () => {
    render(<BrewCard brew={{ ...baseBrew, grinder_name: 'Baratza Encore', grind_setting: '18' }} />);
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('Baratza Encore')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
  });

  it('falls back to an em dash when no grind setting is recorded', () => {
    render(<BrewCard brew={{ ...baseBrew, grinder_name: 'Baratza Encore' }} />);
    fireEvent.click(screen.getByText('Show details'));
    expect(screen.getByText('Baratza Encore')).toBeInTheDocument();
    expect(screen.getByText('Grind setting').nextSibling).toHaveTextContent('—');
  });

  it('shows aroma and flavor ratings alongside the overall rating', () => {
    render(<BrewCard brew={{ ...baseBrew, rating: 9, aroma_rating: 7, flavor_rating: 8 }} />);
    expect(screen.getByText('Overall').nextSibling).toHaveTextContent('9');
    expect(screen.getByText('Aroma').nextSibling).toHaveTextContent('7');
    expect(screen.getByText('Flavor').nextSibling).toHaveTextContent('8');
  });

  it('shows the ratio under the bean/water weight line', () => {
    render(<BrewCard brew={{ ...baseBrew, ratio: 16 }} />);
    expect(screen.getByText('ratio 16')).toBeInTheDocument();
  });
});
