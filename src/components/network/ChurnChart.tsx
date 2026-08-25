import type { TemporalSeries } from '../../lib/temporal'
import './ChurnChart.css'

type ChurnChartProps = {
  series: TemporalSeries
  currentPly: number
  onSelectPly: (ply: number) => void
}

const WIDTH = 900
const HEIGHT = 130
const PAD_L = 28
const PAD_R = 10
const PAD_T = 12
const PAD_B = 20

/**
 * Structural churn per ply, with change points marked.
 *
 * An ordinary move replaces the mover's own relations and leaves the rest
 * standing, so the baseline is not zero and a raw churn value is not readable
 * on its own. What is readable is the departure from the game's own running
 * baseline, which is what the marked bars are — plies where the position was
 * reorganised rather than merely continued.
 */
function ChurnChart({ series, currentPly, onSelectPly }: ChurnChartProps) {
  const points = series.points
  if (points.length === 0) return null

  const innerW = WIDTH - PAD_L - PAD_R
  const innerH = HEIGHT - PAD_T - PAD_B
  const max = Math.max(0.15, ...points.map((p) => p.churn))
  const barWidth = Math.max(1.5, innerW / points.length - 1)

  const changeSet = new Set(series.changePoints.map((c) => c.index))

  return (
    <svg
      className="churn-chart"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Share of attack-and-defence relations replaced at each ply"
      onClick={(event) => {
        const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
        const fraction = (event.clientX - rect.left) / rect.width
        const index = Math.round(((fraction * WIDTH - PAD_L) / innerW) * (points.length - 1))
        const point = points[Math.max(0, Math.min(points.length - 1, index))]
        if (point) onSelectPly(point.index)
      }}
    >
      <line x1={PAD_L} y1={HEIGHT - PAD_B} x2={WIDTH - PAD_R} y2={HEIGHT - PAD_B} className="churn-chart__axis" />

      {points.map((point, i) => {
        const x = PAD_L + (i / Math.max(1, points.length - 1)) * innerW
        const height = (point.churn / max) * innerH
        const isChange = changeSet.has(point.index)
        return (
          <rect
            key={point.index}
            x={x - barWidth / 2}
            y={HEIGHT - PAD_B - height}
            width={barWidth}
            height={Math.max(0.6, height)}
            className={`churn-chart__bar${isChange ? ' is-change' : ''}${currentPly === point.index ? ' is-current' : ''}`}
          >
            <title>
              {`Move ${Math.ceil(point.index / 2)} — ${Math.round(point.churn * 100)}% of relations replaced ` +
                `(${point.formed} formed, ${point.broken} broken)` +
                (isChange ? ' · structural change point' : '')}
            </title>
          </rect>
        )
      })}

      <text x={PAD_L - 6} y={PAD_T + 6} className="churn-chart__tick">
        {Math.round(max * 100)}%
      </text>
      <text x={PAD_L - 6} y={HEIGHT - PAD_B} className="churn-chart__tick">
        0
      </text>
    </svg>
  )
}

export default ChurnChart
