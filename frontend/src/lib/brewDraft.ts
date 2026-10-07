import type { BrewDraft, BrewSetup } from '../types';
import { getBrewStylePreset } from './brewStyles';

// Pure draft transitions for the brew log form. State changes to the form are
// explicit `(draft) => draft` functions passed to setForm - nothing reacts to
// brew_style or yield changes in an effect, so a programmatic change (a saved
// setup applying style + dose + yield together) is never clobbered by a
// style-driven default.
//
// Whole-draft replacement and agitation: the component keeps the agitation
// scale readings (`agitationTotals`) in its own state next to the draft, since
// each row's amount_g is derived from them. Anything that replaces the draft
// wholesale must keep agitation_events and those totals in sync - either
// leave the current agitation_events untouched (what applySetup should do: a
// setup has no agitation data) or reseed the totals with
// agitationTotalsFromEvents, as the component does for an incoming draft and
// clears them on Reset.

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

// Whether a style gets bloom/total-time defaults (preset metadata; espresso
// opts out). A style outside the presets keeps the defaults.
const hasTimedDefaults = (style: string | undefined): boolean =>
  getBrewStylePreset(style)?.timedDefaults ?? true;

// Scale readings for an incoming draft's agitation rows: the running sum of
// amount_g, blank where a row has no amount (matching how the component
// derives amounts from readings, where a blank reading is skipped).
export function agitationTotalsFromEvents(events: DraftForm['agitation_events']): Array<number | ''> {
  let running = 0;
  return events.map((event) => {
    if (typeof event.amount_g !== 'number') return '';
    running += event.amount_g;
    return running;
  });
}

// A fresh draft. With `advanced`, the style-aware advanced defaults are
// applied too (the full form shows those fields from the start).
//
// See applySetup for how a saved setup is applied to a draft.
export function makeDraft(
  options: { beanId?: string; style?: string; grinder?: string; advanced?: boolean } = {}
): DraftForm {
  const { beanId, style = DEFAULT_STYLE, grinder, advanced } = options;
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
  return advanced ? withAdvancedDefaults(draft) : draft;
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
// advanced mode - fill the style's unset advanced defaults. This is for a
// style picked by hand; applying a saved setup must not go through it (see the
// applySetup contract on makeDraft).
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

// "Office · Espresso · 1:3": the setup's name plus its ratio, without trailing
// zeros (3, 2.5, 8).
export const setupChipLabel = (setup: Pick<BrewSetup, 'name' | 'ratio'>): string =>
  `${setup.name} · 1:${Number(setup.ratio)}`;

// Applying a saved setup: a pure `(draft) => draft` for setForm, replacing all
// setup-controlled fields in ONE update. brew_style is set DIRECTLY, not
// through applyStyle (which would reset the yield to the style's first ratio
// and clear bloom/total): the yield is the setup's dose x ratio, using the
// setup's dose or else the draft's current numeric dose (with neither, the
// yield is left alone). grinder_name, grind_setting, total_brew_time_s,
// machine_profile and setup_name are replaced even when the setup leaves them
// null, so nothing from a previous setup lingers. Setups carry no bloom, so
// bloom is left as is - except an untouched bloom default carried from a
// timed style into one without (espresso), cleared as applyStyle does so it is
// not saved on a ~30 s shot. agitation_events are left untouched.
// withAdvancedDefaults runs LAST in advanced mode, so unset fields get the
// new style's defaults.
//
// The component's handler must also set `grinderDecided.current = true`, even
// when the setup has no grinder, so preference hydration does not refill a
// grinder the setup left empty.
export function applySetup(draft: DraftForm, setup: BrewSetup, options: { advanced?: boolean } = {}): DraftForm {
  const dose =
    typeof setup.dose_g === 'number'
      ? setup.dose_g
      : typeof draft.bean_weight_g === 'number'
        ? draft.bean_weight_g
        : undefined;
  const next: DraftForm = {
    ...draft,
    brew_style: setup.brew_style,
    grinder_name: setup.grinder_name ?? undefined,
    grind_setting: setup.grind_setting ?? '',
    total_brew_time_s: setup.target_time_s ?? undefined,
    machine_profile: setup.machine_profile ?? undefined,
    setup_name: setup.name,
  };
  if (typeof setup.dose_g === 'number') next.bean_weight_g = setup.dose_g;
  if (dose !== undefined) next.water_weight_g = roundYield(dose * setup.ratio);
  if (!hasTimedDefaults(setup.brew_style) && hasTimedDefaults(draft.brew_style)) {
    if (draft.bloom_time_s === DEFAULT_BLOOM_TIME) next.bloom_time_s = undefined;
  }
  return options.advanced ? withAdvancedDefaults(next) : next;
}
