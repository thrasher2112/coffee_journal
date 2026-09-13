import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AromaTag, Bean, BrewDraft, FlavorTag } from '../types';
import { BeanPicker } from './BeanPicker';
import { FlavorWheel } from './FlavorWheel';
import { AromaTags } from './AromaTags';
import { MinSecInput } from './MinSecInput';
import { usePreferences } from '../contexts/PreferencesContext';
import type { TemperatureUnit } from '../contexts/PreferencesContext';
import { BREW_STYLE_PRESETS, type BrewStyle } from '../lib/brewStyles';

interface Props {
  beans: Bean[];
  onSave: (draft: BrewDraft) => Promise<void> | void;
  defaultBeanId?: string;
  // 'full' is the dedicated /brew page: starts with advanced fields shown
  // (but the checkbox stays, so it can still collapse back to the quick
  // set) and skips the "Quick Brew" heading, since the page already has
  // its own title. 'quick' (the default, used on Home) shows a link to
  // /brew instead of the checkbox - advanced fields are reached by
  // navigating there, not toggled inline.
  variant?: 'quick' | 'full';
  // Carries an in-progress draft from Home's Quick Brew section over when
  // navigating to /brew, so switching to the full form doesn't lose
  // whatever was already typed in.
  initialDraft?: DraftForm;
}

const DEFAULT_WATER_TEMP = 96;
const DEFAULT_BLOOM_TIME = 45;
const DEFAULT_BREW_TIME = 180;
// Omit the numeric fields that allow a blank ('') input state before
// re-adding them below — intersecting BrewDraft's plain `number` types
// directly with a `number | ''` union would collapse back to `number`
// (the empty-string member has no overlap with BrewDraft's type), silently
// losing the "blank input" case these form fields rely on.
export type DraftForm = Omit<
  BrewDraft,
  'bean_weight_g' | 'water_weight_g' | 'water_temp_c' | 'bloom_time_s' | 'total_brew_time_s'
> & {
  bean_weight_g: number | '';
  water_weight_g: number | '';
  water_temp_c?: number | '';
  bloom_time_s?: number | '';
  total_brew_time_s?: number | '';
};

const DEFAULT_BEAN_WEIGHT_G = 18;

const makeDraft = (beanId?: string, brewStyle: BrewStyle = 'pour-over', grinder?: string): DraftForm => ({
  bean_id: beanId,
  bean_weight_g: DEFAULT_BEAN_WEIGHT_G,
  water_weight_g: Number((DEFAULT_BEAN_WEIGHT_G * BREW_STYLE_PRESETS[brewStyle].ratios[0]).toFixed(1)),
  brew_style: brewStyle,
  date: new Date().toISOString().slice(0, 10),
  agitation_events: [],
  flavor_tags: [],
  aroma_tags: [],
  tasting_notes: '',
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

export function QuickLogBar({ beans, onSave, defaultBeanId, variant = 'quick', initialDraft }: Props) {
  const { preferences, setPreferredGrinder } = usePreferences();
  const [isAdvanced, setIsAdvanced] = useState(variant === 'full');
  const [brewStyle, setBrewStyle] = useState<BrewStyle>(
    () => (initialDraft?.brew_style as BrewStyle | undefined) ?? 'pour-over'
  );
  const [form, setForm] = useState<DraftForm>(
    () => initialDraft ?? makeDraft(defaultBeanId, 'pour-over', preferences.preferredGrinder)
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

  const isFirstBrewStyleRun = useRef(true);
  useEffect(() => {
    if (isFirstBrewStyleRun.current) {
      isFirstBrewStyleRun.current = false;
      return;
    }
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

  // What's captured per row is the scale's running total, not the amount
  // poured in that one event - that's what a person is actually looking at
  // mid-brew. amount_g (what the backend stores) is derived from the
  // difference against the previous row's total, kept in its own array
  // rather than reverse-engineered from amount_g each time so an edit to an
  // earlier row's total doesn't need any special-casing to ripple forward.
  const [agitationTotals, setAgitationTotals] = useState<Array<number | ''>>([]);

  const deriveAgitationAmounts = (totals: Array<number | ''>): Array<number | undefined> => {
    let runningTotal = 0;
    return totals.map((total) => {
      if (total === '') return undefined;
      const delta = total - runningTotal;
      runningTotal = total;
      return delta;
    });
  };

  const addAgitation = () => {
    update('agitation_events', [...form.agitation_events, { timestamp_s: 0, action: 'pour', amount_g: undefined }]);
    setAgitationTotals((prev) => [...prev, '']);
  };

  const updateAgitationTimestamp = (index: number, seconds: number | '') => {
    const events = [...form.agitation_events];
    events[index] = { ...events[index], timestamp_s: seconds === '' ? 0 : seconds };
    update('agitation_events', events);
  };

  const updateAgitationAction = (index: number, action: string) => {
    const events = [...form.agitation_events];
    events[index] = { ...events[index], action };
    update('agitation_events', events);
  };

  const updateAgitationTotal = (index: number, value: string) => {
    const nextTotal = value === '' ? '' : Number(value);
    const totals = [...agitationTotals];
    totals[index] = nextTotal;
    setAgitationTotals(totals);

    const amounts = deriveAgitationAmounts(totals);
    update(
      'agitation_events',
      form.agitation_events.map((eventItem, i) => ({ ...eventItem, amount_g: amounts[i] }))
    );
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
        setAgitationTotals([]);
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
    <section className="journal-card px-6 py-8 text-espresso">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          {variant === 'quick' && <p className="text-xs uppercase tracking-[0.4em] text-moss">Log a brew</p>}
          <div className="flex flex-wrap items-center gap-3">
            {variant === 'quick' && <h2 className="text-3xl font-display">Quick Brew</h2>}
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
          {variant === 'full' ? (
            <label className="flex items-center gap-2 text-moss">
              <input
                type="checkbox"
                className="h-5 w-5 accent-ember"
                checked={isAdvanced}
                onChange={(e) => handleAdvancedToggle(e.target.checked)}
              />
              Advanced mode
            </label>
          ) : (
            <Link
              to="/brew"
              state={{ draft: form }}
              className="inline-flex min-h-11 items-center justify-center min-h-11 text-xs uppercase tracking-[0.3em] text-caramel"
            >
              Full Brew Log
            </Link>
          )}
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center min-h-11 px-1 text-caramel underline"
            onClick={() => {
              setForm(makeDraft(defaultBeanId, brewStyle, preferences.preferredGrinder));
              setAgitationTotals([]);
            }}
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
            <span className="text-xs uppercase tracking-[0.3em] text-moss">Notes</span>
            <textarea
              value={form.tasting_notes}
              onChange={(event) => update('tasting_notes', event.target.value)}
              className="paper-lines rounded-lg border border-caramel/40 bg-transparent px-3 py-2 text-espresso leading-[2rem]"
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
              <MinSecInput
                label="Bloom time"
                valueSeconds={form.bloom_time_s === '' ? '' : form.bloom_time_s ?? DEFAULT_BLOOM_TIME}
                onChange={(seconds) => update('bloom_time_s', seconds)}
              />
              <MinSecInput
                label="Total brew time"
                valueSeconds={form.total_brew_time_s === '' ? '' : form.total_brew_time_s ?? DEFAULT_BREW_TIME}
                onChange={(seconds) => update('total_brew_time_s', seconds)}
              />
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
                    <div className="hidden gap-2 text-[10px] uppercase tracking-[0.2em] text-moss lg:grid lg:grid-cols-3">
                      <span>Time</span>
                      <span>Action</span>
                      <span>Total poured (g)</span>
                    </div>
                  )}
                  {form.agitation_events.map((event, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-1 gap-2 items-start rounded-lg border border-caramel/20 p-2 text-sm lg:grid-cols-3 lg:border-0 lg:p-0"
                    >
                      <MinSecInput
                        label={`Agitation ${index + 1} time`}
                        hideLabel
                        compact
                        valueSeconds={event.timestamp_s ?? ''}
                        onChange={(seconds) => updateAgitationTimestamp(index, seconds)}
                      />
                      <input
                        type="text"
                        value={event.action ?? ''}
                        placeholder="Action (pour, stir)"
                        onChange={(e) => updateAgitationAction(index, e.target.value)}
                        className="rounded border border-caramel/40 bg-white/80 px-2 py-1"
                        aria-label="Agitation action"
                      />
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="number"
                          value={agitationTotals[index] ?? ''}
                          placeholder="Scale reading"
                          onChange={(e) => updateAgitationTotal(index, e.target.value)}
                          className="rounded border border-caramel/40 bg-white/80 px-2 py-1"
                          aria-label="Total poured so far in grams"
                        />
                        {typeof event.amount_g === 'number' && (
                          <span className="text-[10px] text-moss">
                            {event.amount_g >= 0 ? '+' : ''}
                            {event.amount_g}g this event
                          </span>
                        )}
                      </div>
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
            {saving ? 'Saving...' : variant === 'full' ? 'Save brew' : 'Save quick brew'}
          </button>
        </div>
      </form>
    </section>
  );
}
