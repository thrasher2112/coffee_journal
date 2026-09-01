import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AromaTag, Bean, BrewDraft, FlavorTag } from '../types';
import { BeanPicker } from './BeanPicker';
import { FlavorWheel } from './FlavorWheel';
import { AromaTags } from './AromaTags';
import { usePreferences } from '../contexts/PreferencesContext';
import type { TemperatureUnit } from '../contexts/PreferencesContext';

interface Props {
  beans: Bean[];
  onSave: (draft: BrewDraft) => Promise<void> | void;
  defaultBeanId?: string;
}

const BREW_STYLE_PRESETS = {
  'pour-over': {
    label: 'Pour over',
    ratios: [15, 16, 17], // Hoffmann's V60 baseline (~60g/L) rounded to integer ratios
  },
  aeropress: {
    label: 'Aeropress',
    ratios: [17, 18, 19], // Hoffmann's championship AeroPress recipe sits around 1:18
  },
  'french-press': {
    label: 'French press',
    ratios: [13, 15, 17], // Hoffmann recommends 65–75g/L immersion brews ≈1:13–1:15
  },
} as const;

const DEFAULT_WATER_TEMP = 96;
const DEFAULT_BLOOM_TIME = 45;
const DEFAULT_BREW_TIME = 180;

type BrewStyle = keyof typeof BREW_STYLE_PRESETS;
// Omit the numeric fields that allow a blank ('') input state before
// re-adding them below — intersecting BrewDraft's plain `number` types
// directly with a `number | ''` union would collapse back to `number`
// (the empty-string member has no overlap with BrewDraft's type), silently
// losing the "blank input" case these form fields rely on.
type DraftForm = Omit<
  BrewDraft,
  'bean_weight_g' | 'water_weight_g' | 'water_temp_c' | 'bloom_time_s' | 'total_brew_time_s'
> & {
  bean_weight_g: number | '';
  water_weight_g: number | '';
  water_temp_c?: number | '';
  bloom_time_s?: number | '';
  total_brew_time_s?: number | '';
};

const makeDraft = (beanId?: string, brewStyle: BrewStyle = 'pour-over', grinder?: string): DraftForm => ({
  bean_id: beanId,
  bean_weight_g: 18,
  water_weight_g: 288,
  brew_style: brewStyle,
  date: new Date().toISOString().slice(0, 10),
  agitation_events: [],
  flavor_tags: [],
  aroma_tags: [],
  quick_notes: '',
  rating: 8,
  aroma_rating: 8,
  flavor_rating: 8,
  grinder_name: grinder,
  grind_setting: ''
});

const withAdvancedDefaults = (draft: DraftForm): DraftForm => ({
  ...draft,
  water_temp_c: draft.water_temp_c ?? DEFAULT_WATER_TEMP,
  bloom_time_s: draft.bloom_time_s ?? DEFAULT_BLOOM_TIME,
  total_brew_time_s: draft.total_brew_time_s ?? DEFAULT_BREW_TIME
});

const toDisplayTemp = (celsius: number | '' | undefined, unit: TemperatureUnit) => {
  if (celsius === '' || celsius === undefined) return '';
  if (typeof celsius !== 'number' || Number.isNaN(celsius)) return '';
  return unit === 'fahrenheit' ? Math.round((celsius * 9) / 5 + 32).toString() : celsius.toString();
};

export function QuickLogBar({ beans, onSave, defaultBeanId }: Props) {
  const { preferences, setPreferredGrinder } = usePreferences();
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [brewStyle, setBrewStyle] = useState<BrewStyle>('pour-over');
  const [form, setForm] = useState<DraftForm>(() =>
    makeDraft(defaultBeanId, 'pour-over', preferences.preferredGrinder)
  );
  const [waterTempInput, setWaterTempInput] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setWaterTempInput(toDisplayTemp(form.water_temp_c, preferences.temperatureUnit));
  }, [preferences.temperatureUnit]);

  useEffect(() => {
    if (!defaultBeanId) return;
    setForm((prev) =>
      prev.bean_id
        ? prev
        : {
            ...prev,
            bean_id: defaultBeanId,
            brew_style: brewStyle,
          }
    );
  }, [defaultBeanId, brewStyle]);

  useEffect(() => {
    if (!preferences.preferredGrinder) return;
    setForm((prev) => {
      if (prev.grinder_name) {
        return prev;
      }
      return { ...prev, grinder_name: preferences.preferredGrinder };
    });
  }, [preferences.preferredGrinder]);

  useEffect(() => {
    const preferredRatio = BREW_STYLE_PRESETS[brewStyle].ratios[0];
    setForm((prev) => {
      if (prev.bean_weight_g === '' || prev.water_weight_g === '') {
        return { ...prev, brew_style: brewStyle };
      }
      const nextYield = Number((prev.bean_weight_g * preferredRatio).toFixed(1));
      const shouldUpdateYield = Math.abs(prev.water_weight_g - nextYield) >= 0.1;
      return {
        ...prev,
        brew_style: brewStyle,
        water_weight_g: shouldUpdateYield ? nextYield : prev.water_weight_g,
      };
    });
  }, [brewStyle]);

  useEffect(() => {
    if (!isAdvanced) return;
    setForm((prev) => withAdvancedDefaults(prev));
  }, [isAdvanced]);

  const handleAdvancedToggle = (checked: boolean) => {
    setIsAdvanced(checked);
    if (checked) {
      setForm((prev) => {
        const next = withAdvancedDefaults(prev);
        setWaterTempInput(toDisplayTemp(next.water_temp_c, preferences.temperatureUnit));
        return next;
      });
    }
  };

  const beanWeight = typeof form.bean_weight_g === 'number' ? form.bean_weight_g : NaN;
  const waterWeight = typeof form.water_weight_g === 'number' ? form.water_weight_g : NaN;
  const ratio = useMemo(() => {
    if (!Number.isFinite(beanWeight) || beanWeight === 0 || !Number.isFinite(waterWeight)) return undefined;
    return waterWeight / beanWeight;
  }, [beanWeight, waterWeight]);
  const stylePresets = BREW_STYLE_PRESETS[brewStyle];
  const grinderOptions = preferences.grinders;
  const selectedGrinder =
    form.grinder_name && grinderOptions.includes(form.grinder_name) ? form.grinder_name : '';

  const update = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTag = (tag: FlavorTag) => {
    setForm((prev) => {
      const exists = prev.flavor_tags.includes(tag);
      return {
        ...prev,
        flavor_tags: exists ? prev.flavor_tags.filter((item) => item !== tag) : [...prev.flavor_tags, tag]
      };
    });
  };

  const toggleAromaTag = (tag: AromaTag) => {
    setForm((prev) => {
      const nextList = prev.aroma_tags ?? [];
      const exists = nextList.includes(tag);
      return {
        ...prev,
        aroma_tags: exists ? nextList.filter((item) => item !== tag) : [...nextList, tag]
      };
    });
  };

  const addAgitation = () => {
    update('agitation_events', [...form.agitation_events, { timestamp_s: 0, action: 'pour', amount_g: 50 }]);
  };

  const updateAgitation = (index: number, key: 'timestamp_s' | 'action' | 'amount_g', value: string) => {
    const events = [...form.agitation_events];
    const nextValue =
      key === 'timestamp_s' || key === 'amount_g'
        ? value === ''
          ? undefined
          : Number(value)
        : value;
    const next = { ...events[index], [key]: nextValue };
    events[index] = next;
    update('agitation_events', events);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.bean_id) {
      alert('Select a bean to log a brew.');
      return;
    }
    if (typeof form.bean_weight_g !== 'number' || typeof form.water_weight_g !== 'number') {
      alert('Enter dose and yield before saving.');
      return;
    }
    setSaving(true);
    try {
      const payload: BrewDraft = {
        ...form,
        bean_weight_g: form.bean_weight_g,
        water_weight_g: form.water_weight_g,
        water_temp_c: form.water_temp_c === '' ? undefined : form.water_temp_c,
        bloom_time_s: form.bloom_time_s === '' ? undefined : form.bloom_time_s,
        total_brew_time_s: form.total_brew_time_s === '' ? undefined : form.total_brew_time_s
      };
      await onSave(payload);
      setForm(() => {
        const draft = makeDraft(form.bean_id, brewStyle, preferences.preferredGrinder);
        setWaterTempInput('');
        return draft;
      });
    } finally {
      setSaving(false);
    }
  };

  const convertCToF = (value: number) => Math.round((value * 9) / 5 + 32);
  const convertFToC = (value: number) => Math.round(((value - 32) * 5) / 9);

  const handleWaterTempChange = (rawValue: string) => {
    setWaterTempInput(rawValue);
    if (rawValue === '') {
      update('water_temp_c', undefined);
      return;
    }
    const parsed = Number(rawValue);
    if (Number.isNaN(parsed)) {
      return;
    }
    const celsius = preferences.temperatureUnit === 'fahrenheit' ? convertFToC(parsed) : parsed;
    update('water_temp_c', celsius);
  };

  const handleGrinderSelect = (value: string) => {
    if (!value) {
      update('grinder_name', undefined);
      return;
    }
    setPreferredGrinder(value);
    update('grinder_name', value);
  };

  return (
    <section id="quick-log" className="journal-card px-6 py-8 text-espresso">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-moss">Log a brew</p>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-3xl font-display">Quick Brew</h2>
            <label className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-moss">
              Style
              <select
                value={brewStyle}
                onChange={(event) => setBrewStyle(event.target.value as BrewStyle)}
                className="min-h-11 min-w-[170px] rounded-full border border-caramel/40 bg-espresso/60 px-3 py-1 text-crema text-sm normal-case"
              >
                {Object.entries(BREW_STYLE_PRESETS).map(([value, meta]) => (
                  <option key={value} value={value}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-moss">
            <input
              type="checkbox"
              className="h-5 w-5 accent-ember"
              checked={isAdvanced}
              onChange={(e) => handleAdvancedToggle(e.target.checked)}
            />
            Advanced mode
          </label>
          <Link to="/brew" className="inline-flex min-h-11 items-center justify-center min-h-11 text-xs uppercase tracking-[0.3em] text-caramel">
            Open full form
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center min-h-11 px-1 text-caramel underline"
            onClick={() => setForm(makeDraft(defaultBeanId, brewStyle, preferences.preferredGrinder))}
          >
            Reset
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <BeanPicker beans={beans} value={form.bean_id} onChange={(value) => update('bean_id', value)} />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-moss">Dose (g)</span>
            <input
              type="number"
              min={5}
              step={0.5}
              value={form.bean_weight_g === '' ? '' : form.bean_weight_g}
              onChange={(event) =>
                update('bean_weight_g', event.target.value === '' ? '' : Number(event.target.value))
              }
              className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-moss">Yield (g)</span>
            <input
              type="number"
              min={50}
              step={1}
              value={form.water_weight_g === '' ? '' : form.water_weight_g}
              onChange={(event) =>
                update('water_weight_g', event.target.value === '' ? '' : Number(event.target.value))
              }
              className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-moss">
          <span>Ratio: {ratio ? ratio.toFixed(1) : '—'}</span>
          {stylePresets.ratios.map((value) => {
            const isActive = ratio ? Math.abs(ratio - value) < 0.1 : false;
            return (
              <button
                key={value}
                type="button"
                onClick={() =>
                  update(
                    'water_weight_g',
                    typeof form.bean_weight_g === 'number'
                      ? Number((form.bean_weight_g * value).toFixed(1))
                      : form.water_weight_g
                  )
                }
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide ${
                  isActive ? 'border-ember bg-ember/90 text-crema' : 'border-caramel/40 text-espresso'
                }`}
              >
                1:{value}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-4 text-sm">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-[0.3em] text-moss">Overall rating</span>
              <input
                type="range"
                min={1}
                max={10}
                value={form.rating ?? 7}
                onChange={(event) => update('rating', Number(event.target.value))}
                className="accent-ember"
              />
              <span className="text-xs text-moss">{form.rating}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-[0.3em] text-moss">Aroma</span>
              <input
                type="range"
                min={1}
                max={10}
                value={form.aroma_rating ?? 7}
                onChange={(event) => update('aroma_rating', Number(event.target.value))}
                className="accent-ember"
              />
              <span className="text-xs text-moss">{form.aroma_rating}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs uppercase tracking-[0.3em] text-moss">Flavor</span>
              <input
                type="range"
                min={1}
                max={10}
                value={form.flavor_rating ?? 7}
                onChange={(event) => update('flavor_rating', Number(event.target.value))}
                className="accent-ember"
              />
              <span className="text-xs text-moss">{form.flavor_rating}</span>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-moss">Quick notes</span>
            <textarea
              value={form.quick_notes}
              onChange={(event) => update('quick_notes', event.target.value)}
              className="paper-lines rounded-lg border border-caramel/40 bg-transparent px-3 py-2 text-espresso"
              rows={6}
            />
          </label>
        </div>

        {isAdvanced && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">
                  Water temp °{preferences.temperatureUnit === 'fahrenheit' ? 'F' : 'C'}
                </span>
                <input
                  type="number"
                  min={preferences.temperatureUnit === 'fahrenheit' ? 120 : 50}
                  max={preferences.temperatureUnit === 'fahrenheit' ? 212 : 100}
                  value={waterTempInput}
                  onChange={(event) => handleWaterTempChange(event.target.value)}
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">Bloom time (s)</span>
                <input
                  type="number"
                  value={form.bloom_time_s === '' ? '' : form.bloom_time_s ?? DEFAULT_BLOOM_TIME}
                  onChange={(event) =>
                    update('bloom_time_s', event.target.value === '' ? '' : Number(event.target.value))
                  }
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">Total brew time (s)</span>
                <input
                  type="number"
                  value={form.total_brew_time_s === '' ? '' : form.total_brew_time_s ?? DEFAULT_BREW_TIME}
                  onChange={(event) =>
                    update('total_brew_time_s', event.target.value === '' ? '' : Number(event.target.value))
                  }
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">Grinder</span>
                <select
                  value={selectedGrinder}
                  onChange={(event) => handleGrinderSelect(event.target.value)}
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                >
                  <option value="">Select grinder</option>
                  {grinderOptions.map((grinder) => (
                    <option key={grinder} value={grinder}>
                      {grinder}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">Grind setting</span>
                <input
                  type="text"
                  value={form.grind_setting ?? ''}
                  placeholder="e.g., 18, 7.5, 24 clicks"
                  onChange={(event) => update('grind_setting', event.target.value)}
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                />
              </label>
            </div>
            <div className="space-y-4">
              <FlavorWheel selected={form.flavor_tags} onToggle={toggleTag} />
              <AromaTags selected={form.aroma_tags ?? []} onToggle={toggleAromaTag} />
              <div className="rounded-2xl border border-caramel/40 bg-crema/80 p-4 text-espresso">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-moss">Agitation</p>
                  <button type="button" className="text-xs text-caramel" onClick={addAgitation}>
                    + Add event
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {form.agitation_events.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.2em] text-moss">
                      <span>Time (s)</span>
                      <span>Action</span>
                      <span>Amount (g)</span>
                    </div>
                  )}
                  {form.agitation_events.map((event, index) => (
                    <div key={index} className="grid grid-cols-3 gap-2 text-sm">
                      <input
                        type="number"
                        value={event.timestamp_s ?? ''}
                        placeholder="Time"
                        onChange={(e) => updateAgitation(index, 'timestamp_s', e.target.value)}
                        className="rounded border border-caramel/40 bg-white/80 px-2 py-1"
                        aria-label="Agitation time in seconds"
                      />
                      <input
                        type="text"
                        value={event.action ?? ''}
                        placeholder="Action (pour, stir)"
                        onChange={(e) => updateAgitation(index, 'action', e.target.value)}
                        className="rounded border border-caramel/40 bg-white/80 px-2 py-1"
                        aria-label="Agitation action"
                      />
                      <input
                        type="number"
                        value={event.amount_g ?? ''}
                        placeholder="Amount"
                        onChange={(e) => updateAgitation(index, 'amount_g', e.target.value)}
                        className="rounded border border-caramel/40 bg-white/80 px-2 py-1"
                        aria-label="Agitation amount in grams"
                      />
                    </div>
                  ))}
                  {!form.agitation_events.length && (
                    <p className="text-xs text-moss">No agitation logged yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-ember px-6 py-3 font-semibold text-crema shadow-card disabled:opacity-60"
          >
            {saving ? 'Saving...' : isAdvanced ? 'Save advanced brew' : 'Save quick brew'}
          </button>
        </div>
      </form>
    </section>
  );
}
