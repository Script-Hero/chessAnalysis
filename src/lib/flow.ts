import { Chess } from 'chess.js'
import type { PieceSymbol, Square } from 'chess.js'
import { captureGain } from './see'
import type { Side } from './analysis'

/**
 * The defence of a position as a flow network.
 *
 * A single attacked piece needs no graph: count its attackers, count its
 * defenders, compare. The structure only appears when defenders are *shared* —
 * one rook holding two loose pieces supplies one unit of defence, not two, and
 * whether the position holds is then a question about a bipartite graph rather
 * than about any one square.
 *
 * That question is Hall's condition, and its constructive form is max-flow:
 *
 *   source → defender      capacity 1   (a piece can be spent once)
 *   defender → target      capacity 1   (it defends that piece)
 *   target → sink          capacity k   (k enemy attackers must each be answered)
 *
 * When the max flow is short of the total demand, the defence is
 * over-subscribed: no assignment of defenders covers everything, and the
 * targets left on the source side of the residual cut are the ones that fall.
 * The classical overload motif is the special case of this with two targets and
 * one defender.
 *
 * Deflection targets are found by counterfactual rather than by reading the min
 * cut directly. Residual reachability marks every defender currently carrying a
 * unit, so a perfectly sound defence would report all of its defenders as
 * bottlenecks; re-solving the flow without each defender in turn asks the
 * question that was actually meant — would removing this piece break the
 * defence — and on graphs this small it costs nothing.
 */

type FlowEdge = { to: number; cap: number; flow: number; rev: number }

class FlowGraph {
  adj: FlowEdge[][]

  constructor(size: number) {
    this.adj = Array.from({ length: size }, () => [])
  }

  add(from: number, to: number, cap: number) {
    this.adj[from].push({ to, cap, flow: 0, rev: this.adj[to].length })
    this.adj[to].push({ to: from, cap: 0, flow: 0, rev: this.adj[from].length - 1 })
  }

  private levels(source: number, sink: number): number[] | null {
    const level = new Array(this.adj.length).fill(-1)
    level[source] = 0
    const queue = [source]
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head]
      for (const e of this.adj[v]) {
        if (level[e.to] === -1 && e.cap - e.flow > 0) {
          level[e.to] = level[v] + 1
          queue.push(e.to)
        }
      }
    }
    return level[sink] === -1 ? null : level
  }

  private augment(v: number, sink: number, pushed: number, level: number[], iter: number[]): number {
    if (v === sink) return pushed
    for (; iter[v] < this.adj[v].length; iter[v]++) {
      const e = this.adj[v][iter[v]]
      const room = e.cap - e.flow
      if (room <= 0 || level[e.to] !== level[v] + 1) continue
      const sent = this.augment(e.to, sink, Math.min(pushed, room), level, iter)
      if (sent > 0) {
        e.flow += sent
        this.adj[e.to][e.rev].flow -= sent
        return sent
      }
    }
    return 0
  }

  /** Dinic's algorithm. The graphs here have at most ~35 nodes, so this is instant. */
  maxFlow(source: number, sink: number): number {
    let total = 0
    for (;;) {
      const level = this.levels(source, sink)
      if (!level) return total
      const iter = new Array(this.adj.length).fill(0)
      for (;;) {
        const sent = this.augment(source, sink, Infinity, level, iter)
        if (sent === 0) break
        total += sent
      }
    }
  }

  /** Nodes still reachable from the source in the residual graph — the cut's source side. */
  reachable(source: number): Set<number> {
    const seen = new Set<number>([source])
    const queue = [source]
    for (let head = 0; head < queue.length; head++) {
      for (const e of this.adj[queue[head]]) {
        if (e.cap - e.flow > 0 && !seen.has(e.to)) {
          seen.add(e.to)
          queue.push(e.to)
        }
      }
    }
    return seen
  }
}

export type DefenceTarget = {
  square: Square
  type: PieceSymbol
  /** Enemy pieces bearing on it — the units of defence it demands. */
  attackers: Square[]
  /** Own pieces defending it. */
  defenders: Square[]
  /** Material the opponent wins by starting the exchange here now, by SEE. */
  materialAtRisk: number
  /** The flow could not meet this target's demand: it cannot be held. */
  unheld: boolean
}

export type Deflection = {
  square: Square
  type: PieceSymbol
  /** Attacked own pieces whose defence runs through this piece. */
  serves: Square[]
  /** Material that becomes winnable if this defender is removed or deflected. */
  materialFreed: number
}

export type DefenceFlow = {
  side: Side
  targets: DefenceTarget[]
  /** Total units of defence the position demands. */
  demand: number
  /** Units the defenders can actually supply, accounting for sharing. */
  supply: number
  /** demand - supply. Above zero, the defence is over-subscribed by that much. */
  deficit: number
  /**
   * Defenders whose removal drops the flow below its demand — deflect one and
   * something the position was holding is no longer held. Ordered by how many
   * duties the piece is carrying, so true overloads lead.
   */
  deflections: Deflection[]
  /** Material at risk across every target the flow could not cover. */
  materialAtRisk: number
}

const CODE = { white: 'w', black: 'b' } as const

/**
 * Builds and solves the defence flow for one side in one position.
 *
 * Only pieces the opponent could actually profit from taking are made targets;
 * a defended pawn that costs nothing to lose is not a demand on the defence,
 * and including it would let routine positions report a deficit.
 */
export function defenceFlow(fen: string, side: Side): DefenceFlow {
  const empty: DefenceFlow = {
    side,
    targets: [],
    demand: 0,
    supply: 0,
    deficit: 0,
    deflections: [],
    materialAtRisk: 0,
  }

  let chess: Chess
  try {
    chess = new Chess(fen, { skipValidation: true })
  } catch {
    return empty
  }

  const own = CODE[side]
  const enemy = own === 'w' ? 'b' : 'w'
  const enemySide: Side = side === 'white' ? 'black' : 'white'

  const targets: DefenceTarget[] = []
  const defenderSquares = new Set<Square>()

  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== own || cell.type === 'k') continue
      const attackers = chess.attackers(cell.square, enemy)
      if (attackers.length === 0) continue

      const defenders = chess.attackers(cell.square, own).filter((s) => s !== cell.square)
      // What the opponent actually wins by taking here as the position stands.
      // A target that costs nothing is not a demand on the defence.
      const materialAtRisk = captureGain(fen, cell.square, enemySide)
      const worthDefending = materialAtRisk > 0.01 || defenders.length > 0
      if (!worthDefending) continue

      targets.push({
        square: cell.square,
        type: cell.type,
        attackers: [...attackers],
        defenders,
        materialAtRisk,
        unheld: false,
      })
      for (const d of defenders) defenderSquares.add(d)
    }
  }

  if (targets.length === 0) return empty

  const defenders = [...defenderSquares]
  const defenderIndex = new Map(defenders.map((s, i) => [s, i]))

  const SOURCE = 0
  const defenderBase = 1
  const targetBase = defenderBase + defenders.length
  const SINK = targetBase + targets.length
  const graph = new FlowGraph(SINK + 1)

  for (let i = 0; i < defenders.length; i++) graph.add(SOURCE, defenderBase + i, 1)

  let demand = 0
  targets.forEach((target, t) => {
    const need = target.attackers.length
    demand += need
    graph.add(targetBase + t, SINK, need)
    for (const d of target.defenders) {
      const i = defenderIndex.get(d)
      if (i !== undefined) graph.add(defenderBase + i, targetBase + t, 1)
    }
  })

  const supply = graph.maxFlow(SOURCE, SINK)
  const reachable = graph.reachable(SOURCE)

  // A target on the source side of the residual cut is one the flow could not
  // saturate: its demand exceeds what any assignment of defenders can supply.
  targets.forEach((target, t) => {
    target.unheld = reachable.has(targetBase + t)
  })

  // Deflection targets, by counterfactual rather than by residual reachability.
  //
  // Reading them straight off the min cut is wrong in the common case: when the
  // flow already meets its demand, every defender that happens to be carrying a
  // unit is unreachable in the residual graph, so a position whose defence is
  // perfectly sound reports all of its defenders as bottlenecks. The question
  // worth asking is the counterfactual one — *would removing this piece break
  // the defence* — and on graphs this small it can simply be answered by
  // re-solving without it.
  const deflections: Deflection[] = []
  for (let i = 0; i < defenders.length; i++) {
    const square = defenders[i]
    const piece = chess.get(square)
    if (!piece) continue
    const serves = targets.filter((t) => t.defenders.includes(square))
    if (serves.length === 0) continue

    const without = solveWithout(defenders, targets, i)
    // Only a drop that leaves the defence short of its demand counts. A drop
    // that still meets demand means another defender covers the gap, which is
    // exactly the redundancy the flow formulation exists to detect.
    if (without >= demand || without >= supply) continue

    // What the deflection is actually worth, by running the exchange on the
    // board with this defender gone. Assuming the full piece value instead
    // would report a defended pawn as five pawns of pressure.
    const materialFreed = serves.reduce(
      (sum, target) => sum + captureGain(stripped(fen, square), target.square, enemySide),
      0,
    )
    if (materialFreed <= 0.5) continue

    deflections.push({
      square,
      type: piece.type,
      serves: serves.map((t) => t.square),
      materialFreed,
    })
  }
  // A defender carrying two duties is a different and more useful finding than
  // a sole guard carrying one, so duty count leads the ordering.
  deflections.sort(
    (a, b) => b.serves.length - a.serves.length || b.materialFreed - a.materialFreed,
  )

  return {
    side,
    targets: targets.sort((a, b) => b.materialAtRisk - a.materialAtRisk),
    demand,
    supply,
    deficit: Math.max(0, demand - supply),
    deflections,
    materialAtRisk: targets.filter((t) => t.unheld).reduce((sum, t) => sum + t.materialAtRisk, 0),
  }
}

/** Max flow with one defender taken off the board, for the deflection counterfactual. */
function solveWithout(defenders: Square[], targets: DefenceTarget[], skip: number): number {
  const defenderIndex = new Map(defenders.map((s, i) => [s, i]))
  const SOURCE = 0
  const defenderBase = 1
  const targetBase = defenderBase + defenders.length
  const SINK = targetBase + targets.length
  const graph = new FlowGraph(SINK + 1)

  for (let i = 0; i < defenders.length; i++) {
    if (i === skip) continue
    graph.add(SOURCE, defenderBase + i, 1)
  }
  targets.forEach((target, t) => {
    graph.add(targetBase + t, SINK, target.attackers.length)
    for (const d of target.defenders) {
      const i = defenderIndex.get(d)
      if (i !== undefined && i !== skip) graph.add(defenderBase + i, targetBase + t, 1)
    }
  })

  return graph.maxFlow(SOURCE, SINK)
}

/** The position with one piece taken off, for the deflection counterfactual. */
function stripped(fen: string, square: Square): string {
  try {
    const chess = new Chess(fen, { skipValidation: true })
    chess.remove(square)
    return chess.fen()
  } catch {
    return fen
  }
}
