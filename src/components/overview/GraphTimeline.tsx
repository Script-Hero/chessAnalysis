import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { BUCKET_INFO } from '../../lib/graphMetrics'
import type { PlyMetric } from '../../lib/graphMetrics'
import './GraphTimeline.css'

type GraphTimelineProps = {
  metrics: PlyMetric[]
  selectedIndex: number | null
  onSelect: (index: number) => void
}

const GAP = 4
const MIN_BAR_W = 8
const MAX_BAR_W = 22
const HALF_HEIGHT = 90
const HEIGHT = HALF_HEIGHT * 2

function moveLabel(m: PlyMetric): string {
  const moveNumber = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${moveNumber}.${m.san}` : `${moveNumber}…${m.san}`
}

// Bars scale up to fill the available width (up to a cap) when there aren't many
// plies, and shrink down to a floor — past which the container scrolls instead —
// when there are. Keeps a single ply's bar a consistent, legible size either way.
function useBarWidth(containerRef: RefObject<HTMLDivElement | null>, count: number): number {
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  if (!containerWidth || count === 0) return MAX_BAR_W
  const fitted = Math.floor((containerWidth - GAP) / count) - GAP
  return Math.max(MIN_BAR_W, Math.min(MAX_BAR_W, fitted))
}

function GraphTimeline({ metrics, selectedIndex, onSelect }: GraphTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const barW = useBarWidth(containerRef, metrics.length)
  const width = metrics.length * (barW + GAP) + GAP

  return (
    <div className="graph-timeline" ref={containerRef}>
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} className="graph-timeline__svg">
        <line x1={0} y1={HALF_HEIGHT} x2={width} y2={HALF_HEIGHT} className="graph-timeline__baseline" />
        {metrics.map((m, i) => {
          const x = GAP + i * (barW + GAP)
          const h = m.entropy === null ? 3 : Math.max(2, m.entropy * (HALF_HEIGHT - 6))
          const y = m.mover === 'white' ? HALF_HEIGHT - h : HALF_HEIGHT
          const color = `var(${BUCKET_INFO[m.bucket].colorVar})`
          const isSelected = selectedIndex === m.index
          return (
            <rect
              key={m.index}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={2}
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
