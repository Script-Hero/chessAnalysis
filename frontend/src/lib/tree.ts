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

/** The current position's up-to-3 stored candidate lines, merged into one tree. */
export function buildPositionTree(fen: string, lines: EngineLine[], maxPlies: number): LineTreeNode[] {
  return buildLineTree(
    fen,
    lines.map((l) => l.pv),
    maxPlies,
  )
}

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
