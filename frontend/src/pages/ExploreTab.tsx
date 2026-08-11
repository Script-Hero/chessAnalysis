import { useMemo, useState } from 'react'
import EvalChart from '../components/explore/EvalChart'
import LiveEnginePanel from '../components/explore/LiveEnginePanel'
import GameTree from '../components/explore/GameTree'
import CandidateLines from '../components/explore/CandidateLines'
import { buildGameTreeRows, DEFAULT_BRANCH_PLIES, DEFAULT_BRANCH_THRESHOLD } from '../lib/tree'
import type { BranchThreshold, CollapseThreshold } from '../lib/tree'
import { computePlyMetrics } from '../lib/graphMetrics'
import { useAnalysis } from '../context/AnalysisContext'
import './ExploreTab.css'

type ExploreSubTab = 'live' | 'tree' | 'lines'

const BRANCH_THRESHOLD_OPTIONS: { value: BranchThreshold; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'blunder', label: 'Blunder only' },
  { value: 'mistake', label: 'Mistake+' },
  { value: 'inaccuracy', label: 'Inaccuracy+' },
  { value: 'good', label: 'Good+' },
  { value: 'best', label: 'All moves' },
]

const COLLAPSE_THRESHOLD_OPTIONS: { value: CollapseThreshold; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'best', label: 'Best only' },
  { value: 'excellent', label: 'Excellent+' },
  { value: 'good', label: 'Good+' },
]

function ExploreTab() {
  const {
    game,
    ply,
    goTo,
    evals,
    judgments,
    lines,
    liveEngineEnabled,
    setLiveEngineEnabled,
    liveLines,
    liveDepth,
  } = useAnalysis()
  const [subTab, setSubTab] = useState<ExploreSubTab>('live')
  const [branchThreshold, setBranchThreshold] = useState<BranchThreshold>(DEFAULT_BRANCH_THRESHOLD)
  const [collapseThreshold, setCollapseThreshold] = useState<CollapseThreshold>('off')

  const position = game.positions[ply]

  const treeRows = useMemo(() => {
    if (!judgments || !lines) return null
    return buildGameTreeRows(game.positions, game.moves, judgments, lines, DEFAULT_BRANCH_PLIES, branchThreshold)
  }, [game, judgments, lines, branchThreshold])

  const metrics = useMemo(() => {
    if (!judgments || !lines) return null
    return computePlyMetrics(game, judgments, lines)
  }, [game, judgments, lines])

  const currentLines = lines?.[ply] ?? null
  const currentMetric = metrics?.[ply] ?? null

  return (
    <div className="explore-tab">
      {evals ? (
        <EvalChart evals={evals} moves={game.moves} judgments={judgments} currentPly={ply} onSelectPly={goTo} />
      ) : (
        <div className="explore-tab__pending">
          <span className="spinner" aria-hidden="true" />
          Running engine analysis…
        </div>
      )}

      <div className="explore-tab__subtabs" role="tablist" aria-label="Per-move view">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'live'}
          className={`explore-tab__subtab-btn${subTab === 'live' ? ' is-active' : ''}`}
          onClick={() => setSubTab('live')}
        >
          Live
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'tree'}
          className={`explore-tab__subtab-btn${subTab === 'tree' ? ' is-active' : ''}`}
          onClick={() => setSubTab('tree')}
        >
          Tree
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'lines'}
          className={`explore-tab__subtab-btn${subTab === 'lines' ? ' is-active' : ''}`}
          onClick={() => setSubTab('lines')}
        >
          Lines
        </button>
      </div>

      <div className="explore-tab__subtab-content">
        {subTab === 'live' && (
          <LiveEnginePanel
            enabled={liveEngineEnabled}
            onToggle={setLiveEngineEnabled}
            storedLines={lines?.[ply] ?? null}
            liveLines={liveLines}
            liveDepth={liveDepth}
            fen={position}
          />
        )}

        {subTab === 'tree' && (
          <section className="explore-tab__section">
            <div className="explore-tab__filters">
              <div className="explore-tab__filter-group">
                <span className="explore-tab__filter-label">Collapse stem</span>
                <div className="explore-tab__filter-options" role="tablist" aria-label="Collapse trunk moves at or above">
                  {COLLAPSE_THRESHOLD_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={collapseThreshold === value}
                      className={`explore-tab__filter-btn${collapseThreshold === value ? ' is-active' : ''}`}
                      onClick={() => setCollapseThreshold(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="explore-tab__filter-group">
                <span className="explore-tab__filter-label">Show branches</span>
                <div className="explore-tab__filter-options" role="tablist" aria-label="Show branches for moves rated">
                  {BRANCH_THRESHOLD_OPTIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={branchThreshold === value}
                      className={`explore-tab__filter-btn${branchThreshold === value ? ' is-active' : ''}`}
                      onClick={() => setBranchThreshold(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {treeRows ? (
              <GameTree rows={treeRows} currentPly={ply} onSelectPly={goTo} collapseThreshold={collapseThreshold} />
            ) : (
              <p className="explore-tab__pending-text">Waiting for engine analysis…</p>
            )}
          </section>
        )}

        {subTab === 'lines' && <CandidateLines metric={currentMetric} fen={position} lines={currentLines} />}
      </div>
    </div>
  )
}

export default ExploreTab
