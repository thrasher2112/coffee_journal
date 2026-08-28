import { useEffect, useState } from 'react';
import { QuickLogBar } from '../components/QuickLogBar';
import type { Bean } from '../types';
import { createBrew, fetchBeans } from '../lib/api';

export function BrewFormPage() {
  const [beans, setBeans] = useState<Bean[]>([]);

  useEffect(() => {
    fetchBeans().then(setBeans).catch(() => setBeans([]));
  }, []);

  return (
    <div className="space-y-6">
      <header className="journal-card p-6">
        <h1 className="text-4xl font-display text-espresso">Advanced Brew Form</h1>
        <p className="mt-2 text-sm text-moss">
          Capture every dial-in detail. This view mirrors the quick log but defaults to richer controls for recipe development.
        </p>
      </header>
      <QuickLogBar
        beans={beans}
        onSave={async (draft) => {
          await createBrew(draft);
        }}
        defaultBeanId={beans[0]?.id}
      />
    </div>
  );
}
