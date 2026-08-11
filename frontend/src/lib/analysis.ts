import type { ParsedMove } from './pgn'
import type { MoveClassification, MoveJudgment } from './stockfish'

export type Side = 'white' | 'black'

export function moverOf(moveIndex: number): Side {
  return moveIndex % 2 === 0 ? 'white' : 'black'
}

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

// Lichess's win%-loss-to-accuracy curve: forgiving near 0% loss, punishing climbs fast after.
function accuracyFromMeanLoss(meanLossPct: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * meanLossPct) - 3.1669
  return Math.max(0, Math.min(100, raw))
}

function emptyTally(): Record<MoveClassification, number> {
  return { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }
}

export type PlayerAccuracy = {
  accuracy: number | null
  moveCount: number
  tally: Record<MoveClassification, number>
}

export type AccuracySummary = Record<Side, PlayerAccuracy>

export function computeAccuracy(judgments: (MoveJudgment | null)[]): AccuracySummary {
  const acc: Record<Side, { lossSum: number; count: number; tally: Record<MoveClassification, number> }> = {
    white: { lossSum: 0, count: 0, tally: emptyTally() },
    black: { lossSum: 0, count: 0, tally: emptyTally() },
  }

  judgments.forEach((j, i) => {
    if (!j) return
    const side = acc[moverOf(i)]
    side.lossSum += j.rawLossPct
    side.count += 1
    side.tally[j.classification] += 1
  })

  const build = (side: (typeof acc)['white']): PlayerAccuracy => ({
    accuracy: side.count ? accuracyFromMeanLoss(side.lossSum / side.count) : null,
    moveCount: side.count,
    tally: side.tally,
  })

  return { white: build(acc.white), black: build(acc.black) }
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

/** White material minus Black material, in pawns. */
export function materialBalance(fen: string): number {
  const board = fen.split(' ')[0]
  let balance = 0
  for (const ch of board) {
    const lower = ch.toLowerCase()
    const value = PIECE_VALUES[lower]
    if (value === undefined) continue
    balance += ch === lower ? -value : value
  }
  return balance
}

export type Phase = 'opening' | 'middlegame' | 'endgame'

const OPENING_PLY_CUTOFF = 20
const ENDGAME_NON_PAWN_MATERIAL = 14 // combined both sides; roughly two rooks + a minor or less

export function classifyPhase(fen: string, ply: number): Phase {
  if (ply <= OPENING_PLY_CUTOFF) return 'opening'

  const board = fen.split(' ')[0]
  let nonPawnMaterial = 0
  for (const ch of board) {
    const lower = ch.toLowerCase()
    if (lower === 'n' || lower === 'b' || lower === 'r' || lower === 'q') {
      nonPawnMaterial += PIECE_VALUES[lower]
    }
  }
  return nonPawnMaterial <= ENDGAME_NON_PAWN_MATERIAL ? 'endgame' : 'middlegame'
}

export type PhaseAccuracy = Record<Phase, Record<Side, number | null>>

export function computePhaseAccuracy(positions: string[], judgments: (MoveJudgment | null)[]): PhaseAccuracy {
  const buckets: Record<Phase, Record<Side, number[]>> = {
    opening: { white: [], black: [] },
    middlegame: { white: [], black: [] },
    endgame: { white: [], black: [] },
  }

  judgments.forEach((j, i) => {
    if (!j) return
    const phase = classifyPhase(positions[i], i + 1)
    buckets[phase][moverOf(i)].push(j.rawLossPct)
  })

  const toAccuracy = (losses: number[]) =>
    losses.length ? accuracyFromMeanLoss(losses.reduce((a, b) => a + b, 0) / losses.length) : null

  return {
    opening: { white: toAccuracy(buckets.opening.white), black: toAccuracy(buckets.opening.black) },
    middlegame: { white: toAccuracy(buckets.middlegame.white), black: toAccuracy(buckets.middlegame.black) },
    endgame: { white: toAccuracy(buckets.endgame.white), black: toAccuracy(buckets.endgame.black) },
  }
}

export type CriticalMoment = {
  ply: number
  san: string
  mover: Side
  judgment: MoveJudgment
}

const CRITICAL_CLASSIFICATIONS = new Set<MoveClassification>(['mistake', 'blunder'])

export function findCriticalMoments(moves: ParsedMove[], judgments: (MoveJudgment | null)[]): CriticalMoment[] {
  const moments: CriticalMoment[] = []
  judgments.forEach((j, i) => {
    if (!j || !CRITICAL_CLASSIFICATIONS.has(j.classification)) return
    moments.push({ ply: i + 1, san: moves[i].san, mover: moverOf(i), judgment: j })
  })
  return moments
}

export function hasClockData(moves: ParsedMove[]): boolean {
  return moves.length > 0 && moves.every((m) => m.clockSeconds !== null)
}
