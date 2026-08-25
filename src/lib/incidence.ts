import { Chess, SQUARES } from 'chess.js'
import type { PieceSymbol, Square } from 'chess.js'
import type { Side } from './analysis'

/**
 * The board as a bipartite graph of pieces and the squares they control, and
 * the piece-piece projection of it.
 *
 * Betweenness over a piece-to-piece attack graph asks what flows along an
 * attack edge, and nothing does. The bipartite incidence graph has no such
 * problem: a piece is connected to the squares it controls, which is a relation
 * that exists, and two pieces are connected in the projection exactly to the
 * degree that they cover the same ground.
 *
 * The projection makes two things computable that players have words for but no
 * tool measures:
 *
 * - **Redundancy** — control a piece contributes that a teammate already
 *   supplied. High redundancy is over-protection: force committed to ground
 *   that was already held.
 * - **Structural holes** (Burt's constraint) — a piece whose coverage nobody
 *   duplicates spans a hole in the army's coverage. Low constraint means "that
 *   knight is doing all the work": remove it and a region of the board has no
 *   other claimant.
 *
 * Empty squares are nodes here, which matters — the contested ground, the
 * outposts and the open files are the battlefield, and a piece-only graph
 * leaves them out entirely.
 */

const CODE = { white: 'w', black: 'b' } as const

const FILES = 'abcdefgh'

/**
 * How much a square is worth holding.
 *
 * Unweighted coverage counts a1 the same as e5, which makes "controls the most
 * squares" a measure of how far a piece is from a corner. The weighting is
 * deliberately crude — centrality plus proximity to the enemy king — because a
 * finer one would smuggle an evaluation function into what is meant to be a
 * structural measure.
 */
function squareWeight(square: Square, enemyKing: Square | null): number {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1]) - 1
  const centrality = 1 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5)) / 7
  let weight = 0.5 + centrality

  if (enemyKing) {
    const kf = FILES.indexOf(enemyKing[0])
    const kr = Number(enemyKing[1]) - 1
    const distance = Math.max(Math.abs(file - kf), Math.abs(rank - kr))
    if (distance <= 2) weight += 1.2 - 0.4 * distance
  }
  return weight
}

export type PieceCoverage = {
  square: Square
  type: PieceSymbol
  color: Side
  /** Squares this piece controls. */
  controls: Square[]
  /** Squares it controls that no teammate also controls. */
  unique: Square[]
  /** Share of its coverage a teammate already supplied, 0-1. */
  redundancy: number
  /**
   * Burt's constraint over the own-side projection, 0-1. Low means the piece's
   * coverage is not duplicated and not routed around — it spans a structural
   * hole in the army's control.
   */
  constraint: number
  /**
   * Weighted unique coverage: the ground that goes uncontrolled the moment this
   * piece leaves. The direct answer to "which piece is doing all the work".
   */
  loadBearing: number
}

export type IncidenceSide = {
  side: Side
  pieces: PieceCoverage[]
  /** Distinct squares this side controls. */
  coverage: number
  /** Weighted coverage, on the same scale as `loadBearing`. */
  weightedCoverage: number
  /** Mean redundancy across the side's pieces. */
  redundancy: number
  /**
   * Concentration of load-bearing across the army, as a Gini coefficient.
   * Near 0, every piece carries a share; near 1, one piece carries the position
   * and the rest are passengers.
   */
  concentration: number
}

export type IncidenceGraph = {
  white: IncidenceSide
  black: IncidenceSide
  /** Which pieces control each square, for overlays and for the null model. */
  controlledBy: Map<Square, Square[]>
}

export function buildIncidence(fen: string): IncidenceGraph {
  let chess: Chess
  try {
    chess = new Chess(fen, { skipValidation: true })
  } catch {
    return {
      white: emptySide('white'),
      black: emptySide('black'),
      controlledBy: new Map(),
    }
  }

  const kings: Record<Side, Square | null> = { white: null, black: null }
  for (const row of chess.board()) {
    for (const cell of row) {
      if (cell?.type === 'k') kings[cell.color === 'w' ? 'white' : 'black'] = cell.square
    }
  }

  const controlledBy = new Map<Square, Square[]>()
  const controls: Record<Side, Map<Square, Square[]>> = { white: new Map(), black: new Map() }

  for (const square of SQUARES) {
    const here: Square[] = []
    for (const side of ['white', 'black'] as Side[]) {
      for (const from of chess.attackers(square, CODE[side])) {
        if (from === square) continue
        here.push(from)
        if (!controls[side].has(from)) controls[side].set(from, [])
        controls[side].get(from)!.push(square)
      }
    }
    if (here.length) controlledBy.set(square, here)
  }

  return {
    white: buildSide(chess, 'white', controls.white, kings.black),
    black: buildSide(chess, 'black', controls.black, kings.white),
    controlledBy,
  }
}

function emptySide(side: Side): IncidenceSide {
  return { side, pieces: [], coverage: 0, weightedCoverage: 0, redundancy: 0, concentration: 0 }
}

function buildSide(
  chess: Chess,
  side: Side,
  controls: Map<Square, Square[]>,
  enemyKing: Square | null,
): IncidenceSide {
  const squares = [...controls.keys()]
  if (squares.length === 0) return emptySide(side)

  // How many of this side's pieces control each square — the projection's
  // shared-ground counts come straight off this.
  const coverCount = new Map<Square, number>()
  for (const list of controls.values()) {
    for (const s of list) coverCount.set(s, (coverCount.get(s) ?? 0) + 1)
  }

  const overlap = new Map<string, number>()
  for (const [square, list] of controls) {
    const set = new Set(list)
    for (const other of squares) {
      if (other === square) continue
      let shared = 0
      for (const s of controls.get(other) ?? []) if (set.has(s)) shared++
      if (shared > 0) overlap.set(`${square}|${other}`, shared)
    }
  }

  const proportion = new Map<string, number>()
  for (const square of squares) {
    let total = 0
    for (const other of squares) total += overlap.get(`${square}|${other}`) ?? 0
    if (total === 0) continue
    for (const other of squares) {
      const w = overlap.get(`${square}|${other}`) ?? 0
      if (w > 0) proportion.set(`${square}|${other}`, w / total)
    }
  }

  const pieces: PieceCoverage[] = []
  for (const square of squares) {
    const piece = chess.get(square)
    if (!piece) continue
    const list = controls.get(square) ?? []
    const unique = list.filter((s) => (coverCount.get(s) ?? 0) === 1)

    // Burt's constraint: direct investment in each contact plus investment
    // routed through shared contacts, squared and summed.
    let constraint = 0
    for (const other of squares) {
      if (other === square) continue
      const direct = proportion.get(`${square}|${other}`) ?? 0
      let indirect = 0
      for (const via of squares) {
        if (via === square || via === other) continue
        indirect += (proportion.get(`${square}|${via}`) ?? 0) * (proportion.get(`${via}|${other}`) ?? 0)
      }
      const total = direct + indirect
      if (total > 0) constraint += total * total
    }

    pieces.push({
      square,
      type: piece.type,
      color: side,
      controls: list,
      unique,
      redundancy: list.length ? 1 - unique.length / list.length : 0,
      constraint: Math.min(1, constraint),
      loadBearing: unique.reduce((sum, s) => sum + squareWeight(s, enemyKing), 0),
    })
  }

  pieces.sort((a, b) => b.loadBearing - a.loadBearing)

  const covered = new Set<Square>()
  for (const list of controls.values()) for (const s of list) covered.add(s)
  const weightedCoverage = [...covered].reduce((sum, s) => sum + squareWeight(s, enemyKing), 0)

  return {
    side,
    pieces,
    coverage: covered.size,
    weightedCoverage,
    redundancy: pieces.length ? pieces.reduce((sum, p) => sum + p.redundancy, 0) / pieces.length : 0,
    concentration: gini(pieces.map((p) => p.loadBearing)),
  }
}

/** Gini coefficient of a non-negative list. 0 = perfectly even, 1 = all in one place. */
function gini(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const total = sorted.reduce((a, b) => a + b, 0)
  if (total <= 0) return 0
  let weighted = 0
  for (let i = 0; i < n; i++) weighted += (i + 1) * sorted[i]
  return (2 * weighted) / (n * total) - (n + 1) / n
}

/** Weighted coverage of one side, exposed as a bare statistic for the null model. */
export function coverageStatistic(side: Side): (fen: string) => number {
  return (fen: string) => buildIncidence(fen)[side].weightedCoverage
}

/** Load-bearing concentration of one side, as a bare statistic for the null model. */
export function concentrationStatistic(side: Side): (fen: string) => number {
  return (fen: string) => buildIncidence(fen)[side].concentration
}
