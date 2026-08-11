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
const HEIGHT = 96
const PAD_TOP = 10
const PAD_BOTTOM = 18

function moveLabel(m: PlyMetric): string {
  const moveNumber = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${moveNumber}.${m.san}` : `${moveNumber}…${m.san}`
}

function GraphTimeline({ metrics, selectedIndex, onSelect }: GraphTimelineProps) {
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM
  const width = metrics.length * (BAR_W + GAP) + GAP

  return (
    <div className="graph-timeline">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width="100%" height={HEIGHT} className="graph-timeline__svg">
        <line x1={0} y1={PAD_TOP + innerH} x2={width} y2={PAD_TOP + innerH} className="graph-timeline__baseline" />
        {metrics.map((m, i) => {
          const x = GAP + i * (BAR_W + GAP)
          const h = m.entropy === null ? 3 : Math.max(2, m.entropy * innerH)
          const y = PAD_TOP + innerH - h
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
              className={`graph-timeline__bar${isSelected ? ' is-selected' : ''}`}
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
