# Game Tree Filter Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two independent, user-controlled classification-threshold filters to the game tree — one that collapses consecutive "good enough" stem moves into an expandable summary marker, one that controls which stem moves show a branch — exposed as button-group filter bars in `TreeTab`.

**Architecture:** A new pure function (`groupGameTreeRows`) in `frontend/src/lib/tree.ts` groups a `GameTreeRow[]` into a display list of plain rows and collapsed runs, called internally by `GameTree` (mirroring how `PositionTree` already calls `buildPositionTree` internally). `buildGameTreeRows` gains a `branchThreshold` parameter replacing its previously-hardcoded branch-visibility rule. Both threshold values are `useState` in `TreeTab`, surfaced as two `role="tablist"` button groups — the same filter-UI pattern `CriticalMoments.tsx` already uses in this codebase, not a native `<select>`.

**Tech Stack:** React + TypeScript, hand-rolled SVG (existing pattern), no new dependencies.

## Global Constraints

- No test framework is configured in this repo — verify with `cd frontend && npx tsc -b --noEmit` for type safety, and verify UI/visual behavior by running `npm run dev` and checking in the browser (Playwright is available in this environment for driving a real browser check, same as prior tree-tab work).
- No new engine computation — every change here is a client-side filter/grouping over data already in `judgments`/`lines`.
- Follow the existing button-group filter pattern from `frontend/src/components/report/CriticalMoments.tsx`/`.css` for the new filter bar, not a native `<select>` element (this codebase has no existing `<select>` styling; the button-group is the established convention for this exact kind of small discrete-choice filter).
- Both new pieces of UI state (`branchThreshold`, `collapseThreshold`) are `useState` in `TreeTab`, not persisted anywhere (no `AnalysisContext` changes, no localStorage) — they reset to their defaults on reload, consistent with the rest of the tree tab having no persisted UI state.

---

### Task 1: `lib/tree.ts` — branch threshold parameter and row-grouping function

**Files:**
- Modify: `frontend/src/lib/tree.ts`

**Interfaces:**
- Consumes: existing `LineTreeNode`, `buildLineTree`, `moverOf`, `Side`, `MoveClassification`, `MoveJudgment`, `EngineLine`, `ParsedMove` (all already in this file/its imports — no import changes needed).
- Produces (new, consumed by Tasks 2-3):
  - `CLASSIFICATION_RANK: Record<MoveClassification, number>` (worst-to-best: `blunder=0, mistake=1, inaccuracy=2, good=3, excellent=4, best=5`)
  - `type BranchThreshold = MoveClassification | 'none'`
  - `DEFAULT_BRANCH_THRESHOLD: BranchThreshold = 'inaccuracy'`
  - `type CollapseThreshold = MoveClassification | 'off'`
  - `type CollapsedRun = { kind: 'collapsed'; startPly: number; endPly: number; rows: GameTreeRow[] }`
  - `type GameTreeDisplayItem = { kind: 'row'; row: GameTreeRow } | CollapsedRun`
  - `groupGameTreeRows(rows: GameTreeRow[], threshold: CollapseThreshold): GameTreeDisplayItem[]`
- Modifies (signature change, consumed by Task 3): `buildGameTreeRows` gains a 6th parameter, `branchThreshold: BranchThreshold`.

- [ ] **Step 1: Replace `GameTreeRow` through `buildGameTreeRows` (current lines 63-103)**

Replace this whole block:

```ts
export type GameTreeRow = {
  /** 1-indexed ply, matching `AnalysisContext.ply` / `moves` indexing (ply = move index + 1). */
  ply: number
  san: string
  mover: Side
  classification: MoveClassification | null
  /** The engine's top line from this ply's position, only when the played move wasn't already good. */
  branch: LineTreeNode[] | null
}

const BRANCHABLE: ReadonlySet<MoveClassification> = new Set(['inaccuracy', 'mistake', 'blunder'])

export const DEFAULT_BRANCH_PLIES = 4
export const DEFAULT_POSITION_PLIES = 6

/**
 * One row per played move. A row only gets a `branch` (the engine's best
 * line from that position) when the played move's judgment was `inaccuracy`
 * or worse — this is what keeps the whole-game tree readable regardless of
 * game length, since most plies stay a plain trunk node.
 */
export function buildGameTreeRows(
  positions: string[],
  moves: ParsedMove[],
  judgments: (MoveJudgment | null)[],
  lines: EngineLine[][],
  maxBranchPlies: number,
): GameTreeRow[] {
  return moves.map((move, i) => {
    const judgment = judgments[i] ?? null
    const top = lines[i]?.[0]
    const branchable = !!judgment && BRANCHABLE.has(judgment.classification) && !!top && top.pv.length > 0
    return {
      ply: i + 1,
      san: move.san,
      mover: moverOf(i),
      classification: judgment?.classification ?? null,
      branch: branchable ? buildLineTree(positions[i], [top!.pv], maxBranchPlies) : null,
    }
  })
}
```

with:

```ts
export type GameTreeRow = {
  /** 1-indexed ply, matching `AnalysisContext.ply` / `moves` indexing (ply = move index + 1). */
  ply: number
  san: string
  mover: Side
  classification: MoveClassification | null
  /** The engine's top line from this ply's position, only when it clears `branchThreshold`. */
  branch: LineTreeNode[] | null
}

/** Worst-to-best ranking of move classifications, for threshold comparisons. */
export const CLASSIFICATION_RANK: Record<MoveClassification, number> = {
  blunder: 0,
  mistake: 1,
  inaccuracy: 2,
  good: 3,
  excellent: 4,
  best: 5,
}

/** A branch shows for classifications ranked at or below this threshold; `'none'` shows no branches. */
export type BranchThreshold = MoveClassification | 'none'

export const DEFAULT_BRANCH_PLIES = 4
export const DEFAULT_POSITION_PLIES = 6
export const DEFAULT_BRANCH_THRESHOLD: BranchThreshold = 'inaccuracy'

/**
 * One row per played move. A row only gets a `branch` (the engine's best
 * line from that position) when the played move's classification rank is at
 * or below `branchThreshold`'s rank — this is what keeps the whole-game tree
 * readable regardless of game length, since most plies stay a plain trunk
 * node at the default threshold (`'inaccuracy'`, which reproduces the
 * feature's original fixed behavior exactly).
 */
export function buildGameTreeRows(
  positions: string[],
  moves: ParsedMove[],
  judgments: (MoveJudgment | null)[],
  lines: EngineLine[][],
  maxBranchPlies: number,
  branchThreshold: BranchThreshold,
): GameTreeRow[] {
  return moves.map((move, i) => {
    const judgment = judgments[i] ?? null
    const top = lines[i]?.[0]
    const branchable =
      branchThreshold !== 'none' &&
      !!judgment &&
      CLASSIFICATION_RANK[judgment.classification] <= CLASSIFICATION_RANK[branchThreshold] &&
      !!top &&
      top.pv.length > 0
    return {
      ply: i + 1,
      san: move.san,
      mover: moverOf(i),
      classification: judgment?.classification ?? null,
      branch: branchable ? buildLineTree(positions[i], [top!.pv], maxBranchPlies) : null,
    }
  })
}
```

- [ ] **Step 2: Append the collapsing types and function at the end of the file**

Add after the existing `buildPositionTree` function (the last thing in the file):

```ts

/** A summary marker replacing 2+ consecutive `GameTreeRow`s that all clear the collapse threshold. */
export type CollapsedRun = {
  kind: 'collapsed'
  startPly: number
  endPly: number
  rows: GameTreeRow[]
}

export type GameTreeDisplayItem = { kind: 'row'; row: GameTreeRow } | CollapsedRun

/** Rows rank at or above this threshold to collapse; `'off'` collapses nothing. */
export type CollapseThreshold = MoveClassification | 'off'

/**
 * Groups maximal consecutive runs of 2+ rows whose classification rank is at
 * or above `threshold` into a single `CollapsedRun`. A run of exactly 1
 * qualifying row stays a plain `{ kind: 'row' }` item — nothing to
 * summarize. `threshold === 'off'` returns every row as `{ kind: 'row' }`,
 * unchanged.
 */
export function groupGameTreeRows(rows: GameTreeRow[], threshold: CollapseThreshold): GameTreeDisplayItem[] {
  if (threshold === 'off') return rows.map((row) => ({ kind: 'row', row }))

  const minRank = CLASSIFICATION_RANK[threshold]
  const qualifies = (row: GameTreeRow) =>
    row.classification !== null && CLASSIFICATION_RANK[row.classification] >= minRank

  const items: GameTreeDisplayItem[] = []
  let run: GameTreeRow[] = []

  const flushRun = () => {
    if (run.length === 0) return
    if (run.length === 1) {
      items.push({ kind: 'row', row: run[0] })
    } else {
      items.push({ kind: 'collapsed', startPly: run[0].ply, endPly: run[run.length - 1].ply, rows: run })
    }
    run = []
  }

  for (const row of rows) {
    if (qualifies(row)) {
      run.push(row)
    } else {
      flushRun()
      items.push({ kind: 'row', row })
    }
  }
  flushRun()

  return items
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: errors in `GameTree.tsx` and `TreeTab.tsx` (both now call `buildGameTreeRows` with the old 5-argument signature) — this is expected at this point in the plan; Tasks 2-3 fix those call sites. Confirm the *new* code in `tree.ts` itself has no errors (the reported errors should only be about call sites in the other two files, not about anything inside `tree.ts`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/tree.ts
git commit -m "feat: add branch-visibility threshold and stem-collapsing to the tree library"
```

---

### Task 2: `GameTree` — render collapsed runs, accept `collapseThreshold`

**Files:**
- Modify: `frontend/src/components/tree/GameTree.tsx`
- Modify: `frontend/src/components/tree/GameTree.css`

**Interfaces:**
- Consumes: `groupGameTreeRows`, `CollapseThreshold`, `DEFAULT_BRANCH_PLIES`, `GameTreeRow`, `LineTreeNode` from `../../lib/tree` (Task 1).
- Produces: `GameTreeProps` gains `collapseThreshold: CollapseThreshold`, consumed by `TreeTab` (Task 3).

- [ ] **Step 1: Replace the full contents of `GameTree.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { DEFAULT_BRANCH_PLIES, groupGameTreeRows } from '../../lib/tree'
import type { CollapseThreshold, GameTreeRow, LineTreeNode } from '../../lib/tree'
import TreeNodePreview from './TreeNodePreview'
import type { HoverTarget } from './TreeNodePreview'
import './GameTree.css'

type GameTreeProps = {
  rows: GameTreeRow[]
  currentPly: number
  onSelectPly: (ply: number) => void
  collapseThreshold: CollapseThreshold
}

const ROW_PITCH = 30
const RAIL_X = 280
const PAD_TOP = 20
const BRANCH_DX = 60
const BRANCH_DY = 10

const CLASS_TONE: Record<string, string> = {
  best: 'top',
  excellent: 'top',
  good: 'top',
  inaccuracy: 'warning',
  mistake: 'serious',
  blunder: 'critical',
}

function flattenChain(nodes: LineTreeNode[]): LineTreeNode[] {
  const chain: LineTreeNode[] = []
  let cur = nodes
  while (cur.length > 0) {
    chain.push(cur[0])
    cur = cur[0].children
  }
  return chain
}

function moveLabel(row: GameTreeRow): string {
  const moveNumber = Math.floor((row.ply - 1) / 2) + 1
  return row.mover === 'white' ? `${moveNumber}. ${row.san}` : `${moveNumber}... ${row.san}`
}

type RenderItem =
  | { type: 'row'; row: GameTreeRow }
  | { type: 'collapsed'; startPly: number; endPly: number; rows: GameTreeRow[] }

function GameTree({ rows, currentPly, onSelectPly, collapseThreshold }: GameTreeProps) {
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set())

  // A threshold change invalidates the previous grouping — there's no
  // meaningful way to carry "this run is expanded" forward across a regroup.
  useEffect(() => {
    setExpandedRuns(new Set())
  }, [collapseThreshold])

  const items = useMemo(() => groupGameTreeRows(rows, collapseThreshold), [rows, collapseThreshold])

  const renderItems: RenderItem[] = items.flatMap((item) => {
    if (item.kind === 'row') return [{ type: 'row', row: item.row }]
    if (expandedRuns.has(item.startPly)) return item.rows.map((row) => ({ type: 'row' as const, row }))
    return [{ type: 'collapsed', startPly: item.startPly, endPly: item.endPly, rows: item.rows }]
  })

  const height = PAD_TOP * 2 + renderItems.length * ROW_PITCH
  const width = RAIL_X + BRANCH_DX * (DEFAULT_BRANCH_PLIES + 1) + 160

  const showHover = (e: ReactMouseEvent, node: { fen: string; san: string }) =>
    setHover({ fen: node.fen, san: node.san, x: e.clientX, y: e.clientY })

  const expandRun = (startPly: number) => setExpandedRuns((prev) => new Set(prev).add(startPly))

  let branchIndex = 0

  return (
    <div className="game-tree">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="game-tree__svg">
        <line x1={RAIL_X} y1={PAD_TOP} x2={RAIL_X} y2={height - PAD_TOP} className="game-tree__rail" />

        {renderItems.map((item, i) => {
          const rowY = PAD_TOP + i * ROW_PITCH

          if (item.type === 'collapsed') {
            const isCurrent = currentPly >= item.startPly && currentPly <= item.endPly
            return (
              <g key={`collapsed-${item.startPly}`} onClick={() => expandRun(item.startPly)}>
                <circle
                  cx={RAIL_X}
                  cy={rowY}
                  r={4.5}
                  className={`game-tree__collapsed-dot${isCurrent ? ' is-current' : ''}`}
                />
                <text x={RAIL_X + 12} y={rowY + 4} className="game-tree__collapsed-label">
                  {item.rows.length} solid moves
                </text>
              </g>
            )
          }

          const row = item.row
          const isCurrent = row.ply === currentPly
          const tone = row.classification ? CLASS_TONE[row.classification] : 'top'
          const side = row.branch ? (branchIndex++ % 2 === 0 ? 1 : -1) : 0
          const labelSide = side < 0 ? 1 : -1
          const chain = row.branch ? flattenChain(row.branch) : []

          return (
            <g key={row.ply}>
              <circle
                cx={RAIL_X}
                cy={rowY}
                r={isCurrent ? 6 : 4.5}
                className={`game-tree__node game-tree__node--${tone}${isCurrent ? ' is-current' : ''}`}
                onClick={() => onSelectPly(row.ply)}
              />
              <text
                x={RAIL_X + labelSide * 12}
                y={rowY + 4}
                textAnchor={labelSide > 0 ? 'start' : 'end'}
                className="game-tree__label"
              >
                {moveLabel(row)}
              </text>

              {chain.map((node, depth) => {
                const prevX = depth === 0 ? RAIL_X : RAIL_X + side * depth * BRANCH_DX
                const prevY = depth === 0 ? rowY : rowY - depth * BRANCH_DY
                const x = RAIL_X + side * (depth + 1) * BRANCH_DX
                const y = rowY - (depth + 1) * BRANCH_DY
                const midX = (prevX + x) / 2
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
                      className="game-tree__branch-dot"
                      onMouseEnter={(e) => showHover(e, node)}
                      onMouseLeave={() => setHover(null)}
                      // row.branch is built from positions[row.ply - 1] (the position BEFORE the
                      // flagged move was played) — it's the engine's suggested alternative from
                      // that earlier position. Jump to row.ply - 1, not row.ply: the position
                      // after the actual move was already played, where this alternative may no
                      // longer even be legal.
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
            </g>
          )
        })}
      </svg>
      <TreeNodePreview target={hover} />
    </div>
  )
}

export default GameTree
```

- [ ] **Step 2: Append collapsed-marker styles to `GameTree.css`**

```css

.game-tree__collapsed-dot {
  fill: var(--parchment-dim);
  opacity: 0.5;
  cursor: pointer;
}
.game-tree__collapsed-dot.is-current {
  stroke: var(--parchment);
  stroke-width: 2;
  opacity: 0.8;
}

.game-tree__collapsed-label {
  fill: var(--parchment-dim);
  font-style: italic;
  cursor: pointer;
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: remaining errors only in `TreeTab.tsx` (it still calls `buildGameTreeRows` with the old signature and doesn't yet pass `collapseThreshold` to `<GameTree>`) — fixed in Task 3. No errors in `GameTree.tsx` itself.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tree/GameTree.tsx frontend/src/components/tree/GameTree.css
git commit -m "feat: render collapsible stem runs in GameTree"
```

---

### Task 3: `TreeTab` — filter bar UI wiring both thresholds

**Files:**
- Modify: `frontend/src/pages/TreeTab.tsx`
- Modify: `frontend/src/pages/TreeTab.css`

**Interfaces:**
- Consumes: `buildGameTreeRows`, `DEFAULT_BRANCH_PLIES`, `DEFAULT_BRANCH_THRESHOLD`, `BranchThreshold`, `CollapseThreshold` from `../lib/tree` (Task 1); `GameTree` (now requiring `collapseThreshold`) from `../components/tree/GameTree` (Task 2).
- Produces: none new (this is the final consumer in this plan).

- [ ] **Step 1: Replace the full contents of `TreeTab.tsx`**

```tsx
import { useMemo, useState } from 'react'
import { buildGameTreeRows, DEFAULT_BRANCH_PLIES, DEFAULT_BRANCH_THRESHOLD } from '../lib/tree'
import type { BranchThreshold, CollapseThreshold } from '../lib/tree'
import GameTree from '../components/tree/GameTree'
import PositionTree from '../components/tree/PositionTree'
import { useAnalysis } from '../context/AnalysisContext'
import './TreeTab.css'

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

function TreeTab() {
  const { game, ply, goTo, judgments, lines } = useAnalysis()
  const [branchThreshold, setBranchThreshold] = useState<BranchThreshold>(DEFAULT_BRANCH_THRESHOLD)
  const [collapseThreshold, setCollapseThreshold] = useState<CollapseThreshold>('off')

  const rows = useMemo(() => {
    if (!judgments || !lines) return null
    return buildGameTreeRows(game.positions, game.moves, judgments, lines, DEFAULT_BRANCH_PLIES, branchThreshold)
  }, [game, judgments, lines, branchThreshold])

  const position = game.positions[ply]
  const currentLines = lines?.[ply] ?? null

  return (
    <div className="tree-tab">
      <section className="tree-tab__section">
        <h3 className="tree-tab__heading">Game tree</h3>

        <div className="tree-tab__filters">
          <div className="tree-tab__filter-group">
            <span className="tree-tab__filter-label">Collapse stem</span>
            <div className="tree-tab__filter-options" role="tablist" aria-label="Collapse trunk moves at or above">
              {COLLAPSE_THRESHOLD_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={collapseThreshold === value}
                  className={`tree-tab__filter-btn${collapseThreshold === value ? ' is-active' : ''}`}
                  onClick={() => setCollapseThreshold(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tree-tab__filter-group">
            <span className="tree-tab__filter-label">Show branches</span>
            <div className="tree-tab__filter-options" role="tablist" aria-label="Show branches for moves rated">
              {BRANCH_THRESHOLD_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={branchThreshold === value}
                  className={`tree-tab__filter-btn${branchThreshold === value ? ' is-active' : ''}`}
                  onClick={() => setBranchThreshold(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {rows ? (
          <GameTree rows={rows} currentPly={ply} onSelectPly={goTo} collapseThreshold={collapseThreshold} />
        ) : (
          <p className="tree-tab__pending">Waiting for engine analysis…</p>
        )}
      </section>

      <section className="tree-tab__section">
        <h3 className="tree-tab__heading">This position's lines</h3>
        <PositionTree fen={position} lines={currentLines} />
      </section>
    </div>
  )
}

export default TreeTab
```

- [ ] **Step 2: Append filter-bar styles to `TreeTab.css`**

```css

.tree-tab__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 12px;
}

.tree-tab__filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tree-tab__filter-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  opacity: 0.75;
}

.tree-tab__filter-options {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.tree-tab__filter-btn {
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

.tree-tab__filter-btn:hover {
  color: var(--parchment);
  border-color: rgba(201, 162, 75, 0.4);
}

.tree-tab__filter-btn.is-active {
  color: var(--brass-bright);
  border-color: rgba(201, 162, 75, 0.5);
  background: rgba(201, 162, 75, 0.08);
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors anywhere in the project.

- [ ] **Step 4: Manual browser verification**

Run: `cd frontend && npm run dev`, load a PGN with at least one flagged (inaccuracy/mistake/blunder) move and several clean moves in a row (reuse or adapt the sample PGN from the original tree-tab work if still available under `/tmp`, or write a fresh short one), switch to the Tree tab, and check:

- Two filter bars ("Collapse stem" and "Show branches") appear above the game tree, each with the expected buttons, one active (highlighted) by default: "Off" for collapse, "Inaccuracy+" for branches.
- With collapse still "Off", the tree looks exactly as it did before this change (this is the regression check — default behavior must be unchanged).
- Clicking "Good+" (or "Best only"/"Excellent+") under "Collapse stem" collapses runs of 2+ consecutive qualifying moves into a single "N solid moves" marker; clicking that marker expands it back to individual moves.
- If the current ply falls inside a collapsed run, the marker shows the "current" highlight.
- Clicking "All moves" (or "Good+") under "Show branches" causes branches to appear at plies that previously had none (best/excellent/good plies); clicking "None" removes all branches; clicking back to "Inaccuracy+" restores the original default appearance.
- Hover/click-to-jump on branch nodes still work exactly as before (this feature shouldn't have touched that interaction).

Expected: all of the above work with no console errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TreeTab.tsx frontend/src/pages/TreeTab.css
git commit -m "feat: add game tree filter controls for stem collapsing and branch visibility"
```
