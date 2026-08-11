# Dashboard Redesign (Overview / Explore) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 4-tab dashboard (Analysis / Report / Tree / Graph) with 2 tabs — `Overview` (whole-game) and `Explore` (per-move, with Live/Tree/Lines sub-tabs) — per the approved design spec.

**Architecture:** Presentation-layer reorganization only. `DashboardTab` narrows to `'overview' | 'explore'`. Components move into two new directories (`components/overview/`, `components/explore/`) by which tab they now belong to. Two duplicate "candidate line tree" widgets merge into one. Mover (white/black) coloring is added as a stroke/border channel layered on existing move-quality fill colors, reusing the `--white-accent`/`--black-accent` CSS variables already defined in `index.css` and already used by the Report components. The engine/analysis data pipeline is untouched.

**Tech Stack:** React 19, TypeScript, Vite, react-chessboard, chess.js. No test runner is configured (`package.json` has no `test` script) — verification is `pnpm run build` (tsc -b + vite build) and `pnpm run lint` after each task, plus a full manual Playwright walkthrough as the final task.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-dashboard-redesign-design.md` — every requirement in it must map to a task below.
- Non-goals (do not touch): board pane styling/structure, the live-engine worker crash bug, the analysis/engine pipeline (`lib/stockfish.ts`, `lib/analysis.ts`'s existing exports, `lib/graphMetrics.ts`, `lib/tree.ts`), routing, PGN parsing.
- Mover colors: use `var(--white-accent)` / `var(--black-accent)` (already defined in `frontend/src/index.css`) — do not invent new color tokens.
- Move-quality colors (`CLASS_TONE`, `BUCKET_INFO`) are unchanged; mover coloring is an additive stroke/border, never a fill replacement.
- Package manager is `pnpm` (see `frontend/pnpm-lock.yaml`). Run all commands from `frontend/`.
- Follow existing code conventions: BEM-ish CSS class naming (`component__part--modifier`), one `.tsx` + one co-located `.css` per component, `useAnalysis()` from `context/AnalysisContext` for shared state.

---

## File Structure

New/moved files, grouped by destination:

**`frontend/src/lib/analysis.ts`** (modified, not moved) — gains two small exports used by mover coloring in Task 2.

**`frontend/src/components/explore/`** (new directory) — per-move components:
- `EvalChart.tsx` + `.css` (moved from `components/`, unchanged)
- `LiveEnginePanel.tsx` + `.css` (moved from `components/`, unchanged)
- `GameTree.tsx` + `.css` (moved from `components/tree/`, gains mover stroke)
- `TreeNodePreview.tsx` + `.css` (moved from `components/tree/`, unchanged)
- `PositionTree.tsx` + `.css` (moved from `components/tree/`, gains mover stroke)
- `CandidateLines.tsx` + `.css` (new — merges `PositionTree` + the deleted `GraphMoveDetail`'s stat card)

**`frontend/src/components/overview/`** (new directory) — whole-game components:
- `PlayerSummary.tsx` + `.css` (moved from `components/report/`, unchanged)
- `PhaseAccuracy.tsx` + `.css` (moved from `components/report/`, unchanged)
- `MaterialChart.tsx` + `.css` (moved from `components/report/`, unchanged)
- `TimePressureChart.tsx` + `.css` (moved from `components/report/`, unchanged)
- `CriticalMoments.tsx` + `.css` (moved from `components/report/`, unchanged)
- `GraphScatter.tsx` + `.css` (moved from `components/graph/`, gains mover stroke, copy simplified)
- `GraphTimeline.tsx` + `.css` (moved from `components/graph/`, becomes mirrored bar chart)
- `GraphInsights.tsx` + `.css` (moved from `components/graph/`, copy simplified)

**`frontend/src/pages/`**:
- `OverviewTab.tsx` + `.css` (new, replaces `ReportView.tsx`/`.css` and the whole-game parts of `GraphTab.tsx`/`.css`)
- `ExploreTab.tsx` + `.css` (new, replaces `AnalysisTab.tsx`/`.css` and `TreeTab.tsx`/`.css` and the per-move parts of `GraphTab.tsx`/`.css`)
- `AnalysisLayout.tsx` (modified — 2 tabs instead of 4)

**Deleted at the end (Task 13):** `pages/ReportView.tsx`, `pages/ReportView.css`, `pages/AnalysisTab.tsx`, `pages/AnalysisTab.css`, `pages/TreeTab.tsx`, `pages/TreeTab.css`, `pages/GraphTab.tsx`, `pages/GraphTab.css`, `components/report/` (whole dir), `components/graph/` (whole dir), `components/tree/` (whole dir), `components/LiveEnginePanel.tsx`/`.css`, `components/EvalChart.tsx`/`.css`.

**Unchanged:** `context/AnalysisContext.ts` (only the `DashboardTab` type narrows — Task 8), `lib/boardTheme.ts`, `lib/stockfish.ts`, `lib/graphMetrics.ts`, `lib/tree.ts` (except the read in Task 1), `components/MoveBadge.tsx`, `pages/BoardPane.tsx`, `App.tsx`.

---

### Task 1: Create the feature branch

**Files:** none.

- [ ] **Step 1: Create and switch to the branch**

```bash
cd /home/neil/Programming/ChessAnalysis
git checkout -b dashboard-overview-explore-redesign
```

- [ ] **Step 2: Verify**

```bash
git branch --show-current
```

Expected: `dashboard-overview-explore-redesign`

---

### Task 2: Add mover-color helpers to `lib/analysis.ts`

**Files:**
- Modify: `frontend/src/lib/analysis.ts`

**Interfaces:**
- Produces: `sideToMove(fen: string): Side`, `moverAtDepth(rootMover: Side, depth: number): Side` — both exported, used by Task 4 (`PositionTree`), Task 6 (`GameTree`), and Task 10 (`GraphScatter`, indirectly via already-present `PlyMetric.mover`).

`Side` is already exported from this file (`export type Side = 'white' | 'black'`).

- [ ] **Step 1: Add the two functions**

Add after `moverOf` (currently lines 6-8):

```typescript
/** The side to move in `fen`, per FEN's second field ('w' or 'b'). */
export function sideToMove(fen: string): Side {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black'
}

/**
 * The mover of a node at `depth` (1-indexed) in a tree rooted at a position
 * whose side to move is `rootMover` — movers strictly alternate by depth,
 * starting with `rootMover` at depth 1.
 */
export function moverAtDepth(rootMover: Side, depth: number): Side {
  const otherSide: Side = rootMover === 'white' ? 'black' : 'white'
  return depth % 2 === 1 ? rootMover : otherSide
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/analysis.ts
git commit -m "feat: add sideToMove and moverAtDepth helpers for mover color coding"
```

---

### Task 3: Move `GameTree` into `components/explore/` and add mover stroke

**Files:**
- Create: `frontend/src/components/explore/GameTree.tsx` (moved + modified from `frontend/src/components/tree/GameTree.tsx`)
- Create: `frontend/src/components/explore/GameTree.css` (moved + modified from `frontend/src/components/tree/GameTree.css`)
- Create: `frontend/src/components/explore/TreeNodePreview.tsx` (moved, unchanged, from `frontend/src/components/tree/TreeNodePreview.tsx`)
- Create: `frontend/src/components/explore/TreeNodePreview.css` (moved, unchanged, from `frontend/src/components/tree/TreeNodePreview.css`)

**Interfaces:**
- Consumes: `moverAtDepth`, `sideToMove` from `../../lib/analysis` (Task 2); `GameTreeRow`, `LineTreeNode`, `groupGameTreeRows` from `../../lib/tree` (unchanged); `HoverTarget` from `./TreeNodePreview`.
- Produces: `GameTree` component with the same props as today (`rows`, `currentPly`, `onSelectPly`, `collapseThreshold`) — consumed by `ExploreTab` in Task 11.

The trunk node's mover is already available directly as `row.mover` (`GameTreeRow.mover: Side`) — no new lookup needed. The branch chain's mover needs `moverAtDepth`: the first branch node (depth 1) represents an alternative for the same move as the trunk row, so its mover is `row.mover`; deeper nodes alternate from there.

- [ ] **Step 1: Copy files to the new location**

```bash
mkdir -p frontend/src/components/explore
cp frontend/src/components/tree/TreeNodePreview.tsx frontend/src/components/explore/TreeNodePreview.tsx
cp frontend/src/components/tree/TreeNodePreview.css frontend/src/components/explore/TreeNodePreview.css
cp frontend/src/components/tree/GameTree.tsx frontend/src/components/explore/GameTree.tsx
cp frontend/src/components/tree/GameTree.css frontend/src/components/explore/GameTree.css
```

- [ ] **Step 2: Fix `boardTheme` import path in the copied `TreeNodePreview.tsx`**

It currently imports `'../../lib/boardTheme'` — from `components/tree/`, that's `frontend/src/lib/boardTheme.ts`. From `components/explore/`, the relative path is identical (`../../lib/boardTheme`), since both are two levels under `src/components/*/`. No change needed — verify by reading the file.

- [ ] **Step 3: Add mover stroke to `components/explore/GameTree.tsx`**

Add the import and use `row.mover` for the trunk node's stroke, and `moverAtDepth(row.mover, depth + 1)` for each branch node's stroke:

```typescript
// add to imports:
import { moverAtDepth } from '../../lib/analysis'
```

Change the trunk `<circle>` (currently around line 116-122) to add a `stroke` derived from `row.mover`:

```tsx
<circle
  cx={RAIL_X}
  cy={rowY}
  r={isCurrent ? 6 : 4.5}
  className={`game-tree__node game-tree__node--${tone} game-tree__node--mover-${row.mover}${isCurrent ? ' is-current' : ''}`}
  onClick={() => onSelectPly(row.ply)}
/>
```

Change the branch `<circle>` (currently around line 144-157) to add a mover-based class, computing depth's mover:

```tsx
{chain.map((node, depth) => {
  const prevX = depth === 0 ? RAIL_X : RAIL_X + side * depth * BRANCH_DX
  const prevY = depth === 0 ? rowY : rowY - depth * BRANCH_DY
  const x = RAIL_X + side * (depth + 1) * BRANCH_DX
  const y = rowY - (depth + 1) * BRANCH_DY
  const midX = (prevX + x) / 2
  const branchMover = moverAtDepth(row.mover, depth + 1)
  return (
    <g key={node.uci}>
      <path
        d={`M ${prevX} ${prevY} C ${midX} ${prevY} ${midX} ${y} ${x} ${y}`}
        className="game-tree__branch-path"
      />
      <circle
        cx={x}
        cy={y}
        r={3.5}
        className={`game-tree__branch-dot game-tree__branch-dot--mover-${branchMover}`}
        onMouseEnter={(e) => showHover(e, node)}
        onMouseLeave={() => setHover(null)}
        onClick={() => onSelectPly(row.ply - 1)}
      />
      <text
        x={x + side * 6}
        y={y - 4}
        textAnchor={side > 0 ? 'start' : 'end'}
        className="game-tree__branch-label"
      >
        {node.san}
      </text>
    </g>
  )
})}
```

(Keep the existing comment above `onClick={() => onSelectPly(row.ply - 1)}` explaining the ply offset — copy it over unchanged.)

- [ ] **Step 4: Add mover stroke CSS to `components/explore/GameTree.css`**

Append:

```css
.game-tree__node--mover-white {
  stroke: var(--white-accent);
  stroke-width: 1.5;
}
.game-tree__node--mover-black {
  stroke: var(--black-accent);
  stroke-width: 1.5;
}
.game-tree__node--mover-white.is-current,
.game-tree__node--mover-black.is-current {
  stroke: var(--parchment);
  stroke-width: 2;
}

.game-tree__branch-dot--mover-white {
  stroke: var(--white-accent);
  stroke-width: 1.5;
}
.game-tree__branch-dot--mover-black {
  stroke: var(--black-accent);
  stroke-width: 1.5;
}
```

(The `.is-current` override keeps the existing "current position" highlight — `stroke: var(--parchment)` — taking priority over the mover color, matching today's behavior where `.is-current` already overrides via later CSS source order; since both rules have equal specificity, keep the `.is-current` combined selector rule physically after the plain mover rules in the file so it wins.)

- [ ] **Step 5: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit
```

Expected: no errors (new files aren't imported anywhere yet, so this just checks they're syntactically/type valid in isolation — TS will still check unreferenced files that are part of the project's `include`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/explore/GameTree.tsx frontend/src/components/explore/GameTree.css frontend/src/components/explore/TreeNodePreview.tsx frontend/src/components/explore/TreeNodePreview.css
git commit -m "feat: add GameTree + TreeNodePreview to components/explore with mover stroke coloring"
```

---

### Task 4: Move `PositionTree` into `components/explore/` and add mover stroke

**Files:**
- Create: `frontend/src/components/explore/PositionTree.tsx` (moved + modified from `frontend/src/components/tree/PositionTree.tsx`)
- Create: `frontend/src/components/explore/PositionTree.css` (moved + modified from `frontend/src/components/tree/PositionTree.css`)

**Interfaces:**
- Consumes: `sideToMove`, `moverAtDepth` from `../../lib/analysis` (Task 2); `buildPositionTree`, `DEFAULT_POSITION_PLIES`, `LineTreeNode` from `../../lib/tree` (unchanged); `HoverTarget` from `./TreeNodePreview` (Task 3).
- Produces: `PositionTree` component, same props as today (`fen: string`, `lines: EngineLine[] | null`) — consumed by `CandidateLines` in Task 5.

Every node in `PositionTree`'s layout already carries `x`/`y` from `layout()`, but not depth directly — depth is implicit in `x = depth * COL_WIDTH`, so derive it as `node.x / COL_WIDTH` when computing mover (it's always an integer since `COL_WIDTH` is the unit).

- [ ] **Step 1: Copy the files**

```bash
cp frontend/src/components/tree/PositionTree.tsx frontend/src/components/explore/PositionTree.tsx
cp frontend/src/components/tree/PositionTree.css frontend/src/components/explore/PositionTree.css
```

- [ ] **Step 2: Add mover stroke in `components/explore/PositionTree.tsx`**

Add the import:

```typescript
import { sideToMove, moverAtDepth } from '../../lib/analysis'
```

Compute `rootMover` once, and pass a `mover` class to each node. Change the component body (root of the layout is always depth-agnostic; nodes use `node.x / COL_WIDTH` as depth):

```tsx
function PositionTree({ fen, lines }: PositionTreeProps) {
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const rootMover = sideToMove(fen)

  const layoutResult = useMemo(() => {
    // ...unchanged...
  }, [fen, lines])

  if (!layoutResult) {
    return <div className="position-tree position-tree--empty">No stored lines for this position.</div>
  }

  const { top, height, width, rootY } = layoutResult

  const paths: { key: string; d: string; minRank: number }[] = []
  top.forEach((node) => collectPaths(node, { x: 0, y: rootY }, paths))

  const allNodes: LayoutNode[] = []
  top.forEach((node) => collectNodes(node, allNodes))

  const showHover = (e: ReactMouseEvent, node: LayoutNode) =>
    setHover({ fen: node.fen, san: node.san, x: e.clientX, y: e.clientY })

  return (
    <div className="position-tree">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="position-tree__svg">
        <circle cx={0} cy={rootY} r={5} className="position-tree__root" />
        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            className={`position-tree__branch position-tree__branch--${p.minRank === 0 ? 'top' : 'alt'}`}
          />
        ))}
        {allNodes.map((node) => {
          const depth = Math.round(node.x / COL_WIDTH)
          const mover = moverAtDepth(rootMover, depth)
          return (
            <g key={`${node.uci}-${node.x}-${node.y}`}>
              <circle
                cx={node.x}
                cy={node.y}
                r={4}
                className={`position-tree__node position-tree__node--${node.minRank === 0 ? 'top' : 'alt'} position-tree__node--mover-${mover}`}
                onMouseEnter={(e) => showHover(e, node)}
                onMouseLeave={() => setHover(null)}
              />
              <text x={node.x + 8} y={node.y + 4} className="position-tree__label">
                {node.san}
              </text>
            </g>
          )
        })}
      </svg>
      <TreeNodePreview target={hover} />
    </div>
  )
}
```

(`layout`, `collectPaths`, `collectNodes`, `LayoutNode`, `COL_WIDTH`, `ROW_HEIGHT`, `PAD` stay exactly as they are today — only the render body changes.)

- [ ] **Step 3: Add mover stroke CSS to `components/explore/PositionTree.css`**

Append:

```css
.position-tree__node--mover-white {
  stroke: var(--white-accent);
  stroke-width: 1.5;
}
.position-tree__node--mover-black {
  stroke: var(--black-accent);
  stroke-width: 1.5;
}
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/explore/PositionTree.tsx frontend/src/components/explore/PositionTree.css
git commit -m "feat: add PositionTree to components/explore with mover stroke coloring"
```

---

### Task 5: Create `CandidateLines` (merges `PositionTree` + the old `GraphMoveDetail` stat card)

**Files:**
- Create: `frontend/src/components/explore/CandidateLines.tsx`
- Create: `frontend/src/components/explore/CandidateLines.css`

**Interfaces:**
- Consumes: `PositionTree` (Task 4); `BUCKET_INFO`, `PlyMetric` from `../../lib/graphMetrics` (unchanged); `EngineLine` from `../../lib/stockfish` (unchanged).
- Produces: `CandidateLines` component — `{ metric: PlyMetric | null; fen: string | null; lines: EngineLine[] | null }` props, same shape as the old `GraphMoveDetail` — consumed by `ExploreTab` in Task 11.

**Indexing note (read before writing code):** the old `TreeTab`'s "This position's lines" was forward-looking — for the currently-viewed position (`ply`), it showed `lines[ply]` (candidates for the *next* move to be played from here) and `fen = positions[ply]`. The old `GraphTab`'s "Move detail" was backward-looking — for the move *just played* to reach `ply`, it used `metric = metrics[ply - 1]`, `fen = positions[ply - 1]`, `lines = lines[ply - 1]`. These two are inconsistent when merged into one widget for the same `ply`.

This task keeps the **forward-looking** convention (matching the original Tree tab and matching `GameTree`'s existing branch-click behavior, which already jumps to `row.ply - 1` specifically so a forward-looking "position's lines" widget shows that fork's alternatives). `ExploreTab` (Task 11) will therefore pass `metric = metrics[ply]` (not `metrics[ply - 1]`) alongside `fen = positions[ply]` and `lines = lines[ply]` — all three share the same index. `metrics[ply]` describes the move that was actually played next in the game from this position (SAN, classification, entropy, etc.), which existed already as `PlyMetric` but was previously read one index earlier. At the last ply (`ply === game.moves.length`), `metrics[ply]` is `undefined` — treat that exactly like `metric === null`.

- [ ] **Step 1: Write `CandidateLines.tsx`**

```tsx
import PositionTree from './PositionTree'
import { BUCKET_INFO } from '../../lib/graphMetrics'
import type { PlyMetric } from '../../lib/graphMetrics'
import type { EngineLine } from '../../lib/stockfish'
import './CandidateLines.css'

type CandidateLinesProps = {
  metric: PlyMetric | null
  fen: string | null
  lines: EngineLine[] | null
}

function moveLabel(m: PlyMetric): string {
  const moveNumber = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${moveNumber}. ${m.san}` : `${moveNumber}… ${m.san}`
}

function fmt(value: number | null, digits = 0, suffix = ''): string {
  return value === null ? '—' : `${value.toFixed(digits)}${suffix}`
}

function CandidateLines({ metric, fen, lines }: CandidateLinesProps) {
  if (!fen) {
    return <p className="candidate-lines__empty">No position selected.</p>
  }

  return (
    <div className="candidate-lines">
      {metric && (
        <>
          <div className="candidate-lines__header">
            <h4 className="candidate-lines__move">{moveLabel(metric)}</h4>
            <span
              className="candidate-lines__bucket"
              style={{ color: `var(${BUCKET_INFO[metric.bucket].colorVar})` }}
            >
              {BUCKET_INFO[metric.bucket].label}
            </span>
          </div>

          <dl className="candidate-lines__stats">
            <div>
              <dt>Entropy</dt>
              <dd>{fmt(metric.entropy, 2)}</dd>
            </div>
            <div>
              <dt>Top gap</dt>
              <dd>{fmt(metric.topGapPawns, 2, ' pawns')}</dd>
            </div>
            <div>
              <dt>Played rank</dt>
              <dd>
                {metric.playedRank === null
                  ? 'off-graph (not in stored candidates)'
                  : `#${metric.playedRank} of ${metric.branchingFactor}`}
              </dd>
            </div>
            <div>
              <dt>Loss vs. best</dt>
              <dd>{fmt(metric.rawLossPct, 0, '%')}</dd>
            </div>
            <div>
              <dt>Loss vs. field</dt>
              <dd>{fmt(metric.adjustedLossPct, 0, '%')}</dd>
            </div>
            <div>
              <dt>Classification</dt>
              <dd>{metric.classification ?? '—'}</dd>
            </div>
          </dl>
        </>
      )}

      <h5 className="candidate-lines__subheading">Candidate lines from here</h5>
      <PositionTree fen={fen} lines={lines} />
    </div>
  )
}

export default CandidateLines
```

- [ ] **Step 2: Write `CandidateLines.css`**

Base it on the old `GraphMoveDetail.css` (read it first to reuse the existing class-name conventions/spacing), renaming `graph-move-detail` classes to `candidate-lines`:

```bash
cat frontend/src/components/graph/GraphMoveDetail.css
```

Then write `frontend/src/components/explore/CandidateLines.css` with every `.graph-move-detail*` selector renamed to `.candidate-lines*` (same properties/values), plus:

```css
.candidate-lines__empty {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  padding: 20px;
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/explore/CandidateLines.tsx frontend/src/components/explore/CandidateLines.css
git commit -m "feat: add CandidateLines, merging PositionTree and the old move-detail stat card"
```

---

### Task 6: Move `LiveEnginePanel` and `EvalChart` into `components/explore/`

**Files:**
- Create: `frontend/src/components/explore/LiveEnginePanel.tsx` (moved, unchanged, from `frontend/src/components/LiveEnginePanel.tsx`)
- Create: `frontend/src/components/explore/LiveEnginePanel.css` (moved, unchanged)
- Create: `frontend/src/components/explore/EvalChart.tsx` (moved, unchanged, from `frontend/src/components/EvalChart.tsx`)
- Create: `frontend/src/components/explore/EvalChart.css` (moved, unchanged)

**Interfaces:**
- Both keep their exact current props (`LiveEnginePanelProps`, `EvalChartProps`) — consumed by `ExploreTab` in Task 11.
- `LiveEnginePanel` imports `ANALYSIS_DEPTH`, `sanLineFromUci`, `EngineLine` from `'../lib/stockfish'` today (one level up from `components/`); from `components/explore/`, this becomes `'../../lib/stockfish'`.

- [ ] **Step 1: Copy and fix the import path**

```bash
cp frontend/src/components/LiveEnginePanel.tsx frontend/src/components/explore/LiveEnginePanel.tsx
cp frontend/src/components/LiveEnginePanel.css frontend/src/components/explore/LiveEnginePanel.css
cp frontend/src/components/EvalChart.tsx frontend/src/components/explore/EvalChart.tsx
cp frontend/src/components/EvalChart.css frontend/src/components/explore/EvalChart.css
```

In `frontend/src/components/explore/LiveEnginePanel.tsx`, change:
```typescript
import { ANALYSIS_DEPTH, sanLineFromUci } from '../lib/stockfish'
```
to:
```typescript
import { ANALYSIS_DEPTH, sanLineFromUci } from '../../lib/stockfish'
```

`EvalChart.tsx` has no cross-directory imports besides its own types (`ParsedMove` from `'../lib/pgn'`, `MoveJudgment`/`PositionEval` from `'../lib/stockfish'`) — apply the same one-level fix:
```typescript
import type { ParsedMove } from '../../lib/pgn'
import type { MoveJudgment, PositionEval } from '../../lib/stockfish'
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/explore/LiveEnginePanel.tsx frontend/src/components/explore/LiveEnginePanel.css frontend/src/components/explore/EvalChart.tsx frontend/src/components/explore/EvalChart.css
git commit -m "feat: move LiveEnginePanel and EvalChart into components/explore"
```

---

### Task 7: Update `AnalysisContext`'s `DashboardTab` type

**Files:**
- Modify: `frontend/src/context/AnalysisContext.ts`

**Interfaces:**
- Produces: `DashboardTab = 'overview' | 'explore'` — consumed by `AnalysisLayout.tsx` (Task 12) and `OverviewTab`/`ExploreTab` (Tasks 9, 11) via `setActiveTab`.

This will cause `pages/AnalysisLayout.tsx`, `pages/ReportView.tsx`, `pages/AnalysisTab.tsx`, `pages/TreeTab.tsx`, `pages/GraphTab.tsx` to fail type-checking until Tasks 9-13 replace them — that's expected and resolved by Task 13's deletions. Do this task anyway now since every later task builds on the new type.

- [ ] **Step 1: Change the type**

In `frontend/src/context/AnalysisContext.ts`, change line 5:

```typescript
export type DashboardTab = 'overview' | 'explore'
```

- [ ] **Step 2: Verify the expected breakage**

```bash
cd frontend && pnpm exec tsc -b --noEmit 2>&1 | head -30
```

Expected: errors in `pages/AnalysisLayout.tsx`, `pages/ReportView.tsx`, `pages/AnalysisTab.tsx`, `pages/TreeTab.tsx`, `pages/GraphTab.tsx` about `'analysis'`/`'report'`/`'tree'`/`'graph'` not being assignable to `DashboardTab`. This is expected — those files get replaced in Tasks 9-13.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/context/AnalysisContext.ts
git commit -m "feat: narrow DashboardTab to overview/explore"
```

---

### Task 8: Move report components into `components/overview/`

**Files:**
- Create: `frontend/src/components/overview/PlayerSummary.tsx` + `.css` (moved, unchanged, from `components/report/`)
- Create: `frontend/src/components/overview/PhaseAccuracy.tsx` + `.css` (moved, unchanged)
- Create: `frontend/src/components/overview/MaterialChart.tsx` + `.css` (moved, unchanged)
- Create: `frontend/src/components/overview/TimePressureChart.tsx` + `.css` (moved, unchanged)
- Create: `frontend/src/components/overview/CriticalMoments.tsx` + `.css` (moved, unchanged)

**Interfaces:** unchanged props for all five — consumed by `OverviewTab` in Task 10.

`CriticalMoments.tsx` imports `MoveBadge, { classificationLabel, judgmentTitle } from '../MoveBadge'` and `{ SQUARE_DARK, SQUARE_LIGHT } from '../../lib/boardTheme'` — both stay one/two levels up respectively from `components/report/`, and the same relative depth applies from `components/overview/`, so **no import path changes needed** for any of these five files (verify by reading each copied file's imports).

- [ ] **Step 1: Copy all five components**

```bash
mkdir -p frontend/src/components/overview
for f in PlayerSummary PhaseAccuracy MaterialChart TimePressureChart CriticalMoments; do
  cp frontend/src/components/report/$f.tsx frontend/src/components/overview/$f.tsx
  cp frontend/src/components/report/$f.css frontend/src/components/overview/$f.css
done
```

- [ ] **Step 2: Verify import paths are still correct**

```bash
grep -n "^import" frontend/src/components/overview/*.tsx
```

Confirm every import resolves from `components/overview/` (e.g. `'../../lib/analysis'`, `'../MoveBadge'`, `'../../lib/boardTheme'`) — these are identical paths to what worked from `components/report/`, since both are one directory under `components/`.

- [ ] **Step 3: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit 2>&1 | grep -v "pages/AnalysisLayout\|pages/ReportView\|pages/AnalysisTab\|pages/TreeTab\|pages/GraphTab"
```

Expected: no new errors besides the already-known Task 7 breakage in the soon-to-be-deleted page files (filtered out above).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/overview/PlayerSummary.tsx frontend/src/components/overview/PlayerSummary.css frontend/src/components/overview/PhaseAccuracy.tsx frontend/src/components/overview/PhaseAccuracy.css frontend/src/components/overview/MaterialChart.tsx frontend/src/components/overview/MaterialChart.css frontend/src/components/overview/TimePressureChart.tsx frontend/src/components/overview/TimePressureChart.css frontend/src/components/overview/CriticalMoments.tsx frontend/src/components/overview/CriticalMoments.css
git commit -m "feat: move report components into components/overview"
```

---

### Task 9: Move + rework `GraphScatter`, `GraphTimeline`, `GraphInsights` into `components/overview/`

**Files:**
- Create: `frontend/src/components/overview/GraphScatter.tsx` + `.css` (moved + modified, mover stroke + simplified copy)
- Create: `frontend/src/components/overview/GraphTimeline.tsx` + `.css` (moved + modified, mirrored bar chart)
- Create: `frontend/src/components/overview/GraphInsights.tsx` + `.css` (moved + modified, simplified copy)

**Interfaces:**
- All three keep their current prop shapes (`GraphScatter`: `{ metrics, selectedIndex, onSelect }`; `GraphTimeline`: same; `GraphInsights`: `{ metrics }`) — consumed by `OverviewTab` in Task 10.
- Consumes: `BUCKET_INFO`, `PlyMetric`, `computeAggregateInsights`, `isThinSample`, `HIGH_ENTROPY`, `LOW_ENTROPY` from `../../lib/graphMetrics` (unchanged — same relative path from `components/overview/` as from `components/graph/`).

- [ ] **Step 1: Copy the three files' `.tsx`/`.css` pairs**

```bash
cp frontend/src/components/graph/GraphScatter.tsx frontend/src/components/overview/GraphScatter.tsx
cp frontend/src/components/graph/GraphScatter.css frontend/src/components/overview/GraphScatter.css
cp frontend/src/components/graph/GraphTimeline.tsx frontend/src/components/overview/GraphTimeline.tsx
cp frontend/src/components/graph/GraphTimeline.css frontend/src/components/overview/GraphTimeline.css
cp frontend/src/components/graph/GraphInsights.tsx frontend/src/components/overview/GraphInsights.tsx
cp frontend/src/components/graph/GraphInsights.css frontend/src/components/overview/GraphInsights.css
```

- [ ] **Step 2: Add mover stroke + simplified axis labels to `components/overview/GraphScatter.tsx`**

Change the axis labels (currently `decision entropy →` and `loss vs. best line (%) →`, around lines 52-63) to plainer language:

```tsx
<text x={PAD_L} y={HEIGHT - 8} className="graph-scatter__axis-label">
  how forced the position looked →
</text>
<text
  x={-(PAD_T + innerH / 2)}
  y={12}
  transform="rotate(-90)"
  textAnchor="middle"
  className="graph-scatter__axis-label"
>
  cost vs. best move (%) →
</text>
```

Add mover stroke to each point. Change the `points.map` block (currently lines 65-86):

```tsx
{points.map((m) => {
  const cx = xOf(m.entropy!)
  const cy = yOf(m.rawLossPct!)
  const color = `var(${BUCKET_INFO[m.bucket].colorVar})`
  const moverColor = `var(${m.mover === 'white' ? '--white-accent' : '--black-accent'})`
  const isSelected = selectedIndex === m.index
  return (
    <circle
      key={m.index}
      cx={cx}
      cy={cy}
      r={isSelected ? 6 : 4}
      fill={color}
      opacity={isSelected ? 1 : 0.75}
      stroke={isSelected ? 'var(--brass-bright)' : moverColor}
      strokeWidth={1.5}
      className="graph-scatter__point"
      onClick={() => onSelect(m.index)}
    >
      <title>{`${moveLabel(m)}  entropy=${m.entropy!.toFixed(2)}  loss=${m.rawLossPct!.toFixed(0)}%  ${BUCKET_INFO[m.bucket].label}`}</title>
    </circle>
  )
})}
```

(This replaces the `stroke={isSelected ? 'var(--brass-bright)' : 'none'}` line — selection highlight still takes priority over mover color, matching how `.is-current` takes priority in `GameTree`.)

- [ ] **Step 3: Convert `components/overview/GraphTimeline.tsx` to a mirrored bar chart**

Replace the whole file:

```tsx
import { BUCKET_INFO } from '../../lib/graphMetrics'
import type { PlyMetric } from '../../lib/graphMetrics'
import './GraphTimeline.css'

type GraphTimelineProps = {
  metrics: PlyMetric[]
  selectedIndex: number | null
  onSelect: (index: number) => void
}

const BAR_W = 7
const GAP = 2
const HALF_HEIGHT = 60
const HEIGHT = HALF_HEIGHT * 2

function moveLabel(m: PlyMetric): string {
  const moveNumber = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${moveNumber}.${m.san}` : `${moveNumber}…${m.san}`
}

function GraphTimeline({ metrics, selectedIndex, onSelect }: GraphTimelineProps) {
  const width = metrics.length * (BAR_W + GAP) + GAP

  return (
    <div className="graph-timeline">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" height={HEIGHT} className="graph-timeline__svg">
        <line x1={0} y1={HALF_HEIGHT} x2={width} y2={HALF_HEIGHT} className="graph-timeline__baseline" />
        {metrics.map((m, i) => {
          const x = GAP + i * (BAR_W + GAP)
          const h = m.entropy === null ? 3 : Math.max(2, m.entropy * (HALF_HEIGHT - 6))
          const y = m.mover === 'white' ? HALF_HEIGHT - h : HALF_HEIGHT
          const color = `var(${BUCKET_INFO[m.bucket].colorVar})`
          const isSelected = selectedIndex === m.index
          return (
            <rect
              key={m.index}
              x={x}
              y={y}
              width={BAR_W}
              height={h}
              rx={1}
              fill={color}
              opacity={m.entropy === null ? 0.25 : isSelected ? 1 : 0.8}
              className={`graph-timeline__bar graph-timeline__bar--${m.mover}${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelect(m.index)}
            >
              <title>{`${moveLabel(m)}  entropy=${m.entropy === null ? 'n/a' : m.entropy.toFixed(2)}  ${BUCKET_INFO[m.bucket].label}`}</title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}

export default GraphTimeline
```

(White's bars grow upward from the center baseline at `y = HALF_HEIGHT`; Black's grow downward, by setting `y = HALF_HEIGHT` and letting `height = h` extend down. `HALF_HEIGHT - 6` replaces the old `innerH` scaling factor so the tallest bar doesn't touch the container edge.)

- [ ] **Step 4: Update `components/overview/GraphTimeline.css`**

Read the current file, keep `.graph-timeline` and `.graph-timeline__svg` as-is, and update the baseline/bar rules (the old file had no mover-specific classes to remove, just add):

```bash
cat frontend/src/components/graph/GraphTimeline.css
```

Append (or adjust the existing `.graph-timeline__bar` rule if it conflicts):

```css
.graph-timeline__bar--white {
  /* rises above the baseline — no extra styling needed beyond fill, which is set inline */
}
.graph-timeline__bar--black {
  /* extends below the baseline — no extra styling needed beyond fill, which is set inline */
}
```

(If the existing file already fully covers `.graph-timeline__bar`/`.graph-timeline__baseline`/`.is-selected` generically with no directional assumptions, this step is a no-op beyond confirming that — don't add empty rulesets if there's nothing side-specific to say; only add the two placeholder classes above if you actually need a hook for future styling. Skip adding them if the base `.graph-timeline__bar` rule already applies correctly to both.)

- [ ] **Step 5: Simplify copy in `components/overview/GraphInsights.tsx`**

Replace the four `<h4 className="graph-insights__title">` headings and their following `<p className="graph-insights__desc">` text (the underlying `ComparisonBar`/data-binding code is unchanged):

Replace:
```tsx
<h4 className="graph-insights__title">Off-graph rate — the strongest single signal</h4>
<p className="graph-insights__desc">
  Share of moves that aren't among the engine's stored candidates at all, split by whether the move was
  flagged bad.
</p>
```
with:
```tsx
<h4 className="graph-insights__title">How often bad moves came from nowhere</h4>
<p className="graph-insights__desc">
  Share of moves that weren't even among the engine's top candidates, split by whether the move was
  flagged bad or not.
</p>
```

Replace:
```tsx
<h4 className="graph-insights__title">Bad moves cluster in narrower positions</h4>
<p className="graph-insights__desc">
  Mean decision entropy — how spread out the candidate lines were — for flagged-bad moves vs. everything
  else. Lower means the position looked more "obviously forced" to the engine.
</p>
```
with:
```tsx
<h4 className="graph-insights__title">Bad moves cluster in narrower positions</h4>
<p className="graph-insights__desc">
  How forced the position looked to the engine, for flagged-bad moves vs. everything else. Lower means the
  position looked more "obviously forced" — there was less to choose between.
</p>
```

Replace:
```tsx
<h4 className="graph-insights__title">The precision bar rises with entropy</h4>
<p className="graph-insights__desc">
  Among non-flagged moves, how often the played move was the engine's exact #1 line — narrow positions
  (entropy&nbsp;&lt;&nbsp;{LOW_ENTROPY}) vs. wide-open ones (entropy&nbsp;≥&nbsp;{HIGH_ENTROPY}). A drop
  here means "not blundering" is an easier bar to clear than "finding the exact top move."
</p>
```
with:
```tsx
<h4 className="graph-insights__title">Finding the exact best move gets harder in open positions</h4>
<p className="graph-insights__desc">
  Among non-flagged moves, how often the played move was the engine's exact top choice — forced-looking
  positions (entropy&nbsp;&lt;&nbsp;{LOW_ENTROPY}) vs. wide-open ones (entropy&nbsp;≥&nbsp;{HIGH_ENTROPY}). A
  drop here means "not blundering" is an easier bar to clear than "finding the single best move."
</p>
```

Replace:
```tsx
<h4 className="graph-insights__title">Cost by candidate-list standing, in wide-open positions</h4>
<p className="graph-insights__desc">
  Non-flagged moves in wide-open positions, split by whether the played move matched the engine exactly,
  was a near-tied alternative, or missed the stored candidates entirely ("silent drift"). Off-graph moves
  cost real eval even with no formal tag attached.
</p>
```
with:
```tsx
<h4 className="graph-insights__title">Missing the top move still costs you, even unflagged</h4>
<p className="graph-insights__desc">
  Non-flagged moves in wide-open positions, split by whether the played move matched the engine exactly,
  was a near-tied alternative, or wasn't among the engine's candidates at all ("silent drift"). Silent
  drift still costs real evaluation even when nothing gets tagged a mistake.
</p>
```

- [ ] **Step 6: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit 2>&1 | grep -v "pages/AnalysisLayout\|pages/ReportView\|pages/AnalysisTab\|pages/TreeTab\|pages/GraphTab"
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/overview/GraphScatter.tsx frontend/src/components/overview/GraphScatter.css frontend/src/components/overview/GraphTimeline.tsx frontend/src/components/overview/GraphTimeline.css frontend/src/components/overview/GraphInsights.tsx frontend/src/components/overview/GraphInsights.css
git commit -m "feat: move Graph tab's game-level components into components/overview, add mover coloring and mirrored timeline"
```

---

### Task 10: Create `pages/OverviewTab.tsx`

**Files:**
- Create: `frontend/src/pages/OverviewTab.tsx`
- Create: `frontend/src/pages/OverviewTab.css`

**Interfaces:**
- Consumes: `useAnalysis()` from `../context/AnalysisContext`; `PlayerSummary`, `PhaseAccuracy`, `MaterialChart`, `TimePressureChart`, `CriticalMoments`, `GraphScatter`, `GraphTimeline`, `GraphInsights` from `../components/overview/*` (Tasks 8-9); `computeAccuracy`, `computePhaseAccuracy`, `findCriticalMoments`, `hasClockData` from `../lib/analysis` (unchanged); `computePlyMetrics`, `BUCKET_INFO`, `MoveBucket` from `../lib/graphMetrics` (unchanged).
- Produces: `OverviewTab` component (no props — reads everything from context), consumed by `AnalysisLayout.tsx` (Task 12).

Content order, per the spec: `PlayerSummary` → new stat-row → `PhaseAccuracy`+`MaterialChart` grid → `TimePressureChart` (conditional) → `GraphScatter` (with legend) → `GraphInsights` → `CriticalMoments`. The stat-row and legend markup below is lifted directly from the old `GraphTab.tsx` (its `graph-tab__stat-row`/`graph-tab__legend` JSX), just renamed to `overview__*` classes.

- [ ] **Step 1: Write `OverviewTab.tsx`**

```tsx
import { useMemo } from 'react'
import PlayerSummary from '../components/overview/PlayerSummary'
import PhaseAccuracy from '../components/overview/PhaseAccuracy'
import CriticalMoments from '../components/overview/CriticalMoments'
import MaterialChart from '../components/overview/MaterialChart'
import TimePressureChart from '../components/overview/TimePressureChart'
import GraphScatter from '../components/overview/GraphScatter'
import GraphInsights from '../components/overview/GraphInsights'
import { useAnalysis } from '../context/AnalysisContext'
import { computeAccuracy, computePhaseAccuracy, findCriticalMoments, hasClockData } from '../lib/analysis'
import { computePlyMetrics, BUCKET_INFO } from '../lib/graphMetrics'
import type { MoveBucket } from '../lib/graphMetrics'
import './OverviewTab.css'

const LEGEND_BUCKETS: MoveBucket[] = [
  'precise',
  'near-tie',
  'drift',
  'blunder-forced',
  'blunder-open',
  'forced',
]

function OverviewTab() {
  const { game, ply, goTo, judgments, evals, lines, setActiveTab } = useAnalysis()

  const white = game.headers.White ?? 'White'
  const black = game.headers.Black ?? 'Black'

  const accuracy = useMemo(() => (judgments ? computeAccuracy(judgments) : null), [judgments])
  const phaseAccuracy = useMemo(
    () => (judgments ? computePhaseAccuracy(game.positions, judgments) : null),
    [game.positions, judgments],
  )
  const criticalMoments = useMemo(
    () => (judgments ? findCriticalMoments(game.moves, judgments) : []),
    [game.moves, judgments],
  )
  const showClock = useMemo(() => hasClockData(game.moves), [game.moves])

  const metrics = useMemo(() => {
    if (!judgments || !lines) return null
    return computePlyMetrics(game, judgments, lines)
  }, [game, judgments, lines])

  const jumpToBoard = (targetPly: number) => {
    goTo(targetPly)
    setActiveTab('explore')
  }

  if (!evals || !judgments || !accuracy || !phaseAccuracy || !metrics) {
    return (
      <div className="overview">
        <div className="overview__pending">
          <span className="spinner" aria-hidden="true" />
          Waiting on engine analysis…
        </div>
      </div>
    )
  }

  const rated = metrics.filter((m) => m.entropy !== null)
  const counts = rated.reduce(
    (acc, m) => {
      acc[m.bucket] = (acc[m.bucket] ?? 0) + 1
      return acc
    },
    {} as Partial<Record<MoveBucket, number>>,
  )

  return (
    <div className="overview">
      <PlayerSummary white={white} black={black} accuracy={accuracy} />

      <section className="overview__section">
        <div className="overview__stat-row">
          <div className="overview__stat">
            <span className="overview__stat-n">{counts['blunder-forced'] ?? 0}</span>
            <span className="overview__stat-label">should've been found</span>
          </div>
          <div className="overview__stat">
            <span className="overview__stat-n">{counts['blunder-open'] ?? 0}</span>
            <span className="overview__stat-label">genuinely hard misses</span>
          </div>
          <div className="overview__stat">
            <span className="overview__stat-n">{counts['drift'] ?? 0}</span>
            <span className="overview__stat-label">silent drift, untagged</span>
          </div>
          <div className="overview__stat">
            <span className="overview__stat-n">{counts['precise'] ?? 0}</span>
            <span className="overview__stat-label">precise, needle found</span>
          </div>
        </div>
      </section>

      <div className="overview__grid">
        <PhaseAccuracy white={white} black={black} phases={phaseAccuracy} />
        <MaterialChart positions={game.positions} currentPly={ply} onSelectPly={jumpToBoard} />
      </div>

      {showClock && (
        <TimePressureChart
          moves={game.moves}
          judgments={judgments}
          timeControl={game.headers.TimeControl}
          currentPly={ply}
          onSelectPly={jumpToBoard}
        />
      )}

      <section className="overview__section">
        <h3 className="overview__heading">Move quality vs. how open the position was</h3>
        <GraphScatter metrics={metrics} selectedIndex={null} onSelect={(index) => jumpToBoard(index + 1)} />
        <div className="overview__legend">
          {LEGEND_BUCKETS.map((bucket) => (
            <span key={bucket} className="overview__legend-item">
              <span className="overview__legend-dot" style={{ background: `var(${BUCKET_INFO[bucket].colorVar})` }} />
              {BUCKET_INFO[bucket].label}
            </span>
          ))}
        </div>
      </section>

      <section className="overview__section">
        <h3 className="overview__heading">Signals</h3>
        <GraphInsights metrics={metrics} />
      </section>

      <CriticalMoments
        moments={criticalMoments}
        positions={game.positions}
        currentPly={ply}
        onJump={jumpToBoard}
      />
    </div>
  )
}

export default OverviewTab
```

(`GraphScatter`'s `selectedIndex` is `null` here since Overview doesn't track a "selected" scatter point across renders — every click is a one-way jump into `Explore`, unlike the old `GraphTab` which kept `selectedIndex` state to also drive its now-removed in-tab "Move detail" panel. This matches the spec: Overview shows the whole-game picture, `Explore` is where per-move detail lives.)

- [ ] **Step 2: Write `OverviewTab.css`**

```css
.overview {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.overview__pending {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: var(--mono);
  font-size: 13px;
  color: var(--parchment-dim);
  padding: 80px 18px;
}

.overview__grid {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
  gap: 24px;
  align-items: start;
}

@media (max-width: 780px) {
  .overview__grid {
    grid-template-columns: 1fr;
  }
}

.overview__section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.overview__heading {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  opacity: 0.75;
  margin: 0;
}

.overview__stat-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.overview__stat {
  flex: 1 1 130px;
  border: 1px solid rgba(201, 162, 75, 0.18);
  background: rgba(236, 226, 206, 0.02);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.overview__stat-n {
  font-family: var(--mono);
  font-size: 22px;
  font-weight: 600;
  color: var(--brass-bright);
}

.overview__stat-label {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--parchment-dim);
}

.overview__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
}

.overview__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--parchment-dim);
}

.overview__legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit 2>&1 | grep -v "pages/AnalysisLayout\|pages/ReportView\|pages/AnalysisTab\|pages/TreeTab\|pages/GraphTab"
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/OverviewTab.tsx frontend/src/pages/OverviewTab.css
git commit -m "feat: add OverviewTab, consolidating Report and Graph tab's whole-game content"
```

---

### Task 11: Create `pages/ExploreTab.tsx`

**Files:**
- Create: `frontend/src/pages/ExploreTab.tsx`
- Create: `frontend/src/pages/ExploreTab.css`

**Interfaces:**
- Consumes: `useAnalysis()`; `EvalChart`, `LiveEnginePanel`, `GameTree`, `CandidateLines` from `../components/explore/*` (Tasks 3-6); `buildGameTreeRows`, `DEFAULT_BRANCH_PLIES`, `DEFAULT_BRANCH_THRESHOLD`, `BranchThreshold`, `CollapseThreshold` from `../lib/tree` (unchanged); `computePlyMetrics` from `../lib/graphMetrics` (unchanged).
- Produces: `ExploreTab` component (no props), consumed by `AnalysisLayout.tsx` (Task 12).

Sub-tab state (`'live' | 'tree' | 'lines'`) is local `useState`, defaulting to `'live'`, per the spec — not added to `AnalysisContext`.

Per Task 5's indexing note: pass `metric={metrics?.[ply] ?? null}` (not `ply - 1`) to `CandidateLines`, matching `lines[ply]`/`positions[ply]`.

- [ ] **Step 1: Write `ExploreTab.tsx`**

```tsx
import { useMemo, useState } from 'react'
import EvalChart from '../components/explore/EvalChart'
import LiveEnginePanel from '../components/explore/LiveEnginePanel'
import GameTree from '../components/explore/GameTree'
import CandidateLines from '../components/explore/CandidateLines'
import { buildGameTreeRows, DEFAULT_BRANCH_PLIES, DEFAULT_BRANCH_THRESHOLD } from '../lib/tree'
import type { BranchThreshold, CollapseThreshold } from '../lib/tree'
import { computePlyMetrics } from '../lib/graphMetrics'
import { useAnalysis } from '../context/AnalysisContext'
import './ExploreTab.css'

type ExploreSubTab = 'live' | 'tree' | 'lines'

const BRANCH_THRESHOLD_OPTIONS: { value: BranchThreshold; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'blunder', label: 'Blunder only' },
  { value: 'mistake', label: 'Mistake+' },
  { value: 'inaccuracy', label: 'Inaccuracy+' },
  { value: 'good', label: 'Good+' },
  { value: 'best', label: 'All moves' },
]

const COLLAPSE_THRESHOLD_OPTIONS: { value: CollapseThreshold; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'best', label: 'Best only' },
  { value: 'excellent', label: 'Excellent+' },
  { value: 'good', label: 'Good+' },
]

function ExploreTab() {
  const {
    game,
    ply,
    goTo,
    evals,
    judgments,
    lines,
    liveEngineEnabled,
    setLiveEngineEnabled,
    liveLines,
    liveDepth,
  } = useAnalysis()
  const [subTab, setSubTab] = useState<ExploreSubTab>('live')
  const [branchThreshold, setBranchThreshold] = useState<BranchThreshold>(DEFAULT_BRANCH_THRESHOLD)
  const [collapseThreshold, setCollapseThreshold] = useState<CollapseThreshold>('off')

  const position = game.positions[ply]

  const treeRows = useMemo(() => {
    if (!judgments || !lines) return null
    return buildGameTreeRows(game.positions, game.moves, judgments, lines, DEFAULT_BRANCH_PLIES, branchThreshold)
  }, [game, judgments, lines, branchThreshold])

  const metrics = useMemo(() => {
    if (!judgments || !lines) return null
    return computePlyMetrics(game, judgments, lines)
  }, [game, judgments, lines])

  const currentLines = lines?.[ply] ?? null
  const currentMetric = metrics?.[ply] ?? null

  return (
    <div className="explore-tab">
      {evals ? (
        <EvalChart evals={evals} moves={game.moves} judgments={judgments} currentPly={ply} onSelectPly={goTo} />
      ) : (
        <div className="explore-tab__pending">
          <span className="spinner" aria-hidden="true" />
          Running engine analysis…
        </div>
      )}

      <div className="explore-tab__subtabs" role="tablist" aria-label="Per-move view">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'live'}
          className={`explore-tab__subtab-btn${subTab === 'live' ? ' is-active' : ''}`}
          onClick={() => setSubTab('live')}
        >
          Live
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'tree'}
          className={`explore-tab__subtab-btn${subTab === 'tree' ? ' is-active' : ''}`}
          onClick={() => setSubTab('tree')}
        >
          Tree
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'lines'}
          className={`explore-tab__subtab-btn${subTab === 'lines' ? ' is-active' : ''}`}
          onClick={() => setSubTab('lines')}
        >
          Lines
        </button>
      </div>

      <div className="explore-tab__subtab-content">
        {subTab === 'live' && (
          <LiveEnginePanel
            enabled={liveEngineEnabled}
            onToggle={setLiveEngineEnabled}
            storedLines={lines?.[ply] ?? null}
            liveLines={liveLines}
            liveDepth={liveDepth}
            fen={position}
          />
        )}

        {subTab === 'tree' && (
          <section className="explore-tab__section">
            <div className="explore-tab__filters">
              <div className="explore-tab__filter-group">
                <span className="explore-tab__filter-label">Collapse stem</span>
                <div className="explore-tab__filter-options" role="tablist" aria-label="Collapse trunk moves at or above">
                  {COLLAPSE_THRESHOLD_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={collapseThreshold === value}
                      className={`explore-tab__filter-btn${collapseThreshold === value ? ' is-active' : ''}`}
                      onClick={() => setCollapseThreshold(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="explore-tab__filter-group">
                <span className="explore-tab__filter-label">Show branches</span>
                <div className="explore-tab__filter-options" role="tablist" aria-label="Show branches for moves rated">
                  {BRANCH_THRESHOLD_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={branchThreshold === value}
                      className={`explore-tab__filter-btn${branchThreshold === value ? ' is-active' : ''}`}
                      onClick={() => setBranchThreshold(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {treeRows ? (
              <GameTree rows={treeRows} currentPly={ply} onSelectPly={goTo} collapseThreshold={collapseThreshold} />
            ) : (
              <p className="explore-tab__pending-text">Waiting for engine analysis…</p>
            )}
          </section>
        )}

        {subTab === 'lines' && <CandidateLines metric={currentMetric} fen={position} lines={currentLines} />}
      </div>
    </div>
  )
}

export default ExploreTab
```

- [ ] **Step 2: Write `ExploreTab.css`**

Base the sub-tab pill styling on `TreeTab.css`'s existing `.tree-tab__filter-btn`/`.tree-tab__filter-options` convention (read it first), and the filter styling directly from `TreeTab.css` too, renamed:

```bash
cat frontend/src/pages/TreeTab.css
```

```css
.explore-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.explore-tab__pending {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  border: 1px solid rgba(201, 162, 75, 0.28);
  background: rgba(23, 19, 15, 0.55);
  padding: 28px 18px;
}

.explore-tab__pending-text {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  padding: 20px;
}

.explore-tab__subtabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(201, 162, 75, 0.2);
}

.explore-tab__subtab-btn {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  background: transparent;
  cursor: pointer;
  padding: 8px 18px;
  border: 1px solid transparent;
  border-bottom: none;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}

.explore-tab__subtab-btn:hover {
  color: var(--parchment);
}

.explore-tab__subtab-btn.is-active {
  color: var(--brass-bright);
  border-color: rgba(201, 162, 75, 0.4);
  background: rgba(201, 162, 75, 0.08);
}

.explore-tab__subtab-content {
  min-width: 0;
}

.explore-tab__section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.explore-tab__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 12px;
}

.explore-tab__filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.explore-tab__filter-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  opacity: 0.75;
}

.explore-tab__filter-options {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.explore-tab__filter-btn {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  background: transparent;
  border: 1px solid rgba(201, 162, 75, 0.18);
  padding: 5px 10px;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.explore-tab__filter-btn:hover {
  color: var(--parchment);
  border-color: rgba(201, 162, 75, 0.4);
}

.explore-tab__filter-btn.is-active {
  color: var(--brass-bright);
  border-color: rgba(201, 162, 75, 0.5);
  background: rgba(201, 162, 75, 0.08);
}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && pnpm exec tsc -b --noEmit 2>&1 | grep -v "pages/AnalysisLayout\|pages/ReportView\|pages/AnalysisTab\|pages/TreeTab\|pages/GraphTab"
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ExploreTab.tsx frontend/src/pages/ExploreTab.css
git commit -m "feat: add ExploreTab with pinned eval chart and Live/Tree/Lines sub-tabs"
```

---

### Task 12: Wire `AnalysisLayout.tsx` to the two new tabs

**Files:**
- Modify: `frontend/src/pages/AnalysisLayout.tsx`

**Interfaces:**
- Consumes: `OverviewTab` (Task 10), `ExploreTab` (Task 11).

- [ ] **Step 1: Update the imports**

Change (currently lines 3-7):
```typescript
import BoardPane from './BoardPane'
import AnalysisTab from './AnalysisTab'
import ReportView from './ReportView'
import TreeTab from './TreeTab'
import GraphTab from './GraphTab'
```
to:
```typescript
import BoardPane from './BoardPane'
import OverviewTab from './OverviewTab'
import ExploreTab from './ExploreTab'
```

- [ ] **Step 2: Change the default `activeTab`**

Change (currently line 38):
```typescript
const [activeTab, setActiveTab] = useState<DashboardTab>('analysis')
```
to:
```typescript
const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
```

- [ ] **Step 3: Replace the tab bar and content switch**

Change the `dashboard-tabs` block (currently lines 296-325) from four buttons to two:
```tsx
<div className="dashboard-tabs">
  <button
    type="button"
    className={`dashboard-tabs__tab${activeTab === 'overview' ? ' is-active' : ''}`}
    onClick={() => setActiveTab('overview')}
  >
    Overview
  </button>
  <button
    type="button"
    className={`dashboard-tabs__tab${activeTab === 'explore' ? ' is-active' : ''}`}
    onClick={() => setActiveTab('explore')}
  >
    Explore
  </button>
</div>
```

Change the content switch (currently lines 327-337):
```tsx
<div className="dashboard-tabs__content">
  {activeTab === 'overview' ? <OverviewTab /> : <ExploreTab />}
</div>
```

- [ ] **Step 4: Type-check and lint**

```bash
cd frontend && pnpm exec tsc -b --noEmit 2>&1 | grep -v "pages/ReportView\|pages/AnalysisTab\|pages/TreeTab\|pages/GraphTab"
pnpm run lint
```

Expected: no new errors from `AnalysisLayout.tsx` (the four old page files are still broken until Task 13 deletes them — that's expected).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AnalysisLayout.tsx
git commit -m "feat: wire AnalysisLayout to Overview/Explore tabs"
```

---

### Task 13: Delete the superseded files

**Files:**
- Delete: `frontend/src/pages/ReportView.tsx`, `frontend/src/pages/ReportView.css`
- Delete: `frontend/src/pages/AnalysisTab.tsx`, `frontend/src/pages/AnalysisTab.css`
- Delete: `frontend/src/pages/TreeTab.tsx`, `frontend/src/pages/TreeTab.css`
- Delete: `frontend/src/pages/GraphTab.tsx`, `frontend/src/pages/GraphTab.css`
- Delete: `frontend/src/components/report/` (whole directory)
- Delete: `frontend/src/components/graph/` (whole directory)
- Delete: `frontend/src/components/tree/` (whole directory)
- Delete: `frontend/src/components/LiveEnginePanel.tsx`, `frontend/src/components/LiveEnginePanel.css`
- Delete: `frontend/src/components/EvalChart.tsx`, `frontend/src/components/EvalChart.css`

- [ ] **Step 1: Confirm nothing still imports the old paths**

```bash
cd frontend
grep -rn "from '\.\./pages/ReportView'\|from '\./ReportView'\|from '\.\./pages/AnalysisTab'\|from '\./AnalysisTab'\|from '\.\./pages/TreeTab'\|from '\./TreeTab'\|from '\.\./pages/GraphTab'\|from '\./GraphTab'\|components/report/\|components/graph/\|components/tree/\|from '\.\./components/LiveEnginePanel'\|from '\.\./components/EvalChart'" src/ || echo "no remaining references"
```

Expected: `no remaining references` (or only matches inside the files about to be deleted themselves, e.g. `components/graph/GraphMoveDetail.tsx` importing `PositionTree` from `../tree/PositionTree` — check each hit is inside a file that's also being deleted this task).

- [ ] **Step 2: Delete the files**

```bash
git rm -r frontend/src/pages/ReportView.tsx frontend/src/pages/ReportView.css
git rm -r frontend/src/pages/AnalysisTab.tsx frontend/src/pages/AnalysisTab.css
git rm -r frontend/src/pages/TreeTab.tsx frontend/src/pages/TreeTab.css
git rm -r frontend/src/pages/GraphTab.tsx frontend/src/pages/GraphTab.css
git rm -r frontend/src/components/report
git rm -r frontend/src/components/graph
git rm -r frontend/src/components/tree
git rm frontend/src/components/LiveEnginePanel.tsx frontend/src/components/LiveEnginePanel.css
git rm frontend/src/components/EvalChart.tsx frontend/src/components/EvalChart.css
```

- [ ] **Step 3: Type-check, lint, and build**

```bash
cd frontend
pnpm exec tsc -b --noEmit
pnpm run lint
pnpm run build
```

Expected: all three pass clean with zero errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove superseded Report/Analysis/Tree/Graph tabs and their components"
```

---

### Task 14: Manual verification pass

**Files:** none (verification only).

This reruns the same Playwright walkthrough used for the original UX audit, against the redesigned app, per the spec's Testing section.

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && pnpm run dev &
```

Wait for it to report the local URL (typically `http://localhost:5173` or `:5174` if that port's taken — check the terminal output), then confirm it's serving:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173
```

Expected: `200` (adjust the port to whatever `pnpm run dev` printed).

- [ ] **Step 2: Reuse the audit's Playwright script against the new UI**

If the audit script from the original UX review session still exists (check `/tmp/claude-*/*/scratchpad/pw/explore.js` from that session, or recreate an equivalent), run it against each of the 5 sample PGNs in `~/Downloads/*.pgn`, updating only the tab-selector text (`'Report'`/`'Tree'`/`'Graph'` → `'Overview'`/`'Explore'`, and add sub-tab clicks for `'Live'`/`'Tree'`/`'Lines'` inside Explore) and the port if it changed. If the old script is gone, write a fresh minimal script covering the checklist in Step 3 directly with Playwright's Node API (`chromium.launch()`, `page.goto()`, `page.locator(...).click()`, `page.screenshot()`).

- [ ] **Step 3: Confirm each item from the spec's Testing section, across at least one short (~25 ply) and one long (~90+ ply) PGN**

- [ ] No dead space remains on Overview or Explore at 1600px, 900px, and 375px widths
- [ ] White/black stroke coloring renders on: `GameTree` trunk nodes and branch dots (Explore → Tree sub-tab), `CandidateLines`' tree nodes (Explore → Lines sub-tab), `GraphScatter` points (Overview)
- [ ] The mirrored timeline is not directly visible as a standalone component anymore (it was folded into Overview's scatter/signals area per the spec — confirm `GraphTimeline` is not orphaned/unused; if it isn't actually rendered anywhere, that's a gap in Task 10 to go back and fix by adding it to `OverviewTab.tsx`)
- [ ] No duplicate candidate-line widget remains anywhere (only `CandidateLines`, under Explore → Lines)
- [ ] Clicking a critical-moment card, or a scatter point, on Overview correctly jumps `ply` and switches to Explore
- [ ] Explore's eval chart stays visible and correct while switching between Live/Tree/Lines sub-tabs
- [ ] Toggling Live Engine on/off and navigating moves still works (functionally unchanged from before the redesign — only relocated)
- [ ] Changing Tree sub-tab's Collapse/Show-branches filters still works (functionally unchanged, only relocated)

- [ ] **Step 4: Fix any gaps found**

If Step 3 surfaces a gap (most likely: `GraphTimeline` not actually rendered — Task 10's `OverviewTab.tsx` draft above does not include it, since the spec says it "merges into the scatter/signals area" without fully specifying the exact insertion point), add it now: insert `<GraphTimeline metrics={metrics} selectedIndex={null} onSelect={(index) => jumpToBoard(index + 1)} />` into `OverviewTab.tsx`'s scatter section, between the `GraphScatter` call and its legend, or directly below the legend — whichever reads better visually once you see it rendered. Re-run Step 3's checklist after any fix.

- [ ] **Step 5: Stop the dev server and commit any fixes**

```bash
kill %1  # or however the background pnpm dev job was started
```

```bash
git add -A
git commit -m "fix: address gaps found in manual verification of the dashboard redesign"
```

(Skip this commit if Step 4 found nothing to fix.)

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 7), Overview tab content/ordering (Task 10), Explore tab structure incl. pinned eval chart + 3 sub-tabs (Task 11), mover color coding on Tree/Lines/Scatter (Tasks 3, 4, 9) and mirrored timeline (Task 9 + Task 14 wiring check), language simplification (Task 9 Step 5), file/component moves (Tasks 3-13), non-goals (untouched: `BoardPane.tsx`, `lib/stockfish.ts`, `lib/graphMetrics.ts`, `lib/tree.ts`'s existing exports, routing, PGN parsing — verified no task touches them), testing approach (Task 14, matches spec exactly).
- **Placeholder scan:** no TBD/TODO; Task 14 Step 4 documents a known ambiguity (exact `GraphTimeline` insertion point) explicitly with a concrete resolution, not a vague "handle it."
- **Type consistency:** `DashboardTab` used identically in Tasks 7/12; `CandidateLinesProps`/`ExploreSubTab`/`GraphTimelineProps` defined once (Tasks 5, 11, 9) and consumed with matching shapes in Tasks 11/10; `moverAtDepth`/`sideToMove` signatures from Task 2 match their call sites in Tasks 3/4.
