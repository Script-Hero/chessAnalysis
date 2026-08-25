import { Chess } from 'chess.js'
import { stepUci } from './stockfish'
import type { EngineLine } from './stockfish'

/**
 * A FEN-keyed directed acyclic graph of the game and its analysed alternatives.
 *
 * Trees can't represent confluence: `buildLineTree` renders two move orders
 * reaching the same position as two unrelated branches. Keying nodes by
 * position instead of by path merges them, which is what makes the structure a
 * graph and what makes properties like in-degree and path share meaningful.
 */

export type DagNode = {
  key: string
  fen: string
  /** Distinct predecessor edges — how many different ways this position was reached. */
  inDegree: number
  /** Distinct successor moves explored from here. */
  outDegree: number
  /** Ply depth of the shallowest path from the root. */
  depth: number
  /** True if this position occurs on the game's actual mainline. */
  onMainline: boolean
  /** Distinct root-to-here paths through the explored graph. */
  pathsFromRoot: number
  /** Distinct here-to-terminal paths. */
  pathsToLeaf: number
  /**
   * Share of all root-to-terminal paths that pass through this node.
   *
   * Exact for the graph as built, and for that reason easy to misread: candidate
   * lines are only followed `maxPlies` deep, so every mainline node before the
   * first stored branch trivially carries every path. Read it as a description
   * of the *analysed* graph, and use `dominators.ts` for the question it looks
   * like it answers — whether a position is genuinely forced.
   */
  pathShare: number
}

export type DagEdge = { from: string; to: string; uci: string; san: string; onMainline: boolean }

export type PositionDag = {
  root: string
  nodes: Map<string, DagNode>
  edges: DagEdge[]
  /** Nodes reached by more than one distinct move sequence. */
  transpositions: DagNode[]
}

/** Positions are identified by placement, side to move, castling and en-passant — not by clocks. */
export function positionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ')
}

type Builder = {
  nodes: Map<string, { fen: string; depth: number; onMainline: boolean }>
  edgeSet: Map<string, DagEdge>
}

function addNode(b: Builder, fen: string, depth: number, onMainline: boolean) {
  const key = positionKey(fen)
  const existing = b.nodes.get(key)
  if (!existing) {
    b.nodes.set(key, { fen, depth, onMainline })
    return key
  }
  existing.depth = Math.min(existing.depth, depth)
  existing.onMainline = existing.onMainline || onMainline
  return key
}

function addEdge(b: Builder, from: string, to: string, uci: string, san: string, onMainline: boolean) {
  const id = `${from}|${uci}`
  const existing = b.edgeSet.get(id)
  if (existing) {
    existing.onMainline = existing.onMainline || onMainline
    return
  }
  b.edgeSet.set(id, { from, to, uci, san, onMainline })
}

/**
 * Merges the played game and every stored candidate line into one DAG.
 *
 * `maxPlies` bounds how far each candidate variation is followed; the mainline
 * is always followed in full.
 */
export function buildPositionDag(
  positions: string[],
  lines: EngineLine[][],
  maxPlies = 4,
): PositionDag {
  const b: Builder = { nodes: new Map(), edgeSet: new Map() }
  const root = positionKey(positions[0])

  for (let i = 0; i < positions.length; i++) {
    addNode(b, positions[i], i, true)
  }

  // Mainline edges, derived by replaying rather than trusting parallel arrays.
  for (let i = 0; i + 1 < positions.length; i++) {
    const from = positionKey(positions[i])
    const to = positionKey(positions[i + 1])
    const edgeUci = mainlineUci(positions[i], positions[i + 1])
    if (edgeUci) addEdge(b, from, to, edgeUci.uci, edgeUci.san, true)
  }

  // Candidate variations, followed maxPlies deep from each analysed position.
  for (let i = 0; i < positions.length; i++) {
    for (const line of lines[i] ?? []) {
      let fen = positions[i]
      let depth = i
      for (const uci of line.pv.slice(0, maxPlies)) {
        const step = stepUci(fen, uci)
        if (!step) break
        const from = positionKey(fen)
        const to = addNode(b, step.fen, depth + 1, false)
        addEdge(b, from, to, uci, step.san, false)
        fen = step.fen
        depth += 1
      }
    }
  }

  return finalize(b, root)
}

/** Recovers the move connecting two consecutive mainline positions. */
function mainlineUci(from: string, to: string): { uci: string; san: string } | null {
  const target = positionKey(to)
  // Trying every legal move is cheap here and avoids threading SAN through
  // from the PGN layer, which would couple this module to the parse shape.
  for (const uci of legalUcis(from)) {
    const step = stepUci(from, uci)
    if (step && positionKey(step.fen) === target) return { uci, san: step.san }
  }
  return null
}

function legalUcis(fen: string): string[] {
  try {
    return new Chess(fen).moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion ?? ''))
  } catch {
    return []
  }
}

function finalize(b: Builder, root: string): PositionDag {
  const edges = [...b.edgeSet.values()]
  const outgoing = new Map<string, DagEdge[]>()
  const incoming = new Map<string, DagEdge[]>()
  for (const e of edges) {
    if (!outgoing.has(e.from)) outgoing.set(e.from, [])
    outgoing.get(e.from)!.push(e)
    if (!incoming.has(e.to)) incoming.set(e.to, [])
    incoming.get(e.to)!.push(e)
  }

  const order = topoOrder(b, edges, root)

  const pathsFromRoot = new Map<string, number>()
  pathsFromRoot.set(root, 1)
  for (const key of order) {
    const here = pathsFromRoot.get(key) ?? 0
    for (const e of outgoing.get(key) ?? []) {
      pathsFromRoot.set(e.to, (pathsFromRoot.get(e.to) ?? 0) + here)
    }
  }

  const pathsToLeaf = new Map<string, number>()
  for (let i = order.length - 1; i >= 0; i--) {
    const key = order[i]
    const out = outgoing.get(key) ?? []
    if (out.length === 0) {
      pathsToLeaf.set(key, 1)
      continue
    }
    pathsToLeaf.set(
      key,
      out.reduce((sum, e) => sum + (pathsToLeaf.get(e.to) ?? 0), 0),
    )
  }

  const totalPaths = pathsToLeaf.get(root) ?? 0

  const nodes = new Map<string, DagNode>()
  for (const [key, raw] of b.nodes) {
    const from = pathsFromRoot.get(key) ?? 0
    const to = pathsToLeaf.get(key) ?? 0
    const share = totalPaths > 0 ? (from * to) / totalPaths : 0
    nodes.set(key, {
      key,
      fen: raw.fen,
      inDegree: (incoming.get(key) ?? []).length,
      outDegree: (outgoing.get(key) ?? []).length,
      depth: raw.depth,
      onMainline: raw.onMainline,
      pathsFromRoot: from,
      pathsToLeaf: to,
      pathShare: share,
    })
  }

  const all = [...nodes.values()]
  return {
    root,
    nodes,
    edges,
    transpositions: all.filter((n) => n.inDegree > 1).sort((a, b2) => b2.inDegree - a.inDegree),
  }
}

/** Kahn's algorithm over the reachable subgraph, rooted at `root`. */
function topoOrder(b: Builder, edges: DagEdge[], root: string): string[] {
  const indeg = new Map<string, number>()
  const outgoing = new Map<string, DagEdge[]>()
  for (const key of b.nodes.keys()) indeg.set(key, 0)
  for (const e of edges) {
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1)
    if (!outgoing.has(e.from)) outgoing.set(e.from, [])
    outgoing.get(e.from)!.push(e)
  }

  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([k]) => k)
  // Guarantee the root leads, even if a candidate line loops back into it.
  queue.sort((a, b2) => (a === root ? -1 : b2 === root ? 1 : 0))

  const order: string[] = []
  const seen = new Set<string>()
  while (queue.length) {
    const key = queue.shift()!
    if (seen.has(key)) continue
    seen.add(key)
    order.push(key)
    for (const e of outgoing.get(key) ?? []) {
      const next = (indeg.get(e.to) ?? 1) - 1
      indeg.set(e.to, next)
      if (next <= 0) queue.push(e.to)
    }
  }

  // Any node left out sat on a cycle introduced by a repetition; append it so
  // downstream maps stay total.
  for (const key of b.nodes.keys()) if (!seen.has(key)) order.push(key)
  return order
}
