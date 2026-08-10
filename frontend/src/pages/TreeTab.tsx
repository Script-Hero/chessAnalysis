import { useMemo } from 'react'
import { buildGameTreeRows, DEFAULT_BRANCH_PLIES } from '../lib/tree'
import GameTree from '../components/tree/GameTree'
import PositionTree from '../components/tree/PositionTree'
import { useAnalysis } from '../context/AnalysisContext'
import './TreeTab.css'

function TreeTab() {
  const { game, ply, goTo, judgments, lines } = useAnalysis()

  const rows = useMemo(() => {
    if (!judgments || !lines) return null
    return buildGameTreeRows(game.positions, game.moves, judgments, lines, DEFAULT_BRANCH_PLIES)
  }, [game, judgments, lines])

  const position = game.positions[ply]
  const currentLines = lines?.[ply] ?? null

  return (
    <div className="tree-tab">
      <section className="tree-tab__section">
        <h3 className="tree-tab__heading">Game tree</h3>
        {rows ? (
          <GameTree rows={rows} currentPly={ply} onSelectPly={goTo} />
        ) : (
          <p className="tree-tab__pending">Waiting for engine analysis…</p>
        )}
      </section>

      <section className="tree-tab__section">
        <h3 className="tree-tab__heading">This position's lines</h3>
        <PositionTree fen={position} lines={currentLines} currentPly={ply} onJumpToPly={goTo} />
      </section>
    </div>
  )
}

export default TreeTab
