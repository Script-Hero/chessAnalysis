import { Chessboard } from 'react-chessboard'
import { SQUARE_DARK, SQUARE_LIGHT } from '../../lib/boardTheme'
import './TreeNodePreview.css'

export type HoverTarget = { fen: string; san: string; x: number; y: number }

function TreeNodePreview({ target }: { target: HoverTarget | null }) {
  if (!target) return null

  const left = Math.min(target.x + 16, window.innerWidth - 200)
  const top = Math.min(target.y + 16, window.innerHeight - 220)

  return (
    <div className="tree-node-preview" style={{ left, top }}>
      <div className="tree-node-preview__board">
        <Chessboard
          options={{
            id: 'tree-node-preview',
            position: target.fen,
            allowDragging: false,
            showAnimations: false,
            showNotation: false,
            darkSquareStyle: { backgroundColor: SQUARE_DARK },
            lightSquareStyle: { backgroundColor: SQUARE_LIGHT },
          }}
        />
      </div>
      <p className="tree-node-preview__san">{target.san}</p>
    </div>
  )
}

export default TreeNodePreview
