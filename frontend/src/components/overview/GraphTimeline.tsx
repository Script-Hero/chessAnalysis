import { BUCKET_INFO } from '../../lib/graphMetrics'
import type { PlyMetric } from '../../lib/graphMetrics'
import './GraphTimeline.css'

type GraphTimelineProps = {
  metrics: PlyMetric[]
  selectedIndex: number | null
  onSelect: (index: number) => void
}

const BAR_W = 7
const GAP = 2
const HALF_HEIGHT = 60
const HEIGHT = HALF_HEIGHT * 2

function moveLabel(m: PlyMetric): string {
  const moveNumber = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${moveNumber}.${m.san}` : `${moveNumber}…${m.san}`
}

function GraphTimeline({ metrics, selectedIndex, onSelect }: GraphTimelineProps) {
  const width = metrics.length * (BAR_W + GAP) + GAP

  return (
    <div className="graph-timeline">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" height={HEIGHT} className="graph-timeline__svg">
        <line x1={0} y1={HALF_HEIGHT} x2={width} y2={HALF_HEIGHT} className="graph-timeline__baseline" />
        {metrics.map((m, i) => {
          const x = GAP + i * (BAR_W + GAP)
          const h = m.entropy === null ? 3 : Math.max(2, m.entropy * (HALF_HEIGHT - 6))
          const y = m.mover === 'white' ? HALF_HEIGHT - h : HALF_HEIGHT
          const color = `var(${BUCKET_INFO[m.bucket].colorVar})`
          const isSelected = selectedIndex === m.index
          return (
            <rect
              key={m.index}
              x={x}
              y={y}
              width={BAR_W}
              height={h}
              rx={1}
              fill={color}
              opacity={m.entropy === null ? 0.25 : isSelected ? 1 : 0.8}
              className={`graph-timeline__bar graph-timeline__bar--${m.mover}${isSelected ? ' is-selected' : ''}`}
              onClick={() => onSelect(m.index)}
            >
              <title>{`${moveLabel(m)}  entropy=${m.entropy === null ? 'n/a' : m.entropy.toFixed(2)}  ${BUCKET_INFO[m.bucket].label}`}</title>
            </rect>
          )
        })}
      </svg>
    </div>
  )
}

export default GraphTimeline
