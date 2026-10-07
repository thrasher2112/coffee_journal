import { StrictMode } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QuickLogBar } from '../QuickLogBar';
import type { DraftForm } from '../../lib/brewDraft';
import type { Bean, BrewDraft, BrewSetup } from '../../types';
import { lastSetupKey } from '../../lib/lastSetup';

const mockSetPreferredGrinder = vi.hoisted(() => vi.fn());

// The grind lookup. Default: no previous brew, so existing tests see no prefill.
const api = vi.hoisted(() => ({ fetchLastGrind: vi.fn() }));
vi.mock('../../lib/api', () => api);

// The offline queue of not-yet-synced brews, as useLocalBrewStore exposes it.
const mockLocal = vi.hoisted(() => ({ unsynced: [] as Record<string, unknown>[] }));
vi.mock('../../hooks/useLocalBrewStore', () => ({
  useLocalBrewStore: () => ({ brews: mockLocal.unsynced, unsynced: mockLocal.unsynced, addBrew: vi.fn() }),
}));

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
    setPreferredGrinder: mockSetPreferredGrinder,
  }),
}));

beforeEach(() => {
  localStorage.clear();
  api.fetchLastGrind.mockReset();
  api.fetchLastGrind.mockResolvedValue(null);
  mockLocal.unsynced = [];
  mockSetPreferredGrinder.mockClear();
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

// Click save and wait for the async save to settle (the button re-enables once
// onSave has resolved and the next draft has been set), so the trailing state
// updates happen inside RTL's act-aware waitFor rather than after the test.
async function clickSave(label: string) {
  fireEvent.click(screen.getByText(label));
  await waitFor(() => expect(screen.getByRole('button', { name: /^Save/ })).not.toBeDisabled());
}

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
    await clickSave('Save brew');

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

  it('a 1:2.5 chip on an 18.5 g dose gives 46.3 g, which is valid and saves', async () => {
    const onSave = vi.fn();
    renderForm('quick', onSave);
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(doseInput(), { target: { value: '18.5' } });
    fireEvent.click(screen.getByText('1:2.5'));
    expect(yieldInput().value).toBe('46.3');
    expect(yieldInput().checkValidity()).toBe(true);
    expect(doseInput().checkValidity()).toBe(true);
    await clickSave('Save quick brew');
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ bean_weight_g: 18.5, water_weight_g: 46.3, brew_style: 'espresso' })
    );
  });

  it('accepts a 45 g espresso yield (15 g x 3)', async () => {
    const onSave = vi.fn();
    renderForm('quick', onSave);
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(doseInput(), { target: { value: '15' } });
    fireEvent.click(screen.getByText('1:3'));
    expect(yieldInput().value).toBe('45');
    expect(yieldInput().checkValidity()).toBe(true);
    await clickSave('Save quick brew');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ water_weight_g: 45 }));
  });

  it('yield input allows tenths and values down to 0.1 g; dose accepts any decimal down to 0.1 g', () => {
    renderForm();
    expect(yieldInput().min).toBe('0.1');
    expect(yieldInput().step).toBe('0.1');
    expect(doseInput().min).toBe('0.1');
    expect(doseInput().step).toBe('any');
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

  it('espresso initialDraft in the full form gets no bloom and no total-time default', async () => {
    const onSave = vi.fn();
    renderForm('full', onSave, { ...baseDraft, brew_style: 'espresso', bean_weight_g: 18, water_weight_g: 54 });
    expect(bloomMinutes().value).toBe('');
    expect(bloomSeconds().value).toBe('');
    expect(totalMinutes().value).toBe('');
    expect(totalSeconds().value).toBe('');
    // water temp default is unchanged
    expect((screen.getByLabelText(/Water temp/) as HTMLInputElement).value).toBe('96');

    await clickSave('Save brew');
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
  it('drops the untouched pour-over bloom/total defaults, and saves without them', async () => {
    const onSave = vi.fn();
    renderForm('full', onSave);
    expect(bloomSeconds().value).toBe('45');
    expect(totalMinutes().value).toBe('3');
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    expect(bloomSeconds().value).toBe('');
    expect(totalMinutes().value).toBe('');
    expect(totalSeconds().value).toBe('');
    await clickSave('Save brew');
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
  it.each(['cold-brew', 'toString'])('renders %s without crashing and keeps it selectable', async (raw) => {
    const onSave = vi.fn();
    renderForm('quick', onSave, { ...baseDraft, brew_style: raw });
    expect(styleSelect().value).toBe(raw);
    expect(Array.from(styleSelect().options).map((o) => o.value)).toContain(raw);
    expect(screen.getByRole('option', { name: `${raw} (custom)` })).toBeInTheDocument();
    // no ratio chips for a style without a preset
    expect(screen.queryByText(/^1:\d/)).not.toBeInTheDocument();
    // yield from the draft is untouched
    expect(yieldInput().value).toBe('288');

    // saving does not silently change it
    await clickSave('Save quick brew');
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

  it('Reset in the full pour-over form keeps the advanced defaults visible and in the draft', async () => {
    const onSave = vi.fn();
    renderForm('full', onSave);
    fireEvent.change(bloomSeconds(), { target: { value: '30' } });
    fireEvent.click(screen.getByText('Reset'));
    expect(bloomSeconds().value).toBe('45');
    await clickSave('Save brew');
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ bloom_time_s: 45, total_brew_time_s: 180 }));
  });

  it('after a save the next draft keeps the style and its defaults', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderForm('quick', onSave);
    fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
    fireEvent.change(doseInput(), { target: { value: '15' } });
    await clickSave('Save quick brew');
    await vi.waitFor(() => expect(doseInput().value).toBe('18'));
    expect(styleSelect().value).toBe('espresso');
    expect(yieldInput().value).toBe('36');
  });
});

describe('QuickLogBar water temperature field', () => {
  it('shows the default in Fahrenheit and does not fight typing', async () => {
    mockPrefs.temperatureUnit = 'fahrenheit';
    const onSave = vi.fn();
    renderForm('full', onSave);
    const temp = screen.getByLabelText(/Water temp/) as HTMLInputElement;
    expect(temp.value).toBe('205'); // 96 C
    fireEvent.change(temp, { target: { value: '2' } });
    expect(temp.value).toBe('2');
    fireEvent.change(temp, { target: { value: '200' } });
    expect(temp.value).toBe('200');
    await clickSave('Save brew');
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

describe('QuickLogBar blanked water temperature', () => {
  it('stays blank through a style pick and saves without a temperature', async () => {
    const onSave = vi.fn();
    renderForm('full', onSave);
    const temp = screen.getByLabelText(/Water temp/) as HTMLInputElement;
    expect(temp.value).toBe('96');
    fireEvent.change(temp, { target: { value: '' } });
    fireEvent.change(styleSelect(), { target: { value: 'aeropress' } });
    expect(temp.value).toBe('');
    await clickSave('Save brew');
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0] as BrewDraft;
    expect(saved.brew_style).toBe('aeropress');
    expect(saved.water_temp_c).toBeUndefined();
  });

  it('stays blank when advanced mode is toggled off and on', () => {
    renderForm('full');
    const temp = () => screen.getByLabelText(/Water temp/) as HTMLInputElement;
    fireEvent.change(temp(), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Advanced mode'));
    fireEvent.click(screen.getByLabelText('Advanced mode'));
    expect(temp().value).toBe('');
  });

  it('rewrites the buffer in the new unit when the unit switches at runtime', () => {
    const { rerenderForm } = renderForm('full');
    const temp = screen.getByLabelText(/Water temp/) as HTMLInputElement;
    expect(temp.value).toBe('96');
    mockPrefs.temperatureUnit = 'fahrenheit';
    rerenderForm();
    expect(temp.value).toBe('205');
    mockPrefs.temperatureUnit = 'celsius';
    rerenderForm();
    expect(temp.value).toBe('96');
  });
});

describe('QuickLogBar agitation rows', () => {
  const agitationDraft: DraftForm = {
    ...baseDraft,
    agitation_events: [
      { timestamp_s: 10, action: 'pour', amount_g: 50 },
      { timestamp_s: 40, action: 'pour', amount_g: 100 },
      { timestamp_s: 70, action: 'stir', amount_g: undefined },
    ],
  };
  const totals = () =>
    (screen.getAllByLabelText('Total poured so far in grams') as HTMLInputElement[]).map((i) => i.value);

  it('seeds the scale readings from an incoming draft as running totals', () => {
    renderForm('full', vi.fn(), agitationDraft);
    expect(totals()).toEqual(['50', '150', '']);
  });

  it('editing an incoming draft\'s row recomputes later amounts instead of wiping them', () => {
    renderForm('full', vi.fn(), agitationDraft);
    fireEvent.change(screen.getAllByLabelText('Total poured so far in grams')[0], { target: { value: '60' } });
    expect(screen.getByText('+60g this event')).toBeInTheDocument();
    expect(screen.getByText('+90g this event')).toBeInTheDocument();
  });

  it('Reset clears the agitation rows and their readings', () => {
    renderForm('full', vi.fn(), agitationDraft);
    expect(totals()).toHaveLength(3);
    fireEvent.click(screen.getByText('Reset'));
    expect(screen.getByText('No agitation logged yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('+ Add event'));
    expect(totals()).toEqual(['']);
  });
});

describe('QuickLogBar setups', () => {
  const office: BrewSetup = {
    id: 'office',
    name: 'Office · Espresso',
    brew_style: 'espresso',
    ratio: 3,
    dose_g: 18,
    grinder_name: 'DE1 grinder',
    target_time_s: 36,
    machine_profile: 'Extractamundo Dos!',
  };
  const home: BrewSetup = {
    id: 'home',
    name: 'Home · AeroPress',
    brew_style: 'aeropress',
    ratio: 8,
    dose_g: 18,
    grinder_name: null,
    target_time_s: null,
    machine_profile: null,
  };
  const half: BrewSetup = { ...office, id: 'half', name: 'Half', ratio: 2.5, dose_g: null };
  const setups = [office, home];

  interface Opts {
    variant?: 'quick' | 'full';
    setups?: BrewSetup[];
    userId?: string;
    onSave?: (draft: BrewDraft) => void | Promise<void>;
    initialDraft?: DraftForm;
  }
  const ui = (o: Opts) => (
    <BrowserRouter>
      <QuickLogBar
        beans={beans}
        onSave={o.onSave ?? vi.fn()}
        defaultBeanId="bean-1"
        variant={o.variant}
        initialDraft={o.initialDraft}
        setups={o.setups}
        userId={o.userId}
      />
    </BrowserRouter>
  );
  function renderSetups(o: Opts = {}) {
    const result = render(ui(o));
    return { ...result, rerenderWith: (next: Opts) => result.rerender(ui(next)) };
  }
  const chip = (name: string) => screen.getByRole('button', { name });
  const officeChip = () => chip('Office · Espresso · 1:3');
  const homeChip = () => chip('Home · AeroPress · 1:8');

  it('renders no chip row without setups', () => {
    renderSetups();
    expect(screen.queryByRole('group', { name: 'Brew setups' })).not.toBeInTheDocument();
    renderSetups({ setups: [] });
    expect(screen.queryByRole('group', { name: 'Brew setups' })).not.toBeInTheDocument();
  });

  it('labels chips "<name> · 1:<ratio>" without trailing zeros, none pressed initially', () => {
    renderSetups({ setups: [office, home, half] });
    expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    expect(homeChip()).toBeInTheDocument();
    expect(chip('Half · 1:2.5')).toBeInTheDocument();
  });

  it('tapping an espresso chip on a pour-over form keeps 18 g -> 54 g (not reset to 36)', () => {
    renderSetups({ setups, userId: 'u1' });
    expect(styleSelect().value).toBe('pour-over');
    fireEvent.click(officeChip());
    expect(styleSelect().value).toBe('espresso');
    expect(doseInput().value).toBe('18');
    expect(yieldInput().value).toBe('54');
    expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
  });

  it('fills grinder and target time in the full form, and no bloom default', async () => {
    const onSave = vi.fn();
    renderSetups({ variant: 'full', setups, userId: 'u1', onSave });
    expect(bloomSeconds().value).toBe('45');
    fireEvent.click(officeChip());
    expect(grinderSelect().value).toBe('DE1 grinder');
    expect(totalMinutes().value).toBe('0');
    expect(totalSeconds().value).toBe('36');
    expect(bloomSeconds().value).toBe('');
    await clickSave('Save brew');
    const saved = onSave.mock.calls[0][0] as BrewDraft;
    expect(saved).toMatchObject({
      setup_name: 'Office · Espresso',
      machine_profile: 'Extractamundo Dos!',
      brew_style: 'espresso',
      bean_weight_g: 18,
      water_weight_g: 54,
      total_brew_time_s: 36,
      grinder_name: 'DE1 grinder',
    });
    expect(saved.bloom_time_s).toBeUndefined();
  });

  it('a Settings-style fractional dose (18.2 g, 1:3) applies and the form submits it unrounded', async () => {
    const onSave = vi.fn();
    const fractional: BrewSetup = { ...office, id: 'frac', name: 'Frac', dose_g: 18.2, ratio: 3 };
    renderSetups({ setups: [fractional], userId: 'u1', onSave });
    fireEvent.click(chip('Frac · 1:3'));
    expect(doseInput().value).toBe('18.2');
    expect(yieldInput().value).toBe('54.6');
    expect(doseInput().checkValidity()).toBe(true);
    expect(yieldInput().checkValidity()).toBe(true);
    fireEvent.click(screen.getByText('Save quick brew'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ bean_weight_g: 18.2, water_weight_g: 54.6 }));
  });

  it('a hand-typed 17.35 g dose is valid too', () => {
    renderSetups();
    fireEvent.change(doseInput(), { target: { value: '17.35' } });
    expect(doseInput().checkValidity()).toBe(true);
  });

  describe('machine profile', () => {
    const profileInput = () => screen.getByLabelText('Machine profile') as HTMLInputElement;

    it('is an editable field in the full form, filled from the setup, limited to 120 characters', () => {
      renderSetups({ variant: 'full', setups, userId: 'u1' });
      expect(profileInput().value).toBe('');
      fireEvent.click(officeChip());
      expect(profileInput().value).toBe('Extractamundo Dos!');
      expect(profileInput().maxLength).toBe(120);
    });

    it('editing it keeps the chip and setup_name, and the payload carries the edited profile', async () => {
      const onSave = vi.fn();
      renderSetups({ variant: 'full', setups, userId: 'u1', onSave });
      fireEvent.click(officeChip());
      fireEvent.change(profileInput(), { target: { value: 'Londinium' } });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
      await clickSave('Save brew');
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ setup_name: 'Office · Espresso', machine_profile: 'Londinium' })
      );
    });

    it('blank saves as no profile, while the chip stays', async () => {
      const onSave = vi.fn();
      renderSetups({ variant: 'full', setups, userId: 'u1', onSave });
      fireEvent.click(officeChip());
      fireEvent.change(profileInput(), { target: { value: '   ' } });
      await clickSave('Save brew');
      const saved = onSave.mock.calls[0][0] as BrewDraft;
      expect(saved.machine_profile).toBeUndefined();
      expect(saved.setup_name).toBe('Office · Espresso');
    });

    it('Reset puts the setup\'s profile back', () => {
      renderSetups({ variant: 'full', setups, userId: 'u1' });
      fireEvent.click(officeChip());
      fireEvent.change(profileInput(), { target: { value: 'Londinium' } });
      fireEvent.click(screen.getByText('Reset'));
      expect(profileInput().value).toBe('Extractamundo Dos!');
    });

    it('can be typed into a full form with no setup at all', async () => {
      const onSave = vi.fn();
      renderSetups({ variant: 'full', onSave });
      fireEvent.change(profileInput(), { target: { value: 'Flat 9' } });
      await clickSave('Save brew');
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ machine_profile: 'Flat 9' }));
    });

    it('quick form: hidden without a profile, shown once a setup brings one, and kept while cleared', () => {
      renderSetups({ setups, userId: 'u1' });
      expect(screen.queryByLabelText('Machine profile')).not.toBeInTheDocument();
      fireEvent.click(officeChip());
      expect(profileInput().value).toBe('Extractamundo Dos!');
      fireEvent.change(profileInput(), { target: { value: '' } });
      expect(profileInput().value).toBe(''); // still there to type into
      fireEvent.click(homeChip()); // a setup with no profile
      expect(screen.queryByLabelText('Machine profile')).not.toBeInTheDocument();
    });

    it('quick form: editing the profile keeps the chip and the saved payload', async () => {
      const onSave = vi.fn();
      renderSetups({ setups, userId: 'u1', onSave });
      fireEvent.click(officeChip());
      fireEvent.change(profileInput(), { target: { value: 'Blooming' } });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
      await clickSave('Save quick brew');
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ setup_name: 'Office · Espresso', machine_profile: 'Blooming' })
      );
    });
  });

  it('switching chips applies the other one; the previous setup leaves nothing behind', () => {
    renderSetups({ variant: 'full', setups, userId: 'u1' });
    fireEvent.click(officeChip());
    fireEvent.click(homeChip());
    expect(styleSelect().value).toBe('aeropress');
    expect(yieldInput().value).toBe('144');
    expect(grinderSelect().value).toBe('');
    expect((screen.getByLabelText('Grind setting') as HTMLInputElement).value).toBe('');
    expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    expect(homeChip()).toHaveAttribute('aria-pressed', 'true');
    // pour-over style defaults are filled for the unset advanced fields
    expect(totalMinutes().value).toBe('3');
  });

  it('a setup without a dose uses the dose currently on the form', () => {
    renderSetups({ setups: [half], userId: 'u1' });
    fireEvent.change(doseInput(), { target: { value: '20' } });
    fireEvent.click(chip('Half · 1:2.5'));
    expect(doseInput().value).toBe('20');
    expect(yieldInput().value).toBe('50');
  });

  it('clears the grinder when the setup has none, and hydration never refills it', () => {
    mockPrefs.grinders = ['Comandante'];
    mockPrefs.preferredGrinder = 'Comandante';
    const { rerenderWith } = renderSetups({ variant: 'full', setups, userId: 'u1' });
    expect(grinderSelect().value).toBe('Comandante');
    fireEvent.click(homeChip());
    expect(grinderSelect().value).toBe('');
    mockPrefs.preferredGrinder = 'Niche';
    mockPrefs.grinders = ['Comandante', 'Niche'];
    rerenderWith({ variant: 'full', setups, userId: 'u1' });
    expect(grinderSelect().value).toBe('');
  });

  it('hydration arriving after the tap does not fill a grinderless setup', () => {
    const { rerenderWith } = renderSetups({ variant: 'full', setups, userId: 'u1' });
    expect(grinderSelect().value).toBe('');
    fireEvent.click(homeChip());
    mockPrefs.grinders = ['Niche'];
    mockPrefs.preferredGrinder = 'Niche';
    rerenderWith({ variant: 'full', setups, userId: 'u1' });
    expect(grinderSelect().value).toBe('');
  });

  it('shows a setup grinder that is absent from the preferences list as selected, without writing preferences', () => {
    mockPrefs.grinders = ['Comandante'];
    renderSetups({ variant: 'full', setups, userId: 'u1' });
    fireEvent.click(officeChip());
    expect(grinderSelect().value).toBe('DE1 grinder');
    expect(Array.from(grinderSelect().options).map((o) => o.value)).toEqual(['', 'Comandante', 'DE1 grinder']);
    expect(mockSetPreferredGrinder).not.toHaveBeenCalled();
  });

  it('shows an initialDraft grinder that is absent from the preferences list as selected', () => {
    mockPrefs.grinders = ['Comandante'];
    renderSetups({ variant: 'full', initialDraft: { ...baseDraft, grinder_name: 'Old grinder' } });
    expect(grinderSelect().value).toBe('Old grinder');
  });

  it('tapping the selected chip again deselects: values stay, setup_name and machine_profile go', async () => {
    const onSave = vi.fn();
    renderSetups({ setups, userId: 'u1', onSave });
    fireEvent.click(officeChip());
    fireEvent.click(officeChip());
    expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    expect(styleSelect().value).toBe('espresso');
    expect(yieldInput().value).toBe('54');
    await clickSave('Save quick brew');
    const saved = onSave.mock.calls[0][0] as BrewDraft;
    expect(saved.setup_name).toBeUndefined();
    expect(saved.machine_profile).toBeUndefined();
    expect(saved).toMatchObject({ brew_style: 'espresso', water_weight_g: 54 });
  });

  it('editing a non-style field after applying keeps the setup name and the chip', async () => {
    const onSave = vi.fn();
    renderSetups({ setups, userId: 'u1', onSave });
    fireEvent.click(officeChip());
    fireEvent.change(yieldInput(), { target: { value: '40' } });
    fireEvent.change(doseInput(), { target: { value: '17' } });
    expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
    await clickSave('Save quick brew');
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ setup_name: 'Office · Espresso', machine_profile: 'Extractamundo Dos!' })
    );
  });

  describe('changing the style away from the selected setup', () => {
    it('deselects the chip and drops setup_name/machine_profile, keeping the user\'s style through save', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderSetups({ setups, userId: 'u1', onSave });
      fireEvent.click(officeChip());
      fireEvent.change(styleSelect(), { target: { value: 'pour-over' } });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
      expect(styleSelect().value).toBe('pour-over');
      await clickSave('Save quick brew');
      const saved = onSave.mock.calls[0][0] as BrewDraft;
      expect(saved.brew_style).toBe('pour-over');
      expect(saved.setup_name).toBeUndefined();
      expect(saved.machine_profile).toBeUndefined();
      // the next draft is not pulled back to the setup's style
      await waitFor(() => expect(doseInput().value).toBe('18'));
      expect(styleSelect().value).toBe('pour-over');
      expect(yieldInput().value).toBe('270');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    });

    it('Reset keeps the user\'s style instead of flipping back to the setup\'s', () => {
      renderSetups({ setups, userId: 'u1' });
      fireEvent.click(officeChip());
      fireEvent.change(styleSelect(), { target: { value: 'aeropress' } });
      fireEvent.click(screen.getByText('Reset'));
      expect(styleSelect().value).toBe('aeropress');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    });

    it('picking the same style keeps the setup', async () => {
      const onSave = vi.fn();
      renderSetups({ setups, userId: 'u1', onSave });
      fireEvent.click(officeChip());
      fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
      await clickSave('Save quick brew');
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ setup_name: 'Office · Espresso' }));
    });

    it('keeps the last-used storage as the last chip tapped', () => {
      renderSetups({ setups, userId: 'u1' });
      fireEvent.click(officeChip());
      fireEvent.change(styleSelect(), { target: { value: 'pour-over' } });
      expect(localStorage.getItem(lastSetupKey('u1'))).toBe('office');
    });

    it('an orphaned setup_name (no matching setup) is kept as a historical snapshot, with no chip', async () => {
      const onSave = vi.fn();
      renderSetups({ setups, userId: 'u1', onSave, initialDraft: { ...baseDraft, setup_name: 'Gone', machine_profile: 'P' } });
      fireEvent.change(styleSelect(), { target: { value: 'espresso' } });
      await clickSave('Save quick brew');
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ setup_name: 'Gone', machine_profile: 'P' }));
    });
  });

  it('disables the chips while a save is in flight', async () => {
    let finish!: () => void;
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderSetups({ setups, userId: 'u1', onSave });
    fireEvent.click(screen.getByText('Save quick brew'));
    await waitFor(() => expect(officeChip()).toBeDisabled());
    expect(homeChip()).toBeDisabled();
    finish();
    await waitFor(() => expect(officeChip()).not.toBeDisabled());
  });

  describe('last used', () => {
    const key = lastSetupKey('u1');

    it('writes the id when a chip is picked and removes it when deselected', () => {
      renderSetups({ setups, userId: 'u1' });
      fireEvent.click(officeChip());
      expect(localStorage.getItem(key)).toBe('office');
      fireEvent.click(homeChip());
      expect(localStorage.getItem(key)).toBe('home');
      fireEvent.click(homeChip());
      expect(localStorage.getItem(key)).toBeNull();
    });

    it('does not read or write storage without a user id', () => {
      localStorage.setItem('coffee-journal-last-setup:undefined', 'office');
      renderSetups({ setups });
      expect(styleSelect().value).toBe('pour-over');
      fireEvent.click(officeChip());
      expect(localStorage.length).toBe(1);
    });

    it('auto-applies the remembered setup to a fresh draft once setups have loaded', () => {
      localStorage.setItem(key, 'office');
      const { rerenderWith } = renderSetups({ setups: [], userId: 'u1' });
      expect(styleSelect().value).toBe('pour-over');
      rerenderWith({ setups, userId: 'u1' });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
      expect(styleSelect().value).toBe('espresso');
      expect(yieldInput().value).toBe('54');
    });

    it('an auto-applied grinderless setup is not refilled by preference hydration arriving later', () => {
      localStorage.setItem(key, 'home');
      const { rerenderWith } = renderSetups({ variant: 'full', setups: [], userId: 'u1' });
      rerenderWith({ variant: 'full', setups, userId: 'u1' });
      expect(homeChip()).toHaveAttribute('aria-pressed', 'true');
      mockPrefs.grinders = ['Niche'];
      mockPrefs.preferredGrinder = 'Niche';
      rerenderWith({ variant: 'full', setups, userId: 'u1' });
      expect(grinderSelect().value).toBe('');
    });

    it('auto-applies on first render when setups are already there', () => {
      localStorage.setItem(key, 'home');
      renderSetups({ setups, userId: 'u1' });
      expect(homeChip()).toHaveAttribute('aria-pressed', 'true');
      expect(yieldInput().value).toBe('144');
    });

    it('is scoped per user: user B does not get user A\'s setup', () => {
      localStorage.setItem(key, 'office');
      renderSetups({ setups, userId: 'u2' });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
      expect(styleSelect().value).toBe('pour-over');
    });

    it('ignores a remembered id that no longer exists, silently', () => {
      localStorage.setItem(key, 'deleted-setup');
      renderSetups({ setups, userId: 'u1' });
      expect(styleSelect().value).toBe('pour-over');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
      expect(homeChip()).toHaveAttribute('aria-pressed', 'false');
    });

    it('a late setups response does not overwrite what the user already edited', () => {
      localStorage.setItem(key, 'office');
      const { rerenderWith } = renderSetups({ setups: [], userId: 'u1' });
      fireEvent.change(doseInput(), { target: { value: '20' } });
      rerenderWith({ setups, userId: 'u1' });
      expect(styleSelect().value).toBe('pour-over');
      expect(doseInput().value).toBe('20');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    });

    it('a late setups response does not re-apply over a chip the user already picked or deselected', () => {
      localStorage.setItem(key, 'office');
      const { rerenderWith } = renderSetups({ setups: [home], userId: 'u1' });
      // setups arrived without the remembered one; user picks Home, then more arrive
      fireEvent.click(homeChip());
      rerenderWith({ setups, userId: 'u1' });
      expect(homeChip()).toHaveAttribute('aria-pressed', 'true');
      expect(styleSelect().value).toBe('aeropress');
    });

    it.each([
      ['a style pick', () => fireEvent.change(styleSelect(), { target: { value: 'aeropress' } })],
      ['a yield edit', () => fireEvent.change(yieldInput(), { target: { value: '99' } })],
      ['a grinder change', () => fireEvent.change(grinderSelect(), { target: { value: 'Niche' } })],
      ['a flavor tag', () => fireEvent.click(screen.getByRole('button', { name: 'Citrus' }))],
    ])('%s before setups arrive blocks the late auto-apply', (_label, edit) => {
      mockPrefs.grinders = ['Niche'];
      localStorage.setItem(key, 'office');
      const { rerenderWith } = renderSetups({ variant: 'full', setups: [], userId: 'u1' });
      edit();
      rerenderWith({ variant: 'full', setups, userId: 'u1' });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
      expect(styleSelect().value).not.toBe('espresso');
    });

    it('applies at most once per fresh draft: a later setups update does not re-apply', () => {
      localStorage.setItem(key, 'office');
      const { rerenderWith } = renderSetups({ setups, userId: 'u1' });
      fireEvent.click(officeChip()); // deselect
      expect(styleSelect().value).toBe('espresso');
      fireEvent.change(styleSelect(), { target: { value: 'aeropress' } });
      rerenderWith({ setups: [...setups], userId: 'u1' });
      expect(styleSelect().value).toBe('aeropress');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    });

    it('initialDraft beats last-used', () => {
      localStorage.setItem(key, 'office');
      renderSetups({
        setups,
        userId: 'u1',
        initialDraft: { ...baseDraft, brew_style: 'pour-over', water_weight_g: 288 },
      });
      expect(styleSelect().value).toBe('pour-over');
      expect(yieldInput().value).toBe('288');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    });

    it('shows the chip matching initialDraft.setup_name (case-insensitive) selected without re-applying it', () => {
      renderSetups({
        setups,
        userId: 'u1',
        initialDraft: {
          ...baseDraft,
          brew_style: 'espresso',
          bean_weight_g: 18,
          water_weight_g: 40,
          setup_name: 'office · espresso',
          machine_profile: 'Custom',
        },
      });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
      expect(yieldInput().value).toBe('40');
    });

    it('an initialDraft setup_name with no matching setup selects nothing', () => {
      renderSetups({ setups, userId: 'u1', initialDraft: { ...baseDraft, setup_name: 'Gone' } });
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
      expect(homeChip()).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Reset and save', () => {
    it('Reset re-applies the selected setup, not the previous style defaults', () => {
      renderSetups({ setups, userId: 'u1' });
      fireEvent.click(officeChip());
      fireEvent.change(yieldInput(), { target: { value: '30' } });
      fireEvent.click(screen.getByText('Reset'));
      expect(styleSelect().value).toBe('espresso');
      expect(doseInput().value).toBe('18');
      expect(yieldInput().value).toBe('54');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
    });

    it('Reset with a grinderless setup does not refill the preferred grinder', () => {
      mockPrefs.grinders = ['Comandante'];
      mockPrefs.preferredGrinder = 'Comandante';
      renderSetups({ variant: 'full', setups, userId: 'u1' });
      fireEvent.click(homeChip());
      fireEvent.click(screen.getByText('Reset'));
      expect(grinderSelect().value).toBe('');
    });

    it('Reset with no selected setup uses style defaults', () => {
      renderSetups({ setups, userId: 'u1' });
      fireEvent.click(officeChip());
      fireEvent.click(officeChip()); // deselect
      fireEvent.click(screen.getByText('Reset'));
      expect(styleSelect().value).toBe('espresso');
      expect(yieldInput().value).toBe('36');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'false');
    });

    it('after a save the next draft re-applies the selected setup', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderSetups({ variant: 'full', setups, userId: 'u1', onSave });
      fireEvent.click(officeChip());
      fireEvent.change(doseInput(), { target: { value: '20' } });
      await clickSave('Save brew');
      await waitFor(() => expect(doseInput().value).toBe('18'));
      expect(yieldInput().value).toBe('54');
      expect(styleSelect().value).toBe('espresso');
      expect(totalSeconds().value).toBe('36');
      expect(officeChip()).toHaveAttribute('aria-pressed', 'true');
    });

    it('the saved payload and the next draft stay separate', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderSetups({ setups, userId: 'u1', onSave });
      fireEvent.click(homeChip());
      await clickSave('Save quick brew');
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ setup_name: 'Home · AeroPress', brew_style: 'aeropress', water_weight_g: 144 })
      );
    });
  });
});


describe('QuickLogBar grind prefill', () => {
  const beans2: Bean[] = [
    { id: 'bean-1', name: 'Ethiopia', created_at: '', updated_at: '' },
    { id: 'bean-2', name: 'Kenya', created_at: '', updated_at: '' },
    { id: 'bean-3', name: 'Brazil', created_at: '', updated_at: '' },
  ];
  const office: BrewSetup = {
    id: 'office',
    name: 'Office · Espresso',
    brew_style: 'espresso',
    ratio: 3,
    dose_g: 18,
    grinder_name: 'Comandante',
    target_time_s: 36,
    machine_profile: null,
  };
  const grindInput = () => screen.getByLabelText('Grind setting') as HTMLInputElement;
  const beanSelect = () => screen.getByLabelText('Bean') as HTMLSelectElement;
  const hint = (date = '2026-10-03') => {
    const [y, m, d] = date.split('-').map(Number);
    const text = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return screen.queryByText(`from your ${text} brew`);
  };
  const found = (grind: string, date = '2026-10-03') => ({ grind_setting: grind, date });

  interface Opts {
    variant?: 'quick' | 'full';
    onSave?: (draft: BrewDraft) => void | Promise<void>;
    initialDraft?: DraftForm;
    setups?: BrewSetup[];
    strict?: boolean;
  }
  function renderPrefill(o: Opts = {}) {
    const ui = (
      <BrowserRouter>
        <QuickLogBar
          beans={beans2}
          onSave={o.onSave ?? vi.fn()}
          defaultBeanId="bean-1"
          variant={o.variant ?? 'full'}
          initialDraft={o.initialDraft}
          setups={o.setups}
          userId="u1"
        />
      </BrowserRouter>
    );
    return render(o.strict ? <StrictMode>{ui}</StrictMode> : ui);
  }
  // A lookup whose answer the test releases by hand.
  function deferred() {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  beforeEach(() => {
    mockPrefs.grinders = ['Niche', 'Comandante'];
    mockPrefs.preferredGrinder = 'Niche';
  });

  it('prefills the grind for the bean and grinder, with a hint tied to the input', async () => {
    api.fetchLastGrind.mockResolvedValue(found('14'));
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    expect(api.fetchLastGrind).toHaveBeenCalledWith('bean-1', 'Niche');
    const note = hint();
    expect(note).toBeInTheDocument();
    expect(grindInput()).toHaveAttribute('aria-describedby', note!.id);
    // The hint describes the input; it must not rename it.
    expect(screen.getByLabelText('Grind setting')).toBe(grindInput());
  });

  it('does not look anything up without a grinder, and does when one is picked', async () => {
    mockPrefs.preferredGrinder = undefined;
    api.fetchLastGrind.mockResolvedValue(found('14'));
    renderPrefill();
    expect(api.fetchLastGrind).not.toHaveBeenCalled();
    expect(grindInput().value).toBe('');
    fireEvent.change(grinderSelect(), { target: { value: 'Comandante' } });
    await waitFor(() => expect(grindInput().value).toBe('14'));
    expect(api.fetchLastGrind).toHaveBeenCalledWith('bean-1', 'Comandante');
  });

  it('does not look anything up without a bean', async () => {
    renderPrefill();
    await waitFor(() => expect(api.fetchLastGrind).toHaveBeenCalledTimes(1));
    api.fetchLastGrind.mockClear();
    fireEvent.change(beanSelect(), { target: { value: '' } });
    await Promise.resolve();
    expect(api.fetchLastGrind).not.toHaveBeenCalled();
  });

  it('never overwrites a grind the user typed, even when the response lands late', async () => {
    const lookup = deferred();
    api.fetchLastGrind.mockReturnValue(lookup.promise);
    renderPrefill();
    fireEvent.change(grindInput(), { target: { value: '18' } });
    lookup.resolve(found('14'));
    await act(async () => {
      await lookup.promise;
    });
    expect(grindInput().value).toBe('18');
    expect(hint()).not.toBeInTheDocument();
  });

  it('typing replaces a prefill and removes the hint; later bean changes leave the typed grind alone', async () => {
    api.fetchLastGrind.mockResolvedValue(found('14'));
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    fireEvent.change(grindInput(), { target: { value: '15' } });
    expect(hint()).not.toBeInTheDocument();
    api.fetchLastGrind.mockClear();
    fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
    await Promise.resolve();
    expect(api.fetchLastGrind).not.toHaveBeenCalled();
    expect(grindInput().value).toBe('15');
  });

  it('a user who cleared the grind to empty has still decided it', async () => {
    api.fetchLastGrind.mockResolvedValue(found('14'));
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    fireEvent.change(grindInput(), { target: { value: '' } });
    fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
    await Promise.resolve();
    expect(grindInput().value).toBe('');
  });

  it('drops a stale response: the bean changed while the lookup was in flight', async () => {
    const first = deferred();
    const second = deferred();
    api.fetchLastGrind.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderPrefill();
    fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
    expect(api.fetchLastGrind).toHaveBeenLastCalledWith('bean-2', 'Niche');
    // The answer for the old bean arrives after the switch, then the new one.
    first.resolve(found('OLD-BEAN'));
    await act(async () => {
      await first.promise;
    });
    expect(grindInput().value).toBe('');
    second.resolve(found('9'));
    await waitFor(() => expect(grindInput().value).toBe('9'));
  });

  it('drops a stale response: the grinder changed while the lookup was in flight', async () => {
    const first = deferred();
    api.fetchLastGrind.mockReturnValueOnce(first.promise).mockResolvedValueOnce(null);
    renderPrefill();
    fireEvent.change(grinderSelect(), { target: { value: 'Comandante' } });
    first.resolve(found('NICHE-GRIND'));
    await act(async () => {
      await first.promise;
    });
    expect(grindInput().value).toBe('');
    expect(hint()).not.toBeInTheDocument();
  });

  it('a bean change re-looks-up a prefilled grind, and clears it when there is none', async () => {
    api.fetchLastGrind.mockImplementation(async (beanId: string) =>
      beanId === 'bean-1' ? found('14') : beanId === 'bean-2' ? found('9', '2026-09-20') : null
    );
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));

    fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
    await waitFor(() => expect(grindInput().value).toBe('9'));
    expect(hint('2026-09-20')).toBeInTheDocument();
    expect(hint()).not.toBeInTheDocument();

    fireEvent.change(beanSelect(), { target: { value: 'bean-3' } });
    await waitFor(() => expect(grindInput().value).toBe(''));
    expect(screen.queryByText(/^from your/)).not.toBeInTheDocument();
  });

  it('a grinder change re-looks-up; deselecting the grinder clears a prefilled grind', async () => {
    api.fetchLastGrind.mockImplementation(async (_bean: string, grinder: string) =>
      grinder === 'Niche' ? found('14') : grinder === 'Comandante' ? found('24 clicks') : null
    );
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    fireEvent.change(grinderSelect(), { target: { value: 'Comandante' } });
    await waitFor(() => expect(grindInput().value).toBe('24 clicks'));
    fireEvent.change(grinderSelect(), { target: { value: '' } });
    await waitFor(() => expect(grindInput().value).toBe(''));
    expect(screen.queryByText(/^from your/)).not.toBeInTheDocument();
  });

  it('applying a setup moves the grinder, then the lookup fills the grind and leaves it there', async () => {
    api.fetchLastGrind.mockImplementation(async (_bean: string, grinder: string) =>
      grinder === 'Comandante' ? found('22 clicks') : null
    );
    renderPrefill({ setups: [office] });
    await waitFor(() => expect(api.fetchLastGrind).toHaveBeenCalledWith('bean-1', 'Niche'));
    fireEvent.click(screen.getByRole('button', { name: 'Office · Espresso · 1:3' }));
    expect(grinderSelect().value).toBe('Comandante');
    await waitFor(() => expect(grindInput().value).toBe('22 clicks'));
    expect(hint()).toBeInTheDocument();
  });

  it('a setup apply does not clear a typed grind', async () => {
    renderPrefill({ setups: [office] });
    fireEvent.change(grindInput(), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Office · Espresso · 1:3' }));
    await waitFor(() => expect(grinderSelect().value).toBe('Comandante'));
    expect(grindInput().value).toBe('18');
  });

  it('keeps an initialDraft grind and does not look it up', async () => {
    api.fetchLastGrind.mockResolvedValue(found('14'));
    renderPrefill({ initialDraft: { ...baseDraft, grinder_name: 'Niche', grind_setting: '20' } });
    await Promise.resolve();
    expect(grindInput().value).toBe('20');
    expect(api.fetchLastGrind).not.toHaveBeenCalled();
    fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
    await Promise.resolve();
    expect(grindInput().value).toBe('20');
    expect(api.fetchLastGrind).not.toHaveBeenCalled();
  });

  it('prefills an initialDraft that has bean and grinder but no grind', async () => {
    api.fetchLastGrind.mockResolvedValue(found('14'));
    renderPrefill({ initialDraft: { ...baseDraft, grinder_name: 'Niche' } });
    await waitFor(() => expect(grindInput().value).toBe('14'));
  });

  it('a failing lookup is harmless: no prefill, no hint, the form still saves', async () => {
    api.fetchLastGrind.mockRejectedValue(new TypeError('offline'));
    const onSave = vi.fn();
    renderPrefill({ onSave });
    await waitFor(() => expect(api.fetchLastGrind).toHaveBeenCalled());
    await act(async () => {});
    expect(grindInput().value).toBe('');
    expect(hint()).not.toBeInTheDocument();
    await clickSave('Save brew');
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('a failure after a bean change clears the old bean\'s prefill instead of keeping it', async () => {
    api.fetchLastGrind.mockResolvedValueOnce(found('14')).mockRejectedValueOnce(new TypeError('offline'));
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
    await act(async () => {});
    expect(grindInput().value).toBe('');
  });

  it('the saved brew carries the prefilled grind, in the quick form too', async () => {
    api.fetchLastGrind.mockResolvedValue(found('14'));
    const onSave = vi.fn();
    renderPrefill({ variant: 'quick', onSave });
    await waitFor(() => expect(api.fetchLastGrind).toHaveBeenCalled());
    await act(async () => {});
    await clickSave('Save quick brew');
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ bean_id: 'bean-1', grinder_name: 'Niche', grind_setting: '14' })
    );
  });

  describe('quick form', () => {
    const quickGrind = () => screen.queryByLabelText('Grind setting') as HTMLInputElement | null;

    it('shows no grind field while there is no grind and no prefill', async () => {
      renderPrefill({ variant: 'quick' });
      await act(async () => {});
      expect(quickGrind()).not.toBeInTheDocument();
    });

    it('shows an editable grind field with the hint when a grind was prefilled', async () => {
      api.fetchLastGrind.mockResolvedValue(found('14'));
      renderPrefill({ variant: 'quick' });
      await waitFor(() => expect(quickGrind()?.value).toBe('14'));
      expect(hint()).toBeInTheDocument();
      expect(quickGrind()).toHaveAttribute('aria-describedby', hint()!.id);
    });

    it('saves the grind as edited there, not the prefill', async () => {
      api.fetchLastGrind.mockResolvedValue(found('14'));
      const onSave = vi.fn();
      renderPrefill({ variant: 'quick', onSave });
      await waitFor(() => expect(quickGrind()?.value).toBe('14'));
      fireEvent.change(quickGrind()!, { target: { value: '16' } });
      expect(hint()).not.toBeInTheDocument();
      await clickSave('Save quick brew');
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ grind_setting: '16' }));
    });

    it('stays on screen once shown, even when the grind is cleared', async () => {
      api.fetchLastGrind.mockResolvedValue(found('14'));
      renderPrefill({ variant: 'quick' });
      await waitFor(() => expect(quickGrind()?.value).toBe('14'));
      fireEvent.change(quickGrind()!, { target: { value: '' } });
      expect(quickGrind()).toBeInTheDocument();
    });

    it('shows a grind the incoming draft carries', () => {
      renderPrefill({ variant: 'quick', initialDraft: { ...baseDraft, grinder_name: 'Niche', grind_setting: '20' } });
      expect(quickGrind()?.value).toBe('20');
    });

    it('a fresh draft hides it again until the next prefill', async () => {
      api.fetchLastGrind.mockResolvedValueOnce(found('14')).mockResolvedValue(null);
      renderPrefill({ variant: 'quick', onSave: vi.fn().mockResolvedValue(undefined) });
      await waitFor(() => expect(quickGrind()?.value).toBe('14'));
      await clickSave('Save quick brew');
      await waitFor(() => expect(quickGrind()).not.toBeInTheDocument());
    });
  });

  it('after a save the fresh draft looks the grind up again, same bean and grinder', async () => {
    api.fetchLastGrind.mockResolvedValueOnce(found('14')).mockResolvedValueOnce(found('15', '2026-10-07'));
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderPrefill({ onSave });
    await waitFor(() => expect(grindInput().value).toBe('14'));
    await clickSave('Save brew');
    await waitFor(() => expect(grindInput().value).toBe('15'));
    expect(api.fetchLastGrind).toHaveBeenCalledTimes(2);
    expect(hint('2026-10-07')).toBeInTheDocument();
  });

  it('Reset hands a typed grind back to the lookup', async () => {
    api.fetchLastGrind.mockResolvedValue(found('14'));
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    fireEvent.change(grindInput(), { target: { value: '99' } });
    fireEvent.click(screen.getByText('Reset'));
    expect(grindInput().value).toBe('');
    await waitFor(() => expect(grindInput().value).toBe('14'));
  });

  it('a response that was in flight before Reset does not land on the new draft', async () => {
    const stale = deferred();
    api.fetchLastGrind.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(null);
    renderPrefill();
    fireEvent.click(screen.getByText('Reset'));
    stale.resolve(found('STALE'));
    await act(async () => {
      await stale.promise;
    });
    expect(grindInput().value).toBe('');
  });

  it('does not count as an edit: the last-used setup still auto-applies afterwards', async () => {
    localStorage.setItem(lastSetupKey('u1'), 'office');
    api.fetchLastGrind.mockResolvedValue(found('14'));
    const { rerender } = renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    rerender(
      <BrowserRouter>
        <QuickLogBar beans={beans2} onSave={vi.fn()} defaultBeanId="bean-1" variant="full" setups={[office]} userId="u1" />
      </BrowserRouter>
    );
    await waitFor(() => expect(grinderSelect().value).toBe('Comandante'));
  });

  it('adds the year to the hint when the brew is not from this year', async () => {
    const year = new Date().getFullYear();
    api.fetchLastGrind.mockResolvedValue(found('14', `${year - 1}-10-03`));
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    const old = new Date(year - 1, 9, 3).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    expect(screen.getByText(`from your ${old} brew`)).toBeInTheDocument();
  });

  it('omits the year for a brew from this year', async () => {
    const year = new Date().getFullYear();
    api.fetchLastGrind.mockResolvedValue(found('14', `${year}-01-05`));
    renderPrefill();
    await waitFor(() => expect(grindInput().value).toBe('14'));
    const text = new Date(year, 0, 5).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    expect(screen.getByText(`from your ${text} brew`)).toBeInTheDocument();
  });

  describe('initialGrindPrefill (quick -> full navigation)', () => {
    const seeded = { grind: '20', date: '2026-10-03' };
    const draft = { ...baseDraft, grinder_name: 'Niche', grind_setting: '20' };
    const renderSeeded = (initialGrindPrefill: { grind: string; date: string } | undefined, d = draft) =>
      render(
        <BrowserRouter>
          <QuickLogBar
            beans={beans2}
            onSave={vi.fn()}
            defaultBeanId="bean-1"
            variant="full"
            initialDraft={d}
            initialGrindPrefill={initialGrindPrefill}
            userId="u1"
          />
        </BrowserRouter>
      );

    it('shows the hint at once, without another lookup', async () => {
      renderSeeded(seeded);
      expect(grindInput().value).toBe('20');
      expect(hint()).toBeInTheDocument();
      await act(async () => {});
      expect(api.fetchLastGrind).not.toHaveBeenCalled();
    });

    it('a bean change re-looks-up the carried grind, and clears it when there is none', async () => {
      api.fetchLastGrind.mockResolvedValueOnce(found('9')).mockResolvedValueOnce(null);
      renderSeeded(seeded);
      fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
      await waitFor(() => expect(grindInput().value).toBe('9'));
      fireEvent.change(beanSelect(), { target: { value: 'bean-3' } });
      await waitFor(() => expect(grindInput().value).toBe(''));
      expect(hint()).not.toBeInTheDocument();
    });

    it('typing still decides it', async () => {
      renderSeeded(seeded);
      fireEvent.change(grindInput(), { target: { value: '21' } });
      expect(hint()).not.toBeInTheDocument();
      fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
      await act(async () => {});
      expect(api.fetchLastGrind).not.toHaveBeenCalled();
      expect(grindInput().value).toBe('21');
    });

    it('ignores a prefill that does not match the draft grind (the draft grind is then decided)', async () => {
      renderSeeded({ grind: 'something else', date: '2026-10-03' });
      expect(hint()).not.toBeInTheDocument();
      fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
      await act(async () => {});
      expect(api.fetchLastGrind).not.toHaveBeenCalled();
      expect(grindInput().value).toBe('20');
    });
  });

  describe('offline queue', () => {
    const queued = (over: Record<string, unknown> = {}) => ({
      local_id: 'l1',
      synced: false,
      created_at: '2026-10-05T10:00:00.000Z',
      date: '2026-10-05',
      bean_id: 'bean-1',
      grinder_name: 'niche ',
      grind_setting: '15',
      bean_weight_g: 18,
      water_weight_g: 288,
      agitation_events: [],
      flavor_tags: [],
      ...over,
    });
    const serverBrew = (over = {}) => ({
      grind_setting: '14',
      date: '2026-10-05',
      created_at: '2026-10-05T09:00:00.000Z',
      ...over,
    });

    it('a newer queued brew beats the server answer', async () => {
      mockLocal.unsynced = [queued()];
      api.fetchLastGrind.mockResolvedValue(serverBrew());
      renderPrefill();
      await waitFor(() => expect(grindInput().value).toBe('15'));
      await act(async () => {});
      expect(grindInput().value).toBe('15');
    });

    it('a newer server brew beats the queue', async () => {
      mockLocal.unsynced = [queued()];
      api.fetchLastGrind.mockResolvedValue(serverBrew({ date: '2026-10-06', created_at: '2026-10-06T07:00:00Z' }));
      renderPrefill();
      await waitFor(() => expect(grindInput().value).toBe('14'));
      expect(hint('2026-10-06')).toBeInTheDocument();
    });

    it('offline: the queue still suggests a grind', async () => {
      mockLocal.unsynced = [queued()];
      api.fetchLastGrind.mockRejectedValue(new TypeError('offline'));
      renderPrefill();
      await waitFor(() => expect(grindInput().value).toBe('15'));
      expect(hint('2026-10-05')).toBeInTheDocument();
    });

    it('queued brews of another bean, another grinder, or already synced are ignored', async () => {
      mockLocal.unsynced = [
        queued({ bean_id: 'bean-2' }),
        queued({ grinder_name: 'Comandante' }),
        queued({ synced: true }),
      ];
      api.fetchLastGrind.mockResolvedValue(serverBrew());
      renderPrefill();
      await waitFor(() => expect(grindInput().value).toBe('14'));
    });

    it('a bean change consults the queue for the new bean', async () => {
      mockLocal.unsynced = [queued({ bean_id: 'bean-2', grind_setting: '9' })];
      api.fetchLastGrind.mockResolvedValue(serverBrew());
      renderPrefill();
      await waitFor(() => expect(grindInput().value).toBe('14'));
      fireEvent.change(beanSelect(), { target: { value: 'bean-2' } });
      await waitFor(() => expect(grindInput().value).toBe('9'));
    });
  });

  describe('grinder changed after a typed grind', () => {
    const warning = () => screen.queryByText('Grinder changed — check grind setting');

    it('keeps the typed text and warns, tied to the input; typing again clears the warning', async () => {
      renderPrefill();
      await act(async () => {});
      fireEvent.change(grindInput(), { target: { value: '18' } });
      expect(warning()).not.toBeInTheDocument();
      fireEvent.change(grinderSelect(), { target: { value: 'Comandante' } });
      expect(grindInput().value).toBe('18');
      expect(warning()).toBeInTheDocument();
      expect(grindInput().getAttribute('aria-describedby')).toContain(warning()!.id);
      fireEvent.change(grindInput(), { target: { value: '19' } });
      expect(warning()).not.toBeInTheDocument();
    });

    it('also fires when a setup apply moves the grinder', async () => {
      renderPrefill({ setups: [office] });
      fireEvent.change(grindInput(), { target: { value: '18' } });
      fireEvent.click(screen.getByRole('button', { name: 'Office · Espresso · 1:3' }));
      await waitFor(() => expect(warning()).toBeInTheDocument());
      expect(grindInput().value).toBe('18');
    });

    it('does not fire for a prefilled grind (it is re-looked-up instead), or with no typed grind', async () => {
      api.fetchLastGrind.mockResolvedValue(found('14'));
      renderPrefill();
      await waitFor(() => expect(grindInput().value).toBe('14'));
      fireEvent.change(grinderSelect(), { target: { value: 'Comandante' } });
      await act(async () => {});
      expect(warning()).not.toBeInTheDocument();
    });

    it('does not fire when the grinder was empty before (hydration, first pick)', async () => {
      mockPrefs.preferredGrinder = undefined;
      renderPrefill();
      fireEvent.change(grindInput(), { target: { value: '18' } });
      fireEvent.change(grinderSelect(), { target: { value: 'Comandante' } });
      expect(warning()).not.toBeInTheDocument();
    });

    it('Reset clears it', async () => {
      renderPrefill();
      fireEvent.change(grindInput(), { target: { value: '18' } });
      fireEvent.change(grinderSelect(), { target: { value: 'Comandante' } });
      expect(warning()).toBeInTheDocument();
      fireEvent.click(screen.getByText('Reset'));
      expect(warning()).not.toBeInTheDocument();
    });
  });

  it('works under StrictMode double effects', async () => {
    api.fetchLastGrind.mockResolvedValue(found('14'));
    renderPrefill({ strict: true });
    await waitFor(() => expect(grindInput().value).toBe('14'));
    expect(hint()).toBeInTheDocument();
  });
});
