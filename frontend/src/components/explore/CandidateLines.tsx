import PositionTree from './PositionTree'
import { BUCKET_INFO } from '../../lib/graphMetrics'
import type { PlyMetric } from '../../lib/graphMetrics'
import type { EngineLine } from '../../lib/stockfish'
import './CandidateLines.css'

type CandidateLinesProps = {
  metric: PlyMetric | null
  fen: string | null
  lines: EngineLine[] | null
}

function moveLabel(m: PlyMetric): string {
  const moveNumber = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${moveNumber}. ${m.san}` : `${moveNumber}… ${m.san}`
}

function fmt(value: number | null, digits = 0, suffix = ''): string {
  return value === null ? '—' : `${value.toFixed(digits)}${suffix}`
}

function CandidateLines({ metric, fen, lines }: CandidateLinesProps) {
  if (!fen) {
    return <p className="candidate-lines__empty">No position selected.</p>
  }

  return (
    <div className="candidate-lines">
      {metric && (
        <>
          <div className="candidate-lines__header">
            <h4 className="candidate-lines__move">{moveLabel(metric)}</h4>
            <span
              className="candidate-lines__bucket"
              style={{ color: `var(${BUCKET_INFO[metric.bucket].colorVar})` }}
            >
              {BUCKET_INFO[metric.bucket].label}
            </span>
          </div>

          <dl className="candidate-lines__stats">
            <div>
              <dt>Entropy</dt>
              <dd>{fmt(metric.entropy, 2)}</dd>
            </div>
            <div>
              <dt>Top gap</dt>
              <dd>{fmt(metric.topGapPawns, 2, ' pawns')}</dd>
            </div>
            <div>
              <dt>Played rank</dt>
              <dd>
                {metric.playedRank === null
                  ? 'off-graph (not in stored candidates)'
                  : `#${metric.playedRank} of ${metric.branchingFactor}`}
              </dd>
            </div>
            <div>
              <dt>Loss vs. best</dt>
              <dd>{fmt(metric.rawLossPct, 0, '%')}</dd>
            </div>
            <div>
              <dt>Loss vs. field</dt>
              <dd>{fmt(metric.adjustedLossPct, 0, '%')}</dd>
            </div>
            <div>
              <dt>Classification</dt>
              <dd>{metric.classification ?? '—'}</dd>
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
