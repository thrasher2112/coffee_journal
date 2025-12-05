import { useEffect, useMemo, useState } from 'react';
import type { Brew } from '../types';
import { fetchBrews } from '../lib/api';
import { SAMPLE_BREWS } from '../lib/sampleData';
import { BrewCard } from '../components/BrewCard';

function sortBrews(brews: Brew[]) {
  return [...brews].sort((a, b) => {
    const dateA = new Date(a.date ?? a.created_at ?? 0).getTime();
    const dateB = new Date(b.date ?? b.created_at ?? 0).getTime();
    if (dateA === dateB) {
      return new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime();
    }
    return dateB - dateA;
  });
}

export function AllCupsPage() {
  const [brews, setBrews] = useState<Brew[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBrews()
      .then((data) => {
        setBrews(sortBrews(data));
        setError(null);
      })
      .catch(() => {
        setBrews(sortBrews(SAMPLE_BREWS));
        setError('Offline — showing demo cups');
      });
  }, []);

  const totalBrews = brews.length;
  const recentSummary = useMemo(() => {
    if (!brews.length) {
      return 'No brews logged yet.';
    }
    const lastBrew = brews[0];
    return `Last brew: ${new Date(lastBrew.date ?? lastBrew.created_at ?? Date.now()).toLocaleDateString()}`;
  }, [brews]);

  return (
    <section className="space-y-6">
      <header className="journal-card p-6">
        <h1 className="text-4xl font-display text-espresso">All Cups</h1>
        <p className="text-sm text-moss">
          {totalBrews} cup{totalBrews === 1 ? '' : 's'} logged · {recentSummary}
        </p>
        {error && <p className="mt-2 text-sm text-ember">{error}</p>}
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {brews.map((brew) => (
          <BrewCard key={brew.id} brew={brew} />
        ))}
        {!brews.length && <p className="text-sm text-moss">Log a brew to start building your archive.</p>}
      </div>
    </section>
  );
}
