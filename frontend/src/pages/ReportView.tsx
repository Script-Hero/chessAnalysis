import { useMemo } from 'react'
import PlayerSummary from '../components/report/PlayerSummary'
import PhaseAccuracy from '../components/report/PhaseAccuracy'
import CriticalMoments from '../components/report/CriticalMoments'
import MaterialChart from '../components/report/MaterialChart'
import TimePressureChart from '../components/report/TimePressureChart'
import { useAnalysis } from '../context/AnalysisContext'
import { computeAccuracy, computePhaseAccuracy, findCriticalMoments, hasClockData } from '../lib/analysis'
import './ReportView.css'

function ReportView() {
  const { game, ply, goTo, judgments, evals, setActiveTab } = useAnalysis()

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

  const jumpToBoard = (targetPly: number) => {
    goTo(targetPly)
    setActiveTab('analysis')
  }

  if (!evals || !judgments || !accuracy || !phaseAccuracy) {
    return (
      <div className="report">
        <div className="report__pending">
          <span className="spinner" aria-hidden="true" />
          Waiting on engine analysis…
        </div>
      </div>
    )
  }

  return (
    <div className="report">
      <PlayerSummary white={white} black={black} accuracy={accuracy} />

      <div className="report__grid">
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

      <CriticalMoments
        moments={criticalMoments}
        positions={game.positions}
        currentPly={ply}
        onJump={jumpToBoard}
      />
    </div>
  )
}

export default ReportView
