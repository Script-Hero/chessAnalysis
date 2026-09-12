import { Chess } from 'chess.js'
import type { Move } from 'chess.js'
import { PIECE_VALUE } from './see'
import type { DagEdge, PositionDag } from './positionDag'

export type ReplayPosition = { fen: string; san: string; uci: string | null }
export const moveUci = (move: Move) => move.from + move.to + (move.promotion ?? '')

export function replayMoves(fen: string, moves: string[]): ReplayPosition[] {
  const chess = new Chess(fen)
  const result: ReplayPosition[] = [{ fen: chess.fen(), san: 'Start', uci: null }]
  for (const uci of moves) {
    const legal = chess.moves({ verbose: true }).find(move => moveUci(move) === uci)
    if (!legal) break
    chess.move(legal)
    result.push({ fen: chess.fen(), san: legal.san, uci })
  }
  return result
}

/** Illustrative legal swap-off, not a tactical search or the static SEE result. */
export function legalExchanges(fen: string) {
  return new Chess(fen).moves({ verbose: true }).filter(move => move.isCapture() || move.isEnPassant()).map(first => {
    const chess = new Chess(fen)
    const moves = [moveUci(first)]
    chess.move(first)
    for (let depth = 0; depth < 31; depth++) {
      const next = chess.moves({ verbose: true })
        .filter(move => move.to === first.to && move.isCapture())
        .sort((a, b) => PIECE_VALUE[a.piece] - PIECE_VALUE[b.piece] || (PIECE_VALUE[b.promotion ?? 'p'] - PIECE_VALUE[a.promotion ?? 'p']) || a.san.localeCompare(b.san))[0]
      if (!next) break
      moves.push(moveUci(next))
      chess.move(next)
    }
    return { san: first.san, target: first.to, moves, positions: replayMoves(fen, moves) }
  })
}

export function materialBalance(fen: string): number {
  return new Chess(fen).board().flat().reduce((sum, piece) =>
    sum + (!piece || piece.type === 'k' ? 0 : PIECE_VALUE[piece.type] * (piece.color === 'w' ? 1 : -1)), 0)
}

/** Simple root-to-join routes, excluding a prior visit to the join (repetition). */
export function convergingRoutes(dag: PositionDag, target: string): DagEdge[][] {
  if (target === dag.root) return []
  const outgoing = new Map<string, DagEdge[]>()
  for (const edge of dag.edges) {
    const list = outgoing.get(edge.from) ?? []
    list.push(edge)
    outgoing.set(edge.from, list)
  }
  const predecessors = new Map<string, DagEdge>()
  const visited = new Set([dag.root])
  const queue = [dag.root]
  for (let i = 0; i < queue.length; i++) {
    for (const edge of outgoing.get(queue[i]) ?? []) {
      if (edge.to === target || visited.has(edge.to)) continue
      visited.add(edge.to)
      predecessors.set(edge.to, edge)
      queue.push(edge.to)
    }
  }
  const routes: DagEdge[][] = []
  for (const incoming of dag.edges.filter(edge => edge.to === target)) {
    if (!visited.has(incoming.from)) continue
    const route = [incoming]
    let key = incoming.from
    while (key !== dag.root) {
      const edge = predecessors.get(key)!
      route.unshift(edge)
      key = edge.from
    }
    routes.push(route)
  }
  return routes
}

export function commonPrefixLength(routes: DagEdge[][]): number {
  if (routes.length < 2) return 0
  let index = 0
  while (routes.every(route => route[index]?.from === routes[0][index]?.from && route[index]?.uci === routes[0][index]?.uci && route[index] !== undefined)) index++
  return index
}
