import { Chess } from 'chess.js'
import type { PieceSymbol, Square } from 'chess.js'
import { buildIncidence } from './incidence'
import type { Side } from './analysis'

/**
 * How fast one side's control of the board collapses as its pieces are removed.
 *
 * "Which piece is load-bearing" can be answered by definition (see
 * `incidence.ts`) or by experiment, and the experiment is stronger because it
 * carries its own null model: remove pieces in the worst possible order, remove
 * them at random, and compare the two curves. If targeted removal is barely
 * worse than random, the army's control is distributed and no single capture or
 * trade changes much. If the targeted curve falls off a cliff, the position is
 * being held up by one or two pieces and the opponent has a plan.
 *
 * This is site percolation on the piece-square incidence graph, and the gap
 * between the two curves is the part a player can act on — it says whether to
 * look for a target at all.
 */

const REMOVAL_SAMPLES = 10

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function withoutPieces(fen: string, removed: Square[]): string | null {
  try {
    const chess = new Chess(fen, { skipValidation: true })
    for (const square of removed) chess.remove(square)
    return chess.fen()
  } catch {
    return null
  }
}

function health(fen: string, side: Side): number {
  return buildIncidence(fen)[side].weightedCoverage
}

export type RemovalStep = {
  /** Pieces removed so far. */
  removed: number
  /** Share of the side's original weighted control still standing, 0-1. */
  retained: number
}

export type PieceCriticality = {
  square: Square
  type: PieceSymbol
  /** Share of the side's control lost by removing this one piece, 0-1. */
  impact: number
  /** Standard deviations above the mean single-piece impact for this side. */
  z: number | null
}

export type Percolation = {
  side: Side
  /** Worst-case removal order, greedy by realised damage at each step. */
  targeted: RemovalStep[]
  /** Mean of `REMOVAL_SAMPLES` random removal orders. */
  random: RemovalStep[]
  /**
   * 1 - area under the targeted curve. How quickly control collapses when the
   * opponent takes the right pieces. Higher is more fragile.
   */
  fragility: number
  /**
   * Area between the random and targeted curves. This is the part that is about
   * *structure* rather than about material: it is how much better than chance
   * an opponent does by choosing targets, and it is near zero for a position
   * whose control is genuinely distributed.
   */
  concentration: number
  /** Per-piece single-removal impact, worst first. */
  criticality: PieceCriticality[]
}

const CODE = { white: 'w', black: 'b' } as const

export function percolate(fen: string, side: Side, samples = REMOVAL_SAMPLES): Percolation {
  const empty: Percolation = {
    side,
    targeted: [],
    random: [],
    fragility: 0,
    concentration: 0,
    criticality: [],
  }

  let chess: Chess
  try {
    chess = new Chess(fen, { skipValidation: true })
  } catch {
    return empty
  }

  const own = CODE[side]
  const pieces: { square: Square; type: PieceSymbol }[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      // The king is never removable, so including it would put a step in every
      // curve that no opponent can ever take.
      if (cell && cell.color === own && cell.type !== 'k') {
        pieces.push({ square: cell.square, type: cell.type })
      }
    }
  }

  const base = health(fen, side)
  if (pieces.length === 0 || base <= 0) return empty

  // Single-piece impacts double as the greedy heuristic and as the per-piece
  // readout, so they are computed once and reused for both.
  const impacts = new Map<Square, number>()
  for (const piece of pieces) {
    const stripped = withoutPieces(fen, [piece.square])
    impacts.set(piece.square, stripped ? 1 - health(stripped, side) / base : 0)
  }

  const mean = [...impacts.values()].reduce((a, b) => a + b, 0) / impacts.size
  const sd = Math.sqrt(
    [...impacts.values()].reduce((sum, v) => sum + (v - mean) ** 2, 0) / impacts.size,
  )

  const criticality: PieceCriticality[] = pieces
    .map((piece) => ({
      square: piece.square,
      type: piece.type,
      impact: impacts.get(piece.square) ?? 0,
      z: sd > 1e-9 ? ((impacts.get(piece.square) ?? 0) - mean) / sd : null,
    }))
    .sort((a, b) => b.impact - a.impact)

  // Greedy targeted order. Recomputing the full impact of every remaining piece
  // at every step is quadratic and not worth it here: after the first removal
  // the ordering barely changes, and the curve is being read for its shape.
  const order = criticality.map((c) => c.square)
  const targeted: RemovalStep[] = [{ removed: 0, retained: 1 }]
  for (let k = 1; k <= order.length; k++) {
    const stripped = withoutPieces(fen, order.slice(0, k))
    targeted.push({ removed: k, retained: stripped ? health(stripped, side) / base : 0 })
  }

  const randomTotals = new Array(pieces.length + 1).fill(0)
  const rng = mulberry32(hash(fen + side))
  for (let s = 0; s < samples; s++) {
    const shuffled = pieces.map((p) => p.square)
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    randomTotals[0] += 1
    for (let k = 1; k <= shuffled.length; k++) {
      const stripped = withoutPieces(fen, shuffled.slice(0, k))
      randomTotals[k] += stripped ? health(stripped, side) / base : 0
    }
  }
  const random: RemovalStep[] = randomTotals.map((total, k) => ({
    removed: k,
    retained: total / samples,
  }))

  const targetedArea = area(targeted)
  const randomArea = area(random)

  return {
    side,
    targeted,
    random,
    fragility: 1 - targetedArea,
    concentration: Math.max(0, randomArea - targetedArea),
    criticality,
  }
}

/** Trapezoidal area under a removal curve, normalized to [0,1]. */
function area(steps: RemovalStep[]): number {
  if (steps.length < 2) return 0
  let sum = 0
  for (let i = 1; i < steps.length; i++) {
    sum += (steps[i].retained + steps[i - 1].retained) / 2
  }
  return sum / (steps.length - 1)
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
