import { createContext, useContext } from 'react'
import type { ParsedGame } from '../lib/pgn'
import type { EngineLine, MoveJudgment, PositionEval, SurveyPosition } from '../lib/stockfish'
import type { DecisionNode } from '../lib/moveGraph'
import type { CorridorPoint } from '../lib/corridor'
import type { PositionStructure, Robustness } from '../lib/structure'
import type { TemporalSeries } from '../lib/temporal'
import type { EpisodeExplanation, StructureDigest } from '../lib/causes'
import type { GameChain } from '../lib/markov'
import type { Side } from '../lib/analysis'
import type { GameMeta } from '../lib/library'

/**
 * The dashboard is a three-step reading of one game, in the order a postmortem
 * actually goes: what happened, which moves decided it, then one move at a
 * time. The library is filing rather than a step, so it sits outside the run.
 */
export type DashboardTab = 'report' | 'moments' | 'move' | 'library'
export type MoveFilter = 'white' | 'black' | 'both'

/**
 * Which structural measure the board paints.
 *
 * The board is the only place a graph claim can be checked, so every measure
 * that lives on squares is expressible as an overlay rather than as a number in
 * a side panel that the reader has to take on faith.
 */
export type BoardOverlay = 'none' | 'control' | 'delta' | 'load' | 'cut' | 'fragility'

export type AnalysisContextValue = {
  game: ParsedGame
  fileName: string
  /** Library id of the game on screen. */
  gameKey: string | null
  ply: number
  goTo: (target: number) => void
  orientation: Side
  setOrientation: (orientation: Side) => void
  evals: PositionEval[] | null
  judgments: (MoveJudgment | null)[] | null
  lines: EngineLine[][] | null
  survey: SurveyPosition[] | null
  /** Per-move decision metrics over the full legal move set. Null until analysis finishes. */
  decisions: DecisionNode[] | null
  corridor: CorridorPoint[] | null
  /** Every structural graph over the position currently on the board. */
  structure: PositionStructure | null
  /** Percolation curves for the position on screen; null while they compute. */
  robustness: Robustness | null
  /**
   * Set while the structural reading is on screen. Percolation is the one
   * measure expensive enough to compute on demand, and it used to be gated on a
   * top-level tab; now that the reading is a panel inside step three, the panel
   * itself declares when it is mounted.
   */
  setStructureOpen: (open: boolean) => void
  /** The game read as one temporal network. */
  temporal: TemporalSeries | null
  /** Cheap structural reading of every ply, used to explain the corridor. */
  digests: StructureDigest[] | null
  /** Narrowing episodes joined to the structural events that caused them. */
  explanations: EpisodeExplanation[] | null
  /** Absorbing-chain leverage per decision, one chain per side. */
  chains: Record<Side, GameChain> | null
  overlay: BoardOverlay
  setOverlay: (overlay: BoardOverlay) => void
  analyzing: boolean
  progress: { done: number; total: number }
  analysisError: string | null
  onReset: () => void
  liveEngineEnabled: boolean
  setLiveEngineEnabled: (enabled: boolean) => void
  liveLines: EngineLine[]
  liveDepth: number
  activeTab: DashboardTab
  setActiveTab: (tab: DashboardTab) => void
  moveFilter: MoveFilter
  setMoveFilter: (filter: MoveFilter) => void
  library: GameMeta[]
  openGame: (id: string) => void
  removeGame: (id: string) => void
}

export const AnalysisContext = createContext<AnalysisContextValue | null>(null)

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisContext.Provider')
  return ctx
}
