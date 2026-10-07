import { describe, it, expect } from 'vitest';
import {
  BREW_STYLE_PRESETS,
  brewStyleLabel,
  getBrewStylePreset,
  isBrewStyle,
} from '../brewStyles';

describe('BREW_STYLE_PRESETS', () => {
  // Drift guard: backend/src/coffee_journal/brew_styles.py SETUP_BREW_STYLES
  // must list exactly these keys (the backend validates a saved setup's
  // brew_style against it). Change both together.
  it('has exactly the keys the backend SETUP_BREW_STYLES lists', () => {
    expect(Object.keys(BREW_STYLE_PRESETS)).toEqual(['pour-over', 'aeropress', 'french-press', 'espresso']);
  });

  it('espresso offers 1:2, 1:2.5 and 1:3, led by 1:2', () => {
    expect(BREW_STYLE_PRESETS.espresso.ratios).toEqual([2, 2.5, 3]);
    expect(brewStyleLabel('espresso')).toBe('Espresso');
  });
});

describe('isBrewStyle / getBrewStylePreset', () => {
  it('recognises preset keys', () => {
    expect(isBrewStyle('espresso')).toBe(true);
    expect(getBrewStylePreset('aeropress')?.ratios).toEqual([17, 18, 19]);
  });

  it('does not treat unknown or prototype keys as styles', () => {
    for (const value of ['cold-brew', 'toString', 'constructor', '__proto__', 'hasOwnProperty', '']) {
      expect(isBrewStyle(value)).toBe(false);
      expect(getBrewStylePreset(value)).toBeUndefined();
    }
    expect(getBrewStylePreset(undefined)).toBeUndefined();
  });

  it('brewStyleLabel shows unknown values as-is', () => {
    expect(brewStyleLabel('toString')).toBe('toString');
    expect(brewStyleLabel('cold-brew')).toBe('cold-brew');
    expect(brewStyleLabel(undefined)).toBeUndefined();
  });
});
