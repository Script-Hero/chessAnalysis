import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CorridorPoint, NarrowingEpisode } from '../../lib/corridor'
import type { PositionEval } from '../../lib/stockfish'
import { CHOICE_COLOR } from '../../lib/moveGraph'
import type { Choice, DecisionNode } from '../../lib/moveGraph'
import './CorridorChart.css'

type CorridorChartProps = {
  points: CorridorPoint[]
  decisions: DecisionNode[]
  episodes: NarrowingEpisode[]
  evals: PositionEval[] | null
  /** Currently viewed ply, in board terms (position index). */
  currentPly: number
  onSelect: (positionIndex: number) => void
}

const WIDTH = 900
const PAD_T = 20
const HALF = 100
const AXIS_Y = PAD_T + HALF
/** The evaluation gets its own lane rather than a second scale over the bars. */
const LANE_GAP = 18
const EVAL_H = 46
const EVAL_TOP = AXIS_Y + HALF + LANE_GAP
const EVAL_MID = EVAL_TOP + EVAL_H / 2
const PAD_B = 16
const HEIGHT = EVAL_TOP + EVAL_H + PAD_B
const PAD_L = 46
const PAD_R = 12
const EVAL_CLAMP = 5

/**
 * Bars are drawn in bits (log2 of the corridor width) rather than in raw move
 * counts. Width is a multiplicative quantity — the number of surviving plans
 * over several moves is a product of the per-move widths — so a log axis is the
 * one on which "the corridor halved" is a constant drop wherever it happens.
 */
const GRID = [2, 4, 8, 16, 32]
const MAX_BITS = Math.log2(48)

const VERDICT: Record<Choice, string> = {
  best: 'played the best move',
  inside: 'stayed in the corridor',
  outside: 'left the corridor',
}

function moveLabel(p: CorridorPoint): string {
  const n = Math.floor((p.ply - 1) / 2) + 1
  return p.mover === 'white' ? `${n}.${p.san}` : `${n}…${p.san}`
}

function evalLabel(e: PositionEval | undefined): string {
  if (!e) return '—'
  if (e.mateIn !== null) return `mate in ${Math.abs(e.mateIn)} for ${e.mateIn > 0 ? 'White' : 'Black'}`
  return `${e.score > 0 ? '+' : ''}${e.score.toFixed(2)}`
}

function CorridorChart({ points, decisions, episodes, evals, currentPly, onSelect }: CorridorChartProps) {
  const innerW = WIDTH - PAD_L - PAD_R
  const count = points.length
  const [hover, setHover] = useState<number | null>(null)
  const [keyboard, setKeyboard] = useState(false)
  const hitRefs = useRef<(SVGRectElement | null)[]>([])

  const pitch = innerW / Math.max(1, count)
  const xOf = useCallback(
    (index: number) => PAD_L + (index + 0.5) * (innerW / Math.max(1, count)),
    [count, innerW],
  )
  const barW = Math.max(2, Math.min(16, pitch - 2))
  const bitsToPx = (bits: number) => (Math.min(bits, MAX_BITS) / MAX_BITS) * (HALF - 10)
  const evalToY = (score: number) => {
    const v = Math.max(-EVAL_CLAMP, Math.min(EVAL_CLAMP, score))
    return EVAL_MID - (v / EVAL_CLAMP) * (EVAL_H / 2 - 3)
  }

  const byIndex = useMemo(() => new Map(decisions.map((d) => [d.index, d])), [decisions])

  // The chart is filtered by side, so the board's ply has to be looked up in the
  // points actually on screen rather than used as a position in them.
  const currentIdx = useMemo(() => points.findIndex((p) => p.index === currentPly), [points, currentPly])

  const evalPath = useMemo(() => {
    if (!evals || evals.length === 0) return null
    return points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${evalToY(evals[p.index]?.score ?? 0).toFixed(1)}`)
      .join(' ')
  }, [evals, points, xOf])

  // Filled to the zero line and split at it, so which side stands better is
  // legible from the shape alone rather than from where the thin line sits.
  const evalArea = evalPath ? `${evalPath} L ${xOf(count - 1).toFixed(1)} ${EVAL_MID} L ${xOf(0).toFixed(1)} ${EVAL_MID} Z` : null

  /** Sparse move numbers along the bottom: without them there is no way to say where in the game a bar is. */
  const xLabels = useMemo(() => {
    const stride = Math.max(1, Math.ceil(count / 12))
    return points
      .map((p, i) => ({ i, n: Math.floor((p.ply - 1) / 2) + 1 }))
      .filter(({ i }) => i % stride === 0)
  }, [points, count])

  const episodeBands = useMemo(
    () =>
      episodes.map((ep) => {
        const from = points.findIndex((p) => p.ply >= ep.startPly)
        const toIdx = points.findIndex((p) => p.ply >= ep.endPly)
        const x1 = xOf(from < 0 ? 0 : from) - barW
        const x2 = xOf(toIdx < 0 ? count - 1 : toIdx) + barW
        return { ep, x: x1, width: Math.max(4, x2 - x1) }
      }),
    [episodes, points, count, barW, xOf],
  )

  /** Which narrowing run, if any, a point sits inside — surfaced in the readout. */
  const episodeAt = useCallback(
    (p: CorridorPoint) => episodes.find((ep) => p.mover === ep.mover && p.ply >= ep.startPly && p.ply <= ep.endPly),
    [episodes],
  )

  // Arrow keys walk the bars, which is the only way to read this chart without a
  // mouse — and the only way to read it at all on a game where the bars are 2px.
  const step = (delta: number) => {
    if (count === 0) return
    const base = currentIdx >= 0 ? currentIdx : hover ?? 0
    const next = Math.max(0, Math.min(count - 1, base + delta))
    setKeyboard(true)
    setHover(next)
    onSelect(points[next].index)
  }

  useEffect(() => {
    if (keyboard && currentIdx >= 0) hitRefs.current[currentIdx]?.focus()
  }, [keyboard, currentIdx])

  const readIdx = hover ?? (currentIdx >= 0 ? currentIdx : null)
  const read = readIdx === null ? null : points[readIdx]
  const readNode = read ? byIndex.get(read.index) : null
  const readChoice = readNode?.choice ?? null
  const readEpisode = read ? episodeAt(read) : undefined

  return (
    <div className="corridor-chart">
      <div className="corridor-chart__readout">
        {read ? (
          <>
            <span className="corridor-chart__read-move">{moveLabel(read)}</span>
            <span className="corridor-chart__read-figure">
              <strong>{read.width.toFixed(1)}</strong> moves really competed
            </span>
            <span className="corridor-chart__read-band">
              {read.countedWidth} inside the cutoff ({read.countLow}–{read.countHigh})
              {readNode?.legalCount ? ` of ${readNode.legalCount} legal` : ''}
            </span>
            {readChoice && (
              <span className={`corridor-chart__read-verdict is-${readChoice}`}>{VERDICT[readChoice]}</span>
            )}
            {read.isCut && <span className="corridor-chart__read-flag is-cut">only one move held</span>}
            {readEpisode && (
              <span className={`corridor-chart__read-flag${readEpisode.collapsed ? ' is-broken' : ''}`}>
                {readEpisode.collapsed ? 'in a narrowing that broke' : 'in a sustained narrowing'}
              </span>
            )}
            <span className="corridor-chart__read-eval">eval {evalLabel(evals?.[read.index])}</span>
          </>
        ) : (
          <span className="corridor-chart__read-hint">Hover or arrow across a bar to read it — click to open the move.</span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={`corridor-chart__svg${hover !== null ? ' is-hovering' : ''}`}
        role="group"
        aria-label="Real choices offered at each move, White above the axis and Black below, with the evaluation underneath"
        onMouseLeave={() => setHover(null)}
        onBlur={(e) => {
          // Only when focus leaves the chart entirely — moving between bars with
          // the arrow keys fires focusout on every step.
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setKeyboard(false)
            setHover(null)
          }
        }}
      >
        {episodeBands.map(({ ep, x, width }) => (
          <rect
            key={`${ep.mover}-${ep.startPly}`}
            x={x}
            y={ep.mover === 'white' ? PAD_T : AXIS_Y}
            width={width}
            height={HALF}
            className={`corridor-chart__episode${ep.collapsed ? ' is-collapsed' : ''}`}
          />
        ))}

        {GRID.map((moves) => {
          const dy = bitsToPx(Math.log2(moves))
          return (
            <g key={moves}>
              <line x1={PAD_L} x2={WIDTH - PAD_R} y1={AXIS_Y - dy} y2={AXIS_Y - dy} className="corridor-chart__grid" />
              <line x1={PAD_L} x2={WIDTH - PAD_R} y1={AXIS_Y + dy} y2={AXIS_Y + dy} className="corridor-chart__grid" />
              <text x={PAD_L - 7} y={AXIS_Y - dy + 3.5} textAnchor="end" className="corridor-chart__tick">
                {moves}
              </text>
              <text x={PAD_L - 7} y={AXIS_Y + dy + 3.5} textAnchor="end" className="corridor-chart__tick">
                {moves}
              </text>
            </g>
          )
        })}
        <text x={PAD_L - 7} y={AXIS_Y + 3.5} textAnchor="end" className="corridor-chart__tick">
          1
        </text>
        <text
          transform={`rotate(-90) translate(${-AXIS_Y} 13)`}
          textAnchor="middle"
          className="corridor-chart__axis-title"
        >
          moves that competed
        </text>

        <line x1={PAD_L} x2={WIDTH - PAD_R} y1={AXIS_Y} y2={AXIS_Y} className="corridor-chart__axis" />

        {points.map((p, i) => {
          const node = byIndex.get(p.index)
          const h = Math.max(1.5, bitsToPx(p.bits))
          const x = xOf(i) - barW / 2
          const y = p.mover === 'white' ? AXIS_Y - h : AXIS_Y
          const choice = node?.choice ?? null
          const color = choice ? `var(${CHOICE_COLOR[choice]})` : 'var(--parchment-dim)'
          const isCurrent = i === currentIdx
          const isHover = i === hover

          return (
            <g key={p.index} className="corridor-chart__mark">
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={1.5}
                fill={color}
                className={`corridor-chart__bar${isCurrent ? ' is-current' : ''}${isHover ? ' is-hover' : ''}`}
              />
              {p.isCut && (
                <circle
                  cx={xOf(i)}
                  cy={p.mover === 'white' ? AXIS_Y - h - 5 : AXIS_Y + h + 5}
                  r={2.6}
                  className="corridor-chart__cut"
                />
              )}
              {choice === 'outside' && (
                <rect
                  x={x}
                  y={p.mover === 'white' ? AXIS_Y - h - 2.5 : AXIS_Y + h + 0.5}
                  width={barW}
                  height={2}
                  className="corridor-chart__exit"
                />
              )}
            </g>
          )
        })}

        {/* The evaluation lane: same x, its own scale, so the two are read
            against each other without sharing an axis. */}
        <g className="corridor-chart__lane">
          <rect x={PAD_L} y={EVAL_TOP} width={innerW} height={EVAL_H} className="corridor-chart__lane-bg" />
          <line x1={PAD_L} x2={WIDTH - PAD_R} y1={EVAL_MID} y2={EVAL_MID} className="corridor-chart__lane-zero" />
          <clipPath id="corridor-eval-above">
            <rect x={PAD_L} y={EVAL_TOP} width={innerW} height={EVAL_H / 2} />
          </clipPath>
          <clipPath id="corridor-eval-below">
            <rect x={PAD_L} y={EVAL_MID} width={innerW} height={EVAL_H / 2} />
          </clipPath>
          {evalArea && (
            <>
              <path d={evalArea} className="corridor-chart__eval-fill is-white" clipPath="url(#corridor-eval-above)" />
              <path d={evalArea} className="corridor-chart__eval-fill is-black" clipPath="url(#corridor-eval-below)" />
            </>
          )}
          {evalPath && <path d={evalPath} className="corridor-chart__eval" />}
          <text x={PAD_L - 7} y={EVAL_TOP + 8} textAnchor="end" className="corridor-chart__tick">
            +5
          </text>
          <text x={PAD_L - 7} y={EVAL_TOP + EVAL_H - 1} textAnchor="end" className="corridor-chart__tick">
            −5
          </text>
          {read && evals?.[read.index] && (
            <circle
              cx={xOf(readIdx as number)}
              cy={evalToY(evals[read.index].score)}
              r={3}
              className="corridor-chart__eval-dot"
            />
          )}
        </g>

        {currentIdx >= 0 && (
          <line
            x1={xOf(currentIdx)}
            x2={xOf(currentIdx)}
            y1={PAD_T}
            y2={EVAL_TOP + EVAL_H}
            className="corridor-chart__cursor"
          />
        )}
        {hover !== null && hover !== currentIdx && (
          <line
            x1={xOf(hover)}
            x2={xOf(hover)}
            y1={PAD_T}
            y2={EVAL_TOP + EVAL_H}
            className="corridor-chart__hairline"
          />
        )}

        {/* Full-height hit targets: the bars themselves get down to 1.5px tall,
            which is not something anyone can point at. */}
        {points.map((p, i) => (
          <rect
            key={`hit-${p.index}`}
            ref={(el) => {
              hitRefs.current[i] = el
            }}
            x={PAD_L + i * pitch}
            y={PAD_T}
            width={pitch}
            height={EVAL_TOP + EVAL_H - PAD_T}
            className="corridor-chart__hit"
            role="button"
            tabIndex={i === (currentIdx >= 0 ? currentIdx : 0) ? 0 : -1}
            aria-label={`${moveLabel(p)}, ${p.width.toFixed(1)} moves competed${
              byIndex.get(p.index)?.choice ? `, ${VERDICT[byIndex.get(p.index)!.choice as Choice]}` : ''
            }`}
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onClick={() => onSelect(p.index)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault()
                step(1)
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault()
                step(-1)
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(p.index)
              }
            }}
          />
        ))}

        <text x={PAD_L + 4} y={PAD_T - 6} className="corridor-chart__side-label is-white">
          ↑ White
        </text>
        <text x={PAD_L + 4} y={AXIS_Y + HALF + 12} className="corridor-chart__side-label is-black">
          ↓ Black
        </text>
        {xLabels.map(({ i, n }) => (
          <text key={`x-${i}`} x={xOf(i)} y={HEIGHT - 4} textAnchor="middle" className="corridor-chart__x-label">
            {n}
          </text>
        ))}
      </svg>

      <div className="corridor-chart__legend">
        <span className="corridor-chart__legend-label">bar height = choices · colour = the move played</span>
        <span className="corridor-chart__legend-item">
          <span className="corridor-chart__swatch" style={{ background: 'var(--status-good)' }} />
          best move
        </span>
        <span className="corridor-chart__legend-item">
          <span className="corridor-chart__swatch" style={{ background: 'var(--white-accent)' }} />
          stayed in the corridor
        </span>
        <span className="corridor-chart__legend-item">
          <span className="corridor-chart__swatch" style={{ background: 'var(--status-critical)' }} />
          left the corridor
        </span>
        <span className="corridor-chart__legend-item">
          <span className="corridor-chart__swatch corridor-chart__swatch--cut" />
          only one move held
        </span>
        <span className="corridor-chart__legend-item">
          <span className="corridor-chart__swatch corridor-chart__swatch--band" />
          sustained narrowing
        </span>
        <span className="corridor-chart__legend-item">
          <span className="corridor-chart__swatch corridor-chart__swatch--eval" />
          evaluation (own lane)
        </span>
      </div>
    </div>
  )
}

export default CorridorChart
