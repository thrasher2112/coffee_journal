import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QuickLogBar } from '../QuickLogBar';
import type { Bean, BrewDraft } from '../../types';

vi.mock('../../contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: { temperatureUnit: 'celsius', grinders: [], preferredGrinder: undefined },
    setPreferredGrinder: vi.fn(),
  }),
}));

const beans: Bean[] = [
  { id: 'bean-1', name: 'Ethiopia', created_at: '', updated_at: '' },
];

function renderForm(variant?: 'quick' | 'full', onSave: (draft: BrewDraft) => void | Promise<void> = vi.fn()) {
  return render(
    <BrowserRouter>
      <QuickLogBar beans={beans} onSave={onSave} defaultBeanId="bean-1" variant={variant} />
    </BrowserRouter>
  );
}

describe('QuickLogBar variants', () => {
  it('quick (default) shows a link to the full form instead of a checkbox', () => {
    renderForm();
    expect(screen.getByText('Full Brew Log')).toBeInTheDocument();
    expect(screen.queryByLabelText('Advanced mode')).not.toBeInTheDocument();
    expect(screen.getByText('Quick Brew')).toBeInTheDocument();
  });

  it('full shows the advanced-mode checkbox, already checked, and no "Quick Brew" heading', () => {
    renderForm('full');
    const checkbox = screen.getByLabelText('Advanced mode');
    expect(checkbox).toBeChecked();
    expect(screen.queryByText('Quick Brew')).not.toBeInTheDocument();
    expect(screen.queryByText('Full Brew Log')).not.toBeInTheDocument();
    // Advanced-only fields are visible without any extra toggling.
    expect(screen.getByText('Bloom time')).toBeInTheDocument();
  });

  it('full can still collapse back to the quick field set', () => {
    renderForm('full');
    fireEvent.click(screen.getByLabelText('Advanced mode'));
    expect(screen.queryByText('Bloom time')).not.toBeInTheDocument();
    expect(screen.queryByText(/quick/i)).not.toBeInTheDocument();
  });

  it('labels the notes field "Notes", not "Quick notes"', () => {
    renderForm();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.queryByText('Quick notes')).not.toBeInTheDocument();
  });

  it('includes the typed notes text under tasting_notes in the saved payload', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm('full', onSave);

    fireEvent.change(screen.getByLabelText('Notes'), {
      target: { value: 'Tastes like blueberries' },
    });
    fireEvent.click(screen.getByText('Save brew'));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ tasting_notes: 'Tastes like blueberries' })
    );
  });
});

describe('QuickLogBar agitation amount derivation', () => {
  it('derives the first event\'s amount directly from its total poured', () => {
    renderForm('full');
    fireEvent.click(screen.getByText('+ Add event'));

    fireEvent.change(screen.getByLabelText('Total poured so far in grams'), {
      target: { value: '60' },
    });

    expect(screen.getByText('+60g this event')).toBeInTheDocument();
  });

  it('derives each later event\'s amount as the delta from the previous total', () => {
    renderForm('full');
    fireEvent.click(screen.getByText('+ Add event'));
    fireEvent.click(screen.getByText('+ Add event'));

    const totals = screen.getAllByLabelText('Total poured so far in grams');
    fireEvent.change(totals[0], { target: { value: '60' } });
    fireEvent.change(totals[1], { target: { value: '220' } });

    expect(screen.getByText('+60g this event')).toBeInTheDocument();
    expect(screen.getByText('+160g this event')).toBeInTheDocument();
  });

  it('recomputes the later delta when an earlier total is edited', () => {
    renderForm('full');
    fireEvent.click(screen.getByText('+ Add event'));
    fireEvent.click(screen.getByText('+ Add event'));

    const totals = screen.getAllByLabelText('Total poured so far in grams');
    fireEvent.change(totals[0], { target: { value: '60' } });
    fireEvent.change(totals[1], { target: { value: '220' } });
    fireEvent.change(totals[0], { target: { value: '80' } });

    expect(screen.getByText('+80g this event')).toBeInTheDocument();
    expect(screen.getByText('+140g this event')).toBeInTheDocument();
  });
});
