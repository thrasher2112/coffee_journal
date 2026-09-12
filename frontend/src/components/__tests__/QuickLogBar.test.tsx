import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QuickLogBar } from '../QuickLogBar';
import type { Bean } from '../../types';

vi.mock('../../contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: { temperatureUnit: 'celsius', grinders: [], preferredGrinder: undefined },
    setPreferredGrinder: vi.fn(),
  }),
}));

const beans: Bean[] = [
  { id: 'bean-1', name: 'Ethiopia', created_at: '', updated_at: '' },
];

function renderForm() {
  return render(
    <BrowserRouter>
      <QuickLogBar beans={beans} onSave={vi.fn()} defaultBeanId="bean-1" />
    </BrowserRouter>
  );
}

function enableAdvanced() {
  fireEvent.click(screen.getByLabelText('Advanced mode'));
}

describe('QuickLogBar agitation amount derivation', () => {
  it('derives the first event\'s amount directly from its total poured', () => {
    renderForm();
    enableAdvanced();
    fireEvent.click(screen.getByText('+ Add event'));

    fireEvent.change(screen.getByLabelText('Total poured so far in grams'), {
      target: { value: '60' },
    });

    expect(screen.getByText('+60g this event')).toBeInTheDocument();
  });

  it('derives each later event\'s amount as the delta from the previous total', () => {
    renderForm();
    enableAdvanced();
    fireEvent.click(screen.getByText('+ Add event'));
    fireEvent.click(screen.getByText('+ Add event'));

    const totals = screen.getAllByLabelText('Total poured so far in grams');
    fireEvent.change(totals[0], { target: { value: '60' } });
    fireEvent.change(totals[1], { target: { value: '220' } });

    expect(screen.getByText('+60g this event')).toBeInTheDocument();
    expect(screen.getByText('+160g this event')).toBeInTheDocument();
  });

  it('recomputes the later delta when an earlier total is edited', () => {
    renderForm();
    enableAdvanced();
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
