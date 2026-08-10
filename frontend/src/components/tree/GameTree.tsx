import { useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { DEFAULT_BRANCH_PLIES, groupGameTreeRows } from '../../lib/tree'
import type { CollapseThreshold, GameTreeRow, LineTreeNode } from '../../lib/tree'
import TreeNodePreview from './TreeNodePreview'
import type { HoverTarget } from './TreeNodePreview'
import './GameTree.css'

type GameTreeProps = {
  rows: GameTreeRow[]
  currentPly: number
  onSelectPly: (ply: number) => void
  collapseThreshold: CollapseThreshold
}

const ROW_PITCH = 30
const RAIL_X = 280
const PAD_TOP = 20
const BRANCH_DX = 60
const BRANCH_DY = 10

const CLASS_TONE: Record<string, string> = {
  best: 'top',
  excellent: 'top',
  good: 'top',
  inaccuracy: 'warning',
  mistake: 'serious',
  blunder: 'critical',
}

function flattenChain(nodes: LineTreeNode[]): LineTreeNode[] {
  const chain: LineTreeNode[] = []
  let cur = nodes
  while (cur.length > 0) {
    chain.push(cur[0])
    cur = cur[0].children
  }
  return chain
}

function moveLabel(row: GameTreeRow): string {
  const moveNumber = Math.floor((row.ply - 1) / 2) + 1
  return row.mover === 'white' ? `${moveNumber}. ${row.san}` : `${moveNumber}... ${row.san}`
}

type RenderItem =
  | { type: 'row'; row: GameTreeRow }
  | { type: 'collapsed'; startPly: number; endPly: number; rows: GameTreeRow[] }

function GameTree({ rows, currentPly, onSelectPly, collapseThreshold }: GameTreeProps) {
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set())

  // A threshold change invalidates the previous grouping — there's no
  // meaningful way to carry "this run is expanded" forward across a regroup.
  // Adjusted during render (React's recommended pattern for this), not in an
  // effect, to avoid an extra cascading render.
  const [prevCollapseThreshold, setPrevCollapseThreshold] = useState(collapseThreshold)
  if (prevCollapseThreshold !== collapseThreshold) {
    setPrevCollapseThreshold(collapseThreshold)
    setExpandedRuns(new Set())
  }

  const items = useMemo(() => groupGameTreeRows(rows, collapseThreshold), [rows, collapseThreshold])

  const renderItems: RenderItem[] = items.flatMap((item): RenderItem[] => {
    if (item.kind === 'row') return [{ type: 'row', row: item.row }]
    if (expandedRuns.has(item.startPly)) return item.rows.map((row) => ({ type: 'row', row }))
    return [{ type: 'collapsed', startPly: item.startPly, endPly: item.endPly, rows: item.rows }]
  })

  const height = PAD_TOP * 2 + renderItems.length * ROW_PITCH
  const width = RAIL_X + BRANCH_DX * (DEFAULT_BRANCH_PLIES + 1) + 160

  const showHover = (e: ReactMouseEvent, node: { fen: string; san: string }) =>
    setHover({ fen: node.fen, san: node.san, x: e.clientX, y: e.clientY })

  const expandRun = (startPly: number) => setExpandedRuns((prev) => new Set(prev).add(startPly))

  let branchIndex = 0

  return (
    <div className="game-tree">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="game-tree__svg">
        <line x1={RAIL_X} y1={PAD_TOP} x2={RAIL_X} y2={height - PAD_TOP} className="game-tree__rail" />

        {renderItems.map((item, i) => {
          const rowY = PAD_TOP + i * ROW_PITCH

          if (item.type === 'collapsed') {
            const isCurrent = currentPly >= item.startPly && currentPly <= item.endPly
            return (
              <g key={`collapsed-${item.startPly}`} onClick={() => expandRun(item.startPly)}>
                <circle
                  cx={RAIL_X}
                  cy={rowY}
                  r={4.5}
                  className={`game-tree__collapsed-dot${isCurrent ? ' is-current' : ''}`}
                />
                <text x={RAIL_X + 12} y={rowY + 4} className="game-tree__collapsed-label">
                  {item.rows.length} solid moves
                </text>
              </g>
            )
          }

          const row = item.row
          const isCurrent = row.ply === currentPly
          const tone = row.classification ? CLASS_TONE[row.classification] : 'top'
          const side = row.branch ? (branchIndex++ % 2 === 0 ? 1 : -1) : 0
          const labelSide = side < 0 ? 1 : -1
          const chain = row.branch ? flattenChain(row.branch) : []

          return (
            <g key={row.ply}>
              <circle
                cx={RAIL_X}
                cy={rowY}
                r={isCurrent ? 6 : 4.5}
                className={`game-tree__node game-tree__node--${tone}${isCurrent ? ' is-current' : ''}`}
                onClick={() => onSelectPly(row.ply)}
              />
              <text
                x={RAIL_X + labelSide * 12}
                y={rowY + 4}
                textAnchor={labelSide > 0 ? 'start' : 'end'}
                className="game-tree__label"
              >
                {moveLabel(row)}
              </text>

              {chain.map((node, depth) => {
                const prevX = depth === 0 ? RAIL_X : RAIL_X + side * depth * BRANCH_DX
                const prevY = depth === 0 ? rowY : rowY - depth * BRANCH_DY
                const x = RAIL_X + side * (depth + 1) * BRANCH_DX
                const y = rowY - (depth + 1) * BRANCH_DY
                const midX = (prevX + x) / 2
                return (
                  <g key={node.uci}>
                    <path
                      d={`M ${prevX} ${prevY} C ${midX} ${prevY} ${midX} ${y} ${x} ${y}`}
                      className="game-tree__branch-path"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={3.5}
                      className="game-tree__branch-dot"
                      onMouseEnter={(e) => showHover(e, node)}
                      onMouseLeave={() => setHover(null)}
                      // row.branch is built from positions[row.ply - 1] (the position BEFORE the
                      // flagged move was played) — it's the engine's suggested alternative from
                      // that earlier position. Jump to row.ply - 1, not row.ply: the position
                      // after the actual move was already played, where this alternative may no
                      // longer even be legal.
                      onClick={() => onSelectPly(row.ply - 1)}
                    />
                    <text
                      x={x + side * 6}
                      y={y - 4}
                      textAnchor={side > 0 ? 'start' : 'end'}
                      className="game-tree__branch-label"
                    >
                      {node.san}
                    </text>
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>
      <TreeNodePreview target={hover} />
    </div>
  )
}

export default GameTree
