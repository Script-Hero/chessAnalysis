# Store and display all 3 batch-analysis engine lines

## Problem

`analyzeGame` already searches each position with `multiPv = 3`, producing 3
candidate lines per position, but only the single best move's SAN
(`bestMoveSan`) is kept in `MoveJudgment`. The other two lines are discarded.
Separately, the "Live Engine" panel only ever shows anything when its toggle
is on, which triggers a fresh live search — so seeing engine lines at all
requires waiting on a live depth-20 search, even though 3 lines already exist
from the initial batch analysis.

## Change

1. **Keep all 3 lines from the batch analysis.** `analyzeGame`'s internal
   `perPosition: EngineLine[][]` (already built, currently discarded after
   computing `judgments`) becomes part of its return value: `GameAnalysis`
   gains `lines: EngineLine[][]`, one entry per position, indexed the same as
   `evals`/`game.positions`.

2. **Thread `lines` alongside `evals`/`judgments`** through the same existing
   path: new state in `AnalysisLayout.tsx`, a new field on
   `AnalysisContextValue`, and a new field on `CachedAnalysis` in `cache.ts`
   (saved/restored exactly like `evals`/`judgments` already are, no new cache
   logic needed).

3. **`LiveEnginePanel` always shows lines by default.** It shows the 3 stored
   lines for the current ply (`lines[ply]`) as soon as they exist — no toggle
   required, no spinner. Toggling "Live Engine" on switches the panel to a
   live depth-20 search of the current position (existing behavior,
   unchanged); toggling off reverts to the stored lines. A depth label
   distinguishes the two states, e.g. "depth 12 · analyzed" vs "depth 20 ·
   live".

4. **Not-yet-analyzed ply.** If the user is on a ply the batch analysis
   hasn't reached yet (mid-run) and Live Engine is off, the panel shows a
   lightweight "not yet analyzed" placeholder instead of stored lines.

## Out of scope

- Changing the batch analysis depth or multiPv count.
- Any change to `MoveJudgment`/`bestMoveSan` — that stays as-is; `lines` is
  additive.
- Persisting a live search's results — live search stays ephemeral, exactly
  as today.
