# Dashboard redesign: Overview / Explore

## Problem

A UX audit (Playwright walkthrough of all 4 dashboard tabs across 5 real
PGNs — see conversation history, no separate audit doc) found that the
current 4-tab structure (Analysis / Report / Tree / Graph) mixes whole-game
and per-move content inconsistently, without a clear pattern to either kind
of tab:

- **Analysis tab** is nearly empty — the live-engine panel and eval chart
  occupy roughly the top 30% of the pane; the rest is dead space at any
  window size.
- **Report tab** is whole-game (accuracy, phase breakdown, material,
  clock pressure, critical moments) and is the best-organized tab today —
  it already colors White gold / Black blue consistently via
  `--white-accent`/`--black-accent`.
- **Tree tab** is per-move (game tree + current position's candidate
  lines) but has no white/black color coding, and its "This position's
  lines" widget duplicates something in Graph.
- **Graph tab** internally mixes both levels: an aggregate stat row,
  statistical "signals" cards, and a whole-game timeline (all whole-game),
  alongside a "Move detail" stat card and "Candidate tree at this decision
  point" (both per-move) — the latter nearly identical to Tree's "This
  position's lines" widget. It also uses statistics-course language
  ("decision entropy," "off-graph rate," "candidate-list standing") that
  doesn't match the rest of the app's plain-chess-terms tone, and its
  color legend (6 move-quality buckets) has no mover distinction either.

None of this requires new engine computation or new data — `evals`,
`judgments`, `lines`, and the `computePlyMetrics` output already contain
everything both existing "whole game" and "per move" views use. This is a
presentation-layer reorganization.

## Change

Replace the 4 dashboard tabs with 2: **Overview** (whole-game) and
**Explore** (per-move), consolidating duplicated content and adding a
mover (white/black) color channel to the visualizations that currently
lack one.

`DashboardTab` (in `context/AnalysisContext.ts`) narrows from
`'analysis' | 'report' | 'tree' | 'graph'` to `'overview' | 'explore'`.
`Overview` becomes the default tab a freshly-loaded game lands on
(replacing today's `'analysis'` default). `pages/ReportView.tsx`,
`pages/AnalysisTab.tsx`, `pages/TreeTab.tsx`, and `pages/GraphTab.tsx` are
deleted, replaced by `pages/OverviewTab.tsx` and `pages/ExploreTab.tsx`.

The board pane, routing, PGN parsing, and the analysis/engine pipeline
(`lib/stockfish.ts`, `lib/analysis.ts`, `lib/graphMetrics.ts`,
`lib/tree.ts`) are unchanged.

### Overview tab

Tells the whole-game story top to bottom, in this order:

1. `PlayerSummary` (accuracy %, move-quality breakdown) — unchanged.
2. `PhaseAccuracy` + `MaterialChart` side by side — unchanged.
3. `TimePressureChart`, when clock data exists — unchanged.
4. **New:** the aggregate stat row from the old Graph tab's "Overview"
   section (`should've been found` / `genuinely hard misses` /
   `silent drift, untagged` / `precise, needle found`), placed directly
   under `PlayerSummary` as a second summary strip — same "how did each
   player do" framing, from the engine-signal side rather than the
   move-classification side.
5. **New:** the entropy/loss scatter plot (`GraphScatter`), with:
   - axis labels and card copy simplified to plain chess language (exact
     wording finalized during implementation; the underlying metrics and
     chart data do not change)
   - a resolved color legend — see "Mover color coding" below
6. **New:** the "Signals" cards (`GraphInsights`), copy rewritten to plain
   language, positioned as supporting detail below the scatter.
7. `CriticalMoments` gallery — unchanged, stays last since it's the
   "go look at these specific moves" bridge into `Explore`.
8. The game timeline becomes a **mirrored bar chart** (see below) and is
   folded into the scatter/signals area rather than repeating as its own
   separate section further down the page.

Clicking a critical-moment card or a scatter point still jumps the shared
`ply` cursor and switches to `Explore` — same `jumpToBoard`/`goTo` +
`setActiveTab('explore')` pattern already used by `ReportView`/`GraphTab`
today, just retargeted.

### Explore tab

A pinned `EvalChart` sits at the top, always visible regardless of which
sub-tab is active below it — it's a navigation scrubber tied to whichever
position is selected, not a lens in its own right, so it doesn't belong to
any one sub-tab.

Below it, three sub-tabs (local `useState` in `ExploreTab`, defaulting to
`Live`; this state is NOT part of `AnalysisContext` — nothing outside
`Explore` needs it):

- **Live** — `LiveEnginePanel`, relocated unchanged.
- **Tree** — `GameTree` plus its existing collapse-stem / show-branches
  filter controls, relocated unchanged. Every node in the tree still
  represents one move's alternatives, not a whole-game aggregate, so it
  belongs here despite spanning the whole game visually.
- **Lines** — new `components/explore/CandidateLines.tsx`, replacing both
  `components/tree/PositionTree.tsx` ("This position's lines") and
  `components/graph/GraphMoveDetail.tsx` ("Move detail" + "Candidate tree
  at this decision point"), which are deleted. One canonical rendering:
  the per-move stat row (entropy, top gap, played rank, loss vs.
  best/field, classification — currently in `GraphMoveDetail`) on top, the
  candidate-line tree (`PositionTree`'s rendering, which was the cleaner
  of the two duplicate widgets) below it.

### Mover color coding

Two existing CSS variables, `--white-accent` and `--black-accent`
(already used by `PlayerSummary`/`MaterialChart`), get reused as a
**second color channel** layered on top of the existing move-quality
colors, rather than replacing them:

- **Tree** (`GameTree` nodes and branch dots) and **Lines**
  (`CandidateLines`' tree): fill stays the existing move-quality color
  (`CLASS_TONE` mapping); stroke/border becomes `--white-accent` or
  `--black-accent` depending on `row.mover` / the node's side to move.
- **Overview's scatter** (`GraphScatter`): same treatment — fill is the
  existing `BUCKET_INFO` bucket color, stroke is the mover color.
- **Overview's game timeline**: instead of one row of quality-colored
  bars, becomes a mirrored bar chart — white's moves rise as bars above a
  center baseline, black's moves extend below it, still colored by
  quality bucket. This is additive to the existing bucket-color legend
  (no new color meanings to learn) and makes "which side is struggling"
  visible without relying on the border-color trick, since a full-game bar
  strip is dense enough that a 1.5px stroke may not read well at a glance.

This is additive: nothing about the existing quality-bucket or
classification-tone palettes changes, and the white-gold/black-blue
convention is one the user has already seen mean "white/black" on
`PlayerSummary`/`MaterialChart`, so it stays legible when it shows up on
Tree/Lines/Overview's scatter too.

### File/component moves

| Today | Becomes |
|---|---|
| `pages/ReportView.tsx` | deleted → `pages/OverviewTab.tsx` |
| `pages/AnalysisTab.tsx` | deleted → content split into `pages/ExploreTab.tsx` (eval chart) + `Live` sub-tab |
| `pages/TreeTab.tsx` | deleted → `pages/ExploreTab.tsx` (`Tree`, `Lines` sub-tabs) |
| `pages/GraphTab.tsx` | deleted → split into `OverviewTab.tsx` (stat row, scatter, signals, timeline) and `ExploreTab.tsx`'s `Lines` sub-tab (move detail + candidate tree) |
| `components/report/*` | moves to `components/overview/*`, unchanged internally |
| `components/graph/GraphScatter.tsx`, `GraphInsights.tsx` | moves to `components/overview/*`; copy simplified, mover stroke added |
| `components/graph/GraphTimeline.tsx` | moves to `components/overview/*`, becomes mirrored bar chart |
| `components/tree/PositionTree.tsx` + `components/graph/GraphMoveDetail.tsx` | deleted → merged into new `components/explore/CandidateLines.tsx` |
| `components/tree/GameTree.tsx`, `TreeNodePreview.tsx` | move to `components/explore/*`, mover stroke added to `GameTree`, otherwise unchanged |
| `components/LiveEnginePanel.tsx`, `components/EvalChart.tsx` | move to `components/explore/*`, unchanged internally |
| `context/AnalysisContext.ts` | `DashboardTab` narrows to `'overview' \| 'explore'` |
| `lib/boardTheme.ts`, `lib/graphMetrics.ts`, `lib/tree.ts`, `lib/analysis.ts`, `lib/stockfish.ts` | unchanged |

## Non-goals

- Visual/theme overhaul (color palette, typography, board pane styling)
  — out of scope. The parchment/brass theme and the board pane are
  untouched.
- The live-engine worker crash bug found during the audit (uncaught
  `unreachable` exception, blank move columns after rapid navigation
  while Live Engine is on) — tracked as a separate follow-up, not fixed
  here.
- Any change to the analysis/engine pipeline, routing, or PGN parsing.
- Enumerating final copy for every Signals card — direction (plain
  language, same underlying metrics) is specified; exact wording is an
  implementation detail.

## Testing

This is a presentation-layer reorganization with no new business logic,
so the primary verification is manual: re-run the same Playwright
walkthrough used for the audit — drop each of the 5 sample PGNs, click
through Overview and all three Explore sub-tabs, confirm:

- no dead space remains on any tab at 1600px, 900px, and 375px widths
  (the three viewport sizes used in the audit)
- white/black stroke coloring renders on Tree, Lines, and Overview's
  scatter
- the mirrored timeline renders correctly for both short (~25 ply) and
  long (~96 ply) games
- no duplicate candidate-line widget remains anywhere
- clicking a critical-moment card, a scatter point, or a timeline bar
  correctly jumps `ply` and switches to `Explore`

Existing component tests (if any) for `GameTree`, `PositionTree`,
`GraphScatter`, etc. get updated for their new file locations/props as
part of the move, not rewritten from scratch.
