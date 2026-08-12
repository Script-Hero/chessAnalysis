import type { EngineLine, MoveJudgment, PositionEval } from './stockfish'

export type CachedAnalysis = {
  fileName: string
  pgn: string
  evals: PositionEval[]
  judgments: (MoveJudgment | null)[]
  lines: EngineLine[][]
}

const STORAGE_KEY = 'chess-analysis:last-game:v2'

function isCachedAnalysis(value: unknown): value is CachedAnalysis {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.fileName === 'string' &&
    typeof v.pgn === 'string' &&
    Array.isArray(v.evals) &&
    Array.isArray(v.judgments) &&
    Array.isArray(v.lines)
  )
}

export function saveAnalysisCache(entry: CachedAnalysis): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry))
  } catch {
    // Caching is best-effort (e.g. quota exceeded, storage disabled) — ignore.
  }
}

export function loadAnalysisCache(): CachedAnalysis | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!isCachedAnalysis(parsed)) {
      clearAnalysisCache()
      return null
    }
    return parsed
  } catch {
    clearAnalysisCache()
    return null
  }
}

export function clearAnalysisCache(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
