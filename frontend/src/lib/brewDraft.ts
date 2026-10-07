import type { BrewDraft } from '../types';
import { getBrewStylePreset } from './brewStyles';

// Pure draft transitions for the brew log form. State changes to the form are
// explicit `(draft) => draft` functions passed to setForm - nothing reacts to
// brew_style or yield changes in an effect, so a programmatic change (a saved
// setup applying style + dose + yield together) is never clobbered by a
// style-driven default.

// Omit the numeric fields that allow a blank ('') input state before
// re-adding them below — intersecting BrewDraft's plain `number` types
// directly with a `number | ''` union would collapse back to `number`
// (the empty-string member has no overlap with BrewDraft's type), silently
// losing the "blank input" case these form fields rely on.
export type DraftForm = Omit<
  BrewDraft,
  'bean_weight_g' | 'water_weight_g' | 'water_temp_c' | 'bloom_time_s' | 'total_brew_time_s'
> & {
  bean_weight_g: number | '';
  water_weight_g: number | '';
  water_temp_c?: number | '';
  bloom_time_s?: number | '';
  total_brew_time_s?: number | '';
};

export const DEFAULT_STYLE = 'pour-over';
export const DEFAULT_BEAN_WEIGHT_G = 18;
export const DEFAULT_WATER_TEMP = 96;
export const DEFAULT_BLOOM_TIME = 45;
export const DEFAULT_BREW_TIME = 180;

// Yields are shown and stored to one decimal.
export const roundYield = (grams: number): number => Number(grams.toFixed(1));

// First (preferred) ratio of a style; styles without a preset (an unknown
// value carried on an old brew or draft) fall back to the default style's.
const defaultRatio = (style: string | undefined): number =>
  (getBrewStylePreset(style) ?? getBrewStylePreset(DEFAULT_STYLE)!).ratios[0];

// Espresso has no bloom, and a 3-minute total time would be silently saved
// for a 30-second shot, so neither is defaulted for it.
const hasTimedDefaults = (style: string | undefined): boolean => style !== 'espresso';

// A fresh draft. With `advanced`, the style-aware advanced defaults are
// applied too (the full form shows those fields from the start).
export function makeDraft(
  beanId?: string,
  style: string = DEFAULT_STYLE,
  grinder?: string,
  options: { advanced?: boolean } = {}
): DraftForm {
  const draft: DraftForm = {
    bean_id: beanId,
    bean_weight_g: DEFAULT_BEAN_WEIGHT_G,
    water_weight_g: roundYield(DEFAULT_BEAN_WEIGHT_G * defaultRatio(style)),
    brew_style: style,
    date: new Date().toISOString().slice(0, 10),
    agitation_events: [],
    flavor_tags: [],
    aroma_tags: [],
    tasting_notes: '',
    rating: 8,
    aroma_rating: 8,
    flavor_rating: 8,
    grinder_name: grinder,
    grind_setting: '',
  };
  return options.advanced ? withAdvancedDefaults(draft) : draft;
}

// Fills only the advanced fields that are still unset (undefined). A value
// the user entered - or deliberately blanked to '' - is never overwritten.
export function withAdvancedDefaults(draft: DraftForm): DraftForm {
  const timed = hasTimedDefaults(draft.brew_style);
  return {
    ...draft,
    water_temp_c: draft.water_temp_c ?? DEFAULT_WATER_TEMP,
    bloom_time_s: draft.bloom_time_s ?? (timed ? DEFAULT_BLOOM_TIME : undefined),
    total_brew_time_s: draft.total_brew_time_s ?? (timed ? DEFAULT_BREW_TIME : undefined),
  };
}

// Picking a style by hand: set it, reset the yield to dose x that style's
// first ratio (only when the dose is a number and the style has a preset),
// clear untouched bloom/total defaults when moving to espresso, and - in
// advanced mode - fill the style's unset advanced defaults.
export function applyStyle(draft: DraftForm, style: string, options: { advanced?: boolean } = {}): DraftForm {
  const preset = getBrewStylePreset(style);
  const next: DraftForm = { ...draft, brew_style: style };
  // Moving to espresso from another style: bloom/total still equal to the
  // untouched other-style defaults are cleared (they'd otherwise be saved on a
  // ~30 s shot). Anything the user changed to another value stays.
  if (!hasTimedDefaults(style) && hasTimedDefaults(draft.brew_style)) {
    if (draft.bloom_time_s === DEFAULT_BLOOM_TIME) next.bloom_time_s = undefined;
    if (draft.total_brew_time_s === DEFAULT_BREW_TIME) next.total_brew_time_s = undefined;
  }
  if (preset && typeof draft.bean_weight_g === 'number') {
    next.water_weight_g = roundYield(draft.bean_weight_g * preset.ratios[0]);
  }
  return options.advanced ? withAdvancedDefaults(next) : next;
}
