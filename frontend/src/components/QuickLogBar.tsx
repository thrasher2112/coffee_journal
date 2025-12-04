import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Bean, BrewDraft, FlavorTag } from '../types';
import { BeanPicker } from './BeanPicker';
import { FlavorWheel } from './FlavorWheel';

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

type BrewStyle = keyof typeof BREW_STYLE_PRESETS;

const makeDraft = (beanId?: string, brewStyle: BrewStyle = 'pour-over'): BrewDraft => ({
  bean_id: beanId,
  bean_weight_g: 18,
  water_weight_g: 288,
  brew_style: brewStyle,
  date: new Date().toISOString().slice(0, 10),
  agitation_events: [],
  flavor_tags: [],
  quick_notes: '',
  rating: 8
});

export function QuickLogBar({ beans, onSave, defaultBeanId }: Props) {
  const [isAdvanced, setIsAdvanced] = useState(false);
  const [brewStyle, setBrewStyle] = useState<BrewStyle>('pour-over');
  const [form, setForm] = useState<BrewDraft>(() => makeDraft(defaultBeanId, 'pour-over'));
  const [saving, setSaving] = useState(false);

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
    const preferredRatio = BREW_STYLE_PRESETS[brewStyle].ratios[0];
    setForm((prev) => {
      const nextYield = Number((prev.bean_weight_g * preferredRatio).toFixed(1));
      const shouldUpdateYield = Math.abs(prev.water_weight_g - nextYield) >= 0.1;
      return {
        ...prev,
        brew_style: brewStyle,
        water_weight_g: shouldUpdateYield ? nextYield : prev.water_weight_g,
      };
    });
  }, [brewStyle]);

  const ratio = useMemo(() => form.water_weight_g / form.bean_weight_g || 0, [form]);
  const stylePresets = BREW_STYLE_PRESETS[brewStyle];

  const update = <K extends keyof BrewDraft>(key: K, value: BrewDraft[K]) => {
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
    setSaving(true);
    try {
      await onSave(form);
      setForm(makeDraft(form.bean_id, brewStyle));
    } finally {
      setSaving(false);
    }
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
                className="min-w-[170px] rounded-full border border-caramel/40 bg-espresso/60 px-3 py-1 text-crema text-sm normal-case"
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
            <input type="checkbox" checked={isAdvanced} onChange={(e) => setIsAdvanced(e.target.checked)} />
            Advanced mode
          </label>
          <a href="/brew" className="text-xs uppercase tracking-[0.3em] text-caramel">
            Open full form
          </a>
          <button
            type="button"
            className="text-caramel underline"
            onClick={() => setForm(makeDraft(defaultBeanId, brewStyle))}
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
              value={form.bean_weight_g}
              onChange={(event) => update('bean_weight_g', Number(event.target.value))}
              className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-moss">Yield (g)</span>
            <input
              type="number"
              min={50}
              step={1}
              value={form.water_weight_g}
              onChange={(event) => update('water_weight_g', Number(event.target.value))}
              className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-moss">
          <span>Ratio: {ratio ? ratio.toFixed(1) : '—'}</span>
          {stylePresets.ratios.map((value) => {
            const isActive = Math.abs(ratio - value) < 0.1;
            return (
              <button
                key={value}
                type="button"
                onClick={() => update('water_weight_g', Number((form.bean_weight_g * value).toFixed(1)))}
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
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-xs uppercase tracking-[0.3em] text-moss">Rating</span>
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
            <span className="text-xs uppercase tracking-[0.3em] text-moss">Quick notes</span>
            <textarea
              value={form.quick_notes}
              onChange={(event) => update('quick_notes', event.target.value)}
              className="paper-lines rounded-lg border border-caramel/40 bg-transparent px-3 py-2 text-espresso"
              rows={3}
            />
          </label>
        </div>

        {isAdvanced && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">Water temp °C</span>
                <input
                  type="number"
                  value={form.water_temp_c ?? 96}
                  onChange={(event) => update('water_temp_c', Number(event.target.value))}
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">Bloom time (s)</span>
                <input
                  type="number"
                  value={form.bloom_time_s ?? 45}
                  onChange={(event) => update('bloom_time_s', Number(event.target.value))}
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">Total brew time (s)</span>
                <input
                  type="number"
                  value={form.total_brew_time_s ?? 180}
                  onChange={(event) => update('total_brew_time_s', Number(event.target.value))}
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-xs uppercase tracking-[0.3em] text-moss">Grind setting</span>
                <input
                  type="text"
                  value={form.grind_setting ?? ''}
                  onChange={(event) => update('grind_setting', event.target.value)}
                  className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
                />
              </label>
            </div>
            <div className="space-y-4">
              <FlavorWheel selected={form.flavor_tags} onToggle={toggleTag} />
              <div className="rounded-2xl border border-caramel/40 bg-crema/80 p-4 text-espresso">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-moss">Agitation</p>
                  <button type="button" className="text-xs text-caramel" onClick={addAgitation}>
                    + Add event
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {form.agitation_events.map((event, index) => (
                    <div key={index} className="grid grid-cols-3 gap-2 text-sm">
                      <input
                        type="number"
                        value={event.timestamp_s}
                        onChange={(e) => updateAgitation(index, 'timestamp_s', e.target.value)}
                        className="rounded border border-caramel/40 bg-white/80 px-2 py-1"
                      />
                      <input
                        type="text"
                        value={event.action}
                        onChange={(e) => updateAgitation(index, 'action', e.target.value)}
                        className="rounded border border-caramel/40 bg-white/80 px-2 py-1"
                      />
                      <input
                        type="number"
                        value={event.amount_g ?? ''}
                        placeholder="g"
                        onChange={(e) => updateAgitation(index, 'amount_g', e.target.value)}
                        className="rounded border border-caramel/40 bg-white/80 px-2 py-1"
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
