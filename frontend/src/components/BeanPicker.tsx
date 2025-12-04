import type { Bean } from '../types';

interface Props {
  beans: Bean[];
  value?: string;
  onChange: (value: string) => void;
}

export function BeanPicker({ beans, value, onChange }: Props) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs uppercase tracking-[0.3em] text-moss">Bean</span>
      <select
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema"
      >
        <option value="">Select bean</option>
        {beans.map((bean) => (
          <option key={bean.id} value={bean.id}>
            {bean.name} — {bean.roaster || bean.origin}
          </option>
        ))}
      </select>
    </label>
  );
}
