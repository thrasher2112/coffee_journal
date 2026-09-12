import { useEffect, useState } from 'react';
import { minPartFromSeconds, secPartFromSeconds, secondsFromMinSec } from '../lib/time';

interface Props {
  label: string;
  valueSeconds: number | '';
  onChange: (seconds: number | '') => void;
  // The label still drives the inputs' aria-labels when this is set - only
  // its visible <span> is skipped, for compact repeated rows (e.g. one per
  // agitation event) where a column header already names the field.
  hideLabel?: boolean;
  // Narrower inputs matching the padding/sizing of the compact rows this
  // renders alongside (e.g. the per-agitation-event grid), instead of the
  // roomier default sized for a standalone form field.
  compact?: boolean;
}

// Every duration field in the app is stored as whole seconds (matches the
// backend schema), but nobody times a brew in bare seconds - they read a
// stopwatch in minutes:seconds. This is the one place that conversion
// happens, shared by bloom time, total brew time, and each agitation event's
// timestamp so they can't drift out of sync with each other.
//
// The two fields are tracked as their own raw strings rather than always
// being re-derived from valueSeconds. Deriving on every render is what a
// naive version of this does, and it means clearing the duration back to
// "unset" is unreachable: clearing just one field (say, minutes) still
// leaves the other holding a number, so the pair round-trips to that
// number-with-a-zero rather than blank - the field can never get back to
// "" once it has held any value. Keeping raw strings, and only emitting ''
// once BOTH are empty, is what makes clearing it actually clear it.
export function MinSecInput({ label, valueSeconds, onChange, hideLabel, compact }: Props) {
  const [rawMin, setRawMin] = useState(() => String(minPartFromSeconds(valueSeconds)));
  const [rawSec, setRawSec] = useState(() => String(secPartFromSeconds(valueSeconds)));

  // Resync from valueSeconds only when it changed for a reason other than
  // our own last onChange call (e.g. the whole form was reset, or advanced
  // mode filled in a default) - otherwise this would fight the in-progress
  // edit on every keystroke.
  useEffect(() => {
    const echoedBack = secondsFromMinSec(
      rawMin === '' ? '' : Number(rawMin),
      rawSec === '' ? '' : Number(rawSec)
    );
    if (echoedBack === valueSeconds) return;
    setRawMin(String(minPartFromSeconds(valueSeconds)));
    setRawSec(String(secPartFromSeconds(valueSeconds)));
    // Only external changes to valueSeconds should trigger a resync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueSeconds]);

  const emit = (nextMin: string, nextSec: string) => {
    if (nextMin === '' && nextSec === '') {
      onChange('');
      return;
    }
    onChange(secondsFromMinSec(nextMin === '' ? '' : Number(nextMin), nextSec === '' ? '' : Number(nextSec)));
  };

  const inputClass = compact
    ? 'w-12 rounded border border-caramel/40 bg-white/80 px-1.5 py-1 text-espresso'
    : 'w-16 rounded-lg border border-caramel/40 bg-espresso/60 px-3 py-2 text-crema';

  return (
    <label className="flex flex-col gap-1 text-sm">
      {!hideLabel && <span className="text-xs uppercase tracking-[0.3em] text-moss">{label}</span>}
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          value={rawMin}
          placeholder="min"
          aria-label={`${label} minutes`}
          onChange={(event) => {
            setRawMin(event.target.value);
            emit(event.target.value, rawSec);
          }}
          className={inputClass}
        />
        <span className="text-moss">:</span>
        <input
          type="number"
          min={0}
          max={59}
          value={rawSec}
          placeholder="sec"
          aria-label={`${label} seconds`}
          onChange={(event) => {
            setRawSec(event.target.value);
            emit(rawMin, event.target.value);
          }}
          className={inputClass}
        />
      </span>
    </label>
  );
}
