import { Chess, type PieceSymbol } from 'chess.js'
import type { Side } from './analysis'
import type { ParsedGame } from './pgn'

/**
 * Which piece made each move, followed through the game by identity.
 *
 * Players remember "my knight wandered" long before they remember move numbers,
 * so the timeline can give every piece its own lane. A piece is named by the
 * square it started on and followed square to square; pawns share one lane,
 * because eight pawn lanes would bury the pieces that actually tell a story.
 */
export type PieceLane = {
  id: string
  side: Side
  kind: PieceSymbol
  label: string
  /** Move indices this piece made, in game order. */
  moves: number[]
}

const NAME: Record<PieceSymbol, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }
const KIND_ORDER: PieceSymbol[] = ['k', 'q', 'r', 'b', 'n', 'p']

export function trackPieces(game: ParsedGame): PieceLane[] {
  const lanes = new Map<string, PieceLane>()
  const at = new Map<string, string>()
  const lane = (id: string, side: Side, kind: PieceSymbol, label: string) => {
    if (!lanes.has(id)) lanes.set(id, { id, side, kind, label, moves: [] })
    return id
  }

  const start = new Chess(game.positions[0])
  for (const row of start.board()) {
    for (const piece of row) {
      if (!piece) continue
      const side: Side = piece.color === 'w' ? 'white' : 'black'
      const id =
        piece.type === 'p'
          ? lane(`${side}-pawns`, side, 'p', 'Pawns')
          : lane(`${side}-${piece.square}`, side, piece.type, piece.type === 'k' ? 'King' : `${piece.square} ${NAME[piece.type]}`)
      at.set(piece.square, id)
    }
  }

  game.moves.forEach((m, i) => {
    let move
    try {
      move = new Chess(game.positions[i]).move({ from: m.from, to: m.to, promotion: m.promotion ?? undefined })
    } catch {
      return
    }
    const side: Side = move.color === 'w' ? 'white' : 'black'
    const id = at.get(m.from)
    if (id) lanes.get(id)!.moves.push(i)

    if (move.isEnPassant()) at.delete(m.to[0] + m.from[1])
    at.delete(m.from)
    const next = move.promotion ? lane(`${side}-promo-${i}`, side, move.promotion, `${NAME[move.promotion]} (promoted ${m.to})`) : id
    if (next) at.set(m.to, next)
    else at.delete(m.to)

    if (move.isKingsideCastle() || move.isQueensideCastle()) {
      const rank = m.from[1]
      const [rookFrom, rookTo] = move.isKingsideCastle() ? [`h${rank}`, `f${rank}`] : [`a${rank}`, `d${rank}`]
      const rook = at.get(rookFrom)
      if (rook) {
        lanes.get(rook)!.moves.push(i)
        at.delete(rookFrom)
        at.set(rookTo, rook)
      }
    }
  })

  // Pieces in the usual order, promoted pieces after the originals, pawns last.
  const rank = (l: PieceLane) => (l.kind === 'p' ? 99 : l.id.includes('-promo-') ? 50 : KIND_ORDER.indexOf(l.kind))
  return [...lanes.values()]
    .filter((l) => l.moves.length > 0)
    .sort((a, b) => (a.side === b.side ? 0 : a.side === 'white' ? -1 : 1) || rank(a) - rank(b) || a.moves[0] - b.moves[0])
}
