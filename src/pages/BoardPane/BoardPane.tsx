import { useEffect, useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import type { Arrow } from 'react-chessboard'
import MoveBadge from '../../components/MoveBadge'
import { useAnalysis } from '../../context/AnalysisContext'
import { LAST_MOVE_HIGHLIGHT, SQUARE_DARK, SQUARE_LIGHT } from '../../lib/boardTheme'
import { OVERLAY_DESCRIPTION, OVERLAY_LABEL, overlayStyles } from '../../lib/boardOverlay'
import type { BoardOverlay } from '../../context/AnalysisContext'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FlipVertical2 } from 'lucide-react'
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
    decisionIndex, boardPhase, setBoardPhase, boardFen, previewFen, setPreviewFen,
    focusSquare, setFocusSquare,
  } = useAnalysis()

  const total = game.moves.length
  const position = boardFen
  const currentMove = ply > 0 ? game.moves[ply - 1] : null

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || (e.target instanceof Element && e.target.closest('input, select, textarea, button, [role="button"], [contenteditable="true"]'))) return
      if (e.key === 'ArrowLeft') goTo(decisionIndex - 1)
      else if (e.key === 'ArrowRight') goTo(decisionIndex + 1)
      else if (e.key === 'Home') goTo(0)
      else if (e.key === 'End') goTo(total)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisionIndex, total])

  // Structural shading sits underneath the last-move highlight: the overlay is
  // context for the move, so it must never obscure which move was played.
  const squareStyles = useMemo(() => {
    const previous = ply > 0 ? game.positions[ply - 1] : null
    const base = overlayStyles(overlay, position, previous, structure, robustness)
    if (currentMove && !previewFen) {
      for (const square of [currentMove.from, currentMove.to]) {
        base[square] = { background: LAST_MOVE_HIGHLIGHT, ...base[square] }
      }
    }
    if (focusSquare && structure) {
      for (const side of ['white', 'black'] as const) {
        const coverage = structure.incidence[side].pieces.find(p => p.square === focusSquare)
        for (const square of coverage?.unique ?? []) base[square] = { background: 'rgba(60, 170, 155, .4)' }
        const defender = structure.flow[side].deflections.find(p => p.square === focusSquare)
        for (const square of defender?.serves ?? []) base[square] = { background: 'rgba(220, 115, 70, .4)' }
      }
      base[focusSquare] = { ...base[focusSquare], boxShadow: 'inset 0 0 0 4px #38bda9' }
    }
    return base
  }, [currentMove, overlay, position, structure, robustness, ply, game.positions, focusSquare, previewFen])

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
      <div className="board-decision">
        <strong>{game.moves[decisionIndex] ? `${Math.floor(decisionIndex / 2) + 1}${decisionIndex % 2 ? '...' : '.'} ${game.moves[decisionIndex].san}` : 'Starting position'}</strong>
        <span>{decisionIndex % 2 ? game.headers.Black : game.headers.White}</span>
        <MoveBadge judgment={judgments?.[decisionIndex]} />
      </div>
      <div className="board-phases" role="group" aria-label="Decision position">
        {(['before', 'after'] as const).map(phase => <button key={phase} aria-pressed={!previewFen && phase === boardPhase} onClick={() => setBoardPhase(phase)}>{phase === 'before' ? 'Before move' : 'After move'}</button>)}
        {previewFen && <button onClick={() => setPreviewFen(null)}>Return to game</button>}
      </div>
      {previewFen && <p className="board-state">Candidate position</p>}
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
          <ChevronsLeft size={18} />
        </button>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(decisionIndex - 1)}
          disabled={decisionIndex === 0}
          aria-label="Previous move"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="board-pane__ply">
          {decisionIndex + 1} / {total}
        </span>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(decisionIndex + 1)}
          disabled={decisionIndex >= total - 1}
          aria-label="Next move"
        >
          <ChevronRight size={18} />
        </button>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(total)}
          disabled={ply === total}
          aria-label="Go to end"
        >
          <ChevronsRight size={18} />
        </button>
        <button
          type="button"
          className="board-pane__nav board-pane__nav--flip"
          onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}
          aria-label="Flip board"
        >
          <FlipVertical2 size={18} />
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

      {focusSquare && <button className="evidence-clear" onClick={() => setFocusSquare(null)}>Clear {focusSquare} evidence</button>}
      <details className="move-list-disclosure"><summary>Game moves</summary>
      <ol className="board-pane__moves">
        {pairs.map((row) => (
          <li key={row.number} className="board-pane__move-row">
            <span className="board-pane__move-number">{row.number}.</span>
            {row.white && (
              <button
                type="button"
                className={`board-pane__move${decisionIndex === row.white.ply - 1 ? ' is-current' : ''}`}
                onClick={() => goTo(row.white!.ply - 1)}
              >
                {row.white.san}
                <MoveBadge judgment={judgments?.[row.white.ply - 1]} />
              </button>
            )}
            {row.black && (
              <button
                type="button"
                className={`board-pane__move${decisionIndex === row.black.ply - 1 ? ' is-current' : ''}`}
                onClick={() => goTo(row.black!.ply - 1)}
              >
                {row.black.san}
                <MoveBadge judgment={judgments?.[row.black.ply - 1]} />
              </button>
            )}
          </li>
        ))}
      </ol>
      </details>

      <p className="board-pane__filename">{fileName}</p>
    </div>
  )
}

export default BoardPane
