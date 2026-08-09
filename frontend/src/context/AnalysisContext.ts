import { createContext, useContext } from 'react'
import type { ParsedGame } from '../lib/pgn'
import type { EngineLine, MoveJudgment, PositionEval } from '../lib/stockfish'

export type DashboardTab = 'analysis' | 'report'

export type AnalysisContextValue = {
  game: ParsedGame
  fileName: string
  ply: number
  goTo: (target: number) => void
  orientation: 'white' | 'black'
  setOrientation: (orientation: 'white' | 'black') => void
  evals: PositionEval[] | null
  judgments: (MoveJudgment | null)[] | null
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
}

export const AnalysisContext = createContext<AnalysisContextValue | null>(null)

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisContext.Provider')
  return ctx
}
