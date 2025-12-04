import { FormEvent, useEffect, useState } from 'react';
import type { Bean } from '../types';
import { createBean, fetchBeans } from '../lib/api';
import { SAMPLE_BEANS } from '../lib/sampleData';

export function BeansPage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [form, setForm] = useState({ name: '', roaster: '', origin: '', process: '', roast_level: '' });
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await fetchBeans();
      setBeans(data);
      setError(null);
    } catch (err) {
      setBeans(SAMPLE_BEANS);
      setError('Unable to reach API — showing demo beans.');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await createBean(form);
      setForm({ name: '', roaster: '', origin: '', process: '', roast_level: '' });
      load();
    } catch (err) {
      setError('Failed to create bean. Check connection.');
    }
  };

  return (
    <div className="grid gap-8 md:grid-cols-[2fr,1fr]">
      <section className="journal-card p-6">
        <h2 className="text-3xl font-display text-espresso">Bean library</h2>
        {error && <p className="mt-2 text-sm text-ember">{error}</p>}
        <ul className="mt-4 space-y-3">
          {beans.map((bean) => (
            <li key={bean.id} className="rounded-2xl border border-caramel/40 bg-crema/70 p-4 text-espresso">
              <p className="text-lg font-display">{bean.name}</p>
              <p className="text-sm text-moss">{bean.roaster || 'Unknown roaster'}</p>
              <p className="text-xs uppercase tracking-[0.3em] text-moss">{bean.origin || 'Origin TBD'}</p>
            </li>
          ))}
          {!beans.length && <p className="text-sm text-moss">No beans yet.</p>}
        </ul>
      </section>
      <section className="journal-card p-6">
        <h3 className="text-2xl font-display text-espresso">Add bean</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3 text-sm text-moss">
          {Object.entries(form).map(([key, value]) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-[0.3em]">{key.replace('_', ' ')}</span>
              <input
                value={value}
                onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
              />
            </label>
          ))}
          <button type="submit" className="w-full rounded-full bg-ember py-3 text-crema">
            Save bean
          </button>
        </form>
      </section>
    </div>
  );
}
