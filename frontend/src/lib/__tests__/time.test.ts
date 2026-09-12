import { describe, it, expect } from 'vitest';
import { formatMinSec, secondsFromMinSec, minPartFromSeconds, secPartFromSeconds } from '../time';

describe('formatMinSec', () => {
  it('pads single-digit seconds', () => {
    expect(formatMinSec(65)).toBe('1:05');
  });

  it('handles zero', () => {
    expect(formatMinSec(0)).toBe('0:00');
  });

  it('handles bare seconds under a minute', () => {
    expect(formatMinSec(45)).toBe('0:45');
  });

  it('handles multi-minute durations', () => {
    expect(formatMinSec(185)).toBe('3:05');
  });
});

describe('secondsFromMinSec', () => {
  it('combines minutes and seconds', () => {
    expect(secondsFromMinSec(3, 5)).toBe(185);
  });

  it('treats a blank minute as zero', () => {
    expect(secondsFromMinSec('', 45)).toBe(45);
  });

  it('treats a blank second as zero', () => {
    expect(secondsFromMinSec(2, '')).toBe(120);
  });

  it('returns blank only when both fields are blank', () => {
    expect(secondsFromMinSec('', '')).toBe('');
  });
});

describe('minPartFromSeconds / secPartFromSeconds', () => {
  it('splits a duration into its parts', () => {
    expect(minPartFromSeconds(185)).toBe(3);
    expect(secPartFromSeconds(185)).toBe(5);
  });

  it('passes blank/undefined through', () => {
    expect(minPartFromSeconds('')).toBe('');
    expect(secPartFromSeconds(undefined)).toBe('');
  });
});
