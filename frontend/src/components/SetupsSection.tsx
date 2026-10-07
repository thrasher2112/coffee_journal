import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { MinSecInput } from './MinSecInput';
import { usePreferences } from '../contexts/PreferencesContext';
import {
  ApiError,
  AuthError,
  createSetup,
  deleteSetup,
  fetchSetups,
  NetworkError,
  updateSetup
} from '../lib/api';
import { MIN_DOSE_G, MIN_YIELD_G, roundYield } from '../lib/brewDraft';
import { BREW_STYLE_PRESETS, brewStyleLabel, isBrewStyle } from '../lib/brewStyles';
import { formatMinSec } from '../lib/time';
import type { BrewSetup, BrewSetupInput } from '../types';

const OFFLINE_MESSAGE = 'Setups can only be changed while online';
const DUPLICATE_MESSAGE = 'You already have a setup with that name';
const SIGN_IN_MESSAGE = 'Please sign in again to manage your setups';

// Limits mirror the API schema (backend/src/coffee_journal/schemas/setup.py).
const NAME_MAX = 80;
const TEXT_MAX = 120;
const RATIO_MAX = 30;
const TIME_MAX_S = 86400;

const STYLE_KEYS = Object.keys(BREW_STYLE_PRESETS) as Array<keyof typeof BREW_STYLE_PRESETS>;
const GRINDER_LIST_ID = 'setup-grinder-options';

// Number() drops trailing zeros ("3.0" -> 3); toFixed trims float noise first.
const formatRatio = (ratio: number): string => `1:${Number(ratio.toFixed(2))}`;

/** "18 g → 54 g, 1:3, 0:36, Extractamundo Dos!" - absent parts are skipped. */
export function summarizeSetup(setup: BrewSetup): string {
  const parts: string[] = [];
  if (setup.dose_g != null) {
    parts.push(`${setup.dose_g} g → ${roundYield(setup.dose_g * setup.ratio)} g`);
  }
  parts.push(formatRatio(setup.ratio));
  if (setup.target_time_s != null) parts.push(formatMinSec(setup.target_time_s));
  if (setup.grinder_name) parts.push(setup.grinder_name);
  if (setup.machine_profile) parts.push(setup.machine_profile);
  return parts.join(', ');
}

interface FormState {
  name: string;
  brew_style: string;
  ratio: string;
  dose: string;
  target_time_s: number | '';
  grinder_name: string;
  machine_profile: string;
}

const EMPTY_FORM: FormState = {
  name: '',
  brew_style: STYLE_KEYS[0],
  ratio: '',
  dose: '',
  target_time_s: '',
  grinder_name: '',
  machine_profile: ''
};

function formFromSetup(setup: BrewSetup): FormState {
  return {
    name: setup.name,
    brew_style: setup.brew_style,
    ratio: String(setup.ratio),
    dose: setup.dose_g == null ? '' : String(setup.dose_g),
    target_time_s: setup.target_time_s ?? '',
    grinder_name: setup.grinder_name ?? '',
    machine_profile: setup.machine_profile ?? ''
  };
}

// Length as the API counts it: code points, not UTF-16 units (an emoji is 1, not 2).
const charCount = (value: string): number => [...value].length;

const textOrNull = (value: string): string | null => value.trim() || null;

/** Validate and convert the form into an API body, or return a message. */
export function buildInput(form: FormState): BrewSetupInput | string {
  const name = form.name.trim();
  if (!name) return 'Enter a name for the setup.';
  if (charCount(name) > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer.`;

  if (form.ratio.trim() !== '' && !Number.isFinite(Number(form.ratio))) {
    return 'Enter a number for the ratio.';
  }
  const ratio = form.ratio.trim() === '' ? NaN : Number(form.ratio);
  if (!Number.isFinite(ratio) || ratio <= 0) return 'Ratio must be greater than 0.';
  if (ratio > RATIO_MAX) return `Ratio can be at most ${RATIO_MAX}.`;

  let dose: number | null = null;
  if (form.dose.trim() !== '') {
    dose = Number(form.dose);
    if (!Number.isFinite(dose)) return 'Enter a number for the dose.';
    if (dose <= 0) return 'Dose must be greater than 0.';
    // Same floor as the log form's dose input and the API.
    if (dose < MIN_DOSE_G) return `Dose must be at least ${MIN_DOSE_G} g.`;
    if (roundYield(dose * ratio) < MIN_YIELD_G) {
      return `Dose × ratio must give a yield of at least ${MIN_YIELD_G} g.`;
    }
  }

  const time = form.target_time_s;
  if (time !== '') {
    // The API stores whole seconds; a fractional or NaN time would be a 422.
    if (!Number.isInteger(time)) return 'Target time must be in whole seconds.';
    if (time < 0 || time > TIME_MAX_S) return 'Target time must be between 0 seconds and 24 hours.';
  }

  const grinder = textOrNull(form.grinder_name);
  const machine = textOrNull(form.machine_profile);
  for (const [label, value] of [
    ['Grinder', grinder],
    ['Machine profile', machine]
  ] as const) {
    if (value && charCount(value) > TEXT_MAX) return `${label} must be ${TEXT_MAX} characters or fewer.`;
  }

  return {
    name,
    brew_style: form.brew_style,
    ratio,
    dose_g: dose,
    grinder_name: grinder,
    target_time_s: time === '' ? null : time,
    machine_profile: machine
  };
}

/** Only the fields whose value differs from the stored setup. */
function changedFields(original: BrewSetup, next: BrewSetupInput): Partial<BrewSetupInput> {
  const changes: Partial<BrewSetupInput> = {};
  for (const key of Object.keys(next) as Array<keyof BrewSetupInput>) {
    if ((original[key] ?? null) !== next[key]) {
      (changes as Record<string, unknown>)[key] = next[key];
    }
  }
  return changes;
}

const byName = (a: BrewSetup, b: BrewSetup) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

function describeError(err: unknown): string {
  if (err instanceof NetworkError) return OFFLINE_MESSAGE;
  if (err instanceof AuthError) return SIGN_IN_MESSAGE;
  if (err instanceof ApiError && err.status === 409) return DUPLICATE_MESSAGE;
  return '';
}

const inputClass =
  'w-full rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-sm text-crema';
const numberClass = `${inputClass} no-spinner`;
const labelClass = 'text-xs uppercase tracking-[0.3em] text-moss';
const primaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-ember px-4 py-2 text-sm text-crema disabled:opacity-60';
const secondaryButton =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-caramel/50 px-4 py-2 text-sm text-caramel';

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function SetupsSection() {
  const { preferences } = usePreferences();
  const [setups, setSetups] = useState<BrewSetup[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  // null = form closed, 'new' = creating, otherwise the id being edited.
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    fetchSetups()
      .then((items) => {
        if (cancelled) return;
        setSetups([...items].sort(byName));
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const openNew = () => {
    setEditing('new');
    setForm(EMPTY_FORM);
    setFormError(null);
    setNotice(null);
  };

  const openEdit = (setup: BrewSetup) => {
    setEditing(setup.id);
    setForm(formFromSetup(setup));
    setFormError(null);
    setNotice(null);
  };

  const closeForm = () => {
    setEditing(null);
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || editing === null) return;
    const input = buildInput(form);
    if (typeof input === 'string') {
      setFormError(input);
      return;
    }

    // A late response may only close the form it was submitted from.
    const submittedFrom = editing;
    setBusy(true);
    setFormError(null);
    try {
      if (submittedFrom === 'new') {
        const created = await createSetup(input);
        setSetups((prev) => [...prev, created].sort(byName));
      } else {
        const original = setups.find((s) => s.id === submittedFrom);
        const changes = original ? changedFields(original, input) : input;
        if (Object.keys(changes).length > 0) {
          const saved = await updateSetup(submittedFrom, changes);
          setSetups((prev) => prev.map((s) => (s.id === saved.id ? saved : s)).sort(byName));
        }
      }
      setEditing((current) => (current === submittedFrom ? null : current));
    } catch (err) {
      setFormError(describeError(err) || 'Could not save the setup. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (setup: BrewSetup) => {
    if (!window.confirm(`Delete the setup "${setup.name}"? Brews already logged keep their details.`)) {
      return;
    }
    setNotice(null);
    setBusy(true);
    try {
      await deleteSetup(setup.id);
      setSetups((prev) => prev.filter((s) => s.id !== setup.id));
      if (editing === setup.id) closeForm();
    } catch (err) {
      setNotice(describeError(err) || 'Could not delete the setup. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const dose = Number(form.dose);
  const ratio = Number(form.ratio);
  const liveYield =
    form.dose.trim() !== '' && form.ratio.trim() !== '' && dose > 0 && ratio > 0
      ? roundYield(dose * ratio)
      : null;

  return (
    <section className="journal-card space-y-4 p-6" aria-labelledby="setups-heading">
      <div>
        <h2 id="setups-heading" className="text-2xl font-display text-espresso">
          Setups
        </h2>
        <p className="text-sm text-moss">
          Save a recipe and equipment combo to prefill the log form. Setups can only be changed while online.
        </p>
      </div>

      {notice && (
        <p role="alert" className="text-sm text-ember">
          {notice}
        </p>
      )}

      {loadState === 'loading' && (
        <p role="status" className="text-sm text-moss">
          Loading setups...
        </p>
      )}

      {loadState === 'error' && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-moss">
          <p>Couldn&apos;t load your setups. They need a connection to the server.</p>
          <button type="button" className={secondaryButton} onClick={() => setLoadAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          {setups.length === 0 && editing !== 'new' && (
            <p className="text-sm text-moss">No setups yet.</p>
          )}

          <ul className="space-y-2 text-sm">
            {setups.map((setup) => (
              <li
                key={setup.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-caramel/40 bg-espresso/40 px-4 py-2 text-crema"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {setup.name} · {brewStyleLabel(setup.brew_style)}
                  </p>
                  <p className="text-moss">{summarizeSetup(setup)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    aria-label={`Edit ${setup.name}`}
                    disabled={busy}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs uppercase tracking-[0.3em] text-caramel disabled:opacity-50"
                    onClick={() => openEdit(setup)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${setup.name}`}
                    disabled={busy}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-xs uppercase tracking-[0.3em] text-caramel disabled:opacity-50"
                    onClick={() => handleDelete(setup)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {editing === null && (
            <button type="button" className={primaryButton} onClick={openNew} disabled={busy}>
              Add setup
            </button>
          )}

          {editing !== null && (
            <form
              // Remount per row so MinSecInput's own raw-string state never leaks between setups.
              key={editing}
              noValidate
              onSubmit={handleSubmit}
              aria-labelledby="setup-form-heading"
              className="space-y-4 rounded-xl border border-caramel/40 p-4"
            >
              <h3 id="setup-form-heading" className="text-lg font-display text-espresso">
                {editing === 'new' ? 'New setup' : 'Edit setup'}
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="setup-name" label="Setup name">
                  <input
                    id="setup-name"
                    type="text"
                    autoFocus
                    value={form.name}
                    onChange={(e) => update('name', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field id="setup-style" label="Brew style">
                  <select
                    id="setup-style"
                    value={form.brew_style}
                    onChange={(e) => update('brew_style', e.target.value)}
                    className={inputClass}
                  >
                    {/* A stored style outside the presets stays selectable so editing never silently changes it. */}
                    {!isBrewStyle(form.brew_style) && (
                      <option value={form.brew_style}>{form.brew_style}</option>
                    )}
                    {STYLE_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {BREW_STYLE_PRESETS[key].label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="setup-ratio" label="Ratio (1:x)">
                  <input
                    id="setup-ratio"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={form.ratio}
                    onChange={(e) => update('ratio', e.target.value)}
                    className={numberClass}
                  />
                </Field>
                <Field id="setup-dose" label="Dose (g)">
                  <input
                    id="setup-dose"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min={0}
                    value={form.dose}
                    onChange={(e) => update('dose', e.target.value)}
                    className={numberClass}
                  />
                </Field>
                <MinSecInput
                  label="Target time"
                  valueSeconds={form.target_time_s}
                  onChange={(seconds) => update('target_time_s', seconds)}
                />
                <Field id="setup-grinder" label="Grinder">
                  <input
                    id="setup-grinder"
                    type="text"
                    list={GRINDER_LIST_ID}
                    value={form.grinder_name}
                    onChange={(e) => update('grinder_name', e.target.value)}
                    className={inputClass}
                  />
                  <datalist id={GRINDER_LIST_ID}>
                    {preferences.grinders.map((grinder) => (
                      <option key={grinder} value={grinder} />
                    ))}
                  </datalist>
                </Field>
                <Field id="setup-machine" label="Machine profile">
                  <input
                    id="setup-machine"
                    type="text"
                    value={form.machine_profile}
                    onChange={(e) => update('machine_profile', e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>

              {liveYield !== null && <p className="text-sm text-moss">Yield: {liveYield} g</p>}

              {formError && (
                <p role="alert" className="text-sm text-ember">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap gap-3">
                <button type="submit" className={primaryButton} disabled={busy}>
                  Save setup
                </button>
                <button type="button" className={`${secondaryButton} disabled:opacity-60`} onClick={closeForm} disabled={busy}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </section>
  );
}
