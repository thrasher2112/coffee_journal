"""Supported brew style preset keys.

Mirrors the keys of ``BREW_STYLE_PRESETS`` in ``frontend/src/lib/brewStyles.ts``.
Keep the two in sync: a saved setup can only use a style the log form can
render a preset for.
"""

SETUP_BREW_STYLES: tuple[str, ...] = (
    "pour-over",
    "aeropress",
    "french-press",
    "espresso",
)
