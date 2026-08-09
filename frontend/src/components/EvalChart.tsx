import { useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ParsedMove } from '../lib/pgn'
import type { MoveJudgment, PositionEval } from '../lib/stockfish'
import './EvalChart.css'

type EvalChartProps = {
  evals: PositionEval[]
  moves: ParsedMove[]
  judgments?: (MoveJudgment | null)[] | null
  currentPly: number
  onSelectPly: (ply: number) => void
}

const MARKED_CLASSIFICATIONS = new Set(['mistake', 'blunder'])

const VIEW_W = 640
const VIEW_H = 168
const PAD = { top: 14, right: 14, bottom: 14, left: 14 }
const INNER_W = VIEW_W - PAD.left - PAD.right
const INNER_H = VIEW_H - PAD.top - PAD.bottom
const MID_Y = PAD.top + INNER_H / 2

function formatEval(e: PositionEval): string {
  if (e.mateIn !== null) return `M${Math.abs(e.mateIn)}`
  const v = e.score
  return (v > 0 ? '+' : '') + v.toFixed(2)
}

function EvalChart({ evals, moves, judgments, currentPly, onSelectPly }: EvalChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverPly, setHoverPly] = useState<number | null>(null)
  const clipId = useId()

  const n = evals.length

  const maxAbs = Math.min(12, Math.max(1.5, ...evals.map((e) => Math.abs(e.score))))

  const xAt = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * INNER_W)
  const yAt = (score: number) => MID_Y - (Math.max(-maxAbs, Math.min(maxAbs, score)) / maxAbs) * (INNER_H / 2)

  const linePoints = evals.map((e, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(e.score)}`).join(' ')
  const areaPath = n === 0 ? '' : `${linePoints} L ${xAt(n - 1)} ${MID_Y} L ${xAt(0)} ${MID_Y} Z`

  const plyFromClientX = (clientX: number): number | null => {
    const svg = svgRef.current
    if (!svg || n === 0) return null
    const rect = svg.getBoundingClientRect()
    const frac = (clientX - rect.left) / rect.width
    const viewX = frac * VIEW_W
    const ratio = (viewX - PAD.left) / INNER_W
    return Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))))
  }

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const ply = plyFromClientX(e.clientX)
    if (ply !== null) setHoverPly(ply)
  }

  const handleClick = (e: ReactPointerEvent<SVGSVGElement>) => {
    const ply = plyFromClientX(e.clientX)
    if (ply !== null) onSelectPly(ply)
  }

  const activePly = hoverPly ?? currentPly
  const activeEval = evals[activePly]
  const activeMove = activePly > 0 ? moves[activePly - 1] : null
  const activeJudgment = activePly > 0 ? judgments?.[activePly - 1] : null

  return (
    <div className="eval-chart">
      <div className="eval-chart__header">
        <span className="eval-chart__title">Engine evaluation</span>
        <span className="eval-chart__readout">
          {activeEval ? formatEval(activeEval) : '—'}
          {activeMove && <span className="eval-chart__readout-move"> · {activeMove.san}</span>}
          {activeJudgment && MARKED_CLASSIFICATIONS.has(activeJudgment.classification) && (
            <span
              className={`eval-chart__readout-tag eval-chart__readout-tag--${activeJudgment.classification}`}
            >
              {activeJudgment.classification}
            </span>
          )}
        </span>
      </div>

      <svg
        ref={svgRef}
        className="eval-chart__svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverPly(null)}
        onClick={handleClick}
        role="img"
        aria-label="Engine evaluation across the game"
      >
        <defs>
          <clipPath id={`${clipId}-above`}>
            <rect x={0} y={0} width={VIEW_W} height={MID_Y} />
          </clipPath>
          <clipPath id={`${clipId}-below`}>
            <rect x={0} y={MID_Y} width={VIEW_W} height={VIEW_H - MID_Y} />
          </clipPath>
        </defs>

        <line
          className="eval-chart__baseline"
          x1={PAD.left}
          y1={MID_Y}
          x2={VIEW_W - PAD.right}
          y2={MID_Y}
        />

        <path className="eval-chart__area eval-chart__area--white" d={areaPath} clipPath={`url(#${clipId}-above)`} />
        <path className="eval-chart__area eval-chart__area--black" d={areaPath} clipPath={`url(#${clipId}-below)`} />
        <path className="eval-chart__line eval-chart__line--white" d={linePoints} clipPath={`url(#${clipId}-above)`} />
        <path className="eval-chart__line eval-chart__line--black" d={linePoints} clipPath={`url(#${clipId}-below)`} />

        <line
          className="eval-chart__cursor"
          x1={xAt(currentPly)}
          y1={PAD.top}
          x2={xAt(currentPly)}
          y2={VIEW_H - PAD.bottom}
        />

        {judgments &&
          judgments.map((j, i) => {
            if (!j || !MARKED_CLASSIFICATIONS.has(j.classification)) return null
            const markerPly = i + 1
            const e = evals[markerPly]
            if (!e) return null
            return (
              <circle
                key={markerPly}
                className={`eval-chart__marker eval-chart__marker--${j.classification}`}
                cx={xAt(markerPly)}
                cy={yAt(e.score)}
                r={3.5}
                onClick={(evt) => {
                  evt.stopPropagation()
                  onSelectPly(markerPly)
                }}
              >
                <title>{`${j.classification} — ${moves[markerPly - 1]?.san ?? ''}`}</title>
              </circle>
            )
          })}

        {hoverPly !== null && hoverPly !== currentPly && (
          <line
            className="eval-chart__hover-line"
            x1={xAt(hoverPly)}
            y1={PAD.top}
            x2={xAt(hoverPly)}
            y2={VIEW_H - PAD.bottom}
          />
        )}

        {evals[currentPly] && (
          <circle
            className="eval-chart__dot"
            cx={xAt(currentPly)}
            cy={yAt(evals[currentPly].score)}
            r={4}
          />
        )}
      </svg>

      <div className="eval-chart__legend">
        <span className="eval-chart__legend-item">
          <span className="eval-chart__swatch eval-chart__swatch--white" />
          White ahead
        </span>
        <span className="eval-chart__legend-item">
          <span className="eval-chart__swatch eval-chart__swatch--black" />
          Black ahead
        </span>
      </div>
    </div>
  )
}

export default EvalChart
