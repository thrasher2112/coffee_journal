import { useMemo, useState } from 'react';
import { ExportImportModal } from '../components/ExportImportModal';
import { useLocalBrewStore } from '../hooks/useLocalBrewStore';
import { importData, syncBrews } from '../lib/api';
import type { BrewDraft } from '../types';

export function SettingsPage() {
  const { brews, unsynced, markSynced, importLocal } = useLocalBrewStore();
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const localExport = useMemo(() => ({ localBrews: brews }), [brews]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(localExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `coffee-journal-export-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (payload: unknown) => {
    if (
      typeof payload === 'object' &&
      payload !== null &&
      Array.isArray((payload as any).localBrews)
    ) {
      importLocal((payload as any).localBrews);
      setStatus('Imported into offline vault.');
    }
  };

  const handleSync = async () => {
    if (!unsynced.length) {
      setStatus('Nothing to sync.');
      return;
    }
    setStatus('Syncing...');
    try {
      const queue = unsynced
        .filter((brew) => Boolean(brew.bean_id))
        .map(({ local_id, synced, created_at, ...rest }) => ({
          payload: {
            ...rest,
            bean_id: rest.bean_id!,
            agitation_events: rest.agitation_events
          } as BrewDraft,
          localId: local_id
        }));
      if (!queue.length) {
        setStatus('Add a bean before syncing drafts.');
        return;
      }
      await syncBrews(queue.map((item) => item.payload));
      markSynced(queue.map((item) => item.localId));
      setStatus('Synced with API.');
    } catch (error) {
      setStatus('Sync failed, remain offline.');
    }
  };

  const handleServerImport = async () => {
    try {
      const serverPayload = {
        beans: [],
        brews: brews
          .filter((brew) => Boolean(brew.bean_id))
          .map(({ local_id, synced, created_at, ...rest }) => ({
            ...rest,
            bean_id: rest.bean_id ?? '',
            agitation_events: rest.agitation_events,
            created_at,
            updated_at: created_at,
            id: local_id
          }))
      };
      await importData(serverPayload);
      setStatus('Sent backup to API for safekeeping.');
    } catch (error) {
      setStatus('Server import failed.');
    }
  };

  return (
    <section className="space-y-6">
      <header className="journal-card p-6">
        <h1 className="text-4xl font-display text-espresso">Settings & Sync</h1>
        <p className="text-sm text-moss">Offline-first vault with manual export/import controls.</p>
        {status && <p className="mt-2 text-sm text-caramel">{status}</p>}
        <div className="mt-4 flex flex-wrap gap-3 text-sm text-moss">
          <span>Total local brews: {brews.length}</span>
          <span>Unsynced: {unsynced.length}</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button className="rounded-full bg-ember px-4 py-2 text-sm text-crema" onClick={handleSync}>
            Sync now
          </button>
          <button className="rounded-full border border-caramel/50 px-4 py-2 text-sm text-caramel" onClick={() => setModalOpen(true)}>
            Export / Import
          </button>
          <button className="rounded-full border border-caramel/50 px-4 py-2 text-sm text-caramel" onClick={handleServerImport}>
            Push snapshot to API
          </button>
        </div>
      </header>
      <ExportImportModal open={modalOpen} onClose={() => setModalOpen(false)} onExport={handleExport} onImport={handleImport} />
    </section>
  );
}
