import { ArrowRight } from 'lucide-react'
import { useAnalysis } from '../../context/AnalysisContext'
import { findMoments, moveLabel } from '../../lib/moments'

export default function ReviewMoments() {
  const { game, evals, judgments, lines, decisions, explanations, moveFilter, studyDecision } = useAnalysis()
  const moments = evals && judgments && lines ? findMoments({ game, evals, judgments, lines, decisions, explanations }, moveFilter) : null

  return (
    <section className="review-moments">
      <h2>Worth reviewing</h2>
      {moments?.length ? (
        <ol className="review-moments__list">
          {moments.map((m) => (
            <li key={`${m.kind}-${m.index}`} className="review-moment">
              <button className="review-moment__main" onClick={() => studyDecision(m.index)}>
                <strong>
                  <span className={`review-moment__side is-${m.side}`}><span aria-hidden="true">●</span> {m.side === 'white' ? 'White' : 'Black'}</span> {m.headline}
                </strong>
                <span className="review-moment__move">
                  {moveLabel(m.index, game.moves[m.index].san)}
                  <ArrowRight size={18} />
                </span>
              </button>
              <p className="review-moment__detail">
                {m.detail.map((part, i) =>
                  typeof part === 'string' ? (
                    part
                  ) : (
                    <button key={i} className="review-moment__ref" onClick={() => studyDecision(part.index)}>
                      {part.label}
                    </button>
                  ),
                )}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p>
          {moments
            ? 'No single move stood out. The result came from many small decisions, so the charts tell this game better than any one moment.'
            : 'Review moments will appear when analysis completes.'}
        </p>
      )}
    </section>
  )
}
