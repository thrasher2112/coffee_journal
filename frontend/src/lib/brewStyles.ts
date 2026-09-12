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
} as const;

export type BrewStyle = keyof typeof BREW_STYLE_PRESETS;

function isBrewStyle(value: string): value is BrewStyle {
  return value in BREW_STYLE_PRESETS;
}

// Brews from before brew_style existed, or an import from elsewhere, can
// carry a value outside the presets above - fall back to showing it as-is
// rather than hiding it.
export function brewStyleLabel(style: string | undefined | null): string | undefined {
  if (!style) return undefined;
  return isBrewStyle(style) ? BREW_STYLE_PRESETS[style].label : style;
}
