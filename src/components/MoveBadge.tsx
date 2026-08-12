import type { MoveClassification, MoveJudgment } from '../lib/stockfish'
import './MoveBadge.css'

const BADGE_META: Partial<Record<MoveClassification, { symbol: string; tone: string }>> = {
  inaccuracy: { symbol: '?!', tone: 'warning' },
  mistake: { symbol: '?', tone: 'serious' },
  blunder: { symbol: '??', tone: 'critical' },
}

export function classificationLabel(c: MoveClassification): string {
  return c.charAt(0).toUpperCase() + c.slice(1)
}

export function judgmentTitle(j: MoveJudgment): string {
  const base = `${classificationLabel(j.classification)} — lost ~${Math.round(j.adjustedLossPct)}% win probability vs. the best practical alternative`
  if (j.onlyMove && j.bestMoveSan) {
    return `${base}. Only ${j.bestMoveSan} kept the full advantage — a narrow, hard-to-find engine line.`
  }
  if (j.bestMoveSan) {
    return `${base}. Best was ${j.bestMoveSan}.`
  }
  return base
}

function MoveBadge({ judgment }: { judgment: MoveJudgment | null | undefined }) {
  if (!judgment) return null
  const meta = BADGE_META[judgment.classification]
  if (!meta) return null
  return (
    <span className={`move-badge move-badge--${meta.tone}`} title={judgmentTitle(judgment)}>
      {meta.symbol}
    </span>
  )
}

export default MoveBadge
