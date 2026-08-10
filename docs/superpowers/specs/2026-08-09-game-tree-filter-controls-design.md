# Game tree filter controls: collapse the stem, tune branch visibility

## Problem

The game tree currently renders every played move as a trunk node, with a
branch shown only at plies classified `inaccuracy` or worse (a fixed rule
in `buildGameTreeRows`, `frontend/src/lib/tree.ts`). For a long, mostly-clean
game this makes the trunk unnecessarily long to scroll through, and there's
no way to see engine alternatives at plies that weren't flagged, or to
suppress branches you don't want to see. The eventual goal (not built here)
is to run graph analysis over move sequences, for which multiple
differently-filtered views of the same tree are useful groundwork.

## Change

Add two independent, user-controlled thresholds to the game tree, exposed
as two `<select>` dropdowns in a small filter bar above the "Game Tree"
heading in `TreeTab`. Both reuse the existing `MoveClassification` type
(`best | excellent | good | inaccuracy | mistake | blunder`) rather than
introducing a new taxonomy.

### 1. Branch visibility threshold

Replaces the hardcoded `BRANCHABLE` set in `buildGameTreeRows`. Options,
ordered worst-to-best, with the classification acting as an inclusive
"at or worse than" cutoff:

- `None` — no branches ever.
- `Blunder only`
- `Mistake or worse` (mistake, blunder)
- `Inaccuracy or worse` (**default** — matches today's behavior exactly:
  inaccuracy, mistake, blunder)
- `Good or worse` (good, inaccuracy, mistake, blunder)
- `All moves` (every classification, including best/excellent)

`buildGameTreeRows` gains a `branchThreshold: MoveClassification | 'none'`
parameter. A row's `branch` is populated when the row's classification's
rank is `<=` the threshold's rank on a fixed worst-to-best ranking
(`blunder=0, mistake=1, inaccuracy=2, good=3, excellent=4, best=5`), or
never when `branchThreshold === 'none'`. `DEFAULT_BRANCH_THRESHOLD =
'inaccuracy'` is exported so the default reproduces current behavior
exactly.

### 2. Trunk collapse threshold

New behavior, purely additive. Options:

- `Off` (**default** — matches today's behavior: nothing collapses).
- `Best only` — collapses runs of consecutive `best` moves.
- `Excellent or better` — collapses runs of consecutive `best`/`excellent`.
- `Good or better` — collapses runs of consecutive `best`/`excellent`/`good`.

A new pure function in `lib/tree.ts`, `groupGameTreeRows(rows, threshold)`,
walks `GameTreeRow[]` and groups maximal consecutive runs whose
classification rank is `>=` the threshold's rank into a `CollapsedRun`:

```ts
export type CollapsedRun = {
  kind: 'collapsed'
  startPly: number
  endPly: number
  rows: GameTreeRow[]
}
export type GameTreeDisplayItem = { kind: 'row'; row: GameTreeRow } | CollapsedRun
```

A run of length 1 does not collapse (nothing to summarize) — only runs of
2 or more consecutive qualifying moves become a `CollapsedRun`. Rows with
`classification === null` (there are none in practice, since
`buildGameTreeRows` only omits a judgment for the final position, which
isn't a row) never qualify.

`GameTree` calls `groupGameTreeRows` internally (via `useMemo`, keyed on
`[rows, collapseThreshold]`), the same way `PositionTree` already calls
`buildPositionTree` internally rather than receiving pre-built data as a
prop — `GameTree`'s public interface stays `rows: GameTreeRow[]`, gaining
only `collapseThreshold: MoveClassification | 'off'`.

### Rendering a collapsed run

A `CollapsedRun` renders as a single compact marker node on the trunk rail
(distinct visual treatment from a normal move node — e.g. a smaller/dimmer
dot with a label like "12 solid moves"), occupying one row's worth of
vertical space regardless of how many moves it summarizes. Clicking it
expands that run back into its individual `GameTreeRow` entries, each
rendered normally (including branches, if the branch-visibility threshold
would show one — collapsed runs by construction only ever contain rows
above the branch-worthy range at the *default* branch threshold, but if the
user has loosened the branch threshold to `Good or worse` or `All moves`,
expanded rows from a collapsed "good" run can still show branches).

Expand state is a `Set<string>` of expanded run keys (keyed by
`startPly`), local `useState` inside `GameTree`. It resets (clears) whenever
`collapseThreshold` changes, since a threshold change invalidates the
previous grouping and there's no meaningful way to carry "this run is
expanded" forward across a regrouping.

### Interaction with the current-ply indicator

If the currently-selected ply falls inside a collapsed run, the run marker
itself shows the "current" visual treatment (rather than leaving no visible
indicator anywhere on the trunk). Navigating to a ply inside a collapsed
run does not auto-expand it — the user can already see where they are via
the marker, and forcing an expand on every navigation would fight the
threshold setting they chose.

## Data flow

`branchThreshold` is `useState` in `TreeTab` (it must live there since it
feeds the `buildGameTreeRows` call already in `TreeTab`'s `useMemo`).
`collapseThreshold` is also `useState` in `TreeTab`, passed down as a prop
to `GameTree` — kept alongside `branchThreshold` so both controls live in
one filter bar, even though only `collapseThreshold` is consumed inside
`GameTree` rather than by `TreeTab` itself. Neither is persisted (no
localStorage, no `AnalysisContext` changes) — resets to defaults on reload,
consistent with the rest of the tree tab having no persisted UI state.

## Out of scope

- Any change to the position tree (drill-down view) — these controls apply
  only to the game tree.
- Persisting filter selections across reloads.
- Collapsing/filtering by side (white-only / black-only), game phase, or
  any dimension other than move classification.
- The eventual graph-analysis work this is groundwork for — not built here.
- Editing `groupGameTreeRows`'s grouping to span across a currently-open
  `CollapsedRun` boundary in more sophisticated ways (e.g. partial
  expand) — a run is all-or-nothing: fully collapsed or fully expanded.
