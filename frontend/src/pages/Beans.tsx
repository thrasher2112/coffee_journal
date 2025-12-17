import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Bean } from '../types';
import { copyBean, createBean, deleteBean, fetchBeans, updateBean } from '../lib/api';
import { SAMPLE_BEANS } from '../lib/sampleData';

const emptyForm = { name: '', roaster: '', origin: '', process: '', roast_level: '', elevation_m: '' };
const defaultFilters = { q: '', firstUsedAfter: '', lastUsedBefore: '' };

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parts = value.split('T')[0]?.split('-');
  if (!parts || parts.length !== 3) return value;
  const [year, month, day] = parts;
  return `${Number(month)}/${Number(day)}/${year}`;
}

function formatAverage(value?: number | null) {
  if (value === null || value === undefined) return '—';
  return value.toFixed(1);
}

export function BeansPage() {
  const [beans, setBeans] = useState<Bean[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState(defaultFilters);
  const [filterForm, setFilterForm] = useState(defaultFilters);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchBeans({
        q: filters.q || undefined,
        firstUsedAfter: filters.firstUsedAfter || undefined,
        lastUsedBefore: filters.lastUsedBefore || undefined
      });
      setBeans(data);
      setError(null);
    } catch (err) {
      setBeans(SAMPLE_BEANS);
      setError('Unable to reach API — showing demo beans.');
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = {
      ...form,
      elevation_m: form.elevation_m ? Number(form.elevation_m) : null
    };
    try {
      if (editingId) {
        await updateBean(editingId, payload);
      } else {
        await createBean(payload);
      }
      resetForm();
      load();
    } catch (err) {
      setError('Failed to save bean. Check connection.');
    }
  };

  const handleEdit = (bean: Bean) => {
    setIsEditMode(true);
    setEditingId(bean.id);
    setForm({
      name: bean.name,
      roaster: bean.roaster || '',
      origin: bean.origin || '',
      process: bean.process || '',
      roast_level: bean.roast_level || '',
      elevation_m: bean.elevation_m?.toString() || ''
    });
  };

  const handleDelete = async (beanId: string) => {
    if (!window.confirm('Delete this bean? Brews referencing it will also be removed.')) {
      return;
    }
    try {
      await deleteBean(beanId);
      if (editingId === beanId) {
        resetForm();
      }
      load();
    } catch (err) {
      setError('Failed to delete bean. Check connection.');
    }
  };

  const handleCopy = async (beanId: string) => {
    try {
      await copyBean(beanId);
      load();
    } catch (err) {
      setError('Failed to copy bean. Check connection.');
    }
  };

  const handleFilterInput = (key: keyof typeof filterForm, value: string) => {
    setFilterForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFilterSubmit = (event: FormEvent) => {
    event.preventDefault();
    setFilters({ ...filterForm });
  };

  const handleClearFilters = () => {
    setFilterForm(defaultFilters);
    setFilters(defaultFilters);
  };

  const beanCountLabel = useMemo(() => {
    if (!beans.length) return 'No beans yet';
    return `${beans.length} bean${beans.length === 1 ? '' : 's'}`;
  }, [beans.length]);

  return (
    <div className="space-y-6">
      <section className="journal-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-moss">Library</p>
            <h2 className="text-3xl font-display text-espresso">Beans</h2>
            <p className="text-sm text-moss">{beanCountLabel}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const next = !isEditMode;
                setIsEditMode(next);
                if (!next) {
                  resetForm();
                }
              }}
              className={`rounded-full border px-4 py-2 text-sm ${
                isEditMode ? 'border-ember bg-ember/90 text-crema' : 'border-caramel/40 text-espresso'
              }`}
            >
              {isEditMode ? 'Exit edit mode' : 'Edit mode'}
            </button>
          </div>
        </div>

        <form onSubmit={handleFilterSubmit} className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-2 text-sm text-moss">
            <span className="text-xs uppercase tracking-[0.3em]">Search</span>
            <input
              type="search"
              value={filterForm.q}
              onChange={(event) => handleFilterInput('q', event.target.value)}
              className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
              placeholder="Name, roaster, origin"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-moss">
            <span className="text-xs uppercase tracking-[0.3em]">First used after</span>
            <input
              type="date"
              value={filterForm.firstUsedAfter}
              onChange={(event) => handleFilterInput('firstUsedAfter', event.target.value)}
              className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-moss">
            <span className="text-xs uppercase tracking-[0.3em]">Last used before</span>
            <input
              type="date"
              value={filterForm.lastUsedBefore}
              onChange={(event) => handleFilterInput('lastUsedBefore', event.target.value)}
              className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
            />
          </label>
          <div className="flex items-end gap-3">
            <button type="submit" className="flex-1 rounded-full bg-ember py-2 text-crema">
              Apply filters
            </button>
            <button type="button" onClick={handleClearFilters} className="rounded-full border border-caramel/40 px-4 py-2 text-sm">
              Clear
            </button>
          </div>
        </form>

        {error && <p className="mt-4 text-sm text-ember">{error}</p>}
        {isLoading && <p className="mt-4 text-sm text-moss">Loading beans…</p>}

        <ul className="mt-6 space-y-3">
          {beans.map((bean) => (
            <li key={bean.id} className="rounded-2xl border border-caramel/40 bg-crema/70 p-4 text-espresso">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-display">{bean.name}</p>
                  <p className="text-sm text-moss">{bean.roaster || 'Unknown roaster'}</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-moss">{bean.origin || 'Origin TBD'}</p>
                </div>
                {isEditMode && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => handleEdit(bean)}
                      className="rounded-full border border-caramel/40 px-3 py-1"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopy(bean.id)}
                      className="rounded-full border border-caramel/40 px-3 py-1"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(bean.id)}
                      className="rounded-full border border-ember/60 px-3 py-1 text-ember"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-1 text-xs text-moss">
                <p>
                  First brew: {formatDate(bean.first_used_at)} · Last brew: {formatDate(bean.last_used_at)}
                </p>
                <p>
                  Avg rating: {formatAverage(bean.avg_rating)} · Brews: {bean.brew_count ?? 0}
                </p>
                {(bean.process || bean.roast_level || bean.elevation_m) && (
                  <p>
                    {bean.process && <span className="mr-2 uppercase tracking-[0.2em]">{bean.process}</span>}
                    {bean.roast_level && <span className="mr-2 uppercase tracking-[0.2em]">{bean.roast_level}</span>}
                    {bean.elevation_m && <span className="uppercase tracking-[0.2em]">{bean.elevation_m}m</span>}
                  </p>
                )}
              </div>
            </li>
          ))}
          {!beans.length && !isLoading && <p className="text-sm text-moss">No beans match this filter.</p>}
        </ul>
      </section>

      <section className="journal-card p-6">
        <h3 className="text-2xl font-display text-espresso">{editingId ? 'Edit bean' : 'Add bean'}</h3>
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
          <div className="flex items-center gap-3">
            <button type="submit" className="flex-1 rounded-full bg-ember py-3 text-crema">
              {editingId ? 'Update bean' : 'Save bean'}
            </button>
            {editingId && (
              <button type="button" onClick={resetForm} className="rounded-full border border-caramel/40 px-4 py-2">
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
