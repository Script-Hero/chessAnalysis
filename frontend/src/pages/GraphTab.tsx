import { useMemo, useState } from 'react'
import { useAnalysis } from '../context/AnalysisContext'
import { computePlyMetrics, BUCKET_INFO } from '../lib/graphMetrics'
import type { MoveBucket } from '../lib/graphMetrics'
import GraphScatter from '../components/graph/GraphScatter'
import GraphTimeline from '../components/graph/GraphTimeline'
import GraphMoveDetail from '../components/graph/GraphMoveDetail'
import GraphInsights from '../components/graph/GraphInsights'
import './GraphTab.css'

const LEGEND_BUCKETS: MoveBucket[] = [
  'precise',
  'near-tie',
  'drift',
  'blunder-forced',
  'blunder-open',
  'forced',
]

function GraphTab() {
  const { game, judgments, lines, ply, goTo } = useAnalysis()
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const metrics = useMemo(() => {
    if (!judgments || !lines) return null
    return computePlyMetrics(game, judgments, lines)
  }, [game, judgments, lines])

  const select = (index: number) => {
    setSelectedIndex(index)
    goTo(index + 1)
  }

  if (!metrics) {
    return <p className="graph-tab__pending">Waiting for engine analysis…</p>
  }

  const rated = metrics.filter((m) => m.entropy !== null)
  const counts = rated.reduce(
    (acc, m) => {
      acc[m.bucket] = (acc[m.bucket] ?? 0) + 1
      return acc
    },
    {} as Partial<Record<MoveBucket, number>>,
  )

  // Selected move follows explicit clicks; falls back to whatever the shared
  // `ply` cursor currently points at, so switching tabs stays in sync.
  const effectiveIndex = selectedIndex ?? (ply > 0 && ply <= metrics.length ? ply - 1 : null)
  const selectedMetric = effectiveIndex !== null ? (metrics[effectiveIndex] ?? null) : null
  const selectedFen = effectiveIndex !== null ? game.positions[effectiveIndex] : null
  const selectedLines = effectiveIndex !== null ? (lines?.[effectiveIndex] ?? null) : null

  return (
    <div className="graph-tab">
      <section className="graph-tab__section">
        <h3 className="graph-tab__heading">Overview</h3>
        <div className="graph-tab__stat-row">
          <div className="graph-tab__stat">
            <span className="graph-tab__stat-n">{counts['blunder-forced'] ?? 0}</span>
            <span className="graph-tab__stat-label">should've been found</span>
          </div>
          <div className="graph-tab__stat">
            <span className="graph-tab__stat-n">{counts['blunder-open'] ?? 0}</span>
            <span className="graph-tab__stat-label">genuinely hard misses</span>
          </div>
          <div className="graph-tab__stat">
            <span className="graph-tab__stat-n">{counts['drift'] ?? 0}</span>
            <span className="graph-tab__stat-label">silent drift, untagged</span>
          </div>
          <div className="graph-tab__stat">
            <span className="graph-tab__stat-n">{counts['precise'] ?? 0}</span>
            <span className="graph-tab__stat-label">precise, needle found</span>
          </div>
        </div>
        <GraphScatter metrics={metrics} selectedIndex={effectiveIndex} onSelect={select} />
        <div className="graph-tab__legend">
          {LEGEND_BUCKETS.map((bucket) => (
            <span key={bucket} className="graph-tab__legend-item">
              <span className="graph-tab__legend-dot" style={{ background: `var(${BUCKET_INFO[bucket].colorVar})` }} />
              {BUCKET_INFO[bucket].label}
            </span>
          ))}
        </div>
      </section>

      <section className="graph-tab__section">
        <h3 className="graph-tab__heading">Signals</h3>
        <GraphInsights metrics={metrics} />
      </section>

      <section className="graph-tab__section">
        <h3 className="graph-tab__heading">Game timeline</h3>
        <GraphTimeline metrics={metrics} selectedIndex={effectiveIndex} onSelect={select} />
      </section>

      <section className="graph-tab__section">
        <h3 className="graph-tab__heading">Move detail</h3>
        <GraphMoveDetail metric={selectedMetric} fen={selectedFen} lines={selectedLines} />
      </section>
    </div>
  )
}

export default GraphTab
