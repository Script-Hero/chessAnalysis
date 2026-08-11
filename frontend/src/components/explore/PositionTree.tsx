import { useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { buildPositionTree, DEFAULT_POSITION_PLIES } from '../../lib/tree'
import type { LineTreeNode } from '../../lib/tree'
import type { EngineLine } from '../../lib/stockfish'
import { sideToMove, moverAtDepth } from '../../lib/analysis'
import TreeNodePreview from './TreeNodePreview'
import type { HoverTarget } from './TreeNodePreview'
import './PositionTree.css'

type PositionTreeProps = {
  fen: string
  lines: EngineLine[] | null
}

type LayoutNode = LineTreeNode & { x: number; y: number; layoutChildren: LayoutNode[] }

const COL_WIDTH = 92
const ROW_HEIGHT = 30
const PAD = 24

function layout(nodes: LineTreeNode[], depth: number, cursor: { next: number }): LayoutNode[] {
  return nodes.map((node) => {
    if (node.children.length === 0) {
      const y = cursor.next
      cursor.next += ROW_HEIGHT
      return { ...node, x: depth * COL_WIDTH, y, layoutChildren: [] }
    }
    const layoutChildren = layout(node.children, depth + 1, cursor)
    const y = layoutChildren.reduce((sum, c) => sum + c.y, 0) / layoutChildren.length
    return { ...node, x: depth * COL_WIDTH, y, layoutChildren }
  })
}

function collectPaths(
  node: LayoutNode,
  parent: { x: number; y: number },
  out: { key: string; d: string; minRank: number }[],
) {
  const midX = (parent.x + node.x) / 2
  out.push({
    key: `${node.uci}-${node.x}-${node.y}`,
    d: `M ${parent.x} ${parent.y} C ${midX} ${parent.y} ${midX} ${node.y} ${node.x} ${node.y}`,
    minRank: node.minRank,
  })
  node.layoutChildren.forEach((child) => collectPaths(child, node, out))
}

function collectNodes(node: LayoutNode, out: LayoutNode[]) {
  out.push(node)
  node.layoutChildren.forEach((child) => collectNodes(child, out))
}

function PositionTree({ fen, lines }: PositionTreeProps) {
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const rootMover = sideToMove(fen)

  const layoutResult = useMemo(() => {
    if (!lines || lines.length === 0) return null
    const tree = buildPositionTree(fen, lines, DEFAULT_POSITION_PLIES)
    const cursor = { next: PAD }
    const top = layout(tree, 1, cursor)
    if (top.length === 0) return null
    const height = Math.max(cursor.next, PAD * 2)
    const rootY = top.reduce((s, n) => s + n.y, 0) / top.length
    const width = (DEFAULT_POSITION_PLIES + 1) * COL_WIDTH + 80
    return { top, height, width, rootY }
  }, [fen, lines])

  if (!layoutResult) {
    return <div className="position-tree position-tree--empty">No stored lines for this position.</div>
  }

  const { top, height, width, rootY } = layoutResult

  const paths: { key: string; d: string; minRank: number }[] = []
  top.forEach((node) => collectPaths(node, { x: 0, y: rootY }, paths))

  const allNodes: LayoutNode[] = []
  top.forEach((node) => collectNodes(node, allNodes))

  const showHover = (e: ReactMouseEvent, node: LayoutNode) =>
    setHover({ fen: node.fen, san: node.san, x: e.clientX, y: e.clientY })

  return (
    <div className="position-tree">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="position-tree__svg">
        <circle cx={0} cy={rootY} r={5} className="position-tree__root" />
        {paths.map((p) => (
          <path
            key={p.key}
            d={p.d}
            className={`position-tree__branch position-tree__branch--${p.minRank === 0 ? 'top' : 'alt'}`}
          />
        ))}
        {allNodes.map((node) => {
          const depth = Math.round(node.x / COL_WIDTH)
          const mover = moverAtDepth(rootMover, depth)
          return (
            <g key={`${node.uci}-${node.x}-${node.y}`}>
              <circle
                cx={node.x}
                cy={node.y}
                r={4}
                className={`position-tree__node position-tree__node--${node.minRank === 0 ? 'top' : 'alt'} position-tree__node--mover-${mover}`}
                onMouseEnter={(e) => showHover(e, node)}
                onMouseLeave={() => setHover(null)}
              />
              <text x={node.x + 8} y={node.y + 4} className="position-tree__label">
                {node.san}
              </text>
            </g>
          )
        })}
      </svg>
      <TreeNodePreview target={hover} />
    </div>
  )
}

export default PositionTree
