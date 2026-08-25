import { Chess } from 'chess.js'
import { SQUARES } from 'chess.js'
import type { Side } from './analysis'

/**
 * The game as one temporal network rather than as eighty separate graphs.
 *
 * Every structural measure elsewhere is computed fresh per position and then
 * plotted as a series, which throws away the only thing that makes a sequence
 * of graphs more than a sequence of numbers: the correspondence between them.
 * Whether a relation *persisted* is not recoverable from two connectivity
 * values, and it is the part a player can act on — a position reorganises when
 * a large share of its attack-and-defence relations are replaced at once, and
 * that is a different event from the evaluation moving.
 *
 * Two quantities come out of keeping the correspondence:
 *
 * - **Churn**, the Jaccard distance between consecutive edge sets. A normal
 *   move replaces the mover's own relations and leaves the rest standing.
 * - **Change points**, plies whose churn is far above the game's own running
 *   baseline. These mark where the position's structure was rebuilt, which is
 *   usually several moves before an eval graph registers anything.
 *
 * Tie lifetimes fall out of the same bookkeeping: the relations that survived
 * the whole game are the position's skeleton, whatever the pieces were doing.
 */

/** Plies of history the running baseline is measured over. */
const BASELINE_WINDOW = 8

/** Churn this many standard deviations above the running baseline is a change point. */
const CHANGE_Z = 1.8

export type TemporalPoint = {
  index: number
  ply: number
  /** Relations present in this position. */
  edges: number
  /** Jaccard distance from the previous position's relations, 0-1. */
  churn: number
  /** Relations that survived from the previous position. */
  kept: number
  formed: number
  broken: number
  /** Churn's z-score against the trailing window. Null until the window fills. */
  z: number | null
}

export type ChangePoint = {
  index: number
  ply: number
  churn: number
  z: number
  /** Relations rebuilt at this ply. */
  formed: number
  broken: number
}

export type Tie = {
  from: string
  to: string
  kind: 'attack' | 'defend'
  /** Consecutive plies the relation held. */
  span: number
  startPly: number
  endPly: number
}

export type TemporalSeries = {
  side: Side | 'both'
  points: TemporalPoint[]
  changePoints: ChangePoint[]
  meanChurn: number
  /**
   * Median tie lifetime, in plies. A position whose relations turn over every
   * two plies is a different kind of game from one whose skeleton stands for
   * twenty, and neither shows up in an evaluation.
   */
  medianTieLife: number
  /** The longest-standing relations — the game's structural skeleton. */
  skeleton: Tie[]
}

/**
 * The position's relations, read straight off `attackers()`.
 *
 * Deliberately not routed through `buildPieceNetwork`: that builder runs an
 * exchange evaluation for every destination of every piece, which is the right
 * cost for one position on screen and roughly five hundred milliseconds when
 * paid once per ply across a whole game. Only the edge set matters here.
 */
function edgeSetOf(fen: string, side: Side | 'both'): Set<string> {
  const set = new Set<string>()
  let chess: Chess
  try {
    chess = new Chess(fen, { skipValidation: true })
  } catch {
    return set
  }

  for (const square of SQUARES) {
    const occupant = chess.get(square)
    if (!occupant) continue
    for (const code of ['w', 'b'] as const) {
      for (const from of chess.attackers(square, code)) {
        if (from === square) continue
        if (side !== 'both' && (code === 'w') !== (side === 'white')) continue
        const kind = code === occupant.color ? 'defend' : 'attack'
        set.add(`${from}>${square}:${kind}`)
      }
    }
  }
  return set
}

export function analyzeTemporal(positions: string[], side: Side | 'both' = 'both'): TemporalSeries {
  const sets = positions.map((fen) => edgeSetOf(fen, side))
  const points: TemporalPoint[] = []

  // Open tie ledger: each live relation remembers the ply it formed at, so a
  // lifetime is recorded when the relation ends rather than reconstructed after.
  const open = new Map<string, number>()
  const ties: Tie[] = []

  sets.forEach((set, i) => {
    if (i > 0) {
      const previous = sets[i - 1]
      let kept = 0
      for (const edge of set) if (previous.has(edge)) kept++
      const union = previous.size + set.size - kept
      points.push({
        index: i,
        ply: i,
        edges: set.size,
        churn: union > 0 ? 1 - kept / union : 0,
        kept,
        formed: set.size - kept,
        broken: previous.size - kept,
        z: null,
      })
    }

    for (const edge of set) if (!open.has(edge)) open.set(edge, i)
    for (const [edge, start] of [...open]) {
      if (set.has(edge)) continue
      open.delete(edge)
      ties.push({ ...parseEdge(edge), span: i - start, startPly: start, endPly: i - 1 })
    }
  })

  for (const [edge, start] of open) {
    ties.push({
      ...parseEdge(edge),
      span: positions.length - start,
      startPly: start,
      endPly: positions.length - 1,
    })
  }

  // Trailing-window z-scores. A global baseline would let one violent middlegame
  // suppress every change point in a quiet endgame; the running one asks
  // whether this ply was unusual for *this stretch of this game*.
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - BASELINE_WINDOW), i).map((p) => p.churn)
    if (window.length < 4) continue
    const mean = window.reduce((a, b) => a + b, 0) / window.length
    const sd = Math.sqrt(window.reduce((sum, v) => sum + (v - mean) ** 2, 0) / window.length)
    points[i].z = sd > 1e-6 ? (points[i].churn - mean) / sd : null
  }

  const changePoints: ChangePoint[] = points
    .filter((p) => p.z !== null && p.z >= CHANGE_Z)
    .map((p) => ({ index: p.index, ply: p.ply, churn: p.churn, z: p.z!, formed: p.formed, broken: p.broken }))

  const spans = ties.map((t) => t.span).sort((a, b) => a - b)

  return {
    side,
    points,
    changePoints,
    meanChurn: points.length ? points.reduce((sum, p) => sum + p.churn, 0) / points.length : 0,
    medianTieLife: spans.length ? spans[Math.floor(spans.length / 2)] : 0,
    skeleton: ties.sort((a, b) => b.span - a.span).slice(0, 8),
  }
}

function parseEdge(id: string): { from: string; to: string; kind: 'attack' | 'defend' } {
  const [pair, kind] = id.split(':')
  const [from, to] = pair.split('>')
  return { from, to, kind: kind as 'attack' | 'defend' }
}
