import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QuickLogBar, type DraftForm } from '../QuickLogBar';
import type { Bean, BrewDraft } from '../../types';

const mockPrefs = vi.hoisted(() => ({
  temperatureUnit: 'celsius' as 'celsius' | 'fahrenheit',
  grinders: [] as string[],
  preferredGrinder: undefined as string | undefined,
}));

vi.mock('../../contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    preferences: {
      temperatureUnit: mockPrefs.temperatureUnit,
      grinders: mockPrefs.grinders,
      preferredGrinder: mockPrefs.preferredGrinder,
    },
    setPreferredGrinder: vi.fn(),
  }),
}));

beforeEach(() => {
  mockPrefs.temperatureUnit = 'celsius';
  mockPrefs.grinders = [];
  mockPrefs.preferredGrinder = undefined;
});

const beans: Bean[] = [
  { id: 'bean-1', name: 'Ethiopia', created_at: '', updated_at: '' },
];

function renderForm(
  variant?: 'quick' | 'full',
  onSave: (draft: BrewDraft) => void | Promise<void> = vi.fn(),
  initialDraft?: DraftForm
) {
  // A factory, not a constant element: React skips re-rendering when handed
  // the identical element, and the preference tests need a real re-render.
  const ui = () => (
    <BrowserRouter>
      <QuickLogBar
        beans={beans}
        onSave={onSave}
        defaultBeanId="bean-1"
        variant={variant}
        initialDraft={initialDraft}
      />
    </BrowserRouter>
  );
  const result = render(ui());
  return { ...result, rerenderForm: () => result.rerender(ui()) };
}

const baseDraft: DraftForm = {
  bean_id: 'bean-1',
  bean_weight_g: 18,
  water_weight_g: 288,
  brew_style: 'pour-over',
  date: '2026-01-01',
  agitation_events: [],
  flavor_tags: [],
  aroma_tags: [],
  tasting_notes: '',
  rating: 8,
};

const styleSelect = () => screen.getByLabelText('Style') as HTMLSelectElement;
const doseInput = () => screen.getByLabelText('Dose (g)') as HTMLInputElement;
const yieldInput = () => screen.getByLabelText('Yield (g)') as HTMLInputElement;
const grinderSelect = () => screen.getByLabelText('Grinder') as HTMLSelectElement;
const bloomMinutes = () => screen.getByLabelText('Bloom time minutes') as HTMLInputElement;
const bloomSeconds = () => screen.getByLabelText('Bloom time seconds') as HTMLInputElement;
const totalMinutes = () => screen.getByLabelText('Total brew time minutes') as HTMLInputElement;
const totalSeconds = () => screen.getByLabelText('Total brew time seconds') as HTMLInputElement;

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

describe('QuickLogBar style transitions', () => {
  it('picking espresso from pour-over sets yield to dose x 1:2', () => {
    renderForm();
    fireEvent.change(doseInput(), { target: { value: '18' } });
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    expect(styleSelect().value).toBe('espresso');
    expect(yieldInput().value).toBe('36');
    expect(screen.getByText('1:2.5')).toBeInTheDocument();
  });

  it('picking a style with a blank dose leaves the yield alone', () => {
    renderForm();
    fireEvent.change(doseInput(), { target: { value: '' } });
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    expect(styleSelect().value).toBe('espresso');
    expect(yieldInput().value).toBe('270');
  });

  it('a 1:2.5 chip on an 18.5 g dose gives 46.3 g, which is valid and saves', () => {
    const onSave = vi.fn();
    renderForm('quick', onSave);
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(doseInput(), { target: { value: '18.5' } });
    fireEvent.click(screen.getByText('1:2.5'));
    expect(yieldInput().value).toBe('46.3');
    expect(yieldInput().checkValidity()).toBe(true);
    expect(doseInput().checkValidity()).toBe(true);
    fireEvent.click(screen.getByText('Save quick brew'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ bean_weight_g: 18.5, water_weight_g: 46.3, brew_style: 'espresso' })
    );
  });

  it('accepts a 45 g espresso yield (15 g x 3)', () => {
    const onSave = vi.fn();
    renderForm('quick', onSave);
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(doseInput(), { target: { value: '15' } });
    fireEvent.click(screen.getByText('1:3'));
    expect(yieldInput().value).toBe('45');
    expect(yieldInput().checkValidity()).toBe(true);
    fireEvent.click(screen.getByText('Save quick brew'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ water_weight_g: 45 }));
  });

  it('yield input allows tenths and values down to 1 g', () => {
    renderForm();
    expect(yieldInput().min).toBe('1');
    expect(yieldInput().step).toBe('0.1');
  });

  it('does not reset the yield when only the dose changes under the current style', () => {
    renderForm();
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(yieldInput(), { target: { value: '54' } });
    fireEvent.change(doseInput(), { target: { value: '19' } });
    expect(yieldInput().value).toBe('54');
  });
});

describe('QuickLogBar advanced defaults', () => {
  it('pour-over full form still defaults to 45 s bloom, 3:00 total and 96 C', () => {
    renderForm('full');
    expect(bloomMinutes().value).toBe('0');
    expect(bloomSeconds().value).toBe('45');
    expect(totalMinutes().value).toBe('3');
    expect(totalSeconds().value).toBe('0');
    expect((screen.getByLabelText(/Water temp/) as HTMLInputElement).value).toBe('96');
  });

  it('espresso initialDraft in the full form gets no bloom and no total-time default', () => {
    const onSave = vi.fn();
    renderForm('full', onSave, { ...baseDraft, brew_style: 'espresso', bean_weight_g: 18, water_weight_g: 54 });
    expect(bloomMinutes().value).toBe('');
    expect(bloomSeconds().value).toBe('');
    expect(totalMinutes().value).toBe('');
    expect(totalSeconds().value).toBe('');
    // water temp default is unchanged
    expect((screen.getByLabelText(/Water temp/) as HTMLInputElement).value).toBe('96');

    fireEvent.click(screen.getByText('Save brew'));
    const saved = onSave.mock.calls[0][0] as BrewDraft;
    expect(saved.bloom_time_s).toBeUndefined();
    expect(saved.total_brew_time_s).toBeUndefined();
    expect(saved.water_temp_c).toBe(96);
  });

  it('keeps bloom/total values already on an espresso initialDraft', () => {
    renderForm('full', vi.fn(), {
      ...baseDraft,
      brew_style: 'espresso',
      bloom_time_s: 5,
      total_brew_time_s: 28,
    });
    expect(bloomSeconds().value).toBe('5');
    expect(totalMinutes().value).toBe('0');
    expect(totalSeconds().value).toBe('28');
  });

  it('toggling advanced mode off and on for espresso adds no bloom/total', () => {
    renderForm('full', vi.fn(), { ...baseDraft, brew_style: 'espresso' });
    fireEvent.click(screen.getByLabelText('Advanced mode')); // off
    fireEvent.click(screen.getByLabelText('Advanced mode')); // on again
    expect(bloomSeconds().value).toBe('');
    expect(totalSeconds().value).toBe('');
  });

  it('switching espresso -> pour-over fills unset bloom/total but keeps entered values', () => {
    renderForm('full', vi.fn(), { ...baseDraft, brew_style: 'espresso', total_brew_time_s: 28 });
    expect(bloomSeconds().value).toBe('');
    fireEvent.change(styleSelect(), { target: { value: 'pour-over' } });
    expect(bloomSeconds().value).toBe('45');
    expect(totalMinutes().value).toBe('0');
    expect(totalSeconds().value).toBe('28');
  });

  it('switching pour-over -> espresso never adds bloom/total that were cleared', () => {
    renderForm('full', vi.fn(), { ...baseDraft, bloom_time_s: '', total_brew_time_s: '' });
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    expect(bloomSeconds().value).toBe('');
    expect(totalSeconds().value).toBe('');
  });
});

describe('QuickLogBar switching to espresso in the full form', () => {
  it('drops the untouched pour-over bloom/total defaults, and saves without them', () => {
    const onSave = vi.fn();
    renderForm('full', onSave);
    expect(bloomSeconds().value).toBe('45');
    expect(totalMinutes().value).toBe('3');
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    expect(bloomSeconds().value).toBe('');
    expect(totalMinutes().value).toBe('');
    expect(totalSeconds().value).toBe('');
    fireEvent.click(screen.getByText('Save brew'));
    const saved = onSave.mock.calls[0][0] as BrewDraft;
    expect(saved.brew_style).toBe('espresso');
    expect(saved.bloom_time_s).toBeUndefined();
    expect(saved.total_brew_time_s).toBeUndefined();
  });

  it('keeps a user-entered 30 s bloom when switching to espresso', () => {
    renderForm('full');
    fireEvent.change(bloomSeconds(), { target: { value: '30' } });
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    expect(bloomSeconds().value).toBe('30');
    // the untouched total default is still dropped
    expect(totalSeconds().value).toBe('');
  });

  it('switching back to pour-over restores the defaults for the unset fields', () => {
    renderForm('full');
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(styleSelect(), { target: { value: 'pour-over' } });
    expect(bloomSeconds().value).toBe('45');
    expect(totalMinutes().value).toBe('3');
    expect(totalSeconds().value).toBe('0');
  });
});

describe('QuickLogBar initialDraft', () => {
  it('keeps the yield of an espresso initialDraft on mount (18 -> 54 stays 54)', () => {
    renderForm('full', vi.fn(), { ...baseDraft, brew_style: 'espresso', bean_weight_g: 18, water_weight_g: 54 });
    expect(styleSelect().value).toBe('espresso');
    expect(yieldInput().value).toBe('54');
    expect(doseInput().value).toBe('18');
  });

  it('keeps an AeroPress 1:8 yield from initialDraft (144 g, not 306 g)', () => {
    renderForm('quick', vi.fn(), { ...baseDraft, brew_style: 'aeropress', bean_weight_g: 18, water_weight_g: 144 });
    expect(yieldInput().value).toBe('144');
  });
});

describe('QuickLogBar unknown brew_style', () => {
  it.each(['cold-brew', 'toString'])('renders %s without crashing and keeps it selectable', (raw) => {
    const onSave = vi.fn();
    renderForm('quick', onSave, { ...baseDraft, brew_style: raw });
    expect(styleSelect().value).toBe(raw);
    expect(Array.from(styleSelect().options).map((o) => o.value)).toContain(raw);
    // no ratio chips for a style without a preset
    expect(screen.queryByText(/^1:\d/)).not.toBeInTheDocument();
    // yield from the draft is untouched
    expect(yieldInput().value).toBe('288');

    // saving does not silently change it
    fireEvent.click(screen.getByText('Save quick brew'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ brew_style: raw }));
  });

  it('choosing a known style afterwards works normally', () => {
    renderForm('quick', vi.fn(), { ...baseDraft, brew_style: 'cold-brew' });
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    expect(styleSelect().value).toBe('espresso');
    expect(yieldInput().value).toBe('36');
    expect(screen.getByText('1:3')).toBeInTheDocument();
    // the raw option is dropped once the draft no longer carries it
    expect(Array.from(styleSelect().options).map((o) => o.value)).not.toContain('cold-brew');
  });

  it('full variant renders an unknown style with advanced defaults and no crash', () => {
    renderForm('full', vi.fn(), { ...baseDraft, brew_style: 'cold-brew' });
    expect(styleSelect().value).toBe('cold-brew');
    expect(bloomSeconds().value).toBe('45');
  });
});

describe('QuickLogBar grinder hydration', () => {
  beforeEach(() => {
    mockPrefs.grinders = ['Comandante', 'Niche'];
    mockPrefs.preferredGrinder = 'Comandante';
  });

  it('fills the preferred grinder on a fresh draft', () => {
    renderForm('full');
    expect(grinderSelect().value).toBe('Comandante');
  });

  it('fills the preferred grinder when preferences arrive after mount', () => {
    mockPrefs.preferredGrinder = undefined;
    const { rerenderForm } = renderForm('full');
    expect(grinderSelect().value).toBe('');
    mockPrefs.preferredGrinder = 'Niche';
    rerenderForm();
    expect(grinderSelect().value).toBe('Niche');
  });

  it('does not refill a grinder the user cleared when the preference changes', () => {
    const { rerenderForm } = renderForm('full');
    fireEvent.change(grinderSelect(), { target: { value: '' } });
    expect(grinderSelect().value).toBe('');
    mockPrefs.preferredGrinder = 'Niche';
    rerenderForm();
    expect(grinderSelect().value).toBe('');
  });

  it('does not fill a grinder into an initialDraft that has none', () => {
    renderForm('full', vi.fn(), baseDraft);
    expect(grinderSelect().value).toBe('');
  });

  it('keeps the initialDraft grinder over the preferred one', () => {
    renderForm('full', vi.fn(), { ...baseDraft, grinder_name: 'Niche' });
    expect(grinderSelect().value).toBe('Niche');
  });

  it('hydrates again on a fresh draft after Reset', () => {
    renderForm('full');
    fireEvent.change(grinderSelect(), { target: { value: 'Niche' } });
    fireEvent.click(screen.getByText('Reset'));
    expect(grinderSelect().value).toBe('Comandante');
  });
});

describe('QuickLogBar Reset and save', () => {
  it('Reset rebuilds from the current style defaults', () => {
    renderForm();
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(doseInput(), { target: { value: '20' } });
    fireEvent.change(yieldInput(), { target: { value: '41' } });
    fireEvent.click(screen.getByText('Reset'));
    expect(styleSelect().value).toBe('espresso');
    expect(doseInput().value).toBe('18');
    expect(yieldInput().value).toBe('36');
  });

  it('Reset in the full espresso form leaves bloom/total unset and shows them blank', () => {
    renderForm('full', vi.fn(), { ...baseDraft, brew_style: 'espresso' });
    fireEvent.click(screen.getByText('Reset'));
    expect(bloomSeconds().value).toBe('');
    expect(totalSeconds().value).toBe('');
  });

  it('Reset in the full pour-over form keeps the advanced defaults visible and in the draft', () => {
    const onSave = vi.fn();
    renderForm('full', onSave);
    fireEvent.change(bloomSeconds(), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Reset'));
    expect(bloomSeconds().value).toBe('45');
    fireEvent.click(screen.getByText('Save brew'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ bloom_time_s: 45, total_brew_time_s: 180 }));
  });

  it('after a save the next draft keeps the style and its defaults', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm('quick', onSave);
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(doseInput(), { target: { value: '15' } });
    fireEvent.click(screen.getByText('Save quick brew'));
    await vi.waitFor(() => expect(doseInput().value).toBe('18'));
    expect(styleSelect().value).toBe('espresso');
    expect(yieldInput().value).toBe('36');
  });
});

describe('QuickLogBar water temperature field', () => {
  it('shows the default in Fahrenheit and does not fight typing', () => {
    mockPrefs.temperatureUnit = 'fahrenheit';
    const onSave = vi.fn();
    renderForm('full', onSave);
    const temp = screen.getByLabelText(/Water temp/) as HTMLInputElement;
    expect(temp.value).toBe('205'); // 96 C
    fireEvent.change(temp, { target: { value: '2' } });
    expect(temp.value).toBe('2');
    fireEvent.change(temp, { target: { value: '200' } });
    expect(temp.value).toBe('200');
    fireEvent.click(screen.getByText('Save brew'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ water_temp_c: 93 }));
  });

  it('Reset restores the default temperature in the field', () => {
    renderForm('full');
    const temp = screen.getByLabelText(/Water temp/) as HTMLInputElement;
    fireEvent.change(temp, { target: { value: '90' } });
    fireEvent.click(screen.getByText('Reset'));
    expect(temp.value).toBe('96');
  });
});
