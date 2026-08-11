import { BUCKET_INFO } from '../../lib/graphMetrics'
import type { PlyMetric } from '../../lib/graphMetrics'
import './GraphScatter.css'

type GraphScatterProps = {
  metrics: PlyMetric[]
  selectedIndex: number | null
  onSelect: (index: number) => void
}

const WIDTH = 560
const HEIGHT = 300
const PAD_L = 40
const PAD_R = 16
const PAD_T = 16
const PAD_B = 36
const Y_MAX = 60 // rawLossPct clamp — a handful of outlier blunders run much higher than this

function moveLabel(m: PlyMetric): string {
  const moveNumber = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${moveNumber}.${m.san}` : `${moveNumber}…${m.san}`
}

function GraphScatter({ metrics, selectedIndex, onSelect }: GraphScatterProps) {
  const innerW = WIDTH - PAD_L - PAD_R
  const innerH = HEIGHT - PAD_T - PAD_B

  const points = metrics.filter((m) => m.entropy !== null && m.rawLossPct !== null)

  const xOf = (entropy: number) => PAD_L + entropy * innerW
  const yOf = (lossPct: number) => PAD_T + innerH - (Math.min(lossPct, Y_MAX) / Y_MAX) * innerH

  const gridX = [0, 0.25, 0.5, 0.75, 1]
  const gridY = [0, 15, 30, 45, 60]

  return (
    <div className="graph-scatter">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} className="graph-scatter__svg">
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
          decision entropy →
        </text>
        <text
          x={-(PAD_T + innerH / 2)}
          y={12}
          transform="rotate(-90)"
          textAnchor="middle"
          className="graph-scatter__axis-label"
        >
          loss vs. best line (%) →
        </text>

        {points.map((m) => {
          const cx = xOf(m.entropy!)
          const cy = yOf(m.rawLossPct!)
          const color = `var(${BUCKET_INFO[m.bucket].colorVar})`
          const isSelected = selectedIndex === m.index
          return (
            <circle
              key={m.index}
              cx={cx}
              cy={cy}
              r={isSelected ? 6 : 4}
              fill={color}
              opacity={isSelected ? 1 : 0.75}
              stroke={isSelected ? 'var(--brass-bright)' : 'none'}
              strokeWidth={1.5}
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
