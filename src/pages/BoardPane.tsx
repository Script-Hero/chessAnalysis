import { useEffect, useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import type { Arrow } from 'react-chessboard'
import MoveBadge from '../components/MoveBadge'
import { useAnalysis } from '../context/AnalysisContext'
import { LAST_MOVE_HIGHLIGHT, SQUARE_DARK, SQUARE_LIGHT } from '../lib/boardTheme'
import { OVERLAY_DESCRIPTION, OVERLAY_LABEL, overlayStyles } from '../lib/boardOverlay'
import type { BoardOverlay } from '../context/AnalysisContext'
import './BoardPane.css'

// Three distinct hues (not three opacities of one hue) so overlapping
// candidate-line arrows stay separable when two lines share squares — the
// same problem PositionTree already solves with --brass-bright / --tree-alt.
const ARROW_COLORS = ['rgba(232, 195, 117, 0.85)', 'rgba(127, 168, 232, 0.8)', 'rgba(139, 111, 224, 0.75)']

const OVERLAYS: BoardOverlay[] = ['none', 'control', 'delta', 'load', 'cut', 'fragility']

function BoardPane() {
  const {
    game,
    fileName,
    ply,
    goTo,
    orientation,
    setOrientation,
    judgments,
    liveEngineEnabled,
    liveLines,
    overlay,
    setOverlay,
    structure,
    robustness,
  } = useAnalysis()

  const total = game.moves.length
  const position = game.positions[ply]
  const currentMove = ply > 0 ? game.moves[ply - 1] : null

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(ply - 1)
      else if (e.key === 'ArrowRight') goTo(ply + 1)
      else if (e.key === 'Home') goTo(0)
      else if (e.key === 'End') goTo(total)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply, total])

  // Structural shading sits underneath the last-move highlight: the overlay is
  // context for the move, so it must never obscure which move was played.
  const squareStyles = useMemo(() => {
    const previous = ply > 0 ? game.positions[ply - 1] : null
    const base = overlayStyles(overlay, position, previous, structure, robustness)
    if (!currentMove) return base
    return {
      ...base,
      [currentMove.from]: { background: LAST_MOVE_HIGHLIGHT },
      [currentMove.to]: { background: LAST_MOVE_HIGHLIGHT },
    }
  }, [currentMove, overlay, position, structure, robustness, ply, game.positions])

  const pairs = useMemo(() => {
    const rows: { number: number; white?: { san: string; ply: number }; black?: { san: string; ply: number } }[] = []
    game.moves.forEach((move, i) => {
      const moveNumber = Math.floor(i / 2) + 1
      const isWhite = i % 2 === 0
      if (isWhite) {
        rows.push({ number: moveNumber, white: { san: move.san, ply: i + 1 } })
      } else {
        rows[rows.length - 1].black = { san: move.san, ply: i + 1 }
      }
    })
    return rows
  }, [game.moves])

  const arrows = useMemo<Arrow[]>(() => {
    if (!liveEngineEnabled) return []
    return liveLines
      .map((line, i) =>
        line.move
          ? { startSquare: line.move.slice(0, 2), endSquare: line.move.slice(2, 4), color: ARROW_COLORS[i] }
          : null,
      )
      .filter((a): a is Arrow => a !== null)
  }, [liveEngineEnabled, liveLines])

  return (
    <div className="board-pane">
      <div className="board-pane__frame">
        <Chessboard
          options={{
            id: 'analysis-board',
            position,
            boardOrientation: orientation,
            allowDragging: false,
            showAnimations: true,
            animationDurationInMs: 180,
            showNotation: true,
            darkSquareStyle: { backgroundColor: SQUARE_DARK },
            lightSquareStyle: { backgroundColor: SQUARE_LIGHT },
            darkSquareNotationStyle: { color: SQUARE_LIGHT },
            lightSquareNotationStyle: { color: SQUARE_DARK },
            squareStyles,
            arrows,
          }}
        />
      </div>

      <div className="board-pane__controls">
        <button type="button" className="board-pane__nav" onClick={() => goTo(0)} disabled={ply === 0} aria-label="Go to start">
          «
        </button>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(ply - 1)}
          disabled={ply === 0}
          aria-label="Previous move"
        >
          ‹
        </button>
        <span className="board-pane__ply">
          {ply} / {total}
        </span>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(ply + 1)}
          disabled={ply === total}
          aria-label="Next move"
        >
          ›
        </button>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(total)}
          disabled={ply === total}
          aria-label="Go to end"
        >
          »
        </button>
        <button
          type="button"
          className="board-pane__nav board-pane__nav--flip"
          onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}
          aria-label="Flip board"
        >
          ⇅
        </button>
      </div>

      {/* The overlay selector sits directly under the board, not behind a tab.
          A structural claim is only checkable on the squares it is about, so
          painting it is the app's primary reading of a position rather than an
          option buried elsewhere. */}
      <div className="board-pane__overlays">
        <div className="board-pane__overlay-row" role="group" aria-label="Structural board overlay">
          {OVERLAYS.map((value) => (
            <button
              key={value}
              type="button"
              className={`board-pane__overlay${overlay === value ? ' is-active' : ''}`}
              onClick={() => setOverlay(value)}
            >
              {OVERLAY_LABEL[value]}
            </button>
          ))}
        </div>
        <p className="board-pane__overlay-desc">{OVERLAY_DESCRIPTION[overlay]}</p>
      </div>

      <ol className="board-pane__moves">
        {pairs.map((row) => (
          <li key={row.number} className="board-pane__move-row">
            <span className="board-pane__move-number">{row.number}.</span>
            {row.white && (
              <button
                type="button"
                className={`board-pane__move${ply === row.white.ply ? ' is-current' : ''}`}
                onClick={() => goTo(row.white!.ply)}
              >
                {row.white.san}
                <MoveBadge judgment={judgments?.[row.white.ply - 1]} />
              </button>
            )}
            {row.black && (
              <button
                type="button"
                className={`board-pane__move${ply === row.black.ply ? ' is-current' : ''}`}
                onClick={() => goTo(row.black!.ply)}
              >
                {row.black.san}
                <MoveBadge judgment={judgments?.[row.black.ply - 1]} />
              </button>
            )}
          </li>
        ))}
      </ol>

      <p className="board-pane__filename">{fileName}</p>
    </div>
  )
}

export default BoardPane
