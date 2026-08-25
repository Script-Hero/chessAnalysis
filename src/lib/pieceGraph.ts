import { Chess, SQUARES } from 'chess.js'
import type { Square, Color, PieceSymbol } from 'chess.js'
import { PIECE_VALUE, captureGain, see } from './see'
import type { Side } from './analysis'

/**
 * The board as a network of pieces.
 *
 * Nodes are occupied squares; a directed edge runs from every piece to every
 * square it bears on. Edges between opposite colours are attacks, edges within
 * a colour are defences.
 *
 * Two corrections matter here, because the earlier version of this module got
 * both wrong in ways that made its output unreliable rather than merely coarse:
 *
 * - **Safety is an exchange, not a count.** `attackers > defenders` calls a
 *   queen defended by a pawn and attacked by a knight safe. Every safety claim
 *   now runs a real swap-off (`see.ts`), so x-rays and piece values are in it.
 * - **Connectivity must be normalized.** The unnormalized Laplacian's second
 *   eigenvalue scales with degree and with the number of nodes, so comparing it
 *   across a game plots mostly how many pieces are left. The normalized
 *   Laplacian is comparable across positions, and even then it is only ever
 *   shown against a null model.
 */

export type EdgeKind = 'attack' | 'defend'

export type PieceNode = {
  square: Square
  type: PieceSymbol
  color: Side
  /** Squares this piece bears on. */
  out: Square[]
  /** Own pieces defending this one. */
  defenders: Square[]
  /** Enemy pieces attacking this one. */
  attackers: Square[]
  /** Legal destinations available to this piece right now, ignoring whose turn it is. */
  mobility: number
  /** Destinations it can reach without losing material to the exchange that follows. */
  safeMobility: number
  /** Material the opponent wins by taking here, by exchange. Zero when the piece is safe. */
  exchangeLoss: number
  /** The opponent can profitably win this piece as the position stands. */
  hanging: boolean
}

export type PieceEdge = { from: Square; to: Square; kind: EdgeKind }

export type PieceNetwork = {
  nodes: Map<Square, PieceNode>
  edges: PieceEdge[]
}

const COLOR_OF: Record<Color, Side> = { w: 'white', b: 'black' }
const CODE_OF: Record<Side, Color> = { white: 'w', black: 'b' }

/**
 * Legal destinations per piece, taken for both colours at once.
 *
 * `moves()` only ever reports the side to move, so the side without the move
 * would otherwise register as having zero mobility on every position. Flipping
 * the side-to-move field gives the other half; the result is pseudo-legal for
 * that side (it ignores whether they are in check), which is the correct notion
 * here — the question is what the piece bears on, not what it may play today.
 */
function movesBySquare(fen: string): Map<Square, { to: Square; from: Square }[]> {
  const out = new Map<Square, { to: Square; from: Square }[]>()
  for (const code of ['w', 'b'] as Color[]) {
    const parts = fen.split(' ')
    parts[1] = code
    // A stale en-passant square belongs to the other side's move and makes the
    // flipped FEN illegal, so it is cleared along with the side to move.
    parts[3] = '-'
    let chess: Chess
    try {
      chess = new Chess(parts.join(' '))
    } catch {
      continue
    }
    for (const move of chess.moves({ verbose: true })) {
      if (!out.has(move.from)) out.set(move.from, [])
      out.get(move.from)!.push({ from: move.from, to: move.to })
    }
  }
  return out
}

export function buildPieceNetwork(fen: string): PieceNetwork {
  const chess = new Chess(fen)
  const moves = movesBySquare(fen)
  const nodes = new Map<Square, PieceNode>()
  const edges: PieceEdge[] = []

  const occupied: { square: Square; type: PieceSymbol; color: Color }[] = []
  for (const square of SQUARES) {
    const piece = chess.get(square)
    if (piece) occupied.push({ square, type: piece.type, color: piece.color })
  }

  for (const { square, type, color } of occupied) {
    const side = COLOR_OF[color]
    const enemy: Side = side === 'white' ? 'black' : 'white'
    const destinations = moves.get(square) ?? []

    // A destination is safe when the exchange that follows the move does not
    // lose material. Counting raw legal moves instead is what made the old
    // "trapped" readout fire on every temporarily blocked bishop.
    let safeMobility = 0
    for (const move of destinations) {
      if (isSafeDestination(fen, move.from, move.to, type, enemy)) safeMobility++
    }

    const exchangeLoss = type === 'k' ? 0 : captureGain(fen, square, enemy)

    nodes.set(square, {
      square,
      type,
      color: side,
      out: [],
      defenders: [],
      attackers: [],
      mobility: destinations.length,
      safeMobility,
      exchangeLoss,
      hanging: exchangeLoss > 0.01,
    })
  }

  for (const { square, color } of occupied) {
    const node = nodes.get(square)!
    for (const code of ['w', 'b'] as Color[]) {
      for (const from of chess.attackers(square, code)) {
        if (from === square) continue
        const kind: EdgeKind = code === color ? 'defend' : 'attack'
        edges.push({ from, to: square, kind })
        nodes.get(from)?.out.push(square)
        if (kind === 'defend') node.defenders.push(from)
        else node.attackers.push(from)
      }
    }
  }

  return { nodes, edges }
}

/** Whether moving `from`→`to` leaves the piece standing after the exchange. */
function isSafeDestination(
  fen: string,
  from: Square,
  to: Square,
  type: PieceSymbol,
  enemy: Side,
): boolean {
  // A capture is judged by its own exchange value; a quiet move is judged by
  // what the piece is worth on the square it lands on.
  const exchange = see(fen, from, to)
  if (exchange < -0.01) return false

  try {
    const chess = new Chess(fen, { skipValidation: true })
    const piece = chess.get(from)
    if (!piece) return false
    chess.remove(from)
    chess.remove(to)
    chess.put({ type: piece.type, color: piece.color }, to)
    return captureGain(chess.fen(), to, enemy) < PIECE_VALUE[type] * 0.5
  } catch {
    return true
  }
}

/** Per-square control counts, for every square on the board including empty ones. */
export type InfluenceMap = Record<string, { white: number; black: number; net: number }>

export function influenceMap(fen: string): InfluenceMap {
  const chess = new Chess(fen, { skipValidation: true })
  const map: InfluenceMap = {}
  for (const square of SQUARES) {
    const white = chess.attackers(square, 'w').length
    const black = chess.attackers(square, 'b').length
    map[square] = { white, black, net: white - black }
  }
  return map
}

/**
 * Per-square change in net control between two positions.
 *
 * This is what a move actually did to the board, expressed as the thing the
 * move changed rather than as a centipawn number that reports only the
 * engine's verdict on it.
 */
export function influenceDelta(before: string, after: string): Record<string, number> {
  const a = influenceMap(before)
  const b = influenceMap(after)
  const delta: Record<string, number> = {}
  for (const square of SQUARES) delta[square] = b[square].net - a[square].net
  return delta
}

/**
 * Brandes betweenness over one side's mutual-defence graph, normalized to [0,1].
 *
 * Restricted to defence edges on purpose. The earlier version ran over attack
 * and defence edges pooled into one undirected graph, where a shortest path can
 * alternate defend→attack→defend and mean nothing — betweenness presumes
 * something travels along the edges, and nothing travels along an attack.
 * Support does chain: if a piece is captured, its defenders recapture and are
 * themselves exposed, so a path through the defence graph is a real sequence.
 */
export function supportBetweenness(network: PieceNetwork, side: Side): Map<Square, number> {
  const nodes = [...network.nodes.values()].filter((n) => n.color === side).map((n) => n.square)
  const adj = new Map<Square, Square[]>(nodes.map((n) => [n, []]))
  const seen = new Set<string>()
  for (const edge of network.edges) {
    if (edge.kind !== 'defend') continue
    if (!adj.has(edge.from) || !adj.has(edge.to)) continue
    const id = edge.from < edge.to ? `${edge.from}${edge.to}` : `${edge.to}${edge.from}`
    if (seen.has(id)) continue
    seen.add(id)
    adj.get(edge.from)!.push(edge.to)
    adj.get(edge.to)!.push(edge.from)
  }

  const score = new Map<Square, number>(nodes.map((n) => [n, 0]))

  for (const source of nodes) {
    const stack: Square[] = []
    const preds = new Map<Square, Square[]>(nodes.map((n) => [n, []]))
    const sigma = new Map<Square, number>(nodes.map((n) => [n, 0]))
    const dist = new Map<Square, number>(nodes.map((n) => [n, -1]))
    sigma.set(source, 1)
    dist.set(source, 0)

    const queue: Square[] = [source]
    while (queue.length) {
      const v = queue.shift()!
      stack.push(v)
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w)! < 0) {
          dist.set(w, dist.get(v)! + 1)
          queue.push(w)
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!)
          preds.get(w)!.push(v)
        }
      }
    }

    const delta = new Map<Square, number>(nodes.map((n) => [n, 0]))
    while (stack.length) {
      const w = stack.pop()!
      for (const v of preds.get(w)!) {
        delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!))
      }
      if (w !== source) score.set(w, score.get(w)! + delta.get(w)!)
    }
  }

  // Every unordered pair is traversed twice (once per source) on an undirected
  // graph, so the raw score is halved before the standard pair-count
  // normalization — without the halving, values run up to 2 instead of 1.
  const n = nodes.length
  const scale = n > 2 ? 1 / ((n - 1) * (n - 2)) : 1
  for (const [key, value] of score) score.set(key, value * scale)
  return score
}

export type KingSafety = {
  square: Square | null
  /** King square plus its eight neighbours, clipped to the board. */
  zone: Square[]
  attackerCount: number
  defenderCount: number
  /** Zone squares the enemy controls at least as heavily as the defender does. */
  contestedSquares: Square[]
  /** Escape squares the king can reach without being taken there. */
  flightSquares: number
}

export function kingSafety(fen: string, network: PieceNetwork, side: Side): KingSafety {
  const chess = new Chess(fen, { skipValidation: true })
  const kingNode = [...network.nodes.values()].find((n) => n.color === side && n.type === 'k')
  if (!kingNode) {
    return { square: null, zone: [], attackerCount: 0, defenderCount: 0, contestedSquares: [], flightSquares: 0 }
  }

  const zone = kingZone(kingNode.square)
  const own = CODE_OF[side]
  const enemy: Color = own === 'w' ? 'b' : 'w'

  let attackerCount = 0
  let defenderCount = 0
  const contested: Square[] = []
  for (const square of zone) {
    const attackers = chess.attackers(square, enemy).length
    const defenders = chess.attackers(square, own).length
    attackerCount += attackers
    defenderCount += defenders
    if (attackers > 0 && attackers >= defenders) contested.push(square)
  }

  return {
    square: kingNode.square,
    zone,
    attackerCount,
    defenderCount,
    contestedSquares: contested,
    flightSquares: kingNode.safeMobility,
  }
}

const FILES = 'abcdefgh'

function kingZone(square: Square): Square[] {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1])
  const zone: Square[] = []
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      const f = file + df
      const r = rank + dr
      if (f < 0 || f > 7 || r < 1 || r > 8) continue
      zone.push(`${FILES[f]}${r}` as Square)
    }
  }
  return zone
}

/**
 * Algebraic connectivity of one side's mutual-defence graph, over the
 * **normalized** Laplacian.
 *
 * The unnormalized version this replaced was not comparable between positions.
 * Its second eigenvalue scales with node degree and with node count, so a
 * sixteen-piece middlegame and a six-piece endgame produce numbers on different
 * scales and the resulting chart plotted, in effect, the material count. The
 * normalized Laplacian's spectrum lives in [0,2] regardless of size, which
 * makes the series mean the same thing at move 10 and move 60.
 *
 * It is still only interpretable next to a null model — see `nullModel.ts` —
 * because a pawn chain is highly connected for reasons that have nothing to do
 * with how well the pieces are working together.
 */
export function coordination(network: PieceNetwork, side: Side): number {
  const squares = [...network.nodes.values()].filter((n) => n.color === side).map((n) => n.square)
  const n = squares.length
  if (n < 2) return 0
  const index = new Map(squares.map((s, i) => [s, i]))

  const degree = new Array(n).fill(0)
  const adjacency: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  const seen = new Set<string>()
  for (const edge of network.edges) {
    if (edge.kind !== 'defend') continue
    const i = index.get(edge.from)
    const j = index.get(edge.to)
    if (i === undefined || j === undefined || i === j) continue
    const id = i < j ? `${i}-${j}` : `${j}-${i}`
    if (seen.has(id)) continue
    seen.add(id)
    adjacency[i][j] = 1
    adjacency[j][i] = 1
    degree[i] += 1
    degree[j] += 1
  }

  // L_norm = I - D^-1/2 A D^-1/2, with isolated nodes contributing a zero row
  // rather than a division by zero. Every isolated piece adds one more zero
  // eigenvalue, which is exactly right: it is a component of its own.
  return normalizedConnectivity(adjacency, degree)
}

/**
 * Coordination straight from a FEN, without building the full piece network.
 *
 * The full builder now runs an exchange evaluation per destination square,
 * which is the right thing for a position on screen and far too slow to run
 * across the dozens of random boards a null distribution needs. Only the
 * defence edges matter to this measure, and those come off `attackers()`
 * directly.
 */
export function coordinationOf(fen: string, side: Side): number {
  let chess: Chess
  try {
    chess = new Chess(fen, { skipValidation: true })
  } catch {
    return 0
  }
  const own = CODE_OF[side]
  const squares: Square[] = []
  for (const row of chess.board()) {
    for (const cell of row) if (cell && cell.color === own) squares.push(cell.square)
  }
  const n = squares.length
  if (n < 2) return 0

  const index = new Map(squares.map((s, i) => [s, i]))
  const degree = new Array(n).fill(0)
  const adjacency: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (const square of squares) {
    const j = index.get(square)!
    for (const from of chess.attackers(square, own)) {
      const i = index.get(from)
      if (i === undefined || i === j || adjacency[i][j]) continue
      adjacency[i][j] = 1
      adjacency[j][i] = 1
      degree[i] += 1
      degree[j] += 1
    }
  }

  return normalizedConnectivity(adjacency, degree)
}

/** Coordination as a bare function of a FEN, for null-model sampling. */
export function coordinationStatistic(side: Side): (fen: string) => number {
  return (fen: string) => coordinationOf(fen, side)
}

function normalizedConnectivity(adjacency: number[][], degree: number[]): number {
  const n = degree.length
  const laplacian: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
  for (let i = 0; i < n; i++) {
    laplacian[i][i] = degree[i] > 0 ? 1 : 0
    for (let j = 0; j < n; j++) {
      if (i === j || adjacency[i][j] === 0) continue
      laplacian[i][j] = -adjacency[i][j] / Math.sqrt(degree[i] * degree[j])
    }
  }
  const eigenvalues = symmetricEigenvalues(laplacian).sort((a, b) => a - b)
  return Math.max(0, eigenvalues[1] ?? 0)
}

/**
 * Jacobi eigenvalue iteration for a small symmetric matrix.
 *
 * The matrices here are at most 16x16 (one side's pieces), so the simplest
 * correct algorithm is also fast enough to run on every position change.
 */
function symmetricEigenvalues(input: number[][]): number[] {
  const n = input.length
  const a = input.map((row) => [...row])

  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j]
    if (off < 1e-12) break

    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c

        for (let k = 0; k < n; k++) {
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
      }
    }
  }

  return Array.from({ length: n }, (_, i) => a[i][i])
}

export type TrappedPiece = {
  square: Square
  type: PieceSymbol
  safeMobility: number
  mobility: number
  /** What it costs if the piece is simply lost where it stands. */
  exchangeLoss: number
}

/**
 * Pieces with nowhere safe to go.
 *
 * The test is on *safe* destinations, not legal ones: a bishop with nine legal
 * moves, every one of which drops it, is trapped, and a knight with one quiet
 * square is not. Counting legal moves — which is what this used to do — reports
 * the opposite of both.
 *
 * A piece with no legal moves at all is only trapped if something is coming for
 * it. Otherwise every rook in every starting position qualifies, which is how
 * the first version of this test managed to report five trapped white pieces
 * before a move had been played.
 */
export function trappedPieces(network: PieceNetwork, side: Side): TrappedPiece[] {
  return [...network.nodes.values()]
    .filter(
      (n) =>
        n.color === side &&
        n.type !== 'k' &&
        n.type !== 'p' &&
        n.safeMobility === 0 &&
        (n.mobility > 0 || n.attackers.length > 0),
    )
    .map((n) => ({
      square: n.square,
      type: n.type,
      safeMobility: n.safeMobility,
      mobility: n.mobility,
      exchangeLoss: n.exchangeLoss,
    }))
    .sort((a, b) => PIECE_VALUE[b.type] - PIECE_VALUE[a.type])
}
