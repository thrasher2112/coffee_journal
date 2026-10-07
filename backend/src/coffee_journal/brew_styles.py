"""Supported brew style preset keys for saved setups.

The frontend list lives in ``BREW_STYLE_PRESETS`` in
``frontend/src/lib/brewStyles.ts``. It does not have ``espresso`` yet: the
sibling bead cj-8ze.4 adds it. Until then, and after, the two lists must be kept
in sync by hand (a frontend test will pin the list). A saved setup can only use
a style the log form can render a preset for.
"""

SETUP_BREW_STYLES: tuple[str, ...] = (
    "pour-over",
    "aeropress",
    "french-press",
    "espresso",
)
