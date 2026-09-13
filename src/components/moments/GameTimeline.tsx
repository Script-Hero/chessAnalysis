import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { Side } from '../../lib/analysis'
import { COMPENSATION_PAWNS, describeCompensation, type Compensation } from '../../lib/compensation'
import type { CorridorPoint, NarrowingEpisode } from '../../lib/corridor'
import { moveLabel, type Moment, type Squeeze } from '../../lib/moments'
import type { DecisionNode } from '../../lib/moveGraph'
import type { PieceLane } from '../../lib/pieceLanes'
import type { ParsedGame } from '../../lib/pgn'
import { CHOICE_TEXT } from './labels'

export type Span = { from: number; to: number }

type Props = {
  game: ParsedGame
  sides: Side[]
  points: CorridorPoint[]
  decisions: DecisionNode[]
  episodes: NarrowingEpisode[]
  moments: Moment[]
  squeezes: Squeeze[]
  compensation: Compensation | null
  pieces: PieceLane[]
  selected: number
  hover: number | null
  onHover: (index: number | null) => void
  onSelect: (index: number) => void
  highlight: Span | null
  brushed: Set<number>
  reviewed: Set<number>
  selectedEpisode: NarrowingEpisode | null
  onSelectEpisode: (episode: NarrowingEpisode) => void
}

/** Left gutter wide enough for piece names. */
const GUTTER = 92
const RIGHT = 16
const CHOICE_LANE = 128
const CHOICE_BAR = 72
const AXIS = 24
const COMP_H = 96
const COMP_RANGE = 6
const PIECE_ROW = 20
const SECTION_GAP = 30

const activate = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    fn()
  }
}

/**
 * Every per-move lane of the Moments tab on one horizontal scale.
 *
 * Choices, compensation and pieces all run along the same move axis, and the
 * point of drawing them together is the alignment: a squeeze in the choices lane
 * lining up with a jump in compensation is often the whole reason a move is
 * worth opening. One SVG, one scroll container, one cursor.
 */
export default function GameTimeline(props: Props) {
  const { game, sides, points, decisions, episodes, moments, squeezes, compensation, pieces } = props
  const { selected, hover, onHover, onSelect, highlight, brushed, reviewed, selectedEpisode, onSelectEpisode } = props
  const [piecesOpen, setPiecesOpen] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.floor(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const n = game.moves.length
  const fullMoves = Math.max(1, Math.ceil(n / 2))
  const width = Math.max(available, 640, GUTTER + RIGHT + fullMoves * 14)
  const plotW = width - GUTTER - RIGHT
  /** Centre of move `index`'s column. White and Black share a column, in separate lanes. */
  const xMove = (index: number) => GUTTER + (Math.floor(index / 2) + 0.5) / fullMoves * plotW
  /** Position `p` (before move `p`) sits on a column boundary. */
  const xPos = (p: number) => GUTTER + (p / 2) / fullMoves * plotW
  const indexAt = (clientX: number, svg: SVGSVGElement) => {
    const rect = svg.getBoundingClientRect()
    const p = Math.round(((clientX - rect.left - GUTTER) / plotW) * fullMoves * 2)
    return Math.max(0, Math.min(n - 1, p))
  }

  const maxWidth = Math.max(2, ...points.map((p) => p.width))
  const barH = (w: number) => Math.max(3, (Math.log2(Math.max(1, w)) / Math.log2(maxWidth)) * CHOICE_BAR)
  const byIndex = new Map(decisions.map((d) => [d.index, d]))
  const pointAt = new Map(points.map((p) => [p.index, p]))

  // Vertical layout.
  const choicesTop = 16
  const laneBase = (lane: number) => choicesTop + lane * CHOICE_LANE + CHOICE_BAR + 20
  const choicesBottom = choicesTop + sides.length * CHOICE_LANE
  const compTop = choicesBottom + SECTION_GAP
  const compMid = compTop + COMP_H / 2
  const piecesTop = compTop + (compensation ? COMP_H + SECTION_GAP : 0)
  const pieceRows: ({ kind: 'side'; side: Side } | { kind: 'lane'; lane: PieceLane })[] = []
  if (piecesOpen) {
    for (const side of sides) {
      const own = pieces.filter((l) => l.side === side)
      if (!own.length) continue
      pieceRows.push({ kind: 'side', side }, ...own.map((lane) => ({ kind: 'lane' as const, lane })))
    }
  }
  const piecesBottom = piecesTop + pieceRows.length * PIECE_ROW
  const axisY = (piecesOpen && pieceRows.length ? piecesBottom : compensation ? compTop + COMP_H : choicesBottom) + 18
  const height = axisY + AXIS - 8
  const laneOf = (side: Side) => sides.indexOf(side)

  const dim = (index: number) => (brushed.size > 0 && !brushed.has(index)) || (reviewed.has(index) && index !== selected)
  const colorFor = (d: DecisionNode | undefined, side: Side) =>
    d?.choice === 'outside' ? 'var(--status-critical)' : side === 'white' ? 'var(--white-accent)' : 'var(--black-accent)'
  const dotColor = (d: DecisionNode | undefined) =>
    !d?.choice ? 'var(--parchment-dim)' : d.choice === 'outside' ? 'var(--status-critical)' : d.choice === 'best' ? 'var(--status-good)' : 'var(--brass)'

  const compPath = (() => {
    if (!compensation) return ''
    const y = (v: number) => compMid - (Math.max(-COMP_RANGE, Math.min(COMP_RANGE, v)) / COMP_RANGE) * (COMP_H / 2 - 4)
    let d = ''
    let pen = false
    for (const pt of compensation.points) {
      if (pt.value === null) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${xPos(pt.position).toFixed(1)},${y(pt.value).toFixed(1)} `
      pen = true
    }
    return d
  })()

  const readIndex = hover ?? selected
  const readPoint = pointAt.get(readIndex)
  const readDecision = byIndex.get(readIndex)
  const readMoment = moments.find((m) => m.index === readIndex || m.covers.includes(readIndex))
  const readComp = compensation?.points[readIndex]
  const pinned = moments.filter((m) => sides.includes(m.side))

  const onSvgMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    // Only the compensation band maps a bare x to a move; lanes set hover from their own targets.
    const target = e.target as Element
    if (target.closest('[data-hover-x]')) onHover(indexAt(e.clientX, e.currentTarget))
  }

  return (
    <div className="game-timeline">
      <div className="game-timeline__readout" aria-live="polite">
        {readPoint || readDecision ? (
          <>
            <strong>{moveLabel(readIndex, game.moves[readIndex].san)}</strong>
            {readPoint && <span>{readPoint.width.toFixed(1)} effective choices</span>}
            {readDecision?.choice && (
              <span className={`game-timeline__verdict is-${readDecision.choice}`}>{CHOICE_TEXT[readDecision.choice]}</span>
            )}
            {readComp && <span className="game-timeline__comp">{describeCompensation(readComp)}</span>}
            {readMoment && <span className="game-timeline__tag">Worth reviewing</span>}
            {reviewed.has(readIndex) && <span className="game-timeline__tag is-muted">Reviewed</span>}
          </>
        ) : (
          <span>Hover a move to read it; click to select it.</span>
        )}
      </div>

      <div className="game-timeline__scroll" ref={scrollRef} tabIndex={0} aria-label="Game timeline">
        <svg
          width={width}
          height={height}
          role="group"
          aria-label="Choices, compensation and pieces by move"
          className={brushed.size ? 'is-brushed' : undefined}
          onPointerMove={onSvgMove}
          onPointerLeave={() => onHover(null)}
        >
          {highlight && (
            <rect className="game-timeline__highlight" x={xPos(highlight.from)} y={0} width={Math.max(6, xPos(highlight.to) - xPos(highlight.from))} height={axisY} />
          )}

          {/* Choices lanes */}
          {sides.map((side, lane) => {
            const base = laneBase(lane)
            return (
              <g key={side}>
                <text className={`game-timeline__lane-label is-${side}`} x={GUTTER} y={base - CHOICE_BAR - 8}>
                  {side === 'white' ? 'White' : 'Black'} · choices
                </text>
                {[2, 4, 8, 16, 32].filter((v) => v <= maxWidth).map((v) => (
                  <g key={v}>
                    <line className="game-timeline__grid" x1={GUTTER} x2={width - RIGHT} y1={base - barH(v)} y2={base - barH(v)} />
                    <text className="game-timeline__tick" x={GUTTER - 8} y={base - barH(v) + 4} textAnchor="end">{v}</text>
                  </g>
                ))}
                {episodes.filter((e) => e.mover === side).map((e) => {
                  const active = selectedEpisode?.mover === e.mover && selectedEpisode.startPly === e.startPly
                  const x0 = xMove(e.startPly - 1) - 6
                  const w = Math.max(12, xMove(e.endPly - 1) - xMove(e.startPly - 1) + 12)
                  const label = `${side === 'white' ? 'White' : 'Black'} narrowing stretch, moves ${Math.ceil(e.startPly / 2)} to ${Math.ceil(e.endPly / 2)}`
                  return (
                    <g key={e.startPly} role="button" tabIndex={0} aria-label={label} aria-pressed={active} onClick={() => onSelectEpisode(e)} onKeyDown={activate(() => onSelectEpisode(e))}>
                      <rect className={`game-timeline__stretch${active ? ' is-active' : ''}`} x={x0} y={base - CHOICE_BAR - 4} width={w} height={CHOICE_BAR + 8} />
                      <rect className={`game-timeline__stretch-handle${active ? ' is-active' : ''}`} x={x0} y={base + 18} width={w} height={7} rx={3} />
                    </g>
                  )
                })}
                {points.filter((p) => p.mover === side).map((p) => {
                  const d = byIndex.get(p.index)
                  const h = barH(p.width)
                  const outside = d?.choice === 'outside'
                  const isBrushed = brushed.has(p.index)
                  return (
                    <g
                      key={p.index}
                      className={`game-timeline__move${dim(p.index) ? ' is-dim' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${moveLabel(p.index, p.san)}, ${p.width.toFixed(1)} effective choices${d?.choice ? `, ${CHOICE_TEXT[d.choice]}` : ''}`}
                      aria-pressed={p.index === selected}
                      onPointerEnter={() => onHover(p.index)}
                      onFocus={() => onHover(p.index)}
                      onBlur={() => onHover(null)}
                      onClick={() => onSelect(p.index)}
                      onKeyDown={activate(() => onSelect(p.index))}
                    >
                      <rect x={xMove(p.index) - 6} y={base - CHOICE_BAR - 4} width={12} height={CHOICE_BAR + 20} fill="transparent" />
                      <rect x={xMove(p.index) - 3} y={base - h} width={6} height={h} fill={colorFor(d, side)} className={isBrushed ? 'game-timeline__bar is-brushed' : 'game-timeline__bar'} />
                      {outside && <text className="game-timeline__cross" x={xMove(p.index)} y={base + 13} textAnchor="middle">×</text>}
                    </g>
                  )
                })}
                {pinned.filter((m) => m.side === side).map((m) => (
                  <g
                    key={`${m.kind}-${m.index}`}
                    className="game-timeline__pin"
                    role="button"
                    tabIndex={0}
                    aria-label={`Worth reviewing: ${moveLabel(m.index, game.moves[m.index].san)} ${m.headline}`}
                    onPointerEnter={() => onHover(m.index)}
                    onClick={() => onSelect(m.index)}
                    onKeyDown={activate(() => onSelect(m.index))}
                  >
                    <title>{`${m.side === 'white' ? 'White' : 'Black'} ${m.headline}`}</title>
                    <path d={`M${xMove(m.index)},${base - CHOICE_BAR - 2} l5,-6 l-5,-6 l-5,6 z`} />
                  </g>
                ))}
                <line className="game-timeline__base" x1={GUTTER} x2={width - RIGHT} y1={base} y2={base} />
              </g>
            )
          })}

          {/* Cause links: only drawable when both lanes are on screen. */}
          {sides.length === 2 &&
            squeezes.map((s) => {
              const from = pointAt.get(s.setter)
              const to = pointAt.get(s.target)
              if (!from || !to) return null
              // Leave the setter's lane on the side facing the target, and arrive the same way.
              const down = laneOf(from.mover) < laneOf(to.mover)
              const y1 = down ? laneBase(laneOf(from.mover)) + 2 : laneBase(laneOf(from.mover)) - barH(from.width) - 2
              const y2 = down ? laneBase(laneOf(to.mover)) - barH(to.width) - 4 : laneBase(laneOf(to.mover)) + 4
              const x1 = xMove(s.setter)
              const x2 = xMove(s.target)
              const mid = (y1 + y2) / 2
              return (
                <path
                  key={s.setter}
                  className={`game-timeline__cause${hover === s.target || hover === s.setter || selected === s.target ? ' is-active' : ''}`}
                  d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`}
                  markerEnd="url(#game-timeline-arrow)"
                >
                  <title>{`${moveLabel(s.setter, game.moves[s.setter].san)} cut the options to ${Math.max(1, Math.round(s.to))}`}</title>
                </path>
              )
            })}
          <defs>
            <marker id="game-timeline-arrow" viewBox="0 0 6 6" refX="3" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L6,0 L3,6 z" className="game-timeline__arrow" />
            </marker>
          </defs>

          {/* Compensation */}
          {compensation && (
            <g>
              <text className="game-timeline__lane-label" x={GUTTER} y={compTop - 10}>Beyond material · evaluation minus material</text>
              <rect data-hover-x className="game-timeline__comp-bg" x={GUTTER} y={compTop} width={plotW} height={COMP_H} onClick={(e) => onSelect(indexAt(e.clientX, e.currentTarget.ownerSVGElement!))} />
              {compensation.regions.map((r) => (
                <rect
                  key={r.from}
                  data-hover-x
                  className={`game-timeline__comp-region is-${r.side}`}
                  x={xPos(r.from)}
                  y={r.side === 'white' ? compTop : compMid}
                  width={Math.max(3, xPos(r.to) - xPos(r.from))}
                  height={COMP_H / 2}
                  onClick={(e) => onSelect(indexAt(e.clientX, e.currentTarget.ownerSVGElement!))}
                />
              ))}
              {[COMPENSATION_PAWNS, -COMPENSATION_PAWNS].map((v) => {
                const y = compMid - (v / COMP_RANGE) * (COMP_H / 2 - 4)
                return (
                  <g key={v}>
                    <line className="game-timeline__grid" x1={GUTTER} x2={width - RIGHT} y1={y} y2={y} />
                    <text className="game-timeline__tick" x={GUTTER - 8} y={y + 4} textAnchor="end">{v > 0 ? `+${v}` : `−${-v}`}</text>
                  </g>
                )
              })}
              <text className="game-timeline__tick is-white" x={GUTTER - 8} y={compTop + 10} textAnchor="end">White</text>
              <text className="game-timeline__tick is-black" x={GUTTER - 8} y={compTop + COMP_H - 2} textAnchor="end">Black</text>
              <line className="game-timeline__base" x1={GUTTER} x2={width - RIGHT} y1={compMid} y2={compMid} />
              <path className="game-timeline__comp-line" d={compPath} />
            </g>
          )}

          {/* Pieces */}
          {pieceRows.map((row, k) => {
            const y = piecesTop + k * PIECE_ROW + PIECE_ROW / 2
            if (row.kind === 'side') {
              return (
                <text key={`side-${row.side}`} className={`game-timeline__lane-label is-${row.side}`} x={GUTTER} y={y + 4}>
                  {row.side === 'white' ? 'White' : 'Black'} · pieces
                </text>
              )
            }
            const { lane } = row
            return (
              <g key={lane.id}>
                <line className="game-timeline__piece-rule" x1={GUTTER} x2={width - RIGHT} y1={y} y2={y} />
                <text className="game-timeline__piece-label" x={GUTTER - 8} y={y + 4} textAnchor="end">{lane.label}</text>
                {lane.moves.map((i) => (
                  <circle
                    key={i}
                    className={`game-timeline__piece-dot${dim(i) ? ' is-dim' : ''}${i === selected ? ' is-selected' : ''}`}
                    cx={xMove(i)}
                    cy={y}
                    r={4.5}
                    fill={dotColor(byIndex.get(i))}
                    role="button"
                    tabIndex={-1}
                    aria-label={`${lane.label}: ${moveLabel(i, game.moves[i].san)}`}
                    onPointerEnter={() => onHover(i)}
                    onClick={() => onSelect(i)}
                  />
                ))}
              </g>
            )
          })}

          {/* Cursors */}
          {selected < n && <line className="game-timeline__cursor" x1={xMove(selected)} x2={xMove(selected)} y1={4} y2={axisY - 12} />}
          {hover !== null && hover !== selected && <line className="game-timeline__hairline" x1={xMove(hover)} x2={xMove(hover)} y1={4} y2={axisY - 12} />}

          {Array.from({ length: Math.ceil(fullMoves / 5) }, (_, k) => k * 5 + 1).map((m) => (
            <text key={m} className="game-timeline__tick" x={xMove((m - 1) * 2)} y={axisY} textAnchor="middle">{m}</text>
          ))}
        </svg>
      </div>

      <div className="game-timeline__footer">
        <p className="game-timeline__key">
          <span><i className="game-timeline__key-pin" /> Worth reviewing</span>
          <span><i className="game-timeline__key-cause" /> Move that cut the other side's options</span>
          <span>× left the safe moves</span>
          <span><i className="game-timeline__key-stretch" /> Options narrowing</span>
          {compensation && <span><i className="game-timeline__key-comp" /> Position worth 2+ pawns more than material</span>}
        </p>
        {pieces.length > 0 && (
          <button type="button" className="game-timeline__toggle" aria-expanded={piecesOpen} onClick={() => setPiecesOpen((v) => !v)}>
            {piecesOpen ? 'Hide pieces' : 'Show pieces'}
          </button>
        )}
      </div>
      <details className="game-timeline__method">
        <summary>How to read this</summary>
        <p>
          Choices: bar height is how many moves were about as good as the best one (log scale); a bar near one means effectively one
          move held. Beyond material: the engine evaluation minus the material count, in pawns. It sits near zero when the evaluation is
          just counting pieces, and moves away when activity, an attack or a sacrifice matters more. Pieces: one row per piece that
          moved; dots are coloured green for the best move, gold for a move that kept the position, red for one that did not.
        </p>
      </details>
    </div>
  )
}
