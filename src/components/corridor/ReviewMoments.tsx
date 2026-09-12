import { ArrowRight } from 'lucide-react'
import { useAnalysis } from '../../context/AnalysisContext'

export default function ReviewMoments() {
  const { decisions, explanations, moveFilter, studyDecision, game } = useAnalysis()
  const own = (decisions ?? []).filter(d => moveFilter === 'both' || d.mover === moveFilter)
  const costly = [...own].filter(d => d.choice === 'outside').sort((a,b) => (b.playedLossPct ?? 0) - (a.playedLossPct ?? 0))[0]
  const held = own.find(d => d.isCut && (d.choice === 'best' || d.choice === 'inside'))
  const episode = explanations?.find(e => moveFilter === 'both' || e.episode.mover === moveFilter)?.episode
  const entries = [
    ...(costly ? [{ index: costly.index, title: 'A costly decision', detail: `${costly.playedLossPct?.toFixed(1)} percentage points below the best survey move` }] : []),
    ...(held ? [{ index: held.index, title: 'A narrow decision held', detail: `${held.softWidth?.toFixed(1) ?? '1'} effective choices; the played move stayed within tolerance` }] : []),
    ...(episode ? [{ index: episode.startPly - 1, title: 'A narrowing stretch', detail: `${episode.startWidth.toFixed(1)} to ${episode.endWidth.toFixed(1)} effective choices over ${episode.decisions} decisions` }] : []),
  ]
  return <section className="review-moments"><h2>Worth reviewing</h2>{entries.length ? entries.map(e => <button key={e.title} className="review-moment" onClick={() => studyDecision(e.index)}><span><strong>{e.title}</strong><small>{e.detail}</small></span><span className="review-moment__move"><span className={`review-moment__side is-${e.index % 2 ? 'black' : 'white'}`} title={game.headers[e.index % 2 ? 'Black' : 'White']}><span aria-hidden="true">●</span> {e.index % 2 ? 'Black' : 'White'}</span>{Math.floor(e.index / 2) + 1}{e.index % 2 ? '...' : '.'} {game.moves[e.index]?.san}<ArrowRight size={18} /></span></button>) : <p>{decisions ? 'No highlighted moments at the current thresholds. The game remains available for move-by-move review.' : 'Review moments will appear when analysis completes.'}</p>}</section>
}
