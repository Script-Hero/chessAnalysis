# Tree Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Tree" dashboard tab that shows the game's stored engine lines (already captured by the existing `multiPv = 3` batch analysis, no new engine calls) as two branching-tree visualizations: a whole-game trunk with branches only at plies that were inaccuracies or worse, and a small drill-down tree of the current ply's own candidate lines.

**Architecture:** Two pure functions in a new `frontend/src/lib/tree.ts` turn existing `AnalysisContext` data (`game`, `judgments`, `lines`) into tree node structures (no new engine computation, no new persisted state). Two new SVG components (`GameTree`, `PositionTree`) render those structures; a shared `TreeNodePreview` popover (a small `react-chessboard`) appears on node hover. A new `TreeTab` page composes both and is wired in as a third `DashboardTab`.

**Tech Stack:** React + TypeScript, hand-drawn SVG (no charting library, matching `EvalChart`'s existing approach), `chess.js` for FEN/SAN derivation, `react-chessboard` for the hover mini-board (already used by `BoardPane`).

## Global Constraints

- No test framework is configured in this repo (`lib/pgn.ts`, `lib/analysis.ts`, `lib/stockfish.ts` have no tests either) — verify logic changes with `cd frontend && npx tsc -b --noEmit` for type safety, and verify UI/visual behavior by running `npm run dev` and checking in the browser, matching existing project convention.
- No new engine computation of any kind — every visualization is derived only from `evals`/`judgments`/`lines` already produced by `analyzeGame`.
- Follow existing file/CSS organization: page-level components in `frontend/src/pages/`, shared components in `frontend/src/components/` (new tree-specific ones grouped in `frontend/src/components/tree/`), each `.tsx` paired with its own `.css` file, dark parchment/brass theme via the CSS custom properties already defined in `frontend/src/index.css`.

---

### Task 1: Foundation — `stepUci` helper and tree color tokens

**Files:**
- Modify: `frontend/src/lib/stockfish.ts`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces: `stepUci(fen: string, uci: string): { san: string; fen: string } | null`, exported from `frontend/src/lib/stockfish.ts`.
- Produces: two new CSS custom properties on `:root` — `--status-good` and `--tree-alt`.

- [ ] **Step 1: Add `stepUci` to `stockfish.ts`**

Add this new exported function near `sanFromUci` (around line 120 of `frontend/src/lib/stockfish.ts`), leaving `sanFromUci` untouched:

```ts
/** Applies one UCI move to `fen`, returning the resulting SAN and FEN, or null if illegal. */
export function stepUci(fen: string, uci: string): { san: string; fen: string } | null {
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    })
    if (!move) return null
    return { san: move.san, fen: chess.fen() }
  } catch {
    return null
  }
}
```

- [ ] **Step 2: Add tree color tokens to `index.css`**

In `frontend/src/index.css`, directly below the existing `--status-critical: #d03b3b;` line, add:

```css
  --status-good: #4caf7d;
  --tree-alt: #8b6fe0;
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/stockfish.ts frontend/src/index.css
git commit -m "feat: add stepUci helper and tree color tokens for the Tree tab"
```

---

### Task 2: Tree-building library (`lib/tree.ts`)

**Files:**
- Create: `frontend/src/lib/tree.ts`

**Interfaces:**
- Consumes: `stepUci(fen, uci)` from Task 1; `EngineLine`, `MoveClassification`, `MoveJudgment` from `./stockfish`; `ParsedMove` from `./pgn`; `moverOf(index): Side` and `type Side` from `./analysis`.
- Produces (all exported from `frontend/src/lib/tree.ts`, consumed by Tasks 4-6):
  - `type LineTreeNode = { uci: string; san: string; fen: string; minRank: number; children: LineTreeNode[] }`
  - `buildLineTree(fen: string, pvs: string[][], maxPlies: number): LineTreeNode[]`
  - `type GameTreeRow = { ply: number; san: string; mover: Side; classification: MoveClassification | null; branch: LineTreeNode[] | null }`
  - `buildGameTreeRows(positions: string[], moves: ParsedMove[], judgments: (MoveJudgment | null)[], lines: EngineLine[][], maxBranchPlies: number): GameTreeRow[]`
  - `buildPositionTree(fen: string, lines: EngineLine[], maxPlies: number): LineTreeNode[]`
  - `const DEFAULT_BRANCH_PLIES = 4`
  - `const DEFAULT_POSITION_PLIES = 6`

- [ ] **Step 1: Write `lib/tree.ts`**

```ts
import { stepUci } from './stockfish'
import type { EngineLine, MoveClassification, MoveJudgment } from './stockfish'
import type { ParsedMove } from './pgn'
import { moverOf } from './analysis'
import type { Side } from './analysis'

export type LineTreeNode = {
  uci: string
  san: string
  fen: string
  /** Lowest 0-indexed rank (line ordering, 0 = top engine choice) that passes through this node. */
  minRank: number
  children: LineTreeNode[]
}

type PvEntry = { pv: string[]; rank: number }

/**
 * Merges one or more UCI principal variations, all starting from `fen`, into
 * a tree: positions that share a common prefix collapse onto one path, and
 * lines diverge into separate branches at the first move where they differ.
 * Each line is truncated to `maxPlies` moves before merging.
 */
export function buildLineTree(fen: string, pvs: string[][], maxPlies: number): LineTreeNode[] {
  const entries: PvEntry[] = pvs
    .map((pv, rank) => ({ pv: pv.slice(0, maxPlies), rank }))
    .filter((entry) => entry.pv.length > 0)
  return buildLevel(fen, entries)
}

function buildLevel(fen: string, entries: PvEntry[]): LineTreeNode[] {
  const groups = new Map<string, PvEntry[]>()
  const order: string[] = []

  for (const entry of entries) {
    const [head, ...rest] = entry.pv
    if (head === undefined) continue
    if (!groups.has(head)) {
      groups.set(head, [])
      order.push(head)
    }
    groups.get(head)!.push({ pv: rest, rank: entry.rank })
  }

  const nodes: LineTreeNode[] = []
  for (const uci of order) {
    const step = stepUci(fen, uci)
    if (!step) continue
    const group = groups.get(uci)!
    const minRank = Math.min(...group.map((e) => e.rank))
    const childEntries = group.filter((e) => e.pv.length > 0)
    nodes.push({
      uci,
      san: step.san,
      fen: step.fen,
      minRank,
      children: buildLevel(step.fen, childEntries),
    })
  }
  return nodes
}

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

/** The current position's up-to-3 stored candidate lines, merged into one tree. */
export function buildPositionTree(fen: string, lines: EngineLine[], maxPlies: number): LineTreeNode[] {
  return buildLineTree(
    fen,
    lines.map((l) => l.pv),
    maxPlies,
  )
}
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/tree.ts
git commit -m "feat: add tree-building library for merging stored engine lines"
```

---

### Task 3: Shared hover preview (`TreeNodePreview`)

**Files:**
- Create: `frontend/src/components/tree/TreeNodePreview.tsx`
- Create: `frontend/src/components/tree/TreeNodePreview.css`

**Interfaces:**
- Consumes: `SQUARE_DARK`, `SQUARE_LIGHT` from `../../lib/boardTheme`; `Chessboard` from `react-chessboard`.
- Produces: `type HoverTarget = { fen: string; san: string; x: number; y: number }` and default-exported `TreeNodePreview({ target: HoverTarget | null })`, both consumed by `GameTree` (Task 4) and `PositionTree` (Task 5).

- [ ] **Step 1: Write `TreeNodePreview.tsx`**

```tsx
import { Chessboard } from 'react-chessboard'
import { SQUARE_DARK, SQUARE_LIGHT } from '../../lib/boardTheme'
import './TreeNodePreview.css'

export type HoverTarget = { fen: string; san: string; x: number; y: number }

function TreeNodePreview({ target }: { target: HoverTarget | null }) {
  if (!target) return null

  const left = Math.min(target.x + 16, window.innerWidth - 200)
  const top = Math.min(target.y + 16, window.innerHeight - 220)

  return (
    <div className="tree-node-preview" style={{ left, top }}>
      <div className="tree-node-preview__board">
        <Chessboard
          options={{
            id: 'tree-node-preview',
            position: target.fen,
            allowDragging: false,
            showAnimations: false,
            showNotation: false,
            darkSquareStyle: { backgroundColor: SQUARE_DARK },
            lightSquareStyle: { backgroundColor: SQUARE_LIGHT },
          }}
        />
      </div>
      <p className="tree-node-preview__san">{target.san}</p>
    </div>
  )
}

export default TreeNodePreview
```

- [ ] **Step 2: Write `TreeNodePreview.css`**

```css
.tree-node-preview {
  position: fixed;
  z-index: 50;
  width: 176px;
  pointer-events: none;
  background: rgba(15, 13, 10, 0.92);
  border: 1px solid rgba(201, 162, 75, 0.4);
  padding: 8px;
  box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.7);
}

.tree-node-preview__board {
  width: 160px;
}

.tree-node-preview__san {
  margin: 6px 0 0;
  font-family: var(--mono);
  font-size: 11px;
  color: var(--parchment);
  text-align: center;
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors (component isn't imported anywhere yet, but must still compile standalone).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tree/TreeNodePreview.tsx frontend/src/components/tree/TreeNodePreview.css
git commit -m "feat: add shared mini-board hover preview for tree nodes"
```

---

### Task 4: `GameTree` component

**Files:**
- Create: `frontend/src/components/tree/GameTree.tsx`
- Create: `frontend/src/components/tree/GameTree.css`

**Interfaces:**
- Consumes: `GameTreeRow`, `LineTreeNode`, `DEFAULT_BRANCH_PLIES` from `../../lib/tree` (Task 2); `HoverTarget`, `TreeNodePreview` from `./TreeNodePreview` (Task 3).
- Produces: default-exported `GameTree({ rows: GameTreeRow[]; currentPly: number; onSelectPly: (ply: number) => void })`, consumed by `TreeTab` (Task 6).

- [ ] **Step 1: Write `GameTree.tsx`**

```tsx
import { useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { DEFAULT_BRANCH_PLIES } from '../../lib/tree'
import type { GameTreeRow, LineTreeNode } from '../../lib/tree'
import TreeNodePreview from './TreeNodePreview'
import type { HoverTarget } from './TreeNodePreview'
import './GameTree.css'

type GameTreeProps = {
  rows: GameTreeRow[]
  currentPly: number
  onSelectPly: (ply: number) => void
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

function GameTree({ rows, currentPly, onSelectPly }: GameTreeProps) {
  const [hover, setHover] = useState<HoverTarget | null>(null)

  const height = PAD_TOP * 2 + rows.length * ROW_PITCH
  const width = RAIL_X + BRANCH_DX * (DEFAULT_BRANCH_PLIES + 1) + 160

  const showHover = (e: ReactMouseEvent, node: { fen: string; san: string }) =>
    setHover({ fen: node.fen, san: node.san, x: e.clientX, y: e.clientY })

  let branchIndex = 0

  return (
    <div className="game-tree">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="game-tree__svg">
        <line x1={RAIL_X} y1={PAD_TOP} x2={RAIL_X} y2={height - PAD_TOP} className="game-tree__rail" />

        {rows.map((row, i) => {
          const rowY = PAD_TOP + i * ROW_PITCH
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
                      onClick={() => onSelectPly(row.ply)}
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

- [ ] **Step 2: Write `GameTree.css`**

```css
.game-tree {
  position: relative;
  border: 1px solid rgba(201, 162, 75, 0.28);
  background: rgba(23, 19, 15, 0.55);
  padding: 12px;
  max-height: 480px;
  overflow-y: auto;
}

.game-tree__svg {
  display: block;
  font-family: var(--mono);
  font-size: 11px;
}

.game-tree__rail {
  stroke: var(--brass);
  stroke-width: 2;
  opacity: 0.5;
}

.game-tree__node {
  cursor: pointer;
}
.game-tree__node--top {
  fill: var(--brass-bright);
}
.game-tree__node--warning {
  fill: var(--status-warning);
}
.game-tree__node--serious {
  fill: var(--status-serious);
}
.game-tree__node--critical {
  fill: var(--status-critical);
}
.game-tree__node.is-current {
  stroke: var(--parchment);
  stroke-width: 2;
}

.game-tree__label {
  fill: var(--parchment-dim);
}

.game-tree__branch-path {
  fill: none;
  stroke: var(--status-good);
  stroke-width: 1.5;
  opacity: 0.75;
}

.game-tree__branch-dot {
  fill: var(--status-good);
  cursor: pointer;
}

.game-tree__branch-label {
  fill: var(--status-good);
  font-size: 10px;
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tree/GameTree.tsx frontend/src/components/tree/GameTree.css
git commit -m "feat: add GameTree component for the whole-game branch view"
```

---

### Task 5: `PositionTree` component

**Files:**
- Create: `frontend/src/components/tree/PositionTree.tsx`
- Create: `frontend/src/components/tree/PositionTree.css`

**Interfaces:**
- Consumes: `buildPositionTree`, `DEFAULT_POSITION_PLIES`, `LineTreeNode` from `../../lib/tree` (Task 2); `EngineLine` from `../../lib/stockfish`; `HoverTarget`, `TreeNodePreview` from `./TreeNodePreview` (Task 3).
- Produces: default-exported `PositionTree({ fen: string; lines: EngineLine[] | null; currentPly: number; onJumpToPly: (ply: number) => void })`, consumed by `TreeTab` (Task 6).

- [ ] **Step 1: Write `PositionTree.tsx`**

```tsx
import { useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { buildPositionTree, DEFAULT_POSITION_PLIES } from '../../lib/tree'
import type { LineTreeNode } from '../../lib/tree'
import type { EngineLine } from '../../lib/stockfish'
import TreeNodePreview from './TreeNodePreview'
import type { HoverTarget } from './TreeNodePreview'
import './PositionTree.css'

type PositionTreeProps = {
  fen: string
  lines: EngineLine[] | null
  currentPly: number
  onJumpToPly: (ply: number) => void
}

type LayoutNode = LineTreeNode & { x: number; y: number; layoutChildren: LayoutNode[] }

const COL_WIDTH = 92
const ROW_HEIGHT = 30
const PAD = 24

function layout(nodes: LineTreeNode[], depth: number, cursor: { next: number }): LayoutNode[] {
  return nodes.map((node) => {
    if (node.children.length === 0) {
      const y = cursor.next
      cursor.next += ROW_HEIGHT
      return { ...node, x: depth * COL_WIDTH, y, layoutChildren: [] }
    }
    const layoutChildren = layout(node.children, depth + 1, cursor)
    const y = layoutChildren.reduce((sum, c) => sum + c.y, 0) / layoutChildren.length
    return { ...node, x: depth * COL_WIDTH, y, layoutChildren }
  })
}

function collectPaths(
  node: LayoutNode,
  parent: { x: number; y: number },
  out: { key: string; d: string; minRank: number }[],
) {
  const midX = (parent.x + node.x) / 2
  out.push({
    key: `${node.uci}-${node.x}-${node.y}`,
    d: `M ${parent.x} ${parent.y} C ${midX} ${parent.y} ${midX} ${node.y} ${node.x} ${node.y}`,
    minRank: node.minRank,
  })
  node.layoutChildren.forEach((child) => collectPaths(child, node, out))
}

function collectNodes(node: LayoutNode, out: LayoutNode[]) {
  out.push(node)
  node.layoutChildren.forEach((child) => collectNodes(child, out))
}

function PositionTree({ fen, lines, currentPly, onJumpToPly }: PositionTreeProps) {
  const [hover, setHover] = useState<HoverTarget | null>(null)

  const layoutResult = useMemo(() => {
    if (!lines || lines.length === 0) return null
    const tree = buildPositionTree(fen, lines, DEFAULT_POSITION_PLIES)
    const cursor = { next: PAD }
    const top = layout(tree, 1, cursor)
    const height = Math.max(cursor.next, PAD * 2)
    const rootY = top.length ? top.reduce((s, n) => s + n.y, 0) / top.length : PAD
    const width = (DEFAULT_POSITION_PLIES + 1) * COL_WIDTH + 80
    return { top, height, width, rootY }
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
        {allNodes.map((node) => (
          <g key={`${node.uci}-${node.x}-${node.y}`}>
            <circle
              cx={node.x}
              cy={node.y}
              r={4}
              className={`position-tree__node position-tree__node--${node.minRank === 0 ? 'top' : 'alt'}`}
              onMouseEnter={(e) => showHover(e, node)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onJumpToPly(currentPly)}
            />
            <text x={node.x + 8} y={node.y + 4} className="position-tree__label">
              {node.san}
            </text>
          </g>
        ))}
      </svg>
      <TreeNodePreview target={hover} />
    </div>
  )
}

export default PositionTree
```

- [ ] **Step 2: Write `PositionTree.css`**

```css
.position-tree {
  position: relative;
  border: 1px solid rgba(201, 162, 75, 0.28);
  background: rgba(23, 19, 15, 0.55);
  padding: 12px;
}

.position-tree--empty {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  padding: 20px;
}

.position-tree__svg {
  display: block;
  font-family: var(--mono);
  font-size: 11px;
  overflow: visible;
}

.position-tree__root {
  fill: var(--parchment);
}

.position-tree__branch {
  fill: none;
  stroke-width: 1.5;
}
.position-tree__branch--top {
  stroke: var(--brass-bright);
  opacity: 0.85;
}
.position-tree__branch--alt {
  stroke: var(--tree-alt);
  opacity: 0.7;
}

.position-tree__node {
  cursor: pointer;
}
.position-tree__node--top {
  fill: var(--brass-bright);
}
.position-tree__node--alt {
  fill: var(--tree-alt);
}

.position-tree__label {
  fill: var(--parchment-dim);
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/tree/PositionTree.tsx frontend/src/components/tree/PositionTree.css
git commit -m "feat: add PositionTree component for the current-ply drill-down view"
```

---

### Task 6: `TreeTab` page

**Files:**
- Create: `frontend/src/pages/TreeTab.tsx`
- Create: `frontend/src/pages/TreeTab.css`

**Interfaces:**
- Consumes: `buildGameTreeRows`, `DEFAULT_BRANCH_PLIES` from `../lib/tree` (Task 2); `GameTree` from `../components/tree/GameTree` (Task 4); `PositionTree` from `../components/tree/PositionTree` (Task 5); `useAnalysis` from `../context/AnalysisContext`.
- Produces: default-exported `TreeTab()`, consumed by `AnalysisLayout` (Task 7).

- [ ] **Step 1: Write `TreeTab.tsx`**

```tsx
import { useMemo } from 'react'
import { buildGameTreeRows, DEFAULT_BRANCH_PLIES } from '../lib/tree'
import GameTree from '../components/tree/GameTree'
import PositionTree from '../components/tree/PositionTree'
import { useAnalysis } from '../context/AnalysisContext'
import './TreeTab.css'

function TreeTab() {
  const { game, ply, goTo, judgments, lines } = useAnalysis()

  const rows = useMemo(() => {
    if (!judgments || !lines) return null
    return buildGameTreeRows(game.positions, game.moves, judgments, lines, DEFAULT_BRANCH_PLIES)
  }, [game, judgments, lines])

  const position = game.positions[ply]
  const currentLines = lines?.[ply] ?? null

  return (
    <div className="tree-tab">
      <section className="tree-tab__section">
        <h3 className="tree-tab__heading">Game tree</h3>
        {rows ? (
          <GameTree rows={rows} currentPly={ply} onSelectPly={goTo} />
        ) : (
          <p className="tree-tab__pending">Waiting for engine analysis…</p>
        )}
      </section>

      <section className="tree-tab__section">
        <h3 className="tree-tab__heading">This position's lines</h3>
        <PositionTree fen={position} lines={currentLines} currentPly={ply} onJumpToPly={goTo} />
      </section>
    </div>
  )
}

export default TreeTab
```

- [ ] **Step 2: Write `TreeTab.css`**

```css
.tree-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.tree-tab__heading {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  opacity: 0.75;
  margin: 0 0 8px;
}

.tree-tab__pending {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  padding: 20px;
}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TreeTab.tsx frontend/src/pages/TreeTab.css
git commit -m "feat: add TreeTab page composing the game and position tree views"
```

---

### Task 7: Wire the Tree tab into the dashboard

**Files:**
- Modify: `frontend/src/context/AnalysisContext.ts:5`
- Modify: `frontend/src/pages/AnalysisLayout.tsx`

**Interfaces:**
- Consumes: `TreeTab` from `./TreeTab` (Task 6).
- Produces: `DashboardTab` now includes `'tree'`.

- [ ] **Step 1: Add `'tree'` to `DashboardTab`**

In `frontend/src/context/AnalysisContext.ts:5`, change:

```ts
export type DashboardTab = 'analysis' | 'report'
```

to:

```ts
export type DashboardTab = 'analysis' | 'report' | 'tree'
```

- [ ] **Step 2: Import `TreeTab` in `AnalysisLayout.tsx`**

Near the top of `frontend/src/pages/AnalysisLayout.tsx`, alongside the existing `import AnalysisTab from './AnalysisTab'` and `import ReportView from './ReportView'`, add:

```ts
import TreeTab from './TreeTab'
```

- [ ] **Step 3: Add the "Tree" nav button**

In `frontend/src/pages/AnalysisLayout.tsx`, in the `dashboard-tabs` block (currently containing the "Analysis" and "Report" buttons, around line 294-309), add a third button after "Report":

```tsx
<button
  type="button"
  className={`dashboard-tabs__tab${activeTab === 'tree' ? ' is-active' : ''}`}
  onClick={() => setActiveTab('tree')}
>
  Tree
</button>
```

- [ ] **Step 4: Render `TreeTab` in the tab content switch**

Change the existing line:

```tsx
<div className="dashboard-tabs__content">{activeTab === 'analysis' ? <AnalysisTab /> : <ReportView />}</div>
```

to:

```tsx
<div className="dashboard-tabs__content">
  {activeTab === 'analysis' ? <AnalysisTab /> : activeTab === 'report' ? <ReportView /> : <TreeTab />}
</div>
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual browser verification**

Run: `cd frontend && npm run dev`, open the app, drop in a PGN with some inaccuracies/mistakes/blunders (or wait for the cached game from a prior session to load), and check:
- A "Tree" tab appears next to "Analysis" and "Report" and switches content on click.
- The game tree shows one node per played move, evenly spaced, with a green branch appearing only at plies marked inaccuracy/mistake/blunder.
- The current ply's node is visually distinct and updates as you step through moves on the board.
- Hovering a branch node shows a mini chessboard of that hypothetical position; clicking it jumps the main board to the ply it branches from.
- The position-tree section shows the current ply's stored lines merging into a small tree that updates as you move through the game, with a working hover preview and click-to-jump.

Expected: all of the above work with no console errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/context/AnalysisContext.ts frontend/src/pages/AnalysisLayout.tsx
git commit -m "feat: wire the Tree tab into the analysis dashboard"
```
