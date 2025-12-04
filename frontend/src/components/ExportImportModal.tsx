import { ChangeEvent } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onExport: () => void;
  onImport: (payload: unknown) => void;
}

export function ExportImportModal({ open, onClose, onExport, onImport }: Props) {
  if (!open) return null;

  const handleImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onImport(JSON.parse(text));
    event.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-crema p-6 text-espresso shadow-card">
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-display">Export / Import</h3>
          <button onClick={onClose} className="text-moss">
            Close
          </button>
        </div>
        <p className="mt-2 text-sm text-moss">
          Download a JSON snapshot for safekeeping or import a backlog from another device.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <button
            onClick={onExport}
            className="rounded-2xl border border-caramel/60 bg-espresso/90 px-4 py-3 text-crema"
          >
            Download export
          </button>
          <label className="rounded-2xl border border-dashed border-caramel/60 px-4 py-3 text-center text-moss">
            Import JSON
            <input type="file" accept="application/json" className="hidden" onChange={handleImport} />
          </label>
        </div>
      </div>
    </div>
  );
}
