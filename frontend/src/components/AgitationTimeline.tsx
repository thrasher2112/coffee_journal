import type { AgitationEvent } from '../types';
import { formatMinSec } from '../lib/time';

interface Props {
  events: AgitationEvent[];
}

export function AgitationTimeline({ events }: Props) {
  if (!events.length) {
    return (
      <div className="rounded-xl border border-caramel/30 p-3 text-xs text-moss">
        No agitation events logged
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-caramel/40 bg-white/70 p-3">
      <p className="text-xs uppercase tracking-[0.3em] text-moss">Agitation Timeline</p>
      <ol className="mt-2 space-y-1 text-sm text-espresso">
        {events.map((event, idx) => (
          <li key={`${event.timestamp_s}-${idx}`} className="flex items-center justify-between">
            <span>
              {formatMinSec(event.timestamp_s)} · {event.action}
            </span>
            {event.amount_g && <span>{event.amount_g}g</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
