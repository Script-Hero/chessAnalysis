import { useMemo, useState } from 'react'
import { buildGameTreeRows, DEFAULT_BRANCH_PLIES, DEFAULT_BRANCH_THRESHOLD } from '../lib/tree'
import type { BranchThreshold, CollapseThreshold } from '../lib/tree'
import GameTree from '../components/tree/GameTree'
import PositionTree from '../components/tree/PositionTree'
import { useAnalysis } from '../context/AnalysisContext'
import './TreeTab.css'

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

function TreeTab() {
  const { game, ply, goTo, judgments, lines } = useAnalysis()
  const [branchThreshold, setBranchThreshold] = useState<BranchThreshold>(DEFAULT_BRANCH_THRESHOLD)
  const [collapseThreshold, setCollapseThreshold] = useState<CollapseThreshold>('off')

  const rows = useMemo(() => {
    if (!judgments || !lines) return null
    return buildGameTreeRows(game.positions, game.moves, judgments, lines, DEFAULT_BRANCH_PLIES, branchThreshold)
  }, [game, judgments, lines, branchThreshold])

  const position = game.positions[ply]
  const currentLines = lines?.[ply] ?? null

  return (
    <div className="tree-tab">
      <section className="tree-tab__section">
        <h3 className="tree-tab__heading">Game tree</h3>

        <div className="tree-tab__filters">
          <div className="tree-tab__filter-group">
            <span className="tree-tab__filter-label">Collapse stem</span>
            <div className="tree-tab__filter-options" role="tablist" aria-label="Collapse trunk moves at or above">
              {COLLAPSE_THRESHOLD_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={collapseThreshold === value}
                  className={`tree-tab__filter-btn${collapseThreshold === value ? ' is-active' : ''}`}
                  onClick={() => setCollapseThreshold(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="tree-tab__filter-group">
            <span className="tree-tab__filter-label">Show branches</span>
            <div className="tree-tab__filter-options" role="tablist" aria-label="Show branches for moves rated">
              {BRANCH_THRESHOLD_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={branchThreshold === value}
                  className={`tree-tab__filter-btn${branchThreshold === value ? ' is-active' : ''}`}
                  onClick={() => setBranchThreshold(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {rows ? (
          <GameTree rows={rows} currentPly={ply} onSelectPly={goTo} collapseThreshold={collapseThreshold} />
        ) : (
          <p className="tree-tab__pending">Waiting for engine analysis…</p>
        )}
      </section>

      <section className="tree-tab__section">
        <h3 className="tree-tab__heading">This position's lines</h3>
        <PositionTree fen={position} lines={currentLines} />
      </section>
    </div>
  )
}

export default TreeTab
