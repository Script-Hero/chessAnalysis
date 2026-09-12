import { useMemo } from 'react'
import PlayerSummary from '../../components/overview/PlayerSummary'
import PhaseAccuracy from '../../components/overview/PhaseAccuracy'
import MaterialChart from '../../components/overview/MaterialChart'
import TimePressureChart from '../../components/overview/TimePressureChart'
import EvalChart from '../../components/explore/EvalChart'
import ReviewMoments from '../../components/corridor/ReviewMoments'
import { useAnalysis } from '../../context/AnalysisContext'
import { computeAccuracy, computePhaseAccuracy, hasClockData } from '../../lib/analysis'
import '../shared/Dashboard.css'
import './ReportTab.css'

/**
 * Step one: what happened.
 *
 * Nothing on this tab is about a single move. It answers the questions a player
 * asks before they can ask anything else — who played better, where the errors
 * were concentrated, how the evaluation actually travelled — and then hands off
 * to step two, which names the moves. The commodity readouts that used to be
 * folded away at the bottom of the old Corridor tab live here in the open,
 * because "how did the game go" is exactly the question they answer.
 */
function ReportTab() {
  const { game, ply, goTo, judgments, evals, decisions, chains, setActiveTab } = useAnalysis()

  const white = game.headers.White ?? 'White'
  const black = game.headers.Black ?? 'Black'

  const accuracy = useMemo(() => (judgments ? computeAccuracy(judgments) : null), [judgments])
  const phaseAccuracy = useMemo(
    () => (judgments ? computePhaseAccuracy(game.positions, judgments) : null),
    [game.positions, judgments],
  )
  const showClock = useMemo(() => hasClockData(game.moves), [game.moves])

  if (!evals || !judgments || !accuracy || !phaseAccuracy) {
    return (
      <div className="overview">
        <div className="overview__pending">
          <span className="spinner" aria-hidden="true" />
          The engine is still working through the game.
        </div>
      </div>
    )
  }

  return (
    <div className="overview overview--report">
      <div className="step-next step-next--cta">
        <button type="button" className="step-next__button" onClick={() => setActiveTab('moments')}>
          Explore Key Moves and Moments →
        </button>
      </div>

      <section className="overview__section">
        <PlayerSummary
          white={white}
          black={black}
          accuracy={accuracy}
          decisions={decisions}
          chains={chains}
        />
        <PhaseAccuracy white={white} black={black} phases={phaseAccuracy} />
      </section>


      <section className="overview__section">
        
        <EvalChart evals={evals} moves={game.moves} judgments={judgments} currentPly={ply} onSelectPly={goTo} />
                
        <MaterialChart positions={game.positions} currentPly={ply} onSelectPly={goTo} />

        {showClock && (<TimePressureChart
            moves={game.moves}
            judgments={judgments}
            timeControl={game.headers.TimeControl}
            currentPly={ply}
            onSelectPly={goTo}
          />)}

      </section>
    </div>
  )
}

export default ReportTab
