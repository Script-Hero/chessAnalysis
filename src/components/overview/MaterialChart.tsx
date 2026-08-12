import { useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { materialBalance } from '../../lib/analysis'
import './MaterialChart.css'

type MaterialChartProps = {
  positions: string[]
  currentPly: number
  onSelectPly: (ply: number) => void
}

const VIEW_W = 640
const VIEW_H = 96
const PAD = { top: 10, right: 14, bottom: 10, left: 14 }
const INNER_W = VIEW_W - PAD.left - PAD.right
const INNER_H = VIEW_H - PAD.top - PAD.bottom
const MID_Y = PAD.top + INNER_H / 2

function MaterialChart({ positions, currentPly, onSelectPly }: MaterialChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverPly, setHoverPly] = useState<number | null>(null)
  const clipId = useId()

  const values = positions.map(materialBalance)
  const n = values.length
  const maxAbs = Math.max(3, ...values.map(Math.abs))

  const xAt = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * INNER_W)
  const yAt = (v: number) => MID_Y - (Math.max(-maxAbs, Math.min(maxAbs, v)) / maxAbs) * (INNER_H / 2)

  const linePoints = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(v)}`).join(' ')
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

  const activePly = hoverPly ?? currentPly
  const activeValue = values[activePly]

  return (
    <div className="material-chart">
      <div className="material-chart__header">
        <h3 className="material-chart__title">Material balance</h3>
        <span className="material-chart__readout">
          {activeValue > 0 ? `White +${activeValue}` : activeValue < 0 ? `Black +${-activeValue}` : 'Even'}
        </span>
      </div>
      <svg
        ref={svgRef}
        className="material-chart__svg"
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
        aria-label="Material balance across the game"
      >
        <defs>
          <clipPath id={`${clipId}-above`}>
            <rect x={0} y={0} width={VIEW_W} height={MID_Y} />
          </clipPath>
          <clipPath id={`${clipId}-below`}>
            <rect x={0} y={MID_Y} width={VIEW_W} height={VIEW_H - MID_Y} />
          </clipPath>
        </defs>
        <line className="material-chart__baseline" x1={PAD.left} y1={MID_Y} x2={VIEW_W - PAD.right} y2={MID_Y} />
        <path className="material-chart__area material-chart__area--white" d={areaPath} clipPath={`url(#${clipId}-above)`} />
        <path className="material-chart__area material-chart__area--black" d={areaPath} clipPath={`url(#${clipId}-below)`} />
        <path className="material-chart__line material-chart__line--white" d={linePoints} clipPath={`url(#${clipId}-above)`} />
        <path className="material-chart__line material-chart__line--black" d={linePoints} clipPath={`url(#${clipId}-below)`} />
        <line className="material-chart__cursor" x1={xAt(currentPly)} y1={PAD.top} x2={xAt(currentPly)} y2={VIEW_H - PAD.bottom} />
      </svg>
    </div>
  )
}

export default MaterialChart
