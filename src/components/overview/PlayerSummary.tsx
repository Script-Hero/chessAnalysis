import type { MoveClassification } from '../../lib/stockfish'
import type { AccuracySummary, Side } from '../../lib/analysis'
import './PlayerSummary.css'

type PlayerSummaryProps = {
  white: string
  black: string
  accuracy: AccuracySummary
}

const TIER_ORDER: MoveClassification[] = ['best', 'excellent', 'good', 'inaccuracy', 'mistake', 'blunder']
const TIER_LABEL: Record<MoveClassification, string> = {
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  blunder: 'Blunder',
}

function QualityBar({ tally }: { tally: Record<MoveClassification, number> }) {
  const total = TIER_ORDER.reduce((sum, tier) => sum + tally[tier], 0)
  const segments = TIER_ORDER.filter((tier) => tally[tier] > 0)

  return (
    <div className="player-summary__quality">
      <div className="player-summary__bar" role="img" aria-label="Move quality breakdown">
        {total === 0 ? (
          <div className="player-summary__bar-empty" />
        ) : (
          segments.map((tier, i) => (
            <div
              key={tier}
              className={`player-summary__segment player-summary__segment--${tier}${i === 0 ? ' is-first' : ''}${i === segments.length - 1 ? ' is-last' : ''}`}
              style={{ flexGrow: tally[tier] }}
              title={`${TIER_LABEL[tier]}: ${tally[tier]}`}
            />
          ))
        )}
      </div>
      <ul className="player-summary__legend">
        {TIER_ORDER.map((tier) => (
          <li key={tier} className="player-summary__legend-item">
            <span className={`player-summary__swatch player-summary__swatch--${tier}`} />
            {TIER_LABEL[tier]} <span className="player-summary__legend-count">{tally[tier]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PlayerCard({ name, side, data }: { name: string; side: Side; data: AccuracySummary[Side] }) {
  return (
    <div className={`player-summary__card player-summary__card--${side}`}>
      <p className="player-summary__name">{name}</p>
      <p className="player-summary__accuracy">
        {data.accuracy !== null ? data.accuracy.toFixed(1) : '—'}
        {data.accuracy !== null && <span className="player-summary__accuracy-unit">%</span>}
      </p>
      <p className="player-summary__accuracy-label">accuracy</p>
      <QualityBar tally={data.tally} />
    </div>
  )
}

function PlayerSummary({ white, black, accuracy }: PlayerSummaryProps) {
  return (
    <div className="player-summary">
      <PlayerCard name={white} side="white" data={accuracy.white} />
      <div className="player-summary__divider" aria-hidden="true" />
      <PlayerCard name={black} side="black" data={accuracy.black} />
    </div>
  )
}

export default PlayerSummary
