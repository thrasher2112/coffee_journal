# Future Features

Ideas that came up during real work but were deliberately deferred rather
than built on the spot. Each entry should carry enough context that picking
it up later doesn't require re-deriving the design from scratch.

## Live in-brew stopwatch

**Origin**: while fixing bloom/total-brew-time and agitation-event entry to
use minutes:seconds instead of bare seconds (2026-09), the user asked
whether a stopwatch built into the app would be a more human way to capture
these times than typing them in after the fact - it would let each
agitation event's timestamp be captured live, at the moment it happens,
instead of recalled and typed in afterward. Agreed this is a real feature
in its own right, not a small addition to the mm:ss fix, so it's parked
here with the design decisions already made during that conversation.

**What it would do**: a timer widget inside `QuickLogBar`'s advanced
section (so it's available from both the Home "Quick Brew" widget and the
`/brew` Advanced Brew Form, matching how bloom/total-time/agitation fields
already only show in advanced mode). While a brew is in progress:

- **Start** begins the clock at t=0, matching the moment the bloom pour
  happens.
- **Bloom done** is a *dedicated* button, separate from logging an
  agitation event - confirmed with the user, who does a gentle swirl
  during bloom itself (before bloom is considered "done"), so the first
  agitation event is not a reliable stand-in for bloom's end. Tapping it
  sets `bloom_time_s` to the elapsed time and does not add a row to
  `agitation_events`.
- **Log event** (one button, or a couple of presets like "Pour"/"Stir")
  appends a new agitation-event row with `timestamp_s` frozen at the
  current elapsed time; the action text and the poured amount are filled
  in right after (same "total poured so far" flow as manual entry - see
  below, and already shipped independently of this stopwatch feature).
- **Finish** stops the clock and sets `total_brew_time_s` to the elapsed
  time.

**Manual entry stays**: confirmed with the user that manual mm:ss entry
must remain available alongside the timer, for logging a brew after the
fact, or fixing a fumbled tap. Concretely: the timer only *pre-fills*
`bloom_time_s`, `total_brew_time_s`, and each event's `timestamp_s` - all
three stay directly editable afterward through the same min/sec inputs
used when no timer is running at all. No mode switch, no "confirm to
lock" step; the timer is a fast way to fill in fields that were always
editable.

**Deliberately out of scope for a first cut** (revisit only if it turns
out to matter in practice):
- Persisting an in-progress session (e.g. to `localStorage`) so a reload
  or accidental navigation away doesn't lose it. Simpler to ship without
  this and add it later if losing an in-progress timer turns out to be a
  real problem, rather than building resume/expiry logic against a
  hypothetical.
- Pause/resume - brewing doesn't really pause, so Start / Bloom done /
  Log event / Finish covers the real flow without it.

**Implementation note**: this only touches the frontend. The stored data
shape doesn't change at all - `bloom_time_s`, `total_brew_time_s`, and
`AgitationEvent.timestamp_s` are unchanged integer-seconds fields; the
timer just becomes another way of arriving at a value for them, same as
typing into the min/sec inputs `MinSecInput` provides. Suggested shape:
a small `useStopwatch`-style hook or a `BrewTimer` component (own file,
matching the project's existing pattern of small focused components like
`BeanPicker`, `FlavorWheel`, `AgitationTimeline`) that computes elapsed
time from `Date.now() - startedAt` on each tick rather than counting
interval firings, so a throttled/backgrounded tab doesn't drift.
