import { describe, it, expect } from 'vitest';
import {
  agitationTotalsFromEvents,
  applySetup,
  applyStyle,
  makeDraft,
  setupChipLabel,
  withAdvancedDefaults,
  roundYield,
} from '../brewDraft';
import type { BrewSetup } from '../../types';

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

describe('applySetup', () => {
  const office: BrewSetup = {
    id: 's1',
    name: 'Office · Espresso',
    brew_style: 'espresso',
    ratio: 3,
    dose_g: 18,
    grinder_name: 'Niche',
    grind_setting: '14',
    target_time_s: 36,
    machine_profile: 'Extractamundo Dos!',
  };

  it('applies across styles in one go: pour-over draft + espresso setup keeps 18 g -> 54 g', () => {
    const draft = makeDraft({ beanId: 'b', style: 'pour-over', grinder: 'Comandante' });
    const next = applySetup(draft, office, { advanced: false });
    expect(next).not.toBe(draft);
    expect(next).toMatchObject({
      bean_id: 'b',
      brew_style: 'espresso',
      bean_weight_g: 18,
      water_weight_g: 54,
      grinder_name: 'Niche',
      grind_setting: '14',
      total_brew_time_s: 36,
      machine_profile: 'Extractamundo Dos!',
      setup_name: 'Office · Espresso',
    });
    expect(draft.brew_style).toBe('pour-over');
  });

  it('uses the setup dose over the draft dose, and rounds the yield to one decimal', () => {
    const draft = { ...makeDraft({ beanId: 'b' }), bean_weight_g: 20 as number | '' };
    const next = applySetup(draft, { ...office, dose_g: 18.5, ratio: 2.5 }, { advanced: false });
    expect(next).toMatchObject({ bean_weight_g: 18.5, water_weight_g: 46.3 });
  });

  it('uses the draft dose when the setup has none', () => {
    const draft = { ...makeDraft({ beanId: 'b' }), bean_weight_g: 20 as number | '' };
    const next = applySetup(draft, { ...office, dose_g: null, ratio: 8, brew_style: 'aeropress' }, { advanced: false });
    expect(next).toMatchObject({ bean_weight_g: 20, water_weight_g: 160, brew_style: 'aeropress' });
  });

  it('keeps a fractional setup dose unrounded and the yield to one decimal (18.2 g x 3 = 54.6 g)', () => {
    const next = applySetup(makeDraft({ beanId: 'b' }), { ...office, dose_g: 18.2, ratio: 3 }, { advanced: false });
    expect(next).toMatchObject({ bean_weight_g: 18.2, water_weight_g: 54.6 });
  });

  it('leaves the yield alone when dose x ratio would round below the smallest valid yield', () => {
    const draft = makeDraft({ beanId: 'b' });
    const next = applySetup(draft, { ...office, dose_g: 0.1, ratio: 0.4 }, { advanced: false });
    expect(next.bean_weight_g).toBe(0.1);
    expect(next.water_weight_g).toBe(draft.water_weight_g);
  });

  it('leaves the yield alone when neither the setup nor the draft has a dose', () => {
    const draft = { ...makeDraft({ beanId: 'b' }), bean_weight_g: '' as number | '', water_weight_g: 123 as number | '' };
    const next = applySetup(draft, { ...office, dose_g: null }, { advanced: false });
    expect(next).toMatchObject({ bean_weight_g: '', water_weight_g: 123 });
  });

  it('clears grinder, grind setting, target time and profile that the setup leaves null', () => {
    const draft = {
      ...makeDraft({ beanId: 'b', grinder: 'Comandante' }),
      grind_setting: '20',
      total_brew_time_s: 200 as number | '',
      machine_profile: 'Old',
      setup_name: 'Old setup',
    };
    const bare: BrewSetup = { id: 's2', name: 'Bare', brew_style: 'pour-over', ratio: 16 };
    const next = applySetup(draft, bare, { advanced: false });
    expect(next.grinder_name).toBeUndefined();
    expect(next.grind_setting).toBe('');
    expect(next.total_brew_time_s).toBeUndefined();
    expect(next.machine_profile).toBeUndefined();
    expect(next.setup_name).toBe('Bare');
  });

  it('in advanced mode adds no bloom or total default for an espresso setup without a target time', () => {
    const draft = makeDraft({ beanId: 'b', style: 'pour-over', advanced: true });
    const next = applySetup(draft, { ...office, target_time_s: null }, { advanced: true });
    expect(next.bloom_time_s).toBeUndefined();
    expect(next.total_brew_time_s).toBeUndefined();
    expect(next.water_temp_c).toBe(96);
  });

  it('in advanced mode keeps the setup target time and fills the style default when it has none', () => {
    const draft = makeDraft({ beanId: 'b', style: 'espresso', advanced: true });
    expect(applySetup(draft, office, { advanced: true }).total_brew_time_s).toBe(36);
    const pour: BrewSetup = { id: 's3', name: 'V60', brew_style: 'pour-over', ratio: 16 };
    expect(applySetup(draft, pour, { advanced: true })).toMatchObject({ bloom_time_s: 45, total_brew_time_s: 180 });
  });

  it('does not add advanced defaults outside advanced mode', () => {
    const next = applySetup(makeDraft({ beanId: 'b' }), { ...office, target_time_s: null }, { advanced: false });
    expect(next.water_temp_c).toBeUndefined();
  });

  it('drops an untouched pour-over bloom default when moving to a style without one, but not an edited one', () => {
    const untouched = makeDraft({ beanId: 'b', style: 'pour-over', advanced: true });
    expect(applySetup(untouched, office, { advanced: true }).bloom_time_s).toBeUndefined();
    const edited = { ...untouched, bloom_time_s: 30 as number | '' };
    expect(applySetup(edited, office, { advanced: true }).bloom_time_s).toBe(30);
  });

  it('leaves agitation events, notes, ratings and bean alone', () => {
    const events = [{ timestamp_s: 5, action: 'pour', amount_g: 40 }];
    const draft = { ...makeDraft({ beanId: 'b' }), agitation_events: events, tasting_notes: 'hi', rating: 6 };
    const next = applySetup(draft, office, { advanced: false });
    expect(next.agitation_events).toBe(events);
    expect(next).toMatchObject({ tasting_notes: 'hi', rating: 6, bean_id: 'b' });
  });
});

describe('setupChipLabel', () => {
  it('prints the ratio without trailing zeros', () => {
    const base = { id: 'x', name: 'Home · AeroPress', brew_style: 'aeropress' };
    expect(setupChipLabel({ ...base, ratio: 8 })).toBe('Home · AeroPress · 1:8');
    expect(setupChipLabel({ ...base, ratio: 2.5 })).toBe('Home · AeroPress · 1:2.5');
    expect(setupChipLabel({ ...base, ratio: 3.0 })).toBe('Home · AeroPress · 1:3');
  });
});
