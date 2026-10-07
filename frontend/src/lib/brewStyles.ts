// The keys here must match SETUP_BREW_STYLES in
// backend/src/coffee_journal/brew_styles.py (pinned by brewStyles.test.ts).
export const BREW_STYLE_PRESETS = {
  'pour-over': {
    label: 'Pour over',
    ratios: [15, 16, 17], // Hoffmann's V60 baseline (~60g/L) rounded to integer ratios
  },
  aeropress: {
    label: 'Aeropress',
    ratios: [17, 18, 19], // Hoffmann's championship AeroPress recipe sits around 1:18
  },
  'french-press': {
    label: 'French press',
    ratios: [13, 15, 17], // Hoffmann recommends 65–75g/L immersion brews ≈1:13–1:15
  },
  espresso: {
    label: 'Espresso',
    ratios: [2, 2.5, 3], // 1:2 is the classic; modern/lighter roasts run 1:2.5-1:3
  },
} as const;

export type BrewStyle = keyof typeof BREW_STYLE_PRESETS;
export type BrewStylePreset = (typeof BREW_STYLE_PRESETS)[BrewStyle];

// Own-key check: `value in PRESETS` is also true for prototype keys such as
// "toString" or "constructor".
export function isBrewStyle(value: string | undefined | null): value is BrewStyle {
  return typeof value === 'string' && Object.hasOwn(BREW_STYLE_PRESETS, value);
}

// Safe lookup: stored brews/drafts can carry a style outside the presets.
export function getBrewStylePreset(style: string | undefined | null): BrewStylePreset | undefined {
  return isBrewStyle(style) ? BREW_STYLE_PRESETS[style] : undefined;
}

// Brews from before brew_style existed, or an import from elsewhere, can
// carry a value outside the presets above - fall back to showing it as-is
// rather than hiding it.
export function brewStyleLabel(style: string | undefined | null): string | undefined {
  if (!style) return undefined;
  return isBrewStyle(style) ? BREW_STYLE_PRESETS[style].label : style;
}
