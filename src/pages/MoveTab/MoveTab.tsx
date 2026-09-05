import { useMemo, useState } from 'react'
import MoveBadge from '../../components/MoveBadge'
import LiveEnginePanel from '../../components/explore/LiveEnginePanel'
import GameTree from '../../components/explore/GameTree'
import CandidateLines from '../../components/explore/CandidateLines'
import GraphShape from '../../components/explore/GraphShape'
import StructureTab from '../StructureTab/StructureTab'
import { buildGameTreeRows, DEFAULT_BRANCH_PLIES, DEFAULT_BRANCH_THRESHOLD } from '../../lib/tree'
import type { BranchThreshold, CollapseThreshold } from '../../lib/tree'
import { useAnalysis } from '../../context/AnalysisContext'
import './MoveTab.css'

type MoveSubTab = 'lines' | 'why' | 'tree' | 'live'

const SUBTABS: { value: MoveSubTab; label: string; caption: string }[] = [
  {
    value: 'lines',
    label: 'Alternatives',
    caption: 'What else was on offer in this position, and what each line was worth.',
  },
  {
    value: 'why',
    label: 'Why',
    caption:
      'The position read as a network of attack and defence — what was held, what was overloaded, what was about to break.',
  },
  { value: 'tree', label: 'Tree', caption: 'The game beside the branches it never took.' },
  { value: 'live', label: 'Engine', caption: 'Run the engine on this position now, as deep as you like.' },
]

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

/**
 * Step three: one move, taken apart.
 *
 * Everything on this tab is about the ply on the board and nothing else, which
 * is why the move being examined is named at the top rather than left implicit.
 * "Alternatives" leads because the question that brings a player here is what
 * they should have played; the structural reading, the tree and the live engine
 * are the ways of checking that answer.
 */
function MoveTab() {
  const {
    game,
    ply,
    goTo,
    judgments,
    lines,
    decisions,
    liveEngineEnabled,
    setLiveEngineEnabled,
    liveLines,
    liveDepth,
  } = useAnalysis()
  const [subTab, setSubTab] = useState<MoveSubTab>('lines')
  const [branchThreshold, setBranchThreshold] = useState<BranchThreshold>(DEFAULT_BRANCH_THRESHOLD)
  const [collapseThreshold, setCollapseThreshold] = useState<CollapseThreshold>('off')

  const position = game.positions[ply]

  const treeRows = useMemo(() => {
    if (!judgments || !lines) return null
    return buildGameTreeRows(game.positions, game.moves, judgments, lines, DEFAULT_BRANCH_PLIES, branchThreshold)
  }, [game, judgments, lines, branchThreshold])

  const currentLines = lines?.[ply] ?? null
  const currentDecision = decisions?.[ply] ?? null

  const played = ply > 0 ? game.moves[ply - 1] : null
  const playedLabel = played
    ? ply % 2 === 1
      ? `${Math.floor((ply - 1) / 2) + 1}.${played.san}`
      : `${Math.floor((ply - 1) / 2) + 1}…${played.san}`
    : null
  const mover = ply % 2 === 1 ? game.headers.White ?? 'White' : game.headers.Black ?? 'Black'
  const caption = SUBTABS.find((t) => t.value === subTab)?.caption ?? ''

  return (
    <div className="explore-tab">


      {/* The subject of the tab, stated. Every panel below is about this ply,
          and the arrow keys move it. */}
      <div className="move-focus">
        {playedLabel ? (
          <p className="move-focus__played">
            <span className="move-focus__mover">{mover} played</span>
            <strong className="move-focus__san">{playedLabel}</strong>
            <MoveBadge judgment={judgments?.[ply - 1]} />
          </p>
        ) : (
          <p className="move-focus__played">
            <span className="move-focus__mover">Starting position</span>
          </p>
        )}
        <span className="move-focus__hint">← → steps through the game</span>
      </div>

      <div className="explore-tab__subtabs" role="tablist" aria-label="What to look at for this move">
        {SUBTABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={subTab === value}
            className={`explore-tab__subtab-btn${subTab === value ? ' is-active' : ''}`}
            onClick={() => setSubTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="explore-tab__caption">{caption}</p>

      <div className="explore-tab__subtab-content">
        {subTab === 'lines' && <CandidateLines decision={currentDecision} fen={position} lines={currentLines} />}

        {subTab === 'why' && <StructureTab />}

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

            {treeRows && lines ? (
              <>
                <GraphShape positions={game.positions} lines={lines} currentPly={ply} onSelectPly={goTo} />
                <GameTree rows={treeRows} currentPly={ply} onSelectPly={goTo} collapseThreshold={collapseThreshold} />
              </>
            ) : (
              <p className="explore-tab__pending-text">Waiting for engine analysis…</p>
            )}
          </section>
        )}

        {subTab === 'live' && (
          <LiveEnginePanel
            enabled={liveEngineEnabled}
            onToggle={setLiveEngineEnabled}
            storedLines={currentLines}
            liveLines={liveLines}
            liveDepth={liveDepth}
            fen={position}
          />
        )}
      </div>
    </div>
  )
}

export default MoveTab
