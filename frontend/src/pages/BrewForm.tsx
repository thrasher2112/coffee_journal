import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { QuickLogBar } from '../components/QuickLogBar';
import type { Bean, Brew, BrewDraft } from '../types';
import { createBrew, fetchBeans } from '../lib/api';
import { useLocalBrewStore } from '../hooks/useLocalBrewStore';

export function BrewFormPage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const location = useLocation();
  const prefill = (location.state as { prefill?: Partial<Brew> })?.prefill;
  const { addBrew } = useLocalBrewStore();

  useEffect(() => {
    fetchBeans().then(setBeans).catch(() => setBeans([]));
  }, []);

  const handleSave = async (draft: BrewDraft) => {
    setStatus('Saving...');
    try {
      await createBrew(draft);
      setStatus('Saved to API.');
    } catch (err) {
      console.warn('Saving locally', err);
      addBrew(draft);
      setStatus('Offline: saved as local draft.');
    }
  };

  return (
    <div className="space-y-6">
      <header className="journal-card p-6">
        <h1 className="text-4xl font-display text-espresso">Log a Brew</h1>
        <p className="mt-2 text-sm text-moss">Focused workspace for quick or advanced logging.</p>
        {status && <p className="mt-2 text-sm text-caramel">{status}</p>}
      </header>
      <QuickLogBar beans={beans} onSave={handleSave} defaultBeanId={beans[0]?.id} prefill={prefill} />
    </div>
  );
}
