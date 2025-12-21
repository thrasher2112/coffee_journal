import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
  ArcElement
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { BrewCard } from '../components/BrewCard';
import { useLocalBrewStore } from '../hooks/useLocalBrewStore';
import type { Bean, Brew, MetricsOverview } from '../types';
import { fetchBeans, fetchBrews, fetchMetrics } from '../lib/api';
import { SAMPLE_BEANS, SAMPLE_BREWS, SAMPLE_METRICS } from '../lib/sampleData';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

export function HomePage() {
  const navigate = useNavigate();
  const [beans, setBeans] = useState<Bean[]>([]);
  const [brews, setBrews] = useState<Brew[]>([]);
  const [metrics, setMetrics] = useState<MetricsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { brews: localBrews, unsynced } = useLocalBrewStore();

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
    return [...local, ...remote].sort(
      (a, b) => new Date(b.date ?? b.created_at ?? 0).getTime() - new Date(a.date ?? a.created_at ?? 0).getTime()
    );
  }, [brews, localBrews, beans]);

  const lastBrew = allBrews[0];

  const styleDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    allBrews.forEach((brew) => {
      const style = brew.brew_style || 'Unknown';
      counts[style] = (counts[style] || 0) + 1;
    });
    const labels = Object.keys(counts);
    const data = labels.map((label) => counts[label]);
    return { labels, data };
  }, [allBrews]);

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

  const handleLogClick = () => navigate('/brew');
  const handleRepeatLast = () => {
    if (!lastBrew) {
      navigate('/brew');
      return;
    }
    navigate('/brew', { state: { prefill: lastBrew } });
  };

  return (
    <div className="space-y-8">
      {error && <div className="rounded-2xl border border-ember/50 bg-ember/20 p-3 text-sm text-crema">{error}</div>}

      <section className="journal-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-moss">Today at a glance</p>
            <h2 className="text-3xl font-display text-espresso">Dashboard</h2>
            {lastBrew ? (
              <div className="mt-3 text-sm text-moss space-y-1">
                <p>
                  Last brew: <span className="text-espresso font-semibold">{lastBrew.bean_name ?? 'Unknown bean'}</span>{' '}
                  · {lastBrew.brew_style ?? 'Style TBD'} · ratio {lastBrew.ratio ?? '—'} · rating{' '}
                  {lastBrew.rating ?? '—'}
                </p>
                <p className="text-xs uppercase tracking-[0.2em] text-moss">
                  {lastBrew.date || lastBrew.created_at}
                </p>
              </div>
            ) : (
              <p className="mt-2 text-sm text-moss">No brews yet — log your first one to get insights.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <button className="rounded-full bg-ember px-4 py-2 text-crema shadow-card" onClick={handleLogClick}>
              Log a Brew
            </button>
            <button
              className="rounded-full border border-caramel/50 px-4 py-2 text-espresso"
              onClick={handleRepeatLast}
              disabled={!lastBrew}
            >
              Repeat last brew
            </button>
            {unsynced.length > 0 && (
              <span className="rounded-full border border-caramel/50 px-3 py-1 text-xs text-caramel">
                {unsynced.length} draft{unsynced.length === 1 ? '' : 's'} offline
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-3">
        <article className="journal-card p-6 md:col-span-2">
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
          <h3 className="text-xl font-display text-espresso">Brew styles</h3>
          {styleDistribution.labels.length ? (
            <Doughnut
              data={{
                labels: styleDistribution.labels,
                datasets: [
                  {
                    label: 'Brews',
                    data: styleDistribution.data,
                    backgroundColor: ['#C89C73', '#A8563C', '#3B2924', '#56645D', '#F8F1E8']
                  }
                ]
              }}
              options={{ plugins: { legend: { position: 'bottom' } } }}
            />
          ) : (
            <p className="text-sm text-moss">Log a brew to see distribution.</p>
          )}
        </article>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
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
        <article className="journal-card p-6">
          <h3 className="text-xl font-display text-espresso">Recent brews</h3>
          <div className="mt-3 grid gap-3">
            {allBrews.slice(0, 3).map((brew) => (
              <div key={brew.id} className="flex items-center justify-between rounded-xl border border-caramel/30 bg-crema/70 p-3">
                <div>
                  <p className="text-sm font-display text-espresso">{brew.bean_name ?? 'Unknown bean'}</p>
                  <p className="text-xs uppercase tracking-[0.2em] text-moss">
                    {brew.brew_style ?? 'Style'} · ratio {brew.ratio ?? '—'}
                  </p>
                </div>
                <div className="text-right text-sm text-moss">
                  <p className="text-ember text-lg font-display">{brew.rating ?? '—'}</p>
                  <p className="text-xs">{brew.date || brew.created_at}</p>
                </div>
              </div>
            ))}
            {!allBrews.length && <p className="text-sm text-moss">No brews logged yet.</p>}
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-display">All recent cups</h3>
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
