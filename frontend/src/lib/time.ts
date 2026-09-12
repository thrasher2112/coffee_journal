// Every duration in the data model is stored in whole seconds
// (bloom_time_s, total_brew_time_s, AgitationEvent.timestamp_s) to match the
// backend schema. These helpers are the only place that seconds gets
// converted to/from the minutes:seconds shape people actually think and
// brew in.

export function formatMinSec(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function secondsFromMinSec(minutes: number | '', seconds: number | ''): number | '' {
  const min = minutes === '' ? 0 : minutes;
  const sec = seconds === '' ? 0 : seconds;
  if (minutes === '' && seconds === '') return '';
  return min * 60 + sec;
}

export function minPartFromSeconds(totalSeconds: number | '' | undefined): number | '' {
  if (totalSeconds === '' || totalSeconds === undefined) return '';
  return Math.floor(totalSeconds / 60);
}

export function secPartFromSeconds(totalSeconds: number | '' | undefined): number | '' {
  if (totalSeconds === '' || totalSeconds === undefined) return '';
  return totalSeconds % 60;
}
