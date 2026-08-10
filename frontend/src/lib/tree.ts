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
