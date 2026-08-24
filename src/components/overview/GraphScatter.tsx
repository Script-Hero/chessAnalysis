import { BUCKET_INFO } from '../../lib/graphMetrics'
import type { PlyMetric } from '../../lib/graphMetrics'
import './GraphScatter.css'

type GraphScatterProps = {
  metrics: PlyMetric[]
  selectedIndex: number | null
  onSelect: (index: number) => void
}

const WIDTH = 820
const HEIGHT = 420
const PAD_L = 52
const PAD_R = 20
const PAD_T = 20
const PAD_B = 44
const Y_MAX = 60 // rawLossPct clamp — a handful of outlier blunders run much higher than this

function moveLabel(m: PlyMetric): string {
  const moveNumber = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${moveNumber}.${m.san}` : `${moveNumber}…${m.san}`
}

// Most moves cost 0-5%; a handful of blunders cost 30-60%. A linear axis crushes
// the common case into a thin strip at the bottom. Square-root spacing gives the
// low-cost majority room to spread out while still keeping outliers on-chart.
const yScale = (lossPct: number) => Math.sqrt(Math.max(0, Math.min(lossPct, Y_MAX)))
const Y_SCALE_MAX = yScale(Y_MAX)

function GraphScatter({ metrics, selectedIndex, onSelect }: GraphScatterProps) {
  const innerW = WIDTH - PAD_L - PAD_R
  const innerH = HEIGHT - PAD_T - PAD_B

  const points = metrics.filter((m) => m.entropy !== null && m.rawLossPct !== null)

  const xOf = (entropy: number) => PAD_L + entropy * innerW
  const yOf = (lossPct: number) => PAD_T + innerH - (yScale(lossPct) / Y_SCALE_MAX) * innerH

  const gridX = [0, 0.25, 0.5, 0.75, 1]
  const gridY = [0, 5, 15, 30, 60]

  return (
    <div className="graph-scatter">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="graph-scatter__svg">
        {gridY.map((v) => (
          <g key={`y-${v}`}>
            <line x1={PAD_L} x2={WIDTH - PAD_R} y1={yOf(v)} y2={yOf(v)} className="graph-scatter__grid" />
            <text x={PAD_L - 6} y={yOf(v) + 3} textAnchor="end" className="graph-scatter__tick">
              {v}
            </text>
          </g>
        ))}
        {gridX.map((v) => (
          <text key={`x-${v}`} x={xOf(v)} y={HEIGHT - PAD_B + 14} textAnchor="middle" className="graph-scatter__tick">
            {v}
          </text>
        ))}
        <text x={PAD_L} y={HEIGHT - 8} className="graph-scatter__axis-label">
          how forced the position looked →
        </text>
        <text
          x={-(PAD_T + innerH / 2)}
          y={12}
          transform="rotate(-90)"
          textAnchor="middle"
          className="graph-scatter__axis-label"
        >
          cost vs. best move (%) →
        </text>

        {points.map((m) => {
          const cx = xOf(m.entropy!)
          const cy = yOf(m.rawLossPct!)
          const color = `var(${BUCKET_INFO[m.bucket].colorVar})`
          const moverColor = `var(${m.mover === 'white' ? '--white-accent' : '--black-accent'})`
          const isSelected = selectedIndex === m.index
          return (
            <circle
              key={m.index}
              cx={cx}
              cy={cy}
              r={isSelected ? 9 : 6}
              fill={color}
              opacity={isSelected ? 1 : 0.78}
              stroke={isSelected ? 'var(--brass-bright)' : moverColor}
              strokeWidth={2}
              className="graph-scatter__point"
              onClick={() => onSelect(m.index)}
            >
              <title>{`${moveLabel(m)}  entropy=${m.entropy!.toFixed(2)}  loss=${m.rawLossPct!.toFixed(0)}%  ${BUCKET_INFO[m.bucket].label}`}</title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}

export default GraphScatter
