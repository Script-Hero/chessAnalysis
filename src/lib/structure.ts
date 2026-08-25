import type { Square } from 'chess.js'
import {
  buildPieceNetwork,
  coordinationOf,
  coordinationStatistic,
  influenceMap,
  kingSafety,
  trappedPieces,
} from './pieceGraph'
import type { InfluenceMap, KingSafety, PieceNetwork, TrappedPiece } from './pieceGraph'
import { buildIncidence, concentrationStatistic, coverageStatistic } from './incidence'
import type { IncidenceGraph } from './incidence'
import { defenceFlow } from './flow'
import type { DefenceFlow } from './flow'
import { looseMaterial } from './see'
import type { Loose } from './see'
import { percolate } from './percolation'
import type { Percolation } from './percolation'
import { scoreAgainstNull } from './nullModel'
import type { Scored } from './nullModel'
import type { Side } from './analysis'

/**
 * Everything the app knows about the structure of one position, assembled once.
 *
 * Each part is a different graph over the same board, and they are kept
 * together because the interesting statements are the joins between them: a
 * piece that is load-bearing in the incidence graph *and* a min-cut defender in
 * the flow network is a piece the opponent should be trying to trade, and
 * neither graph says that alone.
 *
 * Every scalar here arrives as a `Scored` — value, null-model mean, z — rather
 * than as a bare number, because a bare number is what made the previous
 * version of these panels unreadable.
 */

const SIDES: Side[] = ['white', 'black']

export type PositionStructure = {
  fen: string
  network: PieceNetwork
  influence: InfluenceMap
  incidence: IncidenceGraph
  flow: Record<Side, DefenceFlow>
  king: Record<Side, KingSafety>
  trapped: Record<Side, TrappedPiece[]>
  /** Material either side can win by exchange right now. */
  loose: Loose[]
  coordination: Record<Side, Scored>
  /** Weighted control of the board, against what this material usually holds. */
  coverage: Record<Side, Scored>
  /** How concentrated the side's control is in a few pieces. */
  concentration: Record<Side, Scored>
  /** Load-bearing weight per occupied square, normalized to [0,1] for overlays. */
  loadBearing: Map<Square, number>
}

export function analyzeStructure(fen: string): PositionStructure {
  const network = buildPieceNetwork(fen)
  const incidence = buildIncidence(fen)

  const bySide = <T,>(build: (side: Side) => T): Record<Side, T> => ({
    white: build('white'),
    black: build('black'),
  })

  // Load-bearing is normalized across both armies together, so the overlay
  // compares White's pieces against Black's rather than shading each side
  // against its own maximum and implying a parity that isn't there.
  const loadBearing = new Map<Square, number>()
  let peak = 0
  for (const side of SIDES) {
    for (const piece of incidence[side].pieces) peak = Math.max(peak, piece.loadBearing)
  }
  for (const side of SIDES) {
    for (const piece of incidence[side].pieces) {
      loadBearing.set(piece.square, peak > 0 ? piece.loadBearing / peak : 0)
    }
  }

  return {
    fen,
    network,
    influence: influenceMap(fen),
    incidence,
    loadBearing,
    flow: bySide((side) => defenceFlow(fen, side)),
    king: bySide((side) => kingSafety(fen, network, side)),
    trapped: bySide((side) => trappedPieces(network, side)),
    loose: looseMaterial(fen),
    coordination: bySide((side) =>
      scoreAgainstNull(`coordination-${side}`, fen, coordinationStatistic(side)),
    ),
    coverage: bySide((side) => scoreAgainstNull(`coverage-${side}`, fen, coverageStatistic(side))),
    concentration: bySide((side) =>
      scoreAgainstNull(`concentration-${side}`, fen, concentrationStatistic(side)),
    ),
  }
}

/**
 * Coordination for a whole game, cheaply — the series form of the same measure.
 *
 * Uses the FEN-only path rather than the full network builder: the builder runs
 * an exchange evaluation per destination square, which is worth it for one
 * position on screen and not for eighty.
 */
export function coordinationSeries(positions: string[]): { white: number; black: number }[] {
  return positions.map((fen) => ({
    white: coordinationOf(fen, 'white'),
    black: coordinationOf(fen, 'black'),
  }))
}

export type Robustness = Record<Side, Percolation>

/**
 * Percolation curves for both sides.
 *
 * Kept out of `analyzeStructure` because it is the one measure here that costs
 * real time — it rebuilds the incidence graph a few hundred times — and it is
 * only ever wanted for the position on screen.
 */
export function analyzeRobustness(fen: string): Robustness {
  return { white: percolate(fen, 'white'), black: percolate(fen, 'black') }
}
