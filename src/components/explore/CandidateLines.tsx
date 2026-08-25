import PositionTree from './PositionTree'
import { CHOICE_COLOR, CHOICE_LABEL, OPENNESS_LABEL } from '../../lib/moveGraph'
import type { DecisionNode } from '../../lib/moveGraph'
import type { EngineLine } from '../../lib/stockfish'
import './CandidateLines.css'

type CandidateLinesProps = {
  decision: DecisionNode | null
  fen: string | null
  lines: EngineLine[] | null
}

function moveLabel(d: DecisionNode): string {
  const n = Math.floor(d.index / 2) + 1
  return d.mover === 'white' ? `${n}. ${d.san}` : `${n}… ${d.san}`
}

function fmt(value: number | null, digits = 0, suffix = ''): string {
  return value === null ? '—' : `${value.toFixed(digits)}${suffix}`
}

function CandidateLines({ decision, fen, lines }: CandidateLinesProps) {
  if (!fen) {
    return <p className="candidate-lines__empty">No position selected.</p>
  }

  return (
    <div className="candidate-lines">
      {decision && (
        <>
          <div className="candidate-lines__header">
            <h4 className="candidate-lines__move">{moveLabel(decision)}</h4>
            {decision.choice && (
              <span className="candidate-lines__bucket" style={{ color: `var(${CHOICE_COLOR[decision.choice]})` }}>
                {CHOICE_LABEL[decision.choice]}
              </span>
            )}
          </div>

          <dl className="candidate-lines__stats">
            <div>
              <dt>Corridor width</dt>
              {/* The count is shown with the band it spans when the tolerance
                  moves by the survey's own noise: where the band is wide, the
                  count is reporting search wobble rather than the position. */}
              <dd>
                {decision.corridorWidth} of {decision.legalCount} legal
                {decision.widthLow !== decision.widthHigh && (
                  <span className="candidate-lines__band">
                    {' '}
                    ({decision.widthLow}–{decision.widthHigh})
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt>Position offered</dt>
              <dd>{OPENNESS_LABEL[decision.openness]}</dd>
            </div>
            <div>
              <dt>Real choices</dt>
              {/* Perplexity of the move distribution: how many moves the position
                  effectively offered, which the raw legal count never reports. */}
              <dd>{fmt(decision.softWidth, 1, ' moves')}</dd>
            </div>
            <div>
              <dt>Played rank</dt>
              <dd>
                {decision.playedRank === null
                  ? 'not scored in the survey'
                  : `#${decision.playedRank} of ${decision.scoredCount}`}
              </dd>
            </div>
            <div>
              <dt>Cost vs. best</dt>
              <dd>{fmt(decision.playedLossPct, 1, '% win prob.')}</dd>
            </div>
            <div>
              <dt>Share of moves that lost it</dt>
              <dd>{decision.criticality === null ? '—' : `${Math.round(decision.criticality * 100)}%`}</dd>
            </div>
          </dl>
        </>
      )}

      <h5 className="candidate-lines__subheading">Candidate lines from here</h5>
      <PositionTree fen={fen} lines={lines} />
    </div>
  )
}

export default CandidateLines
