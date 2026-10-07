import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AromaTag, Bean, BrewDraft, BrewSetup, FlavorTag } from '../types';
import { BeanPicker } from './BeanPicker';
import { FlavorWheel } from './FlavorWheel';
import { AromaTags } from './AromaTags';
import { MinSecInput } from './MinSecInput';
import { usePreferences } from '../contexts/PreferencesContext';
import type { TemperatureUnit } from '../contexts/PreferencesContext';
import { BREW_STYLE_PRESETS, getBrewStylePreset, isBrewStyle } from '../lib/brewStyles';
import {
  DEFAULT_STYLE,
  agitationTotalsFromEvents,
  applySetup,
  applyStyle,
  makeDraft,
  roundYield,
  setupChipLabel,
  withAdvancedDefaults,
  type DraftForm,
} from '../lib/brewDraft';
import { readLastSetupId, writeLastSetupId } from '../lib/lastSetup';

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
  // Saved setups for the chip row, loaded by the page alongside beans. Empty
  // (not loaded yet, or the fetch failed) renders no chips.
  setups?: BrewSetup[];
  // Scopes the remembered last-used setup. Without it that is neither read
  // nor written.
  userId?: string;
}

const NO_SETUPS: BrewSetup[] = [];

// Names are unique per user, case-insensitively (the server 409s a duplicate).
const findSetupByName = (setups: BrewSetup[], name: string | null | undefined) => {
  const wanted = name?.toLowerCase();
  return wanted ? setups.find((setup) => setup.name.toLowerCase() === wanted) : undefined;
};

const toDisplayTemp = (celsius: number | '' | undefined, unit: TemperatureUnit) => {
  if (celsius === '' || celsius === undefined) return '';
  if (typeof celsius !== 'number' || Number.isNaN(celsius)) return '';
  return unit === 'fahrenheit' ? Math.round((celsius * 9) / 5 + 32).toString() : celsius.toString();
};

export function QuickLogBar({
  beans,
  onSave,
  defaultBeanId,
  variant = 'quick',
  initialDraft,
  setups = NO_SETUPS,
  userId,
}: Props) {
  const { preferences, setPreferredGrinder } = usePreferences();
  const [isAdvanced, setIsAdvanced] = useState(variant === 'full');
  // form.brew_style is the single source of truth for the style. State
  // changes are explicit transitions (applyStyle, makeDraft, ...) applied via
  // setForm; there is deliberately no effect reacting to brew_style or yield,
  // so a programmatic style + yield change is never clobbered by a default.
  const [form, setForm] = useState<DraftForm>(() => {
    if (initialDraft) {
      // The incoming draft wins over defaults; the full form only fills the
      // advanced fields it left unset.
      const draft = { ...initialDraft, brew_style: initialDraft.brew_style || DEFAULT_STYLE };
      return variant === 'full' ? withAdvancedDefaults(draft) : draft;
    }
    return makeDraft({
      beanId: defaultBeanId,
      grinder: preferences.preferredGrinder,
      advanced: variant === 'full',
    });
  });
  const [waterTempInput, setWaterTempInput] = useState<string>(() =>
    toDisplayTemp(form.water_temp_c, preferences.temperatureUnit)
  );
  const [saving, setSaving] = useState(false);
  // True once the grinder on the current draft has been decided by someone
  // other than preference hydration: the user picked or cleared it, or the
  // draft arrived with its own (possibly empty) grinder. Hydration then
  // leaves it alone, so a grinder that was deliberately cleared (by the user,
  // or later by a setup that has none) is not refilled. Reset/save start a
  // fresh draft and clear it. Any code that applies a draft with a deliberate
  // grinder choice (e.g. a setup) must set this too.
  const grinderDecided = useRef(initialDraft !== undefined);
  // The last-used setup auto-applies at most once per fresh draft, and never
  // over an incoming draft, a chip the user already picked, or edits they have
  // already made (setups can arrive after the form is on screen).
  // `touched` flips on the first user edit; Reset/save start a fresh draft,
  // which resolves the setup question itself (see startFreshDraft).
  const autoApplyDone = useRef(initialDraft !== undefined);
  const touched = useRef(false);

  // The selected chip is derived from the draft's setup_name (case-insensitive;
  // names are unique per user), so it is one source of truth: an incoming
  // draft shows its chip selected with no re-apply, editing fields leaves it
  // selected ("started from"), and deselecting clears setup_name.
  //
  // A setup_name with no matching setup (the setup was renamed or deleted
  // since, or the setups failed to load) is kept on purpose: it is the
  // historical snapshot of what this brew started from. It just has no chip,
  // and nothing re-applies or clears it.
  const selectedSetup = useMemo(() => findSetupByName(setups, form.setup_name), [form.setup_name, setups]);

  // Keep the water-temp text buffer in step with the draft's value (a default
  // applied, a reset, a unit switch) without fighting an edit in progress:
  // resync only when what the buffer currently means differs from the draft.
  useEffect(() => {
    const unit = preferences.temperatureUnit;
    const typed = Number(waterTempInput);
    const typedCelsius =
      waterTempInput === '' || Number.isNaN(typed)
        ? undefined
        : unit === 'fahrenheit'
          ? Math.round(((typed - 32) * 5) / 9)
          : typed;
    const current = form.water_temp_c === '' ? undefined : form.water_temp_c;
    if (typedCelsius === current) return;
    setWaterTempInput(toDisplayTemp(form.water_temp_c, unit));
    // waterTempInput is the buffer being compared, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.water_temp_c, preferences.temperatureUnit]);

  useEffect(() => {
    if (!defaultBeanId) return;
    setForm((prev) => (prev.bean_id ? prev : { ...prev, bean_id: defaultBeanId }));
  }, [defaultBeanId]);

  // Preferences can load after mount; fill the preferred grinder unless this
  // draft's grinder was already decided (see grinderDecided).
  useEffect(() => {
    if (!preferences.preferredGrinder || grinderDecided.current) return;
    setForm((prev) => (prev.grinder_name ? prev : { ...prev, grinder_name: preferences.preferredGrinder }));
  }, [preferences.preferredGrinder]);

  // Replace all setup-controlled fields in one update. The grinder is decided
  // by the setup even when it names none, so hydration leaves it alone.
  const applySetupToForm = (setup: BrewSetup) => {
    grinderDecided.current = true;
    setForm((prev) => applySetup(prev, setup, { advanced: isAdvanced }));
  };

  // Last-used setup, once setups have loaded. A remembered id that no longer
  // exists is ignored silently. Whatever the outcome, the one-shot is spent.
  useEffect(() => {
    if (autoApplyDone.current || !userId || setups.length === 0) return;
    autoApplyDone.current = true;
    if (touched.current) return;
    const remembered = readLastSetupId(userId);
    const setup = remembered ? setups.find((item) => item.id === remembered) : undefined;
    if (setup) applySetupToForm(setup);
    // applySetupToForm only reads isAdvanced as of this render; the effect is
    // keyed on the data that arrives (setups, userId), not on it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setups, userId]);

  const handleSetupChip = (setup: BrewSetup) => {
    autoApplyDone.current = true;
    if (selectedSetup?.id === setup.id) {
      // Deselect: keep every value, drop the provenance.
      setForm((prev) => ({ ...prev, setup_name: undefined, machine_profile: undefined }));
      writeLastSetupId(userId, null);
      return;
    }
    applySetupToForm(setup);
    writeLastSetupId(userId, setup.id);
  };

  const handleStyleChange = (style: string) => {
    touched.current = true;
    setForm((prev) => {
      const next = applyStyle(prev, style, { advanced: isAdvanced });
      // Moving to a different style than the selected setup's means the brew is
      // no longer "from" it: drop the provenance in the same update (the chip
      // deselects, and Reset/save won't re-apply the setup and flip the style
      // back). The same style keeps it. The remembered last-used id is left
      // alone: it records the last chip tapped, not what the form holds.
      const from = findSetupByName(setups, prev.setup_name);
      if (from && from.brew_style !== style) {
        next.setup_name = undefined;
        next.machine_profile = undefined;
      }
      return next;
    });
  };

  // A fresh draft (Reset, or after a save) for the style currently selected,
  // built in one go: if a setup was selected it is re-applied onto the fresh
  // draft (its style wins), otherwise the style's defaults stand.
  const startFreshDraft = (
    beanId: string | undefined,
    style: string | undefined,
    setup: BrewSetup | undefined
  ) => {
    autoApplyDone.current = true;
    touched.current = false;
    setAgitationTotals([]);
    let draft = makeDraft({
      beanId,
      style: style || DEFAULT_STYLE,
      grinder: preferences.preferredGrinder,
      advanced: isAdvanced,
    });
    // A setup also decides the grinder (even an empty one); without one, the
    // preferred grinder hydrates again.
    grinderDecided.current = setup !== undefined;
    if (setup) draft = applySetup(draft, setup, { advanced: isAdvanced });
    setForm(draft);
  };

  const handleAdvancedToggle = (checked: boolean) => {
    setIsAdvanced(checked);
    if (checked) {
      setForm((prev) => withAdvancedDefaults(prev));
    }
  };

  const beanWeight = typeof form.bean_weight_g === 'number' ? form.bean_weight_g : NaN;
  const waterWeight = typeof form.water_weight_g === 'number' ? form.water_weight_g : NaN;
  const ratio = useMemo(() => {
    if (!Number.isFinite(beanWeight) || beanWeight === 0 || !Number.isFinite(waterWeight)) return undefined;
    return waterWeight / beanWeight;
  }, [beanWeight, waterWeight]);
  const brewStyle = form.brew_style ?? DEFAULT_STYLE;
  // Undefined for a style outside the presets (an old brew, an import): no
  // ratio chips, and the select shows the raw value as an extra option.
  const stylePresets = getBrewStylePreset(brewStyle);
  const grinderOptions = preferences.grinders;
  // A grinder named by a setup or an incoming draft that is not in the
  // preferences list still shows as selected, as an extra option (preferences
  // are not written to).
  const selectedGrinder = form.grinder_name ?? '';
  const extraGrinder = selectedGrinder && !grinderOptions.includes(selectedGrinder) ? selectedGrinder : undefined;

  const update = <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
    touched.current = true;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const toggleTag = (tag: FlavorTag) => {
    touched.current = true;
    setForm((prev) => {
      const exists = prev.flavor_tags.includes(tag);
      return {
        ...prev,
        flavor_tags: exists ? prev.flavor_tags.filter((item) => item !== tag) : [...prev.flavor_tags, tag]
      };
    });
  };

  const toggleAromaTag = (tag: AromaTag) => {
    touched.current = true;
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
  const [agitationTotals, setAgitationTotals] = useState<Array<number | ''>>(() =>
    agitationTotalsFromEvents(initialDraft?.agitation_events ?? [])
  );

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
    // Captured before awaiting: the fresh draft that follows a save is built
    // from what was submitted, not from whatever the form holds by then.
    const savedBeanId = form.bean_id;
    const savedStyle = form.brew_style;
    const savedSetup = selectedSetup;
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
      startFreshDraft(savedBeanId, savedStyle, savedSetup);
    } finally {
      setSaving(false);
    }
  };

  const convertCToF = (value: number) => Math.round((value * 9) / 5 + 32);
  const convertFToC = (value: number) => Math.round(((value - 32) * 5) / 9);

  const handleWaterTempChange = (rawValue: string) => {
    setWaterTempInput(rawValue);
    if (rawValue === '') {
      // '' (blanked on purpose), not undefined (unset): only unset gets the
      // 96 C default back from withAdvancedDefaults.
      update('water_temp_c', '');
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
    grinderDecided.current = true;
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
                onChange={(event) => handleStyleChange(event.target.value)}
                className="min-h-11 min-w-[170px] rounded-full border border-caramel/40 bg-espresso/60 px-3 py-1 text-crema text-sm normal-case"
              >
                {!isBrewStyle(brewStyle) && <option value={brewStyle}>{`${brewStyle} (custom)`}</option>}
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
            onClick={() => startFreshDraft(defaultBeanId, form.brew_style, selectedSetup)}
          >
            Reset
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-6">
        {setups.length > 0 && (
          <div role="group" aria-label="Brew setups" className="flex flex-wrap gap-2">
            {setups.map((setup) => {
              const isSelected = selectedSetup?.id === setup.id;
              return (
                <button
                  key={setup.id}
                  type="button"
                  aria-pressed={isSelected}
                  disabled={saving}
                  onClick={() => handleSetupChip(setup)}
                  className={`min-h-11 rounded-full border px-4 py-1 text-sm disabled:opacity-60 ${
                    isSelected ? 'border-ember bg-ember/90 text-crema' : 'border-caramel/40 text-espresso'
                  }`}
                >
                  {setupChipLabel(setup)}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Raw setForm, not update(): picking a bean is not an edit that should
              block the last-used auto-apply (a setup never touches the bean). */}
          <BeanPicker
            beans={beans}
            value={form.bean_id}
            onChange={(value) => setForm((prev) => ({ ...prev, bean_id: value }))}
          />
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
              min={1}
              step={0.1}
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
          {(stylePresets?.ratios ?? []).map((value) => {
            const isActive = ratio ? Math.abs(ratio - value) < 0.1 : false;
            return (
              <button
                key={value}
                type="button"
                onClick={() =>
                  update(
                    'water_weight_g',
                    typeof form.bean_weight_g === 'number'
                      ? roundYield(form.bean_weight_g * value)
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
                valueSeconds={form.bloom_time_s ?? ''}
                onChange={(seconds) => update('bloom_time_s', seconds)}
              />
              <MinSecInput
                label="Total brew time"
                valueSeconds={form.total_brew_time_s ?? ''}
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
                  {extraGrinder && <option value={extraGrinder}>{extraGrinder}</option>}
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
