import { FlavorTag } from '../types';

const FLAVOR_TAGS: FlavorTag[] = ['Chocolatey', 'Nutty', 'Caramel', 'Fruity', 'Berry', 'Citrus', 'Floral', 'Spicy'];

interface Props {
  selected: FlavorTag[];
  onToggle: (tag: FlavorTag) => void;
}

export function FlavorWheel({ selected, onToggle }: Props) {
  return (
    <div className="rounded-2xl border border-caramel/40 bg-crema/70 p-4 text-espresso">
      <p className="text-xs uppercase tracking-[0.4em] text-moss">Flavor tags</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FLAVOR_TAGS.map((tag) => {
          const active = selected.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggle(tag)}
              className={`rounded-full border px-3 py-1 text-xs uppercase tracking-wide transition-colors ${
                active
                  ? 'border-ember bg-ember/90 text-crema shadow-card'
                  : 'border-caramel/60 bg-white/60 text-espresso'
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
