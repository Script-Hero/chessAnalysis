import { useCallback, useMemo } from 'react'
import type { CorridorPoint, NarrowingEpisode } from '../../lib/corridor'
import type { PositionEval } from '../../lib/stockfish'
import { CHOICE_COLOR } from '../../lib/moveGraph'
import type { DecisionNode } from '../../lib/moveGraph'
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
const HALF = 118
const PAD_T = 18
const PAD_B = 26
const HEIGHT = PAD_T + HALF * 2 + PAD_B
const AXIS_Y = PAD_T + HALF
const PAD_L = 34
const PAD_R = 10

/**
 * Bars are drawn in bits (log2 of the corridor width) rather than in raw move
 * counts. Width is a multiplicative quantity — the number of surviving plans
 * over several moves is a product of the per-move widths — so a log axis is the
 * one on which "the corridor halved" is a constant drop wherever it happens.
 */
const TICKS = [1, 2, 4, 8, 16, 32]
const MAX_BITS = Math.log2(48)

function moveLabel(p: CorridorPoint): string {
  const n = Math.floor((p.ply - 1) / 2) + 1
  return p.mover === 'white' ? `${n}.${p.san}` : `${n}…${p.san}`
}

function CorridorChart({ points, decisions, episodes, evals, currentPly, onSelect }: CorridorChartProps) {
  const innerW = WIDTH - PAD_L - PAD_R
  const count = points.length

  const xOf = useCallback(
    (index: number) => PAD_L + ((index + 0.5) / Math.max(1, count)) * innerW,
    [count, innerW],
  )
  const barW = Math.max(2, Math.min(16, innerW / Math.max(1, count) - 2))
  const bitsToPx = (bits: number) => (Math.min(bits, MAX_BITS) / MAX_BITS) * (HALF - 8)

  const byIndex = useMemo(() => new Map(decisions.map((d) => [d.index, d])), [decisions])

  // The eval trace is drawn behind the bars so the two can be read against each
  // other: a flat eval over a collapsing corridor is the shape this whole view
  // exists to expose.
  const evalPath = useMemo(() => {
    if (!evals || evals.length === 0) return null
    const clamp = (v: number) => Math.max(-5, Math.min(5, v))
    return points
      .map((p, i) => {
        const value = clamp(evals[p.index]?.score ?? 0)
        const y = AXIS_Y - (value / 5) * (HALF - 8)
        return `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${y.toFixed(1)}`
      })
      .join(' ')
  }, [evals, points, xOf])

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

  return (
    <div className="corridor-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="corridor-chart__svg">
        {episodeBands.map(({ ep, x, width }) => (
          <g key={`${ep.mover}-${ep.startPly}`}>
            <rect
              x={x}
              y={ep.mover === 'white' ? PAD_T : AXIS_Y}
              width={width}
              height={HALF}
              className={`corridor-chart__episode${ep.collapsed ? ' is-collapsed' : ''}`}
            />
            <title>
              {`${ep.mover === 'white' ? 'White' : 'Black'}: corridor narrowed ${ep.startWidth} → ${ep.endWidth} over ${ep.decisions} moves${ep.collapsed ? ', and broke' : ''}`}
            </title>
          </g>
        ))}

        {TICKS.map((moves) => {
          const dy = bitsToPx(Math.log2(moves))
          return (
            <g key={moves}>
              <line x1={PAD_L} x2={WIDTH - PAD_R} y1={AXIS_Y - dy} y2={AXIS_Y - dy} className="corridor-chart__grid" />
              <line x1={PAD_L} x2={WIDTH - PAD_R} y1={AXIS_Y + dy} y2={AXIS_Y + dy} className="corridor-chart__grid" />
              <text x={PAD_L - 5} y={AXIS_Y - dy + 3} textAnchor="end" className="corridor-chart__tick">
                {moves}
              </text>
              <text x={PAD_L - 5} y={AXIS_Y + dy + 3} textAnchor="end" className="corridor-chart__tick">
                {moves}
              </text>
            </g>
          )
        })}

        {evalPath && <path d={evalPath} className="corridor-chart__eval" />}

        <line x1={PAD_L} x2={WIDTH - PAD_R} y1={AXIS_Y} y2={AXIS_Y} className="corridor-chart__axis" />

        {points.map((p, i) => {
          const node = byIndex.get(p.index)
          const h = Math.max(1.5, bitsToPx(p.bits))
          const x = xOf(i) - barW / 2
          const y = p.mover === 'white' ? AXIS_Y - h : AXIS_Y
          const choice = node?.choice ?? null
          const color = choice ? `var(${CHOICE_COLOR[choice]})` : 'var(--parchment-dim)'
          // Clicking selects the position *before* the move, which is the
          // position in which the decision was actually taken.
          const isCurrent = currentPly === p.index

          return (
            <g key={p.index}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={1.5}
                fill={color}
                opacity={1}
                className={`corridor-chart__bar${isCurrent ? ' is-current' : ''}`}
                onClick={() => onSelect(p.index)}
              >
                <title>
                  {/* Width is a perplexity, so it is continuous — printing it raw
                      put fifteen decimal places in the tooltip. */}
                  {`${moveLabel(p)} — ${p.width.toFixed(1)} real choices` +
                    (node?.legalCount ? ` of ${node.legalCount} legal` : '') +
                    (choice === 'outside' ? ' · left the corridor' : '') +
                    (p.isCut ? ' · only move' : '')}
                </title>
              </rect>
              {p.isCut && (
                <circle
                  cx={xOf(i)}
                  cy={p.mover === 'white' ? AXIS_Y - h - 5 : AXIS_Y + h + 5}
                  r={2.6}
                  className="corridor-chart__cut"
                  onClick={() => onSelect(p.index)}
                />
              )}
              {choice === 'outside' && (
                <rect
                  x={x}
                  y={p.mover === 'white' ? AXIS_Y - h - 2 : AXIS_Y + h}
                  width={barW}
                  height={2}
                  className="corridor-chart__exit"
                />
              )}
            </g>
          )
        })}

        {currentPly >= 0 && currentPly < count && (
          <line
            x1={xOf(currentPly)}
            x2={xOf(currentPly)}
            y1={PAD_T}
            y2={PAD_T + HALF * 2}
            className="corridor-chart__cursor"
          />
        )}

        <text x={PAD_L} y={PAD_T - 5} className="corridor-chart__side-label">
          White ↑
        </text>
        <text x={PAD_L} y={HEIGHT - 8} className="corridor-chart__side-label">
          Black ↓
        </text>
      </svg>

      <div className="corridor-chart__legend">
        <span className="corridor-chart__legend-item">
          <span className="corridor-chart__swatch" style={{ background: 'var(--status-good)' }} />
          played the best move
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
          <span className="corridor-chart__swatch corridor-chart__swatch--eval" />
          evaluation
        </span>
      </div>
    </div>
  )
}

export default CorridorChart
