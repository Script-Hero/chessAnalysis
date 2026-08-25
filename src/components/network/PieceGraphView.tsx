import { useMemo, useState } from 'react'
import type { Square } from 'chess.js'
import type { PositionStructure } from '../../lib/structure'
import type { Side } from '../../lib/analysis'
import './PieceGraphView.css'

type PieceGraphViewProps = {
  structure: PositionStructure
  orientation: Side
  /** Squares to ring as the current focus, e.g. a selected pressure point. */
  focus?: string[]
}

/**
 * The attack-and-defence network, drawn as a network.
 *
 * The panel this replaces described a graph in three definition lists and a
 * bullet list of prose. That is the one place a node-link drawing earns its
 * keep — the claims being made are about which pieces are connected to which,
 * and a reader cannot check that against a paragraph.
 *
 * Nodes are laid out on board coordinates rather than by a force simulation.
 * A spring layout would produce a prettier graph and a useless one: the reader
 * already knows where the pieces are, and any layout that moves them breaks the
 * correspondence with the board sitting next to it. Board coordinates make the
 * drawing an overlay of the same position, so a claim about the knight on f3 is
 * checkable by looking at f3.
 */

const FILES = 'abcdefgh'
const SIZE = 400
const PAD = 26
const CELL = (SIZE - PAD * 2) / 7

const PIECE_GLYPH: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
}

function project(square: string, orientation: Side): { x: number; y: number } {
  const file = FILES.indexOf(square[0])
  const rank = Number(square[1]) - 1
  const x = orientation === 'white' ? file : 7 - file
  const y = orientation === 'white' ? 7 - rank : rank
  return { x: PAD + x * CELL, y: PAD + y * CELL }
}

type EdgeFilter = 'all' | 'defend' | 'attack'

function PieceGraphView({ structure, orientation, focus = [] }: PieceGraphViewProps) {
  const [filter, setFilter] = useState<EdgeFilter>('all')
  const [hover, setHover] = useState<string | null>(null)

  const cutSquares = useMemo(() => {
    const set = new Set<string>()
    for (const side of ['white', 'black'] as Side[]) {
      for (const deflection of structure.flow[side].deflections) set.add(deflection.square)
    }
    return set
  }, [structure])

  const unheldSquares = useMemo(() => {
    const set = new Set<string>()
    for (const side of ['white', 'black'] as Side[]) {
      for (const target of structure.flow[side].targets) if (target.unheld) set.add(target.square)
    }
    return set
  }, [structure])

  const nodes = useMemo(() => [...structure.network.nodes.values()], [structure])

  const edges = useMemo(() => {
    const seen = new Set<string>()
    return structure.network.edges.filter((edge) => {
      if (filter !== 'all' && edge.kind !== filter) return false
      // Mutual defences produce two edges between the same pair; drawing both
      // just thickens the line and hides that it is one relation.
      const id =
        edge.kind === 'defend' && edge.from > edge.to
          ? `${edge.to}|${edge.from}|defend`
          : `${edge.from}|${edge.to}|${edge.kind}`
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }, [structure, filter])

  const active = hover
  const isDimmed = (square: string) =>
    active !== null && square !== active && !touches(active, square, structure)

  return (
    <div className="piece-graph">
      <div className="piece-graph__filters" role="group" aria-label="Which relations to draw">
        {(
          [
            ['all', 'All relations'],
            ['defend', 'Defence only'],
            ['attack', 'Attacks only'],
          ] as [EdgeFilter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`piece-graph__filter${filter === value ? ' is-active' : ''}`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <svg
        className="piece-graph__svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label="Attack and defence network of the current position"
      >
        <defs>
          <marker id="pg-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill="rgba(232, 106, 106, 0.75)" />
          </marker>
        </defs>

        <g className="piece-graph__edges">
          {edges.map((edge, i) => {
            const from = project(edge.from, orientation)
            const to = project(edge.to, orientation)
            const dim = isDimmed(edge.from) && isDimmed(edge.to)
            return (
              <line
                key={`${edge.from}-${edge.to}-${edge.kind}-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className={`piece-graph__edge piece-graph__edge--${edge.kind}${dim ? ' is-dim' : ''}`}
                markerEnd={edge.kind === 'attack' ? 'url(#pg-arrow)' : undefined}
              />
            )
          })}
        </g>

        <g className="piece-graph__nodes">
          {nodes.map((node) => {
            const { x, y } = project(node.square, orientation)
            const load = structure.loadBearing.get(node.square as Square) ?? 0
            // Radius carries load-bearing weight, so the pieces the position is
            // leaning on are the ones that read as large.
            const radius = 7 + load * 9
            const dim = isDimmed(node.square)
            const classes = [
              'piece-graph__node',
              `piece-graph__node--${node.color}`,
              dim ? 'is-dim' : '',
              node.hanging ? 'is-hanging' : '',
              focus.includes(node.square) ? 'is-focus' : '',
            ]
              .filter(Boolean)
              .join(' ')

            return (
              <g
                key={node.square}
                className={classes}
                onMouseEnter={() => setHover(node.square)}
                onMouseLeave={() => setHover(null)}
              >
                {cutSquares.has(node.square) && (
                  <circle cx={x} cy={y} r={radius + 4.5} className="piece-graph__cut-ring" />
                )}
                {unheldSquares.has(node.square) && (
                  <circle cx={x} cy={y} r={radius + 2} className="piece-graph__unheld-ring" />
                )}
                <circle cx={x} cy={y} r={radius} className="piece-graph__disc" />
                <text x={x} y={y + 4.5} className="piece-graph__glyph">
                  {PIECE_GLYPH[node.type]}
                </text>
                <title>
                  {`${node.square} — ${node.color}, ${Math.round(load * 100)}% of the position's load-bearing weight` +
                    (node.hanging ? `, loses ${node.exchangeLoss.toFixed(1)} pawns if taken` : '') +
                    (cutSquares.has(node.square) ? ', min-cut defender' : '')}
                </title>
              </g>
            )
          })}
        </g>
      </svg>

      <ul className="piece-graph__legend">
        <li>
          <span className="piece-graph__key piece-graph__key--defend" /> defends
        </li>
        <li>
          <span className="piece-graph__key piece-graph__key--attack" /> attacks
        </li>
        <li>
          <span className="piece-graph__key piece-graph__key--size" /> node size = ground only that piece covers
        </li>
        <li>
          <span className="piece-graph__key piece-graph__key--cut" /> min-cut defender
        </li>
        <li>
          <span className="piece-graph__key piece-graph__key--unheld" /> cannot be held
        </li>
      </ul>
    </div>
  )
}

/** Whether two squares are directly related in the network — used only for hover focus. */
function touches(a: string, b: string, structure: PositionStructure): boolean {
  for (const edge of structure.network.edges) {
    if ((edge.from === a && edge.to === b) || (edge.from === b && edge.to === a)) return true
  }
  return false
}

export default PieceGraphView
