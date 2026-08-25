import { Chess } from 'chess.js'
import type { Color, PieceSymbol, Square } from 'chess.js'
import type { Side } from './analysis'

/**
 * Static exchange evaluation.
 *
 * Every "is this piece safe" question in the app used to be answered by
 * comparing attacker and defender *counts*, which calls a queen defended by a
 * pawn and attacked by a knight safe. Counting is the wrong operation: the
 * exchange is a sequence, each side takes with its least valuable attacker
 * first, either side may stop when continuing loses material, and removing a
 * piece from the board can reveal an x-ray attacker that was never in the
 * count at all.
 *
 * The swap-off here is run on a real board, so discovered attackers and
 * batteries fall out for free rather than needing a special case.
 */

export const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3.25,
  r: 5,
  q: 9,
  // Not a real value — it exists so the king sorts last as a capturer and is
  // never chosen while a cheaper attacker remains.
  k: 1000,
}

const CODE_OF: Record<Side, Color> = { white: 'w', black: 'b' }
const OTHER: Record<Color, Color> = { w: 'b', b: 'w' }

/**
 * Material the side to capture wins by initiating the exchange on `square`,
 * in pawns. Zero when starting it wins nothing — the exchange is optional, so
 * a losing capture is simply declined.
 */
function swapOff(chess: Chess, square: Square, capturing: Color, depth: number): number {
  // 32 captures on one square is already impossible; the bound only exists so a
  // pathological board can't spin.
  if (depth > 32) return 0

  const victim = chess.get(square)
  if (!victim) return 0

  const attackers = chess.attackers(square, capturing).filter((from) => from !== square)
  if (attackers.length === 0) return 0

  // Least valuable attacker first: taking with the cheapest piece is what makes
  // the sequence an exchange rather than an arbitrary trade order.
  let best: Square | null = null
  let bestValue = Infinity
  for (const from of attackers) {
    const piece = chess.get(from)
    if (!piece) continue
    const value = PIECE_VALUE[piece.type]
    if (value < bestValue) {
      bestValue = value
      best = from
    }
  }
  if (!best) return 0

  const attacker = chess.get(best)!
  chess.remove(best)
  chess.remove(square)
  chess.put({ type: attacker.type, color: attacker.color }, square)

  let gain: number
  if (attacker.type === 'k' && chess.attackers(square, OTHER[capturing]).length > 0) {
    // The king may not capture into a defended square, so this branch of the
    // exchange does not exist. Treated as unavailable rather than as losing.
    gain = -Infinity
  } else {
    gain = PIECE_VALUE[victim.type] - swapOff(chess, square, OTHER[capturing], depth + 1)
  }

  chess.remove(square)
  chess.put({ type: victim.type, color: victim.color }, square)
  chess.put({ type: attacker.type, color: attacker.color }, best)

  return gain === -Infinity ? 0 : Math.max(0, gain)
}

/** Material `side` wins by starting an exchange on `square`, in pawns. */
export function captureGain(fen: string, square: Square, side: Side): number {
  let chess: Chess
  try {
    chess = new Chess(fen, { skipValidation: true })
  } catch {
    return 0
  }
  return swapOff(chess, square, CODE_OF[side], 0)
}

/**
 * Static exchange evaluation of one specific capture, in pawns, from the
 * capturing side's point of view. Negative means the capture loses material.
 */
export function see(fen: string, from: Square, to: Square): number {
  let chess: Chess
  try {
    chess = new Chess(fen, { skipValidation: true })
  } catch {
    return 0
  }
  const attacker = chess.get(from)
  const victim = chess.get(to)
  if (!attacker) return 0

  const victimValue = victim ? PIECE_VALUE[victim.type] : 0
  chess.remove(from)
  chess.remove(to)
  chess.put({ type: attacker.type, color: attacker.color }, to)
  return victimValue - swapOff(chess, to, OTHER[attacker.color], 0)
}

export type Loose = {
  square: Square
  type: PieceSymbol
  color: Side
  /** Material the opponent wins by taking here, in pawns. Always positive. */
  loss: number
}

/**
 * Pieces the opponent can profitably win right now, by exchange rather than by
 * attacker/defender count.
 *
 * This is deliberately a *static* claim — it ignores whose turn it is and
 * whether a counter-threat is bigger, because the question it answers is what
 * the position's structure permits, not what the engine would play.
 */
export function looseMaterial(fen: string): Loose[] {
  let chess: Chess
  try {
    chess = new Chess(fen, { skipValidation: true })
  } catch {
    return []
  }

  const out: Loose[] = []
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.type === 'k') continue
      const enemy: Side = cell.color === 'w' ? 'black' : 'white'
      const loss = captureGain(fen, cell.square, enemy)
      if (loss > 0.01) {
        out.push({
          square: cell.square,
          type: cell.type,
          color: cell.color === 'w' ? 'white' : 'black',
          loss,
        })
      }
    }
  }
  return out.sort((a, b) => b.loss - a.loss)
}
