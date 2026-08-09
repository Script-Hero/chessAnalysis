import EvalChart from '../components/EvalChart'
import LiveEnginePanel from '../components/LiveEnginePanel'
import { useAnalysis } from '../context/AnalysisContext'
import './AnalysisTab.css'

function AnalysisTab() {
  const { game, ply, goTo, evals, judgments, liveEngineEnabled, setLiveEngineEnabled, liveLines, liveDepth } =
    useAnalysis()

  const position = game.positions[ply]

  return (
    <div className="analysis-tab">
      <LiveEnginePanel
        enabled={liveEngineEnabled}
        onToggle={setLiveEngineEnabled}
        lines={liveLines}
        depth={liveDepth}
        fen={position}
      />

      {evals ? (
        <EvalChart evals={evals} moves={game.moves} judgments={judgments} currentPly={ply} onSelectPly={goTo} />
      ) : (
        <div className="analysis-tab__pending">
          <span className="spinner" aria-hidden="true" />
          Running engine analysis…
        </div>
      )}
    </div>
  )
}

export default AnalysisTab
