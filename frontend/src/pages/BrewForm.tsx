import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { QuickLogBar, type GrindPrefillInfo } from '../components/QuickLogBar';
import type { DraftForm } from '../lib/brewDraft';
import type { Bean } from '../types';
import { createBrew, fetchBeans } from '../lib/api';
import { useSetups } from '../hooks/useSetups';
import { useAuth } from '../contexts/AuthContext';

export function BrewFormPage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  // Arriving from Home's Quick Brew section carries whatever was already
  // typed in there, so switching to the full form doesn't lose it. A
  // direct visit to this page (no navigation state) just starts blank.
  const location = useLocation();
  const navState = location.state as { draft?: DraftForm; grindPrefill?: GrindPrefillInfo } | null;
  const initialDraft = navState?.draft;
  // Independent of beans: a setups failure just means no chips.
  const setups = useSetups();
  const { user } = useAuth();

  useEffect(() => {
    fetchBeans().then(setBeans).catch(() => setBeans([]));
  }, []);

  return (
    <div className="space-y-6">
      <header className="journal-card p-6">
        <h1 className="text-4xl font-display text-espresso">Full Brew Log</h1>
        <p className="mt-2 text-sm text-moss">
          Capture every dial-in detail: water temp, bloom, brew time, and each pour.
        </p>
      </header>
      <QuickLogBar
        beans={beans}
        variant="full"
        initialDraft={initialDraft}
        initialGrindPrefill={navState?.grindPrefill}
        setups={setups}
        userId={user?.id}
        onSave={async (draft) => {
          await createBrew(draft);
        }}
        defaultBeanId={beans[0]?.id}
      />
    </div>
  );
}
