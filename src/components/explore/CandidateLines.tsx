import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { ChevronLeft, ChevronRight, Play, X } from 'lucide-react'
import { useAnalysis } from '../../context/AnalysisContext'
import { CORRIDOR_TOLERANCE_PCT } from '../../lib/moveGraph'
import type { DecisionNode } from '../../lib/moveGraph'
import { stepUci, ANALYSIS_DEPTH, SURVEY_DEPTH } from '../../lib/stockfish'
import type { EngineLine } from '../../lib/stockfish'
import './CandidateLines.css'

type Props = { decision: DecisionNode | null; fen: string | null; lines: EngineLine[] | null }

export default function CandidateLines({ decision, fen, lines }: Props) {
  const { survey, decisionIndex, setPreviewFen, previewFen } = useAnalysis()
  const [selected, setSelected] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const moves = useMemo(() => {
    if (!fen) return []
    const scores = new Map((survey?.[decisionIndex]?.moves ?? []).map(m => [m.uci, m]))
    return new Chess(fen).moves({ verbose: true }).map(m => {
      const uci = m.from + m.to + (m.promotion ?? '')
      return { uci, san: m.san, score: scores.get(uci), line: lines?.find(l => l.move === uci) }
    }).sort((a, b) => (a.score?.lossPct ?? Infinity) - (b.score?.lossPct ?? Infinity))
  }, [fen, survey, decisionIndex, lines])
  const chosen = moves.find(m => m.uci === selected)
  const playback = useMemo(() => {
    if (!fen || !chosen) return []
    let current = fen
    const result = [{ fen, san: 'Before' }]
    for (const uci of chosen.line?.pv ?? [chosen.uci]) {
      const next = stepUci(current, uci)
      if (!next) break
      result.push({ fen: next.fen, san: next.san })
      current = next.fen
    }
    return result
  }, [fen, chosen])
  if (!fen) return <p>No position selected.</p>
  const visible = showAll ? moves : moves.filter((m, i) => i < 5 || m.uci === decision?.uci)
  const select = (uci: string) => {
    setSelected(uci)
    setStep(1)
    setPreviewFen(stepUci(fen, uci)?.fen ?? null)
  }
  const advance = (index: number) => {
    setStep(index)
    setPreviewFen(playback[index]?.fen ?? null)
  }
  return <div className="candidate-lines">
    {decision && <dl className="candidate-lines__stats">
      <div><dt>Effective choices</dt><dd>{decision.softWidth?.toFixed(1) ?? decision.corridorWidth}</dd></div>
      <div><dt>Acceptable moves</dt><dd>{decision.corridorWidth} / {decision.scoredCount} scored</dd></div>
      <div><dt>Played move loss</dt><dd>{decision.playedLossPct === null ? 'Not scored' : `${decision.playedLossPct.toFixed(1)} pp`}</dd></div>
    </dl>}
    <div className="comparison-heading"><h3>Compare moves</h3><span>Survey depth {SURVEY_DEPTH} · mover's win estimate</span></div>
    <div className="move-comparison" aria-label="Candidate move comparison">
      <div className="comparison-row comparison-row--head"><span>Move</span><span>Win estimate</span><span>Loss</span><span>Assessment</span></div>
      {visible.map(m => <button key={m.uci} className={`comparison-row${selected === m.uci && previewFen ? ' is-selected' : ''}`} onClick={() => select(m.uci)} aria-label={`Preview ${m.san}${m.uci === decision?.uci ? ', played move' : ''}`}>
        <span><Play size={13} /> <strong>{m.san}</strong>{m.uci === decision?.uci && <small>Played</small>}</span>
        <span>{m.score ? `${m.score.winProb.toFixed(1)}%` : 'Unknown'}</span>
        <span>{m.score ? `${m.score.lossPct.toFixed(1)} pp` : '-'}</span>
        <span className={m.score && m.score.lossPct > CORRIDOR_TOLERANCE_PCT ? 'comparison-outside' : ''}>{!m.score ? 'Not scored' : m.score.lossPct === 0 ? 'Best in survey' : m.score.lossPct <= CORRIDOR_TOLERANCE_PCT ? 'Acceptable' : 'Outside tolerance'}</span>
      </button>)}
    </div>
    {moves.length > 5 && <button className="text-command" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show leading moves' : `All ${moves.length} legal moves`}</button>}
    {chosen && previewFen && <section className="line-playback" aria-label="Candidate playback">
      <div className="playback-controls"><strong>{chosen.san} variation</strong><button title="Previous position" aria-label="Previous candidate position" disabled={step === 0} onClick={() => advance(step - 1)}><ChevronLeft size={18} /></button><span>{step} / {playback.length - 1}</span><button title="Next position" aria-label="Next candidate position" disabled={step >= playback.length - 1} onClick={() => advance(step + 1)}><ChevronRight size={18} /></button><button title="Close variation" aria-label="Close variation" onClick={() => { setPreviewFen(null); setSelected(null) }}><X size={18} /></button></div>
      <div className="playback-moves">{playback.map((p, i) => <button key={i} aria-pressed={i === step} onClick={() => advance(i)}>{p.san}</button>)}</div>
      <p>{chosen.line ? `Stored continuation · depth ${ANALYSIS_DEPTH} · ${chosen.line.mateIn !== null ? `mate ${chosen.line.mateIn}` : `${chosen.line.score > 0 ? '+' : ''}${chosen.line.score.toFixed(2)} pawns for the mover`}` : 'One-move preview. No stored continuation for this move.'}</p>
    </section>}
    <details className="method-details"><summary>Score coverage and definitions</summary><p>{decision?.scoredCount ?? 0} of {moves.length} legal moves scored at depth {SURVEY_DEPTH}. Acceptable means within {CORRIDOR_TOLERANCE_PCT} percentage points of the best survey estimate. These are model estimates, not measured chances for this player.</p><p>Effective choices weights all scored moves by quality. Hard count sensitivity: {decision?.widthLow ?? '-'} to {decision?.widthHigh ?? '-'} moves at tolerances of 6 to 14 points; this is not a confidence interval. Stored continuations use the separate depth-{ANALYSIS_DEPTH} pass.</p></details>
  </div>
}
