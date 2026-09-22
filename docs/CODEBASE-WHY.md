# Why This Codebase Is The Way It Is
_Written 2026-09-18 at commit `1e5ba82`. Companion to `docs/CODEBASE-MAP.md`._
_Every claim is tagged [STATED: source] / [INFERRED: evidence] / [UNKNOWN]._
_Updated 2026-09-18: all six original open questions answered directly by the
repo owner (Ben) and upgraded from UNKNOWN/INFERRED to STATED throughout._

## Purpose

Coffee Journal is a personal pour-over/Aeropress/French-press brewing log —
beans, brews, ratings, trends — used by its own author
[STATED: `docs/FUTURE_FEATURES.md`'s "live in-brew stopwatch" entry describes
the author's own bloom-swirl technique in first-person design detail; this is
someone's real brewing habit, not a hypothetical user story].

But the repo is explicitly dual-purpose, and the second purpose reshapes
almost everything else in it. Commit `aaf3db4`'s message states outright:
*"Preparing the repo to go public and be linked from a resume/LinkedIn"*
[STATED: commit aaf3db4] — adding CI/license badges and a live-demo link for
that reason. README's own one-line pitch leads with *"multi-tenant data
isolation, and a full security hardening pass"* [STATED: README.md:3] ahead
of anything about coffee. `HANDOFF.txt` records a named "22 audit issues
resolved" pass and later a second, deeper "Security audit before going
public" with five numbered findings and fixes [STATED: docs/HANDOFF.txt].

This explains what would otherwise look disproportionate: a single-user
hobby journal has session revocation, hashed magic-link tokens, an email
allowlist with anti-oracle rejection semantics, trusted-hop-aware rate
limiting tuned against a live deploy, and a documented boot-time security
posture log. None of that is what a brewing log needs on its own merits — it
is what a security-hardening portfolio piece needs, applied to a domain the
author also genuinely uses [INFERRED: proportionality gap between app
complexity and hardening depth, combined with STATED "resume" framing in
aaf3db4].

**A second, load-bearing fact about how this repo was built**: most of it was
written by AI coding agents under Ben Robertson's direction, not typed by
hand. `git log --format='%an'` shows 44 commits from Ben Robertson, 15 from
"Codex Agent <agent@example.com>", and 3 from Jonathan Mohrbacher; separately,
40 of the 62 commit bodies carry `Co-Authored-By:` lines for four different
Claude model generations (Opus 4.5, Opus 5, Sonnet 4.6, Sonnet 5), several
with `Claude-Session:` URLs [INFERRED: `git log --format='%an'` and
`--format='%B' | grep -i co-authored-by` counts]. This is why `AGENTS.md`
reads the way it does — not as human onboarding prose but as **context
engineered for the next agent session**: each "Critical Pattern" documents a
bug an agent shipped and the fix, written so it won't recur across sessions
that don't share memory. It is also why `AGENTS.md`/`README.md`/
`STRUCTURE.md` are among the highest-churn files in the repo (per
`CODEBASE-MAP.md` §8) and why commit bodies here are essay-length with
verification transcripts embedded (e.g. `0c70407`'s "Measured against the
built image, 7 requests into a 5/minute endpoint...") — the commit message is
functioning as the durable memory an agent doesn't otherwise have
[INFERRED: commit body style and length, cross-referenced with author/co-author
data above].

**Explicit non-goals** (from `HANDOFF.txt`'s "Known Gaps" across multiple
passes, restated each time rather than fixed, meaning they are deliberately
deprioritized, not merely unfinished) [STATED: docs/HANDOFF.txt]:
- No media/photo attachments on brews or beans.
- No multi-taster "cupping session" scoring — this is a single-taster tool.
- No admin tooling for managing users (consistent with single-user-per-account
  design; there is no concept of an admin role at all).
- Paginated import for very large datasets — current import loads a whole
  file at once.

## Load-bearing decisions

### 1. Single-origin deploy: FastAPI serves the built SPA, not two hosts
**Chosen over**: a split frontend/backend deploy with the frontend calling an
absolute API URL baked in at build time.
**Why** [STATED: `HANDOFF.txt`, "Mobile / PWA + Deploy Pass"]: the earlier
approach baked `VITE_API_URL` (defaulting to `http://localhost:8000`) into
the frontend bundle at build time, which only worked on the machine that
built it. Single-origin also keeps the session cookie on `SameSite=Lax` and
removes CORS entirely as a concern.
**Cost**: the SPA fallback can't be a normal catch-all route — it has to be a
`404` exception handler, because a catch-all route matches during Starlette's
routing *before* `redirect_slashes` runs, and was silently turning the 307 on
`/api/brews` into a 404 (GET) / 405 (POST) [STATED: `docs/HANDOFF.txt`'s
Mobile/PWA pass, PR #8 / commit `38001e7`: "The SPA fallback is a 404
exception handler, NOT a catch-all route... silently turned the 307 on
/api/brews into a 404/405"; restated as a standing rule in AGENTS.md]. The CSP
(`default-src 'self'`) now also covers the app's own HTML, which is why fonts
are vendored via `@fontsource/*` instead of pulled from a CDN
[STATED: same HANDOFF.txt Mobile/PWA pass entry: "The CSP... now covers the
app HTML, so the Google Fonts CDN is blocked. Fonts are self-hosted via
@fontsource"].

### 2. Magic-link (passwordless) auth, token in the URL fragment, hashed at rest
**Chosen over**: password auth (no `password` field anywhere in the schema —
never built at all, not removed), and the original design where the token
rode in the verify URL's query string.
**Why** [STATED: commit `92dc973`]: single-origin means the SPA and API share
a log stream, so `GET /auth/verify?token=<value>` on the query-string design
wrote a live, replayable bearer credential into the API's own access log on
every sign-in, against an endpoint with no rate limit at the time. Moving the
token into the URL fragment means the browser never sends it to the server at
all. The token is stored as `sha256(token)`, not cleartext, because the
`magic_link_tokens` table was, before this fix, a table of live bearer
credentials readable by anyone with DB or backup access.
**Cost**: `ALLOWED_EMAILS` must gate both `request_magic_link` *and*
`verify_magic_link_token` — the second is what invalidates links already
sent when an address is removed from the allowlist — and rejection must
return the identical message as success or the endpoint becomes an allowlist
oracle [STATED: AGENTS.md Security Rules; commit 92dc973 point 3].

### 3. Rate-limit identity reads `X-Forwarded-For` from the right, by a configured hop count, and `TRUSTED_PROXY_HOPS` defaults to 0
**Chosen over**: reading the header's first entry (the original, exploitable
implementation), or hardcoding a hop count.
**Why** [STATED: commits `0c70407`, `d4460e1`, `9607b22`, `90ba884` — a single
saga, four commits, over one day, 2026-09-06 and 2026-09-11]: this is the
project's clearest example of a convention hardened by an actual, verified
incident rather than designed up front. In order:
  1. `0c70407` — `_get_real_ip` took the *first* `X-Forwarded-For` entry.
     Proxies *append*, so the leftmost entry is caller-supplied; rotating the
     header let anyone mint a fresh rate-limit bucket per request, making
     every `@limiter.limit` — including the 5/minute on
     `POST /api/auth/magic-link` — decorative. Fixed to read from the right,
     `TRUSTED_PROXY_HOPS` entries deep, defaulting to 0 ("fails closed").
  2. `d4460e1` — the previous fix's "fails closed" claim was false: `start.sh`
     passed uvicorn `--proxy-headers --forwarded-allow-ips="*"`
     unconditionally, which let uvicorn itself rewrite `scope["client"]` from
     the same attacker-supplied header before `_get_real_ip`'s fallback ever
     ran. Fixed by only passing those flags when `TRUSTED_PROXY_HOPS > 0`.
  3. `9607b22` — deployed to Render with hops guessed at 1 (assuming Render's
     load balancer was the only proxy). Render actually fronts every public
     service with Cloudflare by default, so the real chain is
     client → Cloudflare → Render LB → app: 2 hops, not 1. At hops=1 the app
     was reading Cloudflare's own edge IP, which churns per request, so the
     limiter still did nothing. This commit also fixed a *separate*, unrelated
     bug found at the same time: the boot-time security-posture log lines
     never appeared in Render's logs because uvicorn's logging setup only
     attaches handlers to `uvicorn*` loggers, not root.
  4. `90ba884` — even 2 hops was wrong; a temporary `/debug/xff` endpoint
     (added, used, then removed the same day per commits `e295cd6`/`4754e62`)
     showed the real chain has 3 entries (client, Cloudflare edge, Render's
     own internal 10.x address). `TRUSTED_PROXY_HOPS=3` is what's live at HEAD
     (verified: `render.yaml:56-57`).
**Cost**: this value is deploy-topology-specific and silently wrong in either
direction — too low reads a hop that churns per request (limiter does
nothing); too high re-opens the original spoofing hole. It is not guarded at
boot [STATED: README.md's env table: "`ALLOWED_EMAILS` and
`TRUSTED_PROXY_HOPS` are *not* guarded — a wrong value fails silently"].
Separately, `config.normalize_database_url` rewriting a bare `postgresql://`/
`postgres://` into `postgresql+psycopg://` is the same "deploy-reality"
category of fix, from the same era: managed providers (Neon, Render, Railway,
Supabase) all hand out the bare scheme, which SQLAlchemy reads as psycopg2 —
not installed — killing the app at boot with a `ModuleNotFoundError` naming
nothing relevant [STATED: commit `d0471c4`, "fix(config): accept a provider's
DATABASE_URL verbatim"].

### 4. Sync SQLAlchemy (not async), one shared rate limiter, no ORM-level multi-tenancy enforcement
**Chosen over**: async SQLAlchemy sessions (the more modern default for a new
FastAPI project), and a shared-base-class or row-level-security approach to
tenant isolation.
**Why**: no real reason — confirmed by the repo owner as "just a hasty
decision in the beginning" [STATED: repo owner (Ben), 2026-09-18], not a
considered tradeoff. This matches what the report had inferred from the code
alone (every router handler is plain `def`, not `async def` — confirmed in
`routers/brews.py` per CODEBASE-MAP.md §8) but is now STATED rather than
inferred: there was no deliberate weighing of async's concurrency benefit
against the small scale of this app, it was simply the default reached for
early on. Multi-tenancy instead lives entirely in application code: every
CRUD function takes and filters by `user_id`
[STATED: AGENTS.md Security Rules — "All CRUD functions must accept and
filter by `user_id`"], with one documented, deliberate exception
(`routers/data.py::_id_taken`, which checks global id uniqueness during
import and is explicitly flagged "do not generalise it" — STATED: AGENTS.md).
**Cost**: correctness depends on every new CRUD function remembering the
`user_id` filter; there is no database-level backstop (no RLS, no
tenant-scoped connection). The project's own multi-tenant test suite
(`test_multi_tenant.py`) and the `make_client(user)` fixture pattern exist
specifically to keep this discipline testable [STATED: AGENTS.md
"dependency_overrides is global" note].

### 5. Router schemas qualify `date`/`datetime` types (`import datetime as dt`), and routers never use `from __future__ import annotations`
**Chosen over**: the more idiomatic `from datetime import date` plus a bare
`Optional[date]` annotation — what the schema originally looked like.
**Why** [STATED: commit `60d75b8`, "chore: modernize backend to Python 3.13
and current dependencies", elaborated in `docs/HANDOFF.txt`'s Modernization
Pass]: `BrewUpdate.date` could never be updated in production. Under
`from __future__ import annotations` (lazy/string annotation evaluation), the
Pydantic field named `date` shadowed the imported `datetime.date` type
*before* Pydantic ever resolved the string annotation — `date: Optional[date]
= None` silently resolved to `Optional[None]`, so the field rejected every
real date with "Input should be None." This shipped undetected until the
2026-08-27 dependency-upgrade pass, caught only because `PUT /api/brews/{id}`
was being exercised for something else. Fixed by importing the module
(`import datetime as dt`) and qualifying the annotation (`dt.date`) instead
of importing the bare name, plus a regression test (`test_update_brew_date`).
**Cost**: this is now a whole-codebase convention, not a one-file fix —
AGENTS.md states the rule two different ways for two different failure
modes ("never name a field the same as its type" generally, and "never use
`from __future__ import annotations` in `routers/`" specifically, since the
combination is what makes the shadowing silent instead of a normal
`NameError`). Any new date/datetime field on a schema has to remember this or
risk reintroducing the exact same silent-422 bug.

### 6. Preferences and offline data: server is authoritative once reachable, `NULL` means "never set," localStorage is a cache never a store
**Chosen over**: keeping brewing preferences (temperature unit, grinder list)
client-only in localStorage (the original design), or having the server
backfill/overwrite local values on first sync.
**Why** [STATED: `HANDOFF.txt`, "Preferences moved onto the account" +
commit `bff0ccc`]: preferences lived only in the browser and were lost when
site data was cleared, and didn't follow the user across devices. Moved to
three nullable columns on `User`. `NULL` is kept deliberately distinct from
"set to empty" so the client can keep its own defaults until the user
actively changes something — the first device to sign in seeds the account
rather than a backfill silently overwriting whatever a browser already held.
Client pushes are gated on hydration completing so a stale local value can't
race the account's real value.
**Cost**: this NULL-vs-empty distinction has to be preserved through every
layer that touches these three fields (model, schema, CRUD, frontend context)
or the "first device seeds, doesn't overwrite" guarantee silently breaks.

## The road not taken

- **Google Drive sync** (`sync/google_drive.py`, `GoogleDriveSyncStub`,
  `POST /api/sync/google-drive`) — present in the very first commit
  [STATED: `git log --diff-filter=A` shows the stub files added in `7f56f8e`,
  2025-12-04], described later as a stub that "enqueues but does nothing"
  [STATED: HANDOFF.txt "Known Gaps... Google Drive sync is a stub", 2026-03
  snapshot — describes its state, not its origin], carried
  through every pass unchanged, never had a frontend caller, and was never on
  `docs/FUTURE_FEATURES.md`'s roadmap. Removed in `1e5ba82` (2026-09-18,
  today) as dead code. It was the originally planned data-backup mechanism,
  later replaced/deprioritized in favor of the export/import + PWA
  offline-sync approach that actually shipped, and eventually removed as dead
  code once that replacement made it redundant [STATED: repo owner (Ben),
  2026-09-18]. This matches what the report's own INFERRED guess had been —
  now confirmed rather than speculative.

- **"Push snapshot to API" button** — removed during the
  "Deployment, Security Audit + Account Data" pass. **Why**
  [STATED: HANDOFF.txt]: it sent `beans: []` alongside brews that referenced
  bean ids, so it 400'd for anything not already server-side, and the
  existing Sync flow already did what it was attempting. A redundant,
  actually-broken feature, not a design tradeoff.

- **Export/Import touching only the offline queue** — the original
  Export/Import buttons wrote/read `{localBrews: [...]}` only, so a "backup"
  file contained none of the actual journal (no beans, no server-side brews,
  no preferences). **Why fixed**
  [STATED: HANDOFF.txt "Backup and restore"]: discovered while building real
  backup/restore; export now includes beans, brews, preferences, and queued
  local brews, merged by id so restoring twice updates in place rather than
  duplicating.

- **`tailwind.config.js`** — deleted in the 2026-08-27 modernization pass
  (`7236202`). **Why**: Tailwind v4 is CSS-first; the theme moved into an
  `@theme` block in `frontend/src/styles/index.css`
  [STATED: HANDOFF.txt "Modernization Pass"]. Not a rejected approach so much
  as a forced framework migration, but worth knowing before anyone looks for
  a config file that no longer exists.

- **Absolute `VITE_API_URL` baked at build time** — the pre-single-origin
  deploy shape (see Decision 1). Superseded, not merely deprecated: the
  frontend's default is now a relative `''` and AGENTS.md explicitly warns
  against reintroducing an absolute host "unless it's a genuinely split-origin
  deploy" [STATED: AGENTS.md].

- **Render's own free Postgres** — rejected in favor of Neon's free tier.
  **Why** [STATED: `render.yaml` header comment]: "Render's own free Postgres
  expires, so point `DATABASE_URL` at a Neon free database instead (it does
  not)."

- **The `/debug/xff` endpoint** — added (`e295cd6`), reinstated once more
  data was needed, then removed (`4754e62`) within the same short window once
  it had answered the `TRUSTED_PROXY_HOPS` question (see Decision 3). A
  self-documented temporary diagnostic, not a permanent fossil — worth noting
  because it's a rare example of dead code that *did* get cleaned up promptly,
  unlike the Google Drive stub.

- **Bean elevation tracking — NOT a real "road not taken."** On 2025-12-16,
  three commits landed same-day via PRs #1/#3/#4: `feat: add bean elevation
  tracking` → `Revert "feat: add bean elevation tracking"` →
  `Revert "Revert ..."`. Both revert commit bodies are empty, and
  `elevation_m` is present on `Bean` at HEAD (confirmed in
  `models/bean.py` per CODEBASE-MAP.md §6). Confirmed by the repo owner: "I
  messed up when I did the first revert, made a rash decision instead of
  troubleshooting" [STATED: repo owner (Ben), 2026-09-18]. So this was human
  error under time pressure — a rash revert of a working feature, corrected
  once he'd actually troubleshot it — not GitHub PR-mechanics noise and not a
  design decision that was tried and rejected. Flagged here only so a future
  reader doesn't mistake same-day churn for meaningful design signal about
  the elevation feature itself; there isn't any.

## Constraints in force

- **Single-user-per-account, no admin surface**: passwordless auth, no roles,
  no admin tooling [STATED: HANDOFF.txt "Known Gaps... No admin tooling for
  managing users"]. Any feature implying cross-user visibility (sharing,
  comparison, leaderboards) would need real design work, not a quick add.
- **Free-tier hosting shapes real behavior, not just cost**: Render's free
  web service sleeps after ~15 minutes idle, so first request after a sleep
  takes ~50s — the service worker is relied on to paint the shell immediately
  while the backend wakes [STATED: HANDOFF.txt "Operational notes"]. Neon's
  free Postgres was chosen specifically because it doesn't expire the way
  Render's does [STATED: render.yaml].
- **Resend's test sender (`onboarding@resend.dev`) only delivers to the
  Resend account's own address** [STATED: HANDOFF.txt] — this is currently
  acting as an unintentional *second* gate on registration, alongside
  `ALLOWED_EMAILS`. Verifying a custom domain in Resend removes that
  accidental gate, so `ALLOWED_EMAILS` must be confirmed set *before* domain
  verification, or the app becomes open registration
  [STATED: HANDOFF.txt "Operational notes"].
- **`.gitattributes` forces `eol=lf` on `*.sh` and `Dockerfile`**: a
  Windows checkout without it rewrites `start.sh` with CRLF and the container
  dies at boot with a shell-parsing error naming nothing relevant
  [STATED: AGENTS.md]. This matters concretely for this repo's own
  contributor — the working directory path (`C:\Users\bdrob\...`) confirms
  development happens from Windows [INFERRED: repo path], which is exactly
  the scenario this constraint guards against.
- **Deploy branch pin is doc/config drift, not a live outage**: `render.yaml`
  pins `branch: feat/mobile-pwa` with a comment explicitly saying "change to
  `main` once this is merged, or Render will keep deploying a stale feature
  branch" [STATED: render.yaml]. PR #8 (`feat/mobile-pwa`) merged to `main`
  in `38001e7` on 2026-09-17, and `render.yaml` at HEAD (`1e5ba82`,
  2026-09-18) still says `branch: feat/mobile-pwa` (verified by direct
  read) — but Render's dashboard is actually pointing at `main` now; the
  dashboard was updated separately and the file simply wasn't
  [STATED: repo owner (Ben), 2026-09-18]. So the deploy itself is current;
  the drift is that `render.yaml` no longer describes what's actually
  configured, which will mislead the next person who treats the file as the
  source of truth for the deploy branch.

## Where the design is unsettled

- **`render.yaml`'s branch pin** (above) — confirmed stale as a file, but not
  as a deploy: the dashboard was updated to `main` separately and the file
  wasn't [STATED: repo owner (Ben), 2026-09-18]. This is a small, low-risk
  doc-drift item (fix by updating `render.yaml`'s `branch:` value to match
  the dashboard) rather than an open question — included here mainly because
  it's a live example of the same "file says X, running config says Y"
  pattern documented elsewhere in HANDOFF.txt ("a Web Service created by hand
  does not read [render.yaml] — every var must then be set manually").
- **`legacy@coffee-journal.local` backfill row** (migration `20260325_08`) —
  created on *every* database, including brand-new ones, deliberately using a
  reserved TLD so the row is inert (EmailStr rejects it, no magic link can
  ever be requested for it) [STATED: HANDOFF.txt, both the modernization and
  mobile/PWA passes flag this as a "known gap carried forward"]. Two passes
  in a row explicitly chose not to fix it ("Cleaning it up means a new
  migration; not done here") — this is a permanent, acknowledged wart, not an
  oversight.
- **Import idempotency is one-directional**: re-importing your *own* export
  twice is idempotent (merges by id); re-importing *someone else's* export
  twice still duplicates, because ids get remapped fresh each time
  [STATED: HANDOFF.txt, flagged as a known gap in two separate passes,
  "Would need a natural key to fix"]. Not fixed because the single-user
  framing makes cross-user import a rare/non-primary path.
- **No HSTS header** — flagged as a known gap [STATED: HANDOFF.txt]:
  "onrender.com is HSTS-preloaded so it does not matter today, but it would
  on a custom domain." Deferred, not forgotten — the condition under which it
  becomes urgent (a custom domain) is already written down.
- **Live in-brew stopwatch** — fully designed (start/bloom-done/log-event/
  finish semantics, manual entry must remain available, no persistence-of-
  in-progress-session, no pause/resume) but deliberately not built
  [STATED: docs/FUTURE_FEATURES.md, entire entry]. This is the one item in
  "unsettled" that is unsettled by choice with the design already locked, not
  by neglect — worth distinguishing from the gaps above when triaging.
- **`docs/Options.ods`** — present since `9a150ff` (2025-12-07). Originally
  held the default grinder list [STATED: repo owner (Ben), 2026-09-18] — a
  working spreadsheet, not a mystery file; superseded once grinders became a
  real per-account field (`grinders`/`preferred_grinder` on `User`, see
  Decision 6) but left in place.
- **Gitignored `docs/TO_DO.txt`** — added to `.gitignore` in `85c6bf3`
  ("chore: ignore local todo doc") [STATED: commit 85c6bf3]. It's an earlier,
  unfinished personal plan the repo owner was working through over time, not
  a mysterious untracked file [STATED: repo owner (Ben), 2026-09-18] —
  content still outside this report's reach since it's untracked, but its
  nature is no longer unknown.

## Who knows what

- **Ben Robertson** (`bdrobertson.br@gmail.com`, git user for this session)
  — 44 of 62 commits; the sole named copyright holder in `LICENSE`
  [STATED: LICENSE "Copyright (c) 2026 Ben Robertson"]; the person the
  "resume/LinkedIn" framing in `aaf3db4` is presumably about
  [INFERRED: authorship + LICENSE attribution + repo path under
  `bdrob`]. Primary source for essentially all product and security
  decisions in this report — most are already fully STATED in his own commit
  messages and `HANDOFF.txt`.
- **"Codex Agent" (`agent@example.com`)** — 15 commits, concentrated in the
  earliest period (2025-12-04 through 2026-03-30): initial commit, early
  feature work (brew logging enrichment, grinder preferences), the repo
  root restructure, passwordless auth + multi-tenancy + security hardening
  (`f55252f`), and small fixes. An autonomous/semi-autonomous coding agent
  distinct from the Claude Code sessions that dominate later commits
  [INFERRED: author email pattern `agent@example.com`, generic non-personal
  address]. Not a human to ask — but its commits are where the *original*
  shape of auth/multi-tenancy came from, later hardened by the Claude-Opus/
  Sonnet-assisted security passes.
- **Jonathan Mohrbacher** — 3 commits, all on 2025-12-16: the bean-elevation
  feature, a Postgres port remap, and an `.env.example` addition, then no
  further commits found. A close friend and mentor of Ben's, and also a
  coffee lover — which is why he has these 3 commits on this specific project
  [STATED: repo owner (Ben), 2026-09-18]. Not an ongoing contributor; the
  right person to ask only about the original elevation-tracking feature
  itself, not about anything built since.

## Open questions

All six open questions from the first version of this report were answered
directly by the repo owner (Ben) on 2026-09-18 and have been folded into the
relevant sections above as STATED. Recorded here for traceability:

1. ~~Is the Render deploy serving `main` or the stale `feat/mobile-pwa`
   pin?~~ Resolved: dashboard points at `main`; `render.yaml` itself is stale
   doc/config drift, not a live outage. See "Constraints in force" and
   "Where the design is unsettled."
2. ~~Why did bean elevation get added, reverted, and re-added same-day?~~
   Resolved: a rash revert under time pressure, corrected once
   troubleshot — human error, not a design decision or workflow test. See
   "The road not taken."
3. ~~Why did the Google Drive sync stub exist from the first commit?~~
   Resolved: it was the originally planned backup mechanism, later replaced
   by export/import + PWA offline sync and removed as dead code once
   redundant. See "The road not taken."
4. ~~Who is Jonathan Mohrbacher?~~ Resolved: a close friend and mentor of
   Ben's, and a coffee lover — hence the 3 commits on this project. See "Who
   knows what."
5. ~~What's the reasoning for sync (not async) SQLAlchemy?~~ Resolved: none —
   confirmed as a hasty early decision, not a considered tradeoff. See
   Load-bearing decision 4.
6. ~~What's in `docs/Options.ods` and gitignored `docs/TO_DO.txt`?~~
   Resolved: `Options.ods` originally held the default grinder list;
   `TO_DO.txt` is an old, unfinished personal planning doc. See "Where the
   design is unsettled."

No new open questions surfaced during this pass. Future sessions should
still treat this section as live — re-derive from `docs/CODEBASE-WHY.md`'s
own UNKNOWN tags (there are none remaining as of this update) rather than
assuming permanence.
