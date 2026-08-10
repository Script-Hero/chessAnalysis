# Tree tab: visualize stored engine lines as a branching tree

## Problem

Each position already has up to 3 stored candidate lines (`lines: EngineLine[][]`
from `analyzeGame`, `multiPv = 3`), each carrying a multi-ply principal
variation. Today this is only visible one ply at a time, as flat text, in
`LiveEnginePanel`. There's no way to see how the game's actual path compares
to the engine's alternatives across multiple moves, or to see a position's
candidate lines as anything other than a flat list. No new engine computation
is available or needed — this is purely a new way to look at data already in
`lines`/`judgments`/`evals`.

## Change

Add a third dashboard tab, "Tree", next to "Analysis" and "Report"
(`DashboardTab` gains `'tree'`; `AnalysisLayout.tsx` renders a new
`TreeTab` component). It contains two visualizations, stacked or toggled
within the tab (implementation detail for the plan):

### 1. Game tree (whole-game overview)

A vertical "git-graph" style diagram:

- A single main rail runs top-to-bottom. One node per played ply, in game
  order, labeled with move number/SAN (reusing existing move-number
  formatting conventions from the move list / `EvalChart`).
- Node color follows the existing move-classification palette
  (`MoveClassification` → color, matching whatever `EvalChart`/move badges
  already use for best/excellent/good/inaccuracy/mistake/blunder).
- **A branch is drawn only at plies whose `MoveJudgment.classification` is
  `inaccuracy` or worse.** This is the filter that keeps the tree readable
  regardless of game length: positions where the played move was already
  best/excellent/good stay as plain trunk nodes with no branch. At a
  qualifying ply, one branch curves off the trunk showing the engine's best
  line from that point (`lines[i][0].pv`, i.e. what should have been played
  instead), rendered a few plies deep (existing `sanLineFromUci` truncation
  convention, e.g. `maxPlies = 4-5`) and colored distinctly (e.g. green) to
  read as "best, not played."
- The currently-selected ply (`ply` from `AnalysisContext`) is visually
  marked (e.g. distinct fill/pulse) on the trunk.
- Row pitch is fixed regardless of whether a row has a branch, so the trunk
  reads as an even, predictable rail.

### 2. Position tree (drill-down for the current ply)

- Shows the current ply's own up to-3 stored lines (`lines[ply]`) as a small
  branching tree rooted at the current position: where two or more lines
  share a common opening prefix, that prefix renders once and only the point
  of divergence fans out into separate branches. Same node/branch visual
  language and color coding as the game tree (rank-1 line colored as
  "played/top choice", ranks 2-3 as alternates).
- Recomputes whenever `ply` changes; bounded in size (≤3 lines, each
  truncated to the same `maxPlies` as above), so no filtering is needed here.

### Shared interaction

- **Hover** any non-trunk node (in either visualization) → a small popover
  showing a mini `react-chessboard` rendering of the position reached by
  that node (computed client-side via `chess.js` from the stored UCI PV,
  same pattern `sanLineFromUci` already uses — no engine calls).
- **Click** any node (trunk or branch, either visualization) → calls the
  existing `goTo(ply)` from `AnalysisContext` to move the shared board pane
  there. For a branch node (a hypothetical position not part of the actual
  game), clicking moves the board to the nearest real ply on the trunk that
  the branch sprouts from (the tree does not add new navigable "game
  positions" — the shared board only ever shows real game plies). The mini
  preview on hover is how the user sees the hypothetical line itself.

## Data flow

No new state beyond what `AnalysisContext` already exposes
(`game`, `ply`, `goTo`, `judgments`, `lines`, `evals`). Both visualizations
are pure derivations of existing context values, computed with
`useMemo`/plain functions — no new caching, no new engine calls, nothing
persisted beyond what `cache.ts` already stores.

## Out of scope

- Any new engine computation (deeper search, more lines, live search
  integration with the tree).
- Editable/explorable "what if" trees beyond the stored PVs (e.g. letting the
  user make a move off a branch and analyze further).
- Persisting tree UI state (expand/collapse, selection) across reloads.
- Merging/deduplicating branches *across* positions in the game tree (e.g.
  noticing two different plies' alternate lines transpose to the same
  position) — each branch is local to the ply it sprouts from.
