import { useMemo, useState } from 'react';
import type { Brew } from '../types';
import { AgitationTimeline } from './AgitationTimeline';
import { clsx } from 'clsx';
import { usePreferences } from '../contexts/PreferencesContext';

interface Props {
  brew: Brew;
}

export function BrewCard({ brew }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { preferences } = usePreferences();

  const displayWaterTemp = useMemo(() => {
    if (!brew.water_temp_c) return '—';
    if (preferences.temperatureUnit === 'fahrenheit') {
      const fahrenheit = Math.round((brew.water_temp_c * 9) / 5 + 32);
      return `${fahrenheit}°F`;
    }
    return `${brew.water_temp_c}°C`;
  }, [brew.water_temp_c, preferences.temperatureUnit]);

  return (
    <article className="journal-card relative overflow-hidden p-6 text-espresso">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-moss">{brew.date}</p>
          <h3 className="text-2xl font-display text-espresso">
            {brew.bean_name || 'Unknown Bean'}
          </h3>
          <p className="text-sm text-moss">
            {(brew.bean_weight_g && brew.water_weight_g && `${brew.bean_weight_g}g → ${brew.water_weight_g}g`) || ''}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-xs uppercase tracking-[0.3em] text-moss">Rating</span>
          <span className="text-3xl font-display text-ember">{brew.rating ?? '—'}</span>
          <span className="text-xs text-moss">ratio {brew.ratio ?? '-'}</span>
        </div>
      </div>

      {brew.flavor_tags && (
        <div className="mt-4 flex flex-wrap gap-2">
          {brew.flavor_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-caramel/60 bg-crema/70 px-3 py-1 text-xs uppercase tracking-wide text-espresso"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {brew.aroma_tags && brew.aroma_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {brew.aroma_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-ember/40 bg-ember/10 px-3 py-1 text-xs uppercase tracking-wide text-ember"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {brew.tasting_notes && (
        <p className="mt-4 rounded-lg bg-crema/80 p-3 text-sm text-espresso/80 shadow-inner">
          {brew.tasting_notes}
        </p>
      )}

      <button
        className="mt-4 text-xs uppercase tracking-[0.3em] text-espresso/70"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>

      <div className={clsx('transition-all', expanded ? 'max-h-80 opacity-100' : 'max-h-0 opacity-0')}>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <dl className="text-sm text-espresso/80">
            <div className="flex justify-between border-b border-moss/30 py-1">
              <dt>Water temp</dt>
              <dd>{displayWaterTemp}</dd>
            </div>
            <div className="flex justify-between border-b border-moss/30 py-1">
              <dt>Brew time</dt>
              <dd>{brew.total_brew_time_s ? `${brew.total_brew_time_s}s` : '—'}</dd>
            </div>
            <div className="flex justify-between border-b border-moss/30 py-1">
              <dt>Bloom</dt>
              <dd>{brew.bloom_time_s ? `${brew.bloom_time_s}s` : '—'}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            <div className="flex justify-between text-xs uppercase tracking-[0.3em] text-moss">
              <span>Grinder</span>
              <span>{brew.grinder_name ?? '—'}</span>
            </div>
            <AgitationTimeline events={brew.agitation_events ?? []} />
          </div>
        </div>
      </div>
    </article>
  );
}
