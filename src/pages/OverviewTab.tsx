import { useMemo } from 'react'
import PlayerSummary from '../components/overview/PlayerSummary'
import PhaseAccuracy from '../components/overview/PhaseAccuracy'
import CriticalMoments from '../components/overview/CriticalMoments'
import MaterialChart from '../components/overview/MaterialChart'
import TimePressureChart from '../components/overview/TimePressureChart'
import GraphScatter from '../components/overview/GraphScatter'
import GraphTimeline from '../components/overview/GraphTimeline'
import GraphInsights from '../components/overview/GraphInsights'
import { useAnalysis } from '../context/AnalysisContext'
import { computeAccuracy, computePhaseAccuracy, findCriticalMoments, hasClockData } from '../lib/analysis'
import { computePlyMetrics, BUCKET_INFO } from '../lib/graphMetrics'
import type { MoveBucket } from '../lib/graphMetrics'
import './OverviewTab.css'

const LEGEND_BUCKETS: MoveBucket[] = [
  'precise',
  'near-tie',
  'drift',
  'blunder-forced',
  'blunder-open',
  'forced',
]

function OverviewTab() {
  const { game, ply, goTo, judgments, evals, lines, setActiveTab, moveFilter } = useAnalysis()

  const white = game.headers.White ?? 'White'
  const black = game.headers.Black ?? 'Black'

  const accuracy = useMemo(() => (judgments ? computeAccuracy(judgments) : null), [judgments])
  const phaseAccuracy = useMemo(
    () => (judgments ? computePhaseAccuracy(game.positions, judgments) : null),
    [game.positions, judgments],
  )
  const criticalMoments = useMemo(
    () => (judgments ? findCriticalMoments(game.moves, judgments) : []),
    [game.moves, judgments],
  )
  const showClock = useMemo(() => hasClockData(game.moves), [game.moves])

  const metrics = useMemo(() => {
    if (!judgments || !lines) return null
    return computePlyMetrics(game, judgments, lines)
  }, [game, judgments, lines])

  const filteredMetrics = useMemo(() => {
    if (!metrics) return null
    if (moveFilter === 'both') return metrics
    return metrics.filter((m) => m.mover === moveFilter)
  }, [metrics, moveFilter])

  const jumpToBoard = (targetPly: number) => {
    goTo(targetPly)
    setActiveTab('explore')
  }

  if (!evals || !judgments || !accuracy || !phaseAccuracy || !metrics || !filteredMetrics) {
    return (
      <div className="overview">
        <div className="overview__pending">
          <span className="spinner" aria-hidden="true" />
          Waiting on engine analysis…
        </div>
      </div>
    )
  }

  const rated = metrics.filter((m) => m.entropy !== null)
  const counts = rated.reduce(
    (acc, m) => {
      acc[m.bucket] = (acc[m.bucket] ?? 0) + 1
      return acc
    },
    {} as Partial<Record<MoveBucket, number>>,
  )

  return (
    <div className="overview">
      <PlayerSummary white={white} black={black} accuracy={accuracy} />

      <section className="overview__section">
        <h3 className="overview__heading">Move quality vs. how open the position was</h3>
        <GraphScatter metrics={filteredMetrics} selectedIndex={null} onSelect={(index) => jumpToBoard(index)} />
        <div className="overview__legend">
          {LEGEND_BUCKETS.map((bucket) => (
            <span key={bucket} className="overview__legend-item">
              <span className="overview__legend-dot" style={{ background: `var(${BUCKET_INFO[bucket].colorVar})` }} />
              {BUCKET_INFO[bucket].label}
            </span>
          ))}
          <span className="overview__legend-item">
            <span className="overview__legend-dot overview__legend-dot--mover" style={{ borderColor: 'var(--white-accent)' }} />
            White to move
          </span>
          <span className="overview__legend-item">
            <span className="overview__legend-dot overview__legend-dot--mover" style={{ borderColor: 'var(--black-accent)' }} />
            Black to move
          </span>
        </div>
        <GraphTimeline metrics={filteredMetrics} selectedIndex={null} onSelect={(index) => jumpToBoard(index)} />
      </section>

      <section className="overview__section">
        <div className="overview__stat-row">
          <div className="overview__stat overview__stat--caution">
            <span className="overview__stat-n">{counts['blunder-forced'] ?? 0}</span>
            <span className="overview__stat-label">should've been found</span>
          </div>
          <div className="overview__stat overview__stat--neutral">
            <span className="overview__stat-n">{counts['blunder-open'] ?? 0}</span>
            <span className="overview__stat-label">genuinely hard misses</span>
          </div>
          <div className="overview__stat overview__stat--caution">
            <span className="overview__stat-n">{counts['drift'] ?? 0}</span>
            <span className="overview__stat-label">silent drift, untagged</span>
          </div>
          <div className="overview__stat overview__stat--good">
            <span className="overview__stat-n">{counts['precise'] ?? 0}</span>
            <span className="overview__stat-label">precise, needle found</span>
          </div>
        </div>
      </section>

      <div className="overview__grid">
        <PhaseAccuracy white={white} black={black} phases={phaseAccuracy} />
        <MaterialChart positions={game.positions} currentPly={ply} onSelectPly={jumpToBoard} />
      </div>

      {showClock && (
        <TimePressureChart
          moves={game.moves}
          judgments={judgments}
          timeControl={game.headers.TimeControl}
          currentPly={ply}
          onSelectPly={jumpToBoard}
        />
      )}

      <section className="overview__section">
        <h3 className="overview__heading">Signals</h3>
        <GraphInsights metrics={metrics} whiteLabel={white} blackLabel={black} />
      </section>

      <CriticalMoments
        moments={criticalMoments}
        positions={game.positions}
        currentPly={ply}
        onJump={(momentPly) => jumpToBoard(momentPly - 1)}
      />
    </div>
  )
}

export default OverviewTab
