import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ParsedMove } from '../../lib/pgn'
import type { MoveJudgment } from '../../lib/stockfish'
import './TimePressureChart.css'

type TimePressureChartProps = {
  moves: ParsedMove[]
  judgments: (MoveJudgment | null)[] | null
  timeControl?: string
  currentPly: number
  onSelectPly: (ply: number) => void
}

const VIEW_W = 640
const VIEW_H = 140
const PAD = { top: 12, right: 14, bottom: 14, left: 14 }
const INNER_W = VIEW_W - PAD.left - PAD.right
const INNER_H = VIEW_H - PAD.top - PAD.bottom

const MARKED = new Set(['mistake', 'blunder'])

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function TimePressureChart({ moves, judgments, timeControl, currentPly, onSelectPly }: TimePressureChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverPly, setHoverPly] = useState<number | null>(null)

  const total = moves.length
  const maxClock = Math.max(1, ...moves.map((m) => m.clockSeconds ?? 0))

  const xAt = (ply: number) => PAD.left + (total === 0 ? 0 : (ply / total) * INNER_W)
  const yAt = (seconds: number) => PAD.top + INNER_H - (Math.max(0, seconds) / maxClock) * INNER_H

  const whitePath = moves
    .map((m, i) => (i % 2 === 0 ? `${xAt(i + 1)} ${yAt(m.clockSeconds ?? 0)}` : ''))
    .filter(Boolean)
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt}`)
    .join(' ')

  const blackPath = moves
    .map((m, i) => (i % 2 === 1 ? `${xAt(i + 1)} ${yAt(m.clockSeconds ?? 0)}` : ''))
    .filter(Boolean)
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt}`)
    .join(' ')

  const plyFromClientX = (clientX: number): number | null => {
    const svg = svgRef.current
    if (!svg || total === 0) return null
    const rect = svg.getBoundingClientRect()
    const frac = (clientX - rect.left) / rect.width
    const viewX = frac * VIEW_W
    const ratio = (viewX - PAD.left) / INNER_W
    return Math.max(1, Math.min(total, Math.round(ratio * total)))
  }

  const activePly = hoverPly ?? currentPly
  const activeMove = activePly > 0 ? moves[activePly - 1] : null

  return (
    <div className="time-chart">
      <div className="time-chart__header">
        <span className="time-chart__title">Clock pressure</span>
        <span className="time-chart__readout">
          {activeMove?.clockSeconds != null ? formatClock(activeMove.clockSeconds) : '—'}
          {timeControl && <span className="time-chart__control"> · {timeControl}</span>}
        </span>
      </div>
      <svg
        ref={svgRef}
        className="time-chart__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        onPointerMove={(e: ReactPointerEvent<SVGSVGElement>) => {
          const ply = plyFromClientX(e.clientX)
          if (ply !== null) setHoverPly(ply)
        }}
        onPointerLeave={() => setHoverPly(null)}
        onClick={(e: ReactPointerEvent<SVGSVGElement>) => {
          const ply = plyFromClientX(e.clientX)
          if (ply !== null) onSelectPly(ply)
        }}
        role="img"
        aria-label="Remaining clock time across the game"
      >
        <path className="time-chart__line time-chart__line--white" d={whitePath} />
        <path className="time-chart__line time-chart__line--black" d={blackPath} />

        {judgments &&
          judgments.map((j, i) => {
            if (!j || !MARKED.has(j.classification) || moves[i].clockSeconds == null) return null
            return (
              <circle
                key={i}
                className={`time-chart__marker time-chart__marker--${j.classification}`}
                cx={xAt(i + 1)}
                cy={yAt(moves[i].clockSeconds ?? 0)}
                r={3}
                onClick={(evt) => {
                  evt.stopPropagation()
                  onSelectPly(i + 1)
                }}
              />
            )
          })}

        <line
          className="time-chart__cursor"
          x1={xAt(currentPly)}
          y1={PAD.top}
          x2={xAt(currentPly)}
          y2={VIEW_H - PAD.bottom}
        />
      </svg>
      <div className="time-chart__legend">
        <span className="time-chart__legend-item">
          <span className="time-chart__swatch time-chart__swatch--white" /> White clock
        </span>
        <span className="time-chart__legend-item">
          <span className="time-chart__swatch time-chart__swatch--black" /> Black clock
        </span>
      </div>
    </div>
  )
}

export default TimePressureChart
