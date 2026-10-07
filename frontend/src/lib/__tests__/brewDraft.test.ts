import { describe, it, expect } from 'vitest';
import { applyStyle, makeDraft, withAdvancedDefaults, roundYield } from '../brewDraft';

describe('makeDraft', () => {
  it('uses the style\'s first ratio for the yield', () => {
    expect(makeDraft('b', 'pour-over').water_weight_g).toBe(270);
    expect(makeDraft('b', 'espresso').water_weight_g).toBe(36);
  });

  it('keeps an unknown style as-is and falls back to the default ratio', () => {
    const draft = makeDraft('b', 'cold-brew');
    expect(draft.brew_style).toBe('cold-brew');
    expect(draft.water_weight_g).toBe(270);
  });

  it('only applies advanced defaults when asked', () => {
    expect(makeDraft('b', 'pour-over').bloom_time_s).toBeUndefined();
    expect(makeDraft('b', 'pour-over', undefined, { advanced: true }).bloom_time_s).toBe(45);
    expect(makeDraft('b', 'espresso', undefined, { advanced: true }).bloom_time_s).toBeUndefined();
  });
});

describe('withAdvancedDefaults', () => {
  it('is style-aware and never overwrites set or blanked values', () => {
    const base = makeDraft('b', 'pour-over');
    expect(withAdvancedDefaults(base)).toMatchObject({ water_temp_c: 96, bloom_time_s: 45, total_brew_time_s: 180 });
    expect(withAdvancedDefaults({ ...base, bloom_time_s: 30, total_brew_time_s: '' })).toMatchObject({
      bloom_time_s: 30,
      total_brew_time_s: '',
    });
    expect(withAdvancedDefaults(makeDraft('b', 'espresso'))).toMatchObject({
      water_temp_c: 96,
      bloom_time_s: undefined,
      total_brew_time_s: undefined,
    });
  });
});

describe('applyStyle', () => {
  it('sets the style and the yield from dose x first ratio, as a new object', () => {
    const draft = makeDraft('b', 'pour-over');
    const next = applyStyle(draft, 'espresso');
    expect(next).not.toBe(draft);
    expect(next).toMatchObject({ brew_style: 'espresso', bean_weight_g: 18, water_weight_g: 36 });
    expect(draft.brew_style).toBe('pour-over');
  });

  it('leaves the yield alone for a blank dose or a style without a preset', () => {
    expect(applyStyle({ ...makeDraft('b'), bean_weight_g: '' }, 'espresso').water_weight_g).toBe(270);
    expect(applyStyle(makeDraft('b'), 'toString')).toMatchObject({ brew_style: 'toString', water_weight_g: 270 });
  });

  it('rounds to one decimal', () => {
    expect(applyStyle({ ...makeDraft('b'), bean_weight_g: 18.7 }, 'pour-over').water_weight_g).toBe(280.5);
    expect(roundYield(46.25)).toBe(46.3);
  });

  it('adds advanced defaults only in advanced mode', () => {
    expect(applyStyle(makeDraft('b'), 'aeropress').bloom_time_s).toBeUndefined();
    expect(applyStyle(makeDraft('b'), 'aeropress', { advanced: true }).bloom_time_s).toBe(45);
    expect(applyStyle(makeDraft('b'), 'espresso', { advanced: true }).bloom_time_s).toBeUndefined();
  });
});
