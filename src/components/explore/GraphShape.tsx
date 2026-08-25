import { useMemo } from 'react'
import { buildPositionDag, positionKey } from '../../lib/positionDag'
import { analyzeDominance } from '../../lib/dominators'
import type { EngineLine } from '../../lib/stockfish'
import './GraphShape.css'

type GraphShapeProps = {
  positions: string[]
  lines: EngineLine[][]
  currentPly: number
  onSelectPly: (ply: number) => void
}

/**
 * Shape of the analysed position graph.
 *
 * The tree views elsewhere render each variation as its own branch, so two move
 * orders reaching the same position appear as two unrelated lines. Merging on
 * position instead makes those joins visible, which is the whole difference
 * between a tree and a graph — and confluence is a real property of a position:
 * where many orders converge, the order you chose did not matter.
 *
 * Criticality is read off the dominator tree rather than off path counts. A
 * node's share of root-to-terminal paths rounds to 1 for every position before
 * the first stored branch, so it reported the sampling policy — candidate lines
 * are only followed a few plies — as if it were a property of the game.
 * Dominance has an exact definition that sparse sampling cannot distort: a node
 * is forced when every path from the root to the exit runs through it, and the
 * size of its dominator subtree is how much of the analysed future that one
 * decision exclusively governs.
 */
function GraphShape({ positions, lines, currentPly, onSelectPly }: GraphShapeProps) {
  const dag = useMemo(() => buildPositionDag(positions, lines, 4), [positions, lines])
  const dominance = useMemo(() => analyzeDominance(dag), [dag])

  const currentKey = positionKey(positions[currentPly] ?? positions[0])
  const current = dag.nodes.get(currentKey)
  const forced = useMemo(() => new Set(dominance.forced), [dominance])
  const scope = dominance.scope.get(currentKey) ?? 0

  // Mainline plies at which a candidate line rejoins a position reached another
  // way — the joins worth navigating to.
  const mainlineTranspositions = useMemo(() => {
    const byKey = new Map<string, number>()
    positions.forEach((fen, i) => {
      const key = positionKey(fen)
      if (!byKey.has(key)) byKey.set(key, i)
    })
    return dag.transpositions
      .map((node) => ({ node, ply: byKey.get(node.key) }))
      .filter((entry): entry is { node: (typeof dag.transpositions)[number]; ply: number } => entry.ply !== undefined)
      .slice(0, 8)
  }, [dag, positions])

  return (
    <div className="graph-shape">
      <dl className="graph-shape__stats">
        <div>
          <dt>Positions in graph</dt>
          <dd>{dag.nodes.size}</dd>
        </div>
        <div>
          <dt>Moves (edges)</dt>
          <dd>{dag.edges.length}</dd>
        </div>
        <div>
          <dt>Confluences</dt>
          <dd>{dag.transpositions.length}</dd>
        </div>
        <div>
          <dt>Forced junctures</dt>
          <dd>{dominance.forced.length}</dd>
        </div>
      </dl>

      <div className="graph-shape__current">
        <h5>This position</h5>
        {!current ? (
          <p className="graph-shape__note">Not in the analysed graph.</p>
        ) : (
          <ul>
            <li>
              Reached {current.inDegree === 0 ? 'as the starting position' : `by ${current.inDegree} distinct move${current.inDegree === 1 ? '' : 's'}`}
              , continues into {current.outDegree} analysed move{current.outDegree === 1 ? '' : 's'}.
            </li>
            <li>
              {forced.has(currentKey)
                ? 'Every analysed continuation runs through here — this position dominates the exit.'
                : `Not forced: some analysed line reaches the end without passing through here.`}
            </li>
            <li>
              Exclusively governs {scope} position{scope === 1 ? '' : 's'} of the analysed graph
              {dag.nodes.size > 0 && ` (${Math.round((scope / dag.nodes.size) * 100)}%)`} — the size of its dominator
              subtree, and the scope of the decision made here.
            </li>
          </ul>
        )}
      </div>

      {mainlineTranspositions.length > 0 && (
        <div className="graph-shape__current">
          <h5>Where lines converge</h5>
          <ul className="graph-shape__joins">
            {mainlineTranspositions.map(({ node, ply }) => (
              <li key={node.key}>
                <button type="button" onClick={() => onSelectPly(ply)}>
                  ply {ply} — reachable {node.inDegree} ways
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default GraphShape
