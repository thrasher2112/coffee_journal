import { describe, it, expect } from 'vitest';
import { localLastGrind, pickSuggestion, fromServer } from '../lastGrind';
import type { LocalBrew } from '../../types';

const brew = (over: Partial<LocalBrew> = {}): LocalBrew => ({
  local_id: Math.random().toString(),
  synced: false,
  created_at: '2026-10-05T10:00:00.000Z',
  bean_id: 'b1',
  grinder_name: 'Niche Zero',
  grind_setting: '15',
  date: '2026-10-05',
  bean_weight_g: 18,
  water_weight_g: 288,
  agitation_events: [],
  flavor_tags: [],
  ...over,
});

describe('localLastGrind', () => {
  it('matches bean and grinder (case-insensitive, trimmed) with a non-blank grind', () => {
    expect(localLastGrind([brew({ grinder_name: ' niche ZERO ' })], 'b1', 'niche zero')).toMatchObject({
      grind: '15',
      date: '2026-10-05',
    });
  });

  it('ignores synced entries, other beans, other grinders and blank grinds', () => {
    const queue = [
      brew({ synced: true }),
      brew({ bean_id: 'b2' }),
      brew({ grinder_name: 'Comandante' }),
      brew({ grind_setting: '  ' }),
      brew({ grind_setting: undefined }),
    ];
    expect(localLastGrind(queue, 'b1', 'niche zero')).toBeNull();
  });

  it('picks the newest by date, then by created_at', () => {
    const queue = [
      brew({ grind_setting: 'old', date: '2026-10-01' }),
      brew({ grind_setting: 'a', date: '2026-10-05', created_at: '2026-10-05T08:00:00Z' }),
      brew({ grind_setting: 'b', date: '2026-10-05', created_at: '2026-10-05T09:00:00Z' }),
    ];
    expect(localLastGrind(queue, 'b1', 'niche zero')?.grind).toBe('b');
  });
});

describe('pickSuggestion', () => {
  const server = fromServer({ grind_setting: '14', date: '2026-10-05', created_at: '2026-10-05T09:00:00Z' });
  const local = (createdAt?: string, date = '2026-10-05') => ({ grind: '15', date, createdAt });

  it('returns whichever side exists', () => {
    expect(pickSuggestion(null, null)).toBeNull();
    expect(pickSuggestion(local(), null)?.grind).toBe('15');
    expect(pickSuggestion(null, server)?.grind).toBe('14');
  });

  it('later date wins, whichever side it is on', () => {
    expect(pickSuggestion(local('2026-10-05T01:00:00Z', '2026-10-06'), server)?.grind).toBe('15');
    expect(pickSuggestion(local('2026-10-09T01:00:00Z', '2026-10-04'), server)?.grind).toBe('14');
  });

  it('same day: later created_at wins', () => {
    expect(pickSuggestion(local('2026-10-05T10:00:00Z'), server)?.grind).toBe('15');
    expect(pickSuggestion(local('2026-10-05T08:00:00Z'), server)?.grind).toBe('14');
  });

  it('same day and no timestamp to compare: the queued brew wins', () => {
    expect(pickSuggestion(local(undefined), server)?.grind).toBe('15');
    expect(pickSuggestion(local('2026-10-05T08:00:00Z'), { grind: '14', date: '2026-10-05' })?.grind).toBe('15');
  });
});
