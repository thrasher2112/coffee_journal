"""Supported brew style preset keys for saved setups.

The frontend list lives in ``BREW_STYLE_PRESETS`` in
``frontend/src/lib/brewStyles.ts``. The two lists must be kept in sync by
hand: ``frontend/src/lib/__tests__/brewStyles.test.ts`` pins the frontend keys
to exactly the values below, so changing the frontend list without touching
that test fails it - update both lists and the test together. A saved setup can
only use a style the log form can render a preset for.
"""

SETUP_BREW_STYLES: tuple[str, ...] = (
    "pour-over",
    "aeropress",
    "french-press",
    "espresso",
)
