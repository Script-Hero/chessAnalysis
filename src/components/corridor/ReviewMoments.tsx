import { ArrowRight } from 'lucide-react'
import { useAnalysis } from '../../context/AnalysisContext'
import { findMoments, moveLabel, type Moment, type Swing } from '../../lib/moments'
import type { Side } from '../../lib/analysis'

/** The headline side's win% around the moment, with the described change drawn heavier. */
function SwingChart({ swing, side }: { swing: Swing; side: Side }) {
  const { start, from, to, values } = swing
  const x = (p: number) => 4 + ((p - start) / Math.max(1, values.length - 1)) * 88
  // Scaled to what the window shows (at least 30 points tall) so a real swing reads as one.
  const mid = (Math.min(...values) + Math.max(...values)) / 2
  const half = Math.max(15, (Math.max(...values) - Math.min(...values)) / 2 + 5)
  const lo = Math.max(0, Math.min(100 - 2 * half, mid - half))
  const y = (v: number) => 38 - ((v - lo) / (2 * half)) * 34
  const path = (a: number, b: number) => values.slice(a - start, b - start + 1).map((v, k) => `${x(a + k)},${y(v)}`).join(' ')
  const name = side === 'white' ? 'White' : 'Black'
  const first = Math.round(values[from - start])
  const last = Math.round(values[to - start])
  return (
    <figure className={`review-swing is-${side}`}>
      <svg viewBox="0 0 96 42" role="img" aria-label={`${name}'s win chances went from ${first}% to ${last}%`}>
        {lo <= 50 && lo + 2 * half >= 50 && <line className="review-swing__mid" x1="4" x2="92" y1={y(50)} y2={y(50)} />}
        <polyline className="review-swing__context" points={path(start, start + values.length - 1)} />
        <polyline className="review-swing__change" points={path(from, to)} />
        <circle cx={x(from)} cy={y(values[from - start])} r="2.5" />
        <circle cx={x(to)} cy={y(values[to - start])} r="2.5" />
      </svg>
      <figcaption>{name} win {first}% → {last}%</figcaption>
    </figure>
  )
}

type Props = {
  /** Precomputed moments, so a page can pin the same list elsewhere. Computed here when omitted. */
  moments?: Moment[] | null
  /** Reports the hovered row's swing span, or null when the pointer leaves. */
  onHover?: (span: { from: number; to: number } | null) => void
  reviewed?: Set<number>
  /** Called instead of `studyDecision` when given, so the caller can record the visit. */
  onOpen?: (index: number) => void
}

export default function ReviewMoments({ moments: given, onHover, reviewed, onOpen }: Props = {}) {
  const { game, evals, judgments, lines, decisions, explanations, moveFilter, studyDecision } = useAnalysis()
  const moments =
    given !== undefined
      ? given
      : evals && judgments && lines
        ? findMoments({ game, evals, judgments, lines, decisions, explanations }, moveFilter)
        : null
  const open = onOpen ?? studyDecision

  return (
    <section className="review-moments">
      <h2>Worth reviewing</h2>
      {moments?.length ? (
        <ol className="review-moments__list">
          {moments.map((m) => (
            // The whole row opens the move; the headline button is its keyboard target, and
            // its click bubbles here like any other click in the row.
            <li
              key={`${m.kind}-${m.index}`}
              className={`review-moment${reviewed?.has(m.index) ? ' is-reviewed' : ''}`}
              onClick={() => open(m.index)}
              onMouseEnter={() => onHover?.({ from: m.swing.from, to: m.swing.to })}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.({ from: m.swing.from, to: m.swing.to })}
              onBlur={() => onHover?.(null)}
            >
              <button className="review-moment__main">
                <strong>
                  <span className={`review-moment__side is-${m.side}`}><span aria-hidden="true">●</span> {m.side === 'white' ? 'White' : 'Black'}</span> {m.headline}
                </strong>
              </button>
              <SwingChart swing={m.swing} side={m.side} />
              <span className="review-moment__move">
                {reviewed?.has(m.index) && <span className="review-moment__reviewed">Reviewed</span>}
                {moveLabel(m.index, game.moves[m.index].san)}
                <ArrowRight size={18} />
              </span>
              <p className="review-moment__detail">
                {m.detail.map((part, i) =>
                  typeof part === 'string' ? (
                    part
                  ) : (
                    <button
                      key={i}
                      className="review-moment__ref"
                      onClick={(e) => {
                        e.stopPropagation()
                        open(part.index)
                      }}
                    >
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
