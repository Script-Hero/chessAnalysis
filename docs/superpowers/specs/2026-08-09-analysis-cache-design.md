# Cache engine analysis + PGN across page reloads

## Problem

The app is client-only: a PGN is dropped in, parsed, and immediately run through
Stockfish in a web worker (`analyzeGame` in `frontend/src/lib/stockfish.ts`).
None of this survives a page reload — the user lands back on the empty dropzone
and has to re-drop the file and wait for the engine to redo the same work.

## Scope

- Cache the most recently *completed* analysis: the raw PGN text, the file name,
  and the resulting `evals`/`judgments`.
- On reload, restore that game and its analysis without re-running the engine.
- Restore lands on move 0 / white orientation / the Analysis tab — board position,
  orientation, active dashboard tab, and any live-engine session are **not**
  persisted.
- Only one game is kept. Loading and fully analyzing a new PGN overwrites the
  cached entry. There is no history/LRU of multiple games.
- If a reload happens while analysis is still in progress, that in-progress run
  is simply restarted from scratch on the next load (nothing partial is ever
  cached). Whatever was previously cached — from an earlier, already-completed
  game — is what comes back, if anything.

## Storage

`localStorage`, single key `chess-analysis:last-game:v1`:

```json
{
  "fileName": "string",
  "pgn": "string (raw file contents)",
  "evals": "PositionEval[]",
  "judgments": "(MoveJudgment | null)[]"
}
```

The `:v1` suffix lets a future format change be introduced by bumping the key
rather than migrating old data.

## New module: `frontend/src/lib/cache.ts`

- `saveAnalysisCache(entry: CachedAnalysis): void` — `JSON.stringify` and write.
  Swallows/logs write errors (e.g. quota exceeded) rather than throwing, since
  caching is a nice-to-have, not core functionality.
- `loadAnalysisCache(): CachedAnalysis | null` — reads and `JSON.parse`s the key,
  wrapped in try/catch. Does a minimal shape check (pgn is a string, evals and
  judgments are arrays). Returns `null` and clears the stored key on anything
  missing, malformed, or a parse failure.
- `clearAnalysisCache(): void`.

## Wiring in `frontend/src/pages/AnalysisLayout.tsx`

- Add `pgnText` state, set alongside `game` inside `acceptFile` (the raw file
  text) — needed so a completed analysis has the original PGN to persist and so
  a restored session can be re-parsed with the existing `parsePgn`.
- A ref, e.g. `skipNextAnalysisRef`, guards the existing "auto-analyze whenever
  `game` changes" effect.
- On mount, a one-time effect calls `loadAnalysisCache()`. If it returns an
  entry:
  - `parsePgn(cached.pgn)` (any parse failure clears the cache and falls
    through to the normal empty-dropzone state)
  - sets `pgnText`, `fileName`, `game`, `ply` (to `moves.length`), `evals`,
    `judgments`
  - sets `skipNextAnalysisRef.current = true` so the analysis effect's next run
    (triggered by `game` changing) skips re-running the engine.
- A new effect watches `game`, `pgnText`, `evals`, `judgments`, `fileName`; once
  all are non-null it calls `saveAnalysisCache`. This fires both after a normal
  freshly-completed analysis and (harmlessly, as a no-op rewrite) right after a
  cache restore.
- `reset()` additionally calls `clearAnalysisCache()` and clears `pgnText`.

## Out of scope / explicitly not done

- Persisting ply, orientation, active tab, or live-engine state.
- Caching more than one game (no LRU/history).
- Resuming a partially-completed engine run.
- Any backend/server-side storage — this app has none.
