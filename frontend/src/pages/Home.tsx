import { useEffect, useMemo, useState } from 'react';
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { QuickLogBar } from '../components/QuickLogBar';
import { BrewCard } from '../components/BrewCard';
import { useLocalBrewStore } from '../hooks/useLocalBrewStore';
import type { Bean, Brew, MetricsOverview, BrewDraft } from '../types';
import { createBrew, fetchBeans, fetchBrews, fetchMetrics, NetworkError } from '../lib/api';
import { SAMPLE_BEANS, SAMPLE_BREWS, SAMPLE_METRICS } from '../lib/sampleData';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

export function HomePage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [brews, setBrews] = useState<Brew[]>([]);
  const [metrics, setMetrics] = useState<MetricsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { brews: localBrews, addBrew, unsynced } = useLocalBrewStore();

  const load = async () => {
    try {
      const [beanData, brewData, metricsData] = await Promise.all([fetchBeans(), fetchBrews(), fetchMetrics()]);
      setBeans(beanData);
      setBrews(brewData);
      setMetrics(metricsData);
      setError(null);
    } catch (err) {
      console.warn('Falling back to local data', err);
      setBeans(SAMPLE_BEANS);
      setBrews(SAMPLE_BREWS);
      setMetrics(SAMPLE_METRICS);
      setError('Offline — showing demo data');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (draft: BrewDraft) => {
    try {
      await createBrew(draft);
      await load();
      setError(null);
    } catch (err) {
      // Only queue when the request never landed. A rejected payload (422) or a
      // dead session (401) would otherwise sit in the queue retrying forever.
      if (err instanceof NetworkError) {
        console.warn('Offline - queued locally', err);
        addBrew(draft);
        setError('Offline — brew saved locally and will sync when you reconnect.');
      } else {
        console.error('Failed to save brew', err);
        setError('Could not save that brew. Check the values and try again.');
      }
    }
  };

  const allBrews = useMemo(() => {
    const remote = brews;
    const local = localBrews.map((brew) => ({
      id: brew.local_id,
      bean_id: brew.bean_id ?? 'local-draft',
      bean_name: beans.find((b) => b.id === brew.bean_id)?.name ?? 'Local Draft',
      bean_weight_g: brew.bean_weight_g,
      grinder_name: brew.grinder_name,
      water_weight_g: brew.water_weight_g,
      date: brew.date,
      grind_setting: brew.grind_setting,
      grind_setting_notes: brew.grind_setting_notes,
      water_temp_c: brew.water_temp_c,
      bloom_time_s: brew.bloom_time_s,
      total_brew_time_s: brew.total_brew_time_s,
      flavor_tags: brew.flavor_tags,
      aroma_tags: brew.aroma_tags,
      tasting_notes: brew.quick_notes,
      rating: brew.rating,
      aroma_rating: brew.aroma_rating,
      flavor_rating: brew.flavor_rating,
      agitation_events: brew.agitation_events,
      created_at: brew.created_at,
      updated_at: brew.created_at,
      ratio: Number((brew.water_weight_g / brew.bean_weight_g).toFixed(1))
    })) as Brew[];
    return [...local, ...remote];
  }, [brews, localBrews, beans]);

  const sortedTrendData = useMemo(() => {
    if (!metrics?.rating_trends) return [];
    const parseIsoWeekLabel = (label: string | null | undefined) => {
      if (!label) return null;
      const [yearStr, weekStr] = label.split('-');
      const year = Number(yearStr);
      const week = Number(weekStr);
      if (Number.isNaN(year) || Number.isNaN(week)) return null;
      const firstThursday = new Date(Date.UTC(year, 0, 4));
      const day = firstThursday.getUTCDay() || 7;
      firstThursday.setUTCDate(firstThursday.getUTCDate() - day + 1 + (week - 1) * 7);
      return firstThursday;
    };
    const parseTrendDate = (trend: MetricsOverview['rating_trends'][number]) => {
      if (trend.date) {
        const parsed = new Date(trend.date);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed;
        }
      }
      return parseIsoWeekLabel(trend.iso_week ?? trend.week);
    };
    return metrics.rating_trends
      .filter((trend) => typeof trend.avg_rating === 'number')
      .map((trend) => {
        const parsedDate = parseTrendDate(trend);
        const sortValue = parsedDate ? parsedDate.getTime() : 0;
        const displayLabel = parsedDate
          ? parsedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
          : trend.date ?? trend.iso_week ?? trend.week ?? '—';
        return { ...trend, sortValue, displayLabel };
      })
      .sort((a, b) => a.sortValue - b.sortValue);
  }, [metrics]);

  return (
    <div className="space-y-8">
      {error && <div className="rounded-2xl border border-ember/50 bg-ember/20 p-3 text-sm text-crema">{error}</div>}
      <QuickLogBar beans={beans} onSave={handleSave} defaultBeanId={beans[0]?.id} />

      <section className="grid gap-6 md:grid-cols-2">
        <article className="journal-card p-6">
          <h3 className="text-xl font-display text-espresso">Rating trend</h3>
          {sortedTrendData.length ? (
            <Line
              data={{
                labels: sortedTrendData.map((m) => m.displayLabel),
                datasets: [
                  {
                    label: 'Avg rating',
                    data: sortedTrendData.map((m) => m.avg_rating ?? 0),
                    borderColor: '#A8563C',
                    backgroundColor: 'rgba(168, 86, 60, 0.2)',
                    tension: 0.4,
                    fill: true
                  }
                ]
              }}
              options={{ plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#56645D' } }, y: { ticks: { color: '#56645D' }, suggestedMin: 5, suggestedMax: 10 } } }}
            />
          ) : (
            <p className="text-sm text-moss">No data yet.</p>
          )}
        </article>
        <article className="journal-card p-6">
          <h3 className="text-xl font-display text-espresso">Top beans</h3>
          {metrics ? (
            <Bar
              data={{
                labels: metrics.top_beans.map((bean) => bean.bean_name),
                datasets: [
                  {
                    label: 'Avg rating',
                    data: metrics.top_beans.map((bean) => bean.avg_rating ?? 0),
                    backgroundColor: '#C89C73'
                  }
                ]
              }}
              options={{ plugins: { legend: { display: false } }, scales: { y: { suggestedMax: 10 } } }}
            />
          ) : (
            <p className="text-sm text-moss">No beans logged yet.</p>
          )}
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-display">Recent brews</h3>
          {unsynced.length > 0 && <span className="text-sm text-caramel">{unsynced.length} pending sync</span>}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {allBrews.slice(0, 6).map((brew) => (
            <BrewCard key={brew.id} brew={brew as Brew} />
          ))}
        </div>
      </section>
    </div>
  );
}
