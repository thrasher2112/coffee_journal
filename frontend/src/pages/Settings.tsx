import { useMemo, useState } from 'react';
import { ExportImportModal } from '../components/ExportImportModal';
import { useAuth } from '../contexts/AuthContext';
import { useLocalBrewStore } from '../hooks/useLocalBrewStore';
import { importData } from '../lib/api';
import { useBrewSync } from '../hooks/useBrewSync';
import { TemperatureUnit, usePreferences } from '../contexts/PreferencesContext';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { brews, unsynced, importLocal } = useLocalBrewStore();
  const { syncNow } = useBrewSync();
  const [modalOpen, setModalOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const { preferences, setPreference, addGrinder, removeGrinder, setPreferredGrinder } = usePreferences();
  const [newGrinder, setNewGrinder] = useState('');

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
    const { synced, needsBean, failed } = await syncNow();

    if (failed) {
      setStatus('Sync failed - still offline.');
      return;
    }
    // Drafts with no bean can never be accepted by the API. Say so instead of
    // leaving them stuck in the queue with no explanation.
    const blocked = needsBean
      ? ` ${needsBean} draft${needsBean === 1 ? '' : 's'} still need a bean before they can sync.`
      : '';
    setStatus(synced ? `Synced ${synced} brew${synced === 1 ? '' : 's'}.${blocked}` : blocked.trim() || 'Nothing to sync.');
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

  const handleTemperatureUnitChange = (unit: TemperatureUnit) => {
    setPreference('temperatureUnit', unit);
    setStatus(`Water temperature now displayed in ${unit === 'celsius' ? '°C' : '°F'}.`);
  };

  const handleAddGrinder = () => {
    const name = newGrinder.trim();
    if (!name) {
      setStatus('Enter a grinder name before adding.');
      return;
    }
    addGrinder(name);
    setPreferredGrinder(name);
    setNewGrinder('');
    setStatus(`Added ${name} to your grinder list.`);
  };

  const handleRemoveGrinder = (name: string) => {
    removeGrinder(name);
    setStatus(`Removed ${name} from your grinder list.`);
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
          <button className="inline-flex min-h-11 items-center justify-center rounded-full bg-ember px-4 py-2 text-sm text-crema" onClick={handleSync}>
            Sync now
          </button>
          <button className="inline-flex min-h-11 items-center justify-center rounded-full border border-caramel/50 px-4 py-2 text-sm text-caramel" onClick={() => setModalOpen(true)}>
            Export / Import
          </button>
          <button className="inline-flex min-h-11 items-center justify-center rounded-full border border-caramel/50 px-4 py-2 text-sm text-caramel" onClick={handleServerImport}>
            Push snapshot to API
          </button>
        </div>
      </header>
      <section className="journal-card p-6">
        <h2 className="text-2xl font-display text-espresso">Measurement preferences</h2>
        <p className="text-sm text-moss">Switch how water temperatures are displayed while logging brews.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(['celsius', 'fahrenheit'] as TemperatureUnit[]).map((unit) => {
            const active = preferences.temperatureUnit === unit;
            return (
              <button
                key={unit}
                type="button"
                onClick={() => handleTemperatureUnitChange(unit)}
                className={`inline-flex min-h-11 items-center justify-center rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? 'border-ember bg-ember text-crema'
                    : 'border-caramel/50 bg-transparent text-espresso'
                }`}
              >
                {unit === 'celsius' ? 'Celsius (°C)' : 'Fahrenheit (°F)'}
              </button>
            );
          })}
        </div>
      </section>
      <section className="journal-card space-y-4 p-6">
        <div>
          <h2 className="text-2xl font-display text-espresso">Preferred grinders</h2>
          <p className="text-sm text-moss">Manage the grinders that appear in Quick Brew. Set a default to prefill new brews.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            value={newGrinder}
            onChange={(event) => setNewGrinder(event.target.value)}
            placeholder="Add grinder name"
            className="flex-1 rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-sm text-crema min-w-[220px]"
          />
          <button type="button" className="inline-flex min-h-11 items-center justify-center rounded-full bg-ember px-4 py-2 text-sm text-crema" onClick={handleAddGrinder}>
            Add grinder
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {preferences.grinders.map((grinder) => {
            const active = preferences.preferredGrinder === grinder;
            return (
              <li
                key={grinder}
                className="flex items-center justify-between rounded-xl border border-caramel/40 bg-espresso/40 px-4 py-2 text-crema"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="preferred-grinder"
                    className="h-5 w-5 accent-ember"
                    checked={active}
                    onChange={() => setPreferredGrinder(grinder)}
                  />
                  <span>{grinder}</span>
                </div>
                <button
                  type="button"
                  className="inline-flex min-h-11 items-center justify-center min-w-11 px-2 text-xs uppercase tracking-[0.3em] text-caramel"
                  onClick={() => handleRemoveGrinder(grinder)}
                >
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="journal-card space-y-4 p-6">
        <div>
          <h2 className="text-2xl font-display text-espresso">Account</h2>
          <p className="text-sm text-moss">Signed in as <span className="text-caramel">{user?.email}</span></p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-caramel/50 px-4 py-2 text-sm text-caramel"
        >
          Sign out
        </button>
      </section>
      <ExportImportModal open={modalOpen} onClose={() => setModalOpen(false)} onExport={handleExport} onImport={handleImport} />
    </section>
  );
}
