import PositionTree from '../tree/PositionTree'
import { BUCKET_INFO } from '../../lib/graphMetrics'
import type { PlyMetric } from '../../lib/graphMetrics'
import type { EngineLine } from '../../lib/stockfish'
import './GraphMoveDetail.css'

type GraphMoveDetailProps = {
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

function GraphMoveDetail({ metric, fen, lines }: GraphMoveDetailProps) {
  if (!metric || !fen) {
    return <p className="graph-move-detail__empty">Select a move on the timeline or scatter plot above.</p>
  }

  const info = BUCKET_INFO[metric.bucket]
  const rankLabel =
    metric.playedRank === null
      ? 'off-graph (not in stored candidates)'
      : `#${metric.playedRank} of ${metric.branchingFactor}`

  return (
    <div className="graph-move-detail">
      <div className="graph-move-detail__header">
        <h4 className="graph-move-detail__move">{moveLabel(metric)}</h4>
        <span className="graph-move-detail__bucket" style={{ color: `var(${info.colorVar})` }}>
          {info.label}
        </span>
      </div>

      <dl className="graph-move-detail__stats">
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
          <dd>{rankLabel}</dd>
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

      <h5 className="graph-move-detail__subheading">Candidate tree at this decision point</h5>
      <PositionTree fen={fen} lines={lines} />
    </div>
  )
}

export default GraphMoveDetail
