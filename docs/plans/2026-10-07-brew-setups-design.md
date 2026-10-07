# Brew Setups — Design

Status: approved 2026-10-07. Tracked as beads epic (see `bd show` on the
"Brew setups" epic in this repo's stealth tracker).

## Problem

Ratio presets are hardcoded per brew style in `frontend/src/lib/brewStyles.ts`
(pour-over 15/16/17, AeroPress 17/18/19, French press 13/15/17). They cannot
express how the owner actually brews:

- **Office:** espresso on a Decent DE1, profile "Extractamundo Dos!", 18 g in →
  54 g out (1:3), ~36 s. Espresso is not a brew style at all today.
- **Home:** AeroPress at 1:8 — far outside the 17–19 presets.

Also, the yield input has `min={50} step={1}`, so a 15 g espresso at 1:3
(45 g) or any fractional yield fails native form validation.

The DE1 pushes every shot to visualizer.coffee, but those shots carry **no**
dose, grinder or grind setting (all null on the reference shot
`8cccf69b-7247-4f89-bdcc-d1929169e81b`). The journal is where those live.

## Solution: saved setups

A **setup** is a named, user-defined starting point, e.g. "Office · Espresso"
or "Home · AeroPress". Tapping it in the log form fills in a brew; every field
stays editable afterwards.

### 1. Data model

New table `brew_setups`:

| column | type | notes |
|---|---|---|
| `id` | String(36) PK | uuid4 |
| `user_id` | FK users.id, indexed | tenant key |
| `name` | String(80), not null | trimmed; unique per user **case-insensitively** |
| `brew_style` | String(50), not null | one of the supported presets (see §3) |
| `ratio` | Float, not null | finite, > 0, ≤ 30; fractional allowed (2.5) |
| `dose_g` | Float, nullable | finite, > 0 |
| `grinder_name` | String(120), nullable | |
| `grind_setting` | String(120), nullable | |
| `target_time_s` | Integer, nullable | ≥ 0 |
| `machine_profile` | String(120), nullable | free text, e.g. "Extractamundo Dos!" |
| `created_at` / `updated_at` | DateTime(tz) | |

Case-insensitive uniqueness: enforce with a unique index on
`(user_id, lower(name))` (works on Postgres and SQLite), and also check in CRUD
so the API can return a clean **409** — including on a concurrent create, where
the IntegrityError must be caught and mapped to 409, not 500.

`brews` gains two **snapshot** columns, both nullable, no FK:

- `setup_name` String(80) — the setup's name at the time of logging.
- `machine_profile` String(120) — the profile at the time of logging.

**Deliberately no `brews.setup_id`.** A live reference would let a deleted
setup poison the offline replay queue, require ownership validation on every
brew write path (including `/api/import`, which calls CRUD directly), and
require setup-id remapping on restore of both server brews and local drafts.
Snapshots give historical provenance and still allow filtering "all Office ·
Espresso brews" by name. Trade-off accepted: renaming a setup does not relabel
past brews.

One Alembic migration for the table; the brew columns may share it or follow
it (never two parallel heads).

### 2. API

New `routers/setups.py` (no `from __future__ import annotations` — router rule):

- `GET /api/setups` — list the caller's setups, ordered by name.
- `POST /api/setups` — create. 409 on duplicate name.
- `PATCH /api/setups/{id}` — partial update through a
  `_SETUP_MUTABLE_FIELDS` allowlist. Explicit `null` clears an optional field.
  409 on rename collision.
- `DELETE /api/setups/{id}` — 204. No brew is touched (snapshots only).

All endpoints `Depends(get_current_user)`; all CRUD filters by `user_id`
(another user's id → 404). Writes carry `@limiter.limit(...)` from the shared
`rate_limit.limiter`.

Brew schemas/CRUD allowlist/router accept and return `setup_name` and
`machine_profile` (max lengths as above). No setup validation on brew writes —
they are plain strings.

### 3. Frontend

**Brew styles.** Add `espresso` to `BREW_STYLE_PRESETS` with ratios
`[2, 2.5, 3]`. Setup `brew_style` is restricted to preset keys (backend
validates against the same list); any unknown style already stored must render
safely (fallback label, no crash on `BREW_STYLE_PRESETS[style]`).

**Yield input.** `min={1} step={0.1}`; chip/setup yields round to one decimal.

**Explicit form transitions (replaces the brewStyle effect).** Today
`QuickLogBar.tsx` runs an effect on `brewStyle` change that resets yield to
`ratios[0]`. Applying a setup through that path would turn 18 g × 3 = 54 g into
36 g, and AeroPress 144 g into 306 g. Replace effect-driven defaulting with
explicit transitions:

- *Pick a style manually* → apply that style's defaults (yield from `ratios[0]`).
- *Pick a setup* → in one state update, replace all setup-controlled fields:
  `brew_style`, `bean_weight_g` (if `dose_g` set), `water_weight_g` =
  dose × ratio, `grinder_name`, `grind_setting` (cleared when the setup leaves
  them null), `total_brew_time_s` = `target_time_s` (prefilled as an editable
  value), `machine_profile`, `setup_name`.
- *Incoming draft* (edit/navigate with `initialDraft`) wins over last-used
  defaults.
- *Preference hydration* must not refill a grinder the setup intentionally left
  empty.
- *Next brew / reset* re-applies the selected setup (or style defaults if none).
- Advanced defaults are style-aware: no 45 s bloom default for espresso.

A grinder named by a setup but absent from the preferences grinder list still
displays as selected (no forced write to preferences).

**Setup chips** sit at the top of the log form: "Office · Espresso 1:3".
Setups load from the server alongside beans — **no offline cache**. The
last-used setup id is remembered per device in localStorage under a key scoped
to the user id (e.g. `coffee-journal-last-setup:<userId>`), and ignored if it no
longer exists.

**Settings → Setups section.** List, add, edit, delete. Online-only. Show the
409 message on duplicate names.

**BrewCard** shows `setup_name` and `machine_profile` when present.

**Types / API client.** `types.ts` gets `BrewSetup`; `Brew`/`BrewDraft` gain
`setup_name?`, `machine_profile?`. `lib/api.ts` gets
`fetchSetups/createSetup/updateSetup/deleteSetup`.

### 4. Backup / restore

- `GET /api/export` includes `setups`.
- `POST /api/import` accepts optional `setups`. An incoming setup whose name
  (case-insensitive) already exists for the user is **skipped**, not merged;
  ids follow the existing `_id_taken` keep-if-free pattern. Response counts
  include setups (created vs skipped).
- Frontend backup file becomes `version: 2` with a `setups` array. Restore
  accepts v1 files (no `setups`) unchanged.
- Local drafts need no remapping (no setup ids on brews).

### 5. Testing

Backend (pytest, `make_client(user)` for tenancy):
- setup CRUD happy path; PATCH null-clearing; validation bounds (ratio ≤ 0,
  NaN/inf, unknown style, over-length strings → 422).
- duplicate name (incl. different case) → 409 on create and rename.
- user B cannot read/update/delete user A's setup (404).
- brew round-trips `setup_name` / `machine_profile`.
- export includes setups; import skips name collisions; v1-shaped payload
  without `setups` still imports.

Frontend (vitest):
- applying a setup **across styles** (pour-over → espresso) keeps yield = 54.
- fractional yield (18.5 × 2.5 = 46.3) is accepted by the form.
- setup with null grinder clears grinder and preference hydration does not
  refill it.
- last-used setup is selected on load, scoped per user; stale id ignored.
- `initialDraft` beats last-used.
- Settings: create/edit/delete, 409 message.
- BrewCard renders setup name / profile; unknown style doesn't crash.

## Out of scope

- Importing shots from visualizer.coffee (public
  `GET /api/shots/{id}/download` makes this feasible later).
- Offline caching of beans/setups and the existing offline-queue defects —
  tracked separately.
