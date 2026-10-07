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

**No `grind_setting` on a setup.** The first cut had one (migration 12 added the
column); owner testing showed it does not belong there. Grind depends on the
bean *and* the grinder, and drifts as a bag ages, so a fixed value on a setup is
wrong most of the time. Migration 14 drops the column (12 stays as shipped: it is
already applied on live databases). Instead the log form prefills the grind from
the last brew of the same bean on the same grinder, which brews already record
(`grind_setting` + `grinder_name`); no new bean field. Setup schemas ignore
unknown keys, so an old backup or stale client that still sends `grind_setting`
on a setup is accepted and the value dropped.

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

Grind prefill lives on the brews router, declared before `/{brew_id}`:

- `GET /api/brews/last-grind?bean_id=&grinder_name=` — the caller's newest brew
  of that bean whose `grinder_name` matches case-insensitively and trimmed and
  whose `grind_setting` is non-blank (order: brew `date`, then `created_at`).
  200 `{grind_setting, date, created_at}` (the brew's date and log time), or 200 with a JSON `null` body
  when there is none - including another user's or an unknown bean id, so
  nothing leaks and "no suggestion" is not an error. Both params required
  (`bean_id` ≤ 36, `grinder_name` ≤ 120, else 422). Authenticated, user-scoped.

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

**Dose / yield inputs.** Dose `min={0.1} step="any"`, yield `min={0.1} step={0.1}`;
chip/setup yields round to one decimal. Setup `dose_g` is held to the same 0.1 g
floor (API `ge=0.1`, Settings check), and Settings refuses a dose x ratio that
rounds below 0.1 g, so any setup can be applied and then saved. Machine profile
is an editable field on the log form (always in the full form; in the quick form
while the draft carries one) - a setup only suggests it.

**Explicit form transitions (replaces the brewStyle effect).** Today
`QuickLogBar.tsx` runs an effect on `brewStyle` change that resets yield to
`ratios[0]`. Applying a setup through that path would turn 18 g × 3 = 54 g into
36 g, and AeroPress 144 g into 306 g. Replace effect-driven defaulting with
explicit transitions:

- *Pick a style manually* → apply that style's defaults (yield from `ratios[0]`).
- *Pick a setup* → in one state update, replace all setup-controlled fields:
  `brew_style`, `bean_weight_g` (if `dose_g` set), `water_weight_g` =
  dose × ratio, `grinder_name` (cleared when the setup leaves it null),
  `total_brew_time_s` = `target_time_s` (prefilled as an editable
  value), `machine_profile`, `setup_name`.
  A setup never touches `grind_setting`: a typed or prefilled grind survives it.
- *Grind prefill* - an effect keyed on (bean, normalised grinder), the one
  legitimate effect here (it syncs with the server, unlike the removed style
  effect). With both set and the grind not yet *decided*, it asks
  `fetchLastGrind` and fills the grind, with a hint beside the grind input
  ("from your 3 Oct brew", tied to the input by `aria-describedby`). Triggers:
  bean change, grinder change (setup apply, grinder select, preference
  hydration), a fresh draft after save/reset (the brew just saved is now the
  newest), initial mount. Rules: typing in the grind input decides it (an
  explicit `grindDecided` ref, like `grinderDecided`) and the lookup never
  overwrites it; an `initialDraft` with a non-empty grind counts as decided;
  Reset/save clear the flag. A response is applied only if bean and normalised
  grinder still match the request and the grind is still undecided. If the bean
  or grinder changes after a *prefilled* grind, that grind is cleared at once
  and looked up again; no result leaves it empty. Brews still waiting in the offline
  queue (`useLocalBrewStore`, unsynced, same bean and normalised grinder,
  non-blank grind) are candidates too: the newer of queue vs server wins, by
  brew date then `created_at` (the server sends it for this; with no timestamp
  to compare on the same day the queued brew wins, since it was logged on this
  device and the server has not seen it). Offline, a queue match alone is
  suggested. The queue is not account-scoped (known, tracked in another epic),
  but bean ids are per-user UUIDs, so matching on bean id cannot surface another
  account's grind. If the grinder changes under a grind the user typed (or the
  draft brought), the text is kept and a "Grinder changed — check grind
  setting" warning is shown beside the input until they type again. Otherwise,
  offline or failing: silently no prefill, the form never waits. The grind input (and so the hint) is an
  advanced-form field, but the quick form shows it (editable, with the hint) as
  soon as the draft has a grind - prefilled, typed or carried in - and keeps it
  for that draft, so a saved grind is never invisible. Reset/save hide it again. Navigating quick -> full
  passes the prefill (value + date) in the router state next to the draft, so the
  full form keeps the hint and still treats the grind as a suggestion, with no
  refetch. The hint adds the year when the brew is not from the current year.
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
- `last-grind`: match; grinder case/whitespace; newest by date then created_at;
  other grinder/bean ignored; null/blank grind skipped; other user's data
  invisible; null body when none; param bounds and missing params → 422.
- setups neither accept nor return `grind_setting`; an old-shaped import with it
  on its setups still works.
- export includes setups; import skips name collisions; v1-shaped payload
  without `setups` still imports.

Frontend (vitest):
- applying a setup **across styles** (pour-over → espresso) keeps yield = 54.
- fractional yield (18.5 × 2.5 = 46.3) is accepted by the form.
- setup with null grinder clears grinder and preference hydration does not
  refill it.
- last-used setup is selected on load, scoped per user; stale id ignored.
- `initialDraft` beats last-used.
- grind prefill: fills with hint on bean + grinder; no grinder → no lookup; a
  typed grind is never overwritten (late response too); stale response dropped
  (bean or grinder changed, or Reset); bean change re-prefills, clears when none
  or on failure; setup apply then lookup fills; `initialDraft` grind kept;
  failure harmless; saved payload carries the prefilled grind; StrictMode.
- `applySetup` leaves the grind alone.
- Settings: create/edit/delete, 409 message.
- BrewCard renders setup name / profile; unknown style doesn't crash.

## Deploy and rollback

Migrations 12-14 are additive except 14, which drops `brew_setups.grind_setting`
(its values are discarded). To roll back past migration 14, downgrade with the
**new** image first (`alembic downgrade 20261007_13`, which re-adds the column,
empty), and only then start an older image: an older image would otherwise find
a database revision it does not know. Rolling back further (13, 12) follows the
same rule - downgrade with the image that has those revisions, then switch.

## Out of scope

- Importing shots from visualizer.coffee (public
  `GET /api/shots/{id}/download` makes this feasible later).
- Offline caching of beans/setups and the existing offline-queue defects —
  tracked separately.
