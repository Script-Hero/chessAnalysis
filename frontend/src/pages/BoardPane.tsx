import { useEffect, useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import type { Arrow } from 'react-chessboard'
import MoveBadge from '../components/MoveBadge'
import { useAnalysis } from '../context/AnalysisContext'
import { LAST_MOVE_HIGHLIGHT, SQUARE_DARK, SQUARE_LIGHT } from '../lib/boardTheme'
import './BoardPane.css'

const ARROW_COLORS = ['rgba(232, 195, 117, 0.9)', 'rgba(232, 195, 117, 0.55)', 'rgba(232, 195, 117, 0.3)']

function BoardPane() {
  const {
    game,
    fileName,
    ply,
    goTo,
    orientation,
    setOrientation,
    judgments,
    onReset,
    liveEngineEnabled,
    liveLines,
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

  const squareStyles = useMemo(() => {
    if (!currentMove) return {}
    return {
      [currentMove.from]: { background: LAST_MOVE_HIGHLIGHT },
      [currentMove.to]: { background: LAST_MOVE_HIGHLIGHT },
    }
  }, [currentMove])

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

  const white = game.headers.White ?? 'White'
  const black = game.headers.Black ?? 'Black'
  const result = game.headers.Result
  const event = game.headers.Event
  const date = game.headers.Date

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

      <div className="board-pane__header">
        <p className="board-pane__players">
          <span className={ply % 2 === 0 ? 'is-active' : ''}>{white}</span>
          <span className="board-pane__vs">vs</span>
          <span className={ply % 2 === 1 ? 'is-active' : ''}>{black}</span>
        </p>
        {(event || date) && <p className="board-pane__meta">{[event, date].filter(Boolean).join(' — ')}</p>}
        {result && <p className="board-pane__result">{result}</p>}
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

      <div className="board-pane__footer">
        <p className="board-pane__filename">{fileName}</p>
        <button type="button" className="board-pane__reset" onClick={onReset}>
          Load another game
        </button>
      </div>
    </div>
  )
}

export default BoardPane
