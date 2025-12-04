import { useEffect, useState } from 'react';
import type { Brew } from '../types';
import { fetchBrews } from '../lib/api';
import { SAMPLE_BREWS } from '../lib/sampleData';
import { BrewCard } from '../components/BrewCard';

export function BestCupsPage() {
  const [brews, setBrews] = useState<Brew[]>([]);

  useEffect(() => {
    fetchBrews()
      .then((data) => setBrews(data.filter((brew) => (brew.rating ?? 0) >= 8)))
      .catch(() => setBrews(SAMPLE_BREWS.filter((brew) => (brew.rating ?? 0) >= 8)));
  }, []);

  return (
    <section className="space-y-6">
      <header className="journal-card p-6">
        <h1 className="text-4xl font-display text-espresso">Best Cups</h1>
        <p className="text-sm text-moss">Batches scoring 8+ sorted by rating, then recency.</p>
      </header>
      <div className="grid gap-6 md:grid-cols-2">
        {brews.map((brew) => (
          <BrewCard key={brew.id} brew={brew} />
        ))}
        {!brews.length && <p className="text-sm text-moss">Log a few brews to see the hall of fame.</p>}
      </div>
    </section>
  );
}
