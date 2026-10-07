import { describe, it, expect } from 'vitest';
import { agitationTotalsFromEvents, applyStyle, makeDraft, withAdvancedDefaults, roundYield } from '../brewDraft';

describe('makeDraft', () => {
  it('takes a single options object, all optional', () => {
    const draft = makeDraft();
    expect(draft).toMatchObject({ brew_style: 'pour-over', bean_weight_g: 18, water_weight_g: 270 });
    expect(draft.bean_id).toBeUndefined();
    expect(makeDraft({ beanId: 'b', grinder: 'Niche' })).toMatchObject({ bean_id: 'b', grinder_name: 'Niche' });
  });

  it('uses the style\'s first ratio for the yield', () => {
    expect(makeDraft({ beanId: 'b', style: 'pour-over' }).water_weight_g).toBe(270);
    expect(makeDraft({ beanId: 'b', style: 'espresso' }).water_weight_g).toBe(36);
  });

  it('keeps an unknown style as-is and falls back to the default ratio', () => {
    const draft = makeDraft({ beanId: 'b', style: 'cold-brew' });
    expect(draft.brew_style).toBe('cold-brew');
    expect(draft.water_weight_g).toBe(270);
  });

  it('only applies advanced defaults when asked', () => {
    expect(makeDraft({ beanId: 'b', style: 'pour-over' }).bloom_time_s).toBeUndefined();
    expect(makeDraft({ beanId: 'b', style: 'pour-over', advanced: true }).bloom_time_s).toBe(45);
    expect(makeDraft({ beanId: 'b', style: 'espresso', advanced: true }).bloom_time_s).toBeUndefined();
  });
});

describe('withAdvancedDefaults', () => {
  it('is style-aware and never overwrites set or blanked values', () => {
    const base = makeDraft({ beanId: 'b', style: 'pour-over' });
    expect(withAdvancedDefaults(base)).toMatchObject({ water_temp_c: 96, bloom_time_s: 45, total_brew_time_s: 180 });
    expect(withAdvancedDefaults({ ...base, bloom_time_s: 30, total_brew_time_s: '' })).toMatchObject({
      bloom_time_s: 30,
      total_brew_time_s: '',
    });
    expect(withAdvancedDefaults(makeDraft({ beanId: 'b', style: 'espresso' }))).toMatchObject({
      water_temp_c: 96,
      bloom_time_s: undefined,
      total_brew_time_s: undefined,
    });
  });
});

describe('applyStyle', () => {
  it('sets the style and the yield from dose x first ratio, as a new object', () => {
    const draft = makeDraft({ beanId: 'b', style: 'pour-over' });
    const next = applyStyle(draft, 'espresso');
    expect(next).not.toBe(draft);
    expect(next).toMatchObject({ brew_style: 'espresso', bean_weight_g: 18, water_weight_g: 36 });
    expect(draft.brew_style).toBe('pour-over');
  });

  it('leaves the yield alone for a blank dose or a style without a preset', () => {
    expect(applyStyle({ ...makeDraft({ beanId: 'b' }), bean_weight_g: '' }, 'espresso').water_weight_g).toBe(270);
    expect(applyStyle(makeDraft({ beanId: 'b' }), 'toString')).toMatchObject({ brew_style: 'toString', water_weight_g: 270 });
  });

  it('rounds to one decimal', () => {
    expect(applyStyle({ ...makeDraft({ beanId: 'b' }), bean_weight_g: 18.7 }, 'pour-over').water_weight_g).toBe(280.5);
    expect(roundYield(46.25)).toBe(46.3);
  });

  it('adds advanced defaults only in advanced mode', () => {
    expect(applyStyle(makeDraft({ beanId: 'b' }), 'aeropress').bloom_time_s).toBeUndefined();
    expect(applyStyle(makeDraft({ beanId: 'b' }), 'aeropress', { advanced: true }).bloom_time_s).toBe(45);
    expect(applyStyle(makeDraft({ beanId: 'b' }), 'espresso', { advanced: true }).bloom_time_s).toBeUndefined();
  });

  it('moving to espresso clears bloom/total that are still the untouched defaults', () => {
    const pourOver = makeDraft({ beanId: 'b', style: 'pour-over', advanced: true });
    const next = applyStyle(pourOver, 'espresso', { advanced: true });
    expect(next.bloom_time_s).toBeUndefined();
    expect(next.total_brew_time_s).toBeUndefined();
    expect(next.water_temp_c).toBe(96);
  });

  it('moving to espresso keeps bloom/total values the user changed', () => {
    const pourOver = { ...makeDraft({ beanId: 'b', style: 'pour-over', advanced: true }), bloom_time_s: 30, total_brew_time_s: 200 };
    const next = applyStyle(pourOver, 'espresso', { advanced: true });
    expect(next.bloom_time_s).toBe(30);
    expect(next.total_brew_time_s).toBe(200);
  });

  it('clears each default independently', () => {
    const pourOver = { ...makeDraft({ beanId: 'b', style: 'pour-over', advanced: true }), total_brew_time_s: 200 };
    const next = applyStyle(pourOver, 'espresso', { advanced: true });
    expect(next.bloom_time_s).toBeUndefined();
    expect(next.total_brew_time_s).toBe(200);
  });

  it('does not clear anything when the draft is already espresso', () => {
    const espresso = { ...makeDraft({ beanId: 'b', style: 'espresso' }), bloom_time_s: 45, total_brew_time_s: 180 };
    const next = applyStyle(espresso, 'espresso', { advanced: true });
    expect(next).toMatchObject({ bloom_time_s: 45, total_brew_time_s: 180 });
  });

  it('moving from espresso to another style fills unset bloom/total', () => {
    const next = applyStyle(makeDraft({ beanId: 'b', style: 'espresso', advanced: true }), 'pour-over', { advanced: true });
    expect(next).toMatchObject({ bloom_time_s: 45, total_brew_time_s: 180 });
  });
});

describe('agitationTotalsFromEvents', () => {
  it('is the running sum of amount_g, blank where the amount is missing', () => {
    const event = (amount_g?: number) => ({ timestamp_s: 0, action: 'pour', amount_g });
    expect(agitationTotalsFromEvents([])).toEqual([]);
    expect(agitationTotalsFromEvents([event(50), event(100), event(undefined), event(30)])).toEqual([
      50,
      150,
      '',
      180,
    ]);
  });
});
