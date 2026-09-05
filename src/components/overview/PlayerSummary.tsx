import { useMemo } from 'react'
import DecisionProfile from './DecisionProfile'
import type { ProfileScale } from './DecisionProfile'
import { summarizeCorridor } from '../../lib/corridor'
import type { MoveClassification } from '../../lib/stockfish'
import type { DecisionNode } from '../../lib/moveGraph'
import type { GameChain } from '../../lib/markov'
import type { AccuracySummary, Side } from '../../lib/analysis'
import './PlayerSummary.css'

type PlayerSummaryProps = {
  white: string
  black: string
  accuracy: AccuracySummary
  /** Corridor decisions, when the move graph has been built. Omitted, the card
      is the accuracy card it always was. */
  decisions?: DecisionNode[] | null
  chains?: Record<Side, GameChain> | null
}

/** Bars only compare if both cards are drawn against the same ruler, so the
    scale is set here, across both sides, rather than inside either card. */
function computeProfileScale(
  decisions: DecisionNode[],
  chains: Record<Side, GameChain> | null,
): ProfileScale {
  const widths: number[] = []
  const leverages: number[] = []

  for (const side of ['white', 'black'] as Side[]) {
    const summary = summarizeCorridor(decisions, side)
    if (summary.meanWidth !== null) widths.push(summary.meanWidth)
    if (summary.meanWidthOnFailure !== null) widths.push(summary.meanWidthOnFailure)
    const chain = chains?.[side]
    if (chain && chain.ranked.length) leverages.push(chain.ranked[0].leverage)
  }

  return {
    width: Math.max(...widths, 1),
    leverage: Math.max(...leverages, 1),
  }
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

function PlayerCard({
  name,
  side,
  data,
  decisions,
  chain,
  scale,
}: {
  name: string
  side: Side
  data: AccuracySummary[Side]
  decisions: DecisionNode[] | null
  chain: GameChain | null
  scale: ProfileScale | null
}) {
  return (
    <div className={`player-summary__card player-summary__card--${side}`}>
      <p className="player-summary__name">{name}</p>
      <p className="player-summary__accuracy">
        {data.accuracy !== null ? data.accuracy.toFixed(1) : '—'}
        {data.accuracy !== null && <span className="player-summary__accuracy-unit">%</span>}
      </p>
      <p className="player-summary__accuracy-label">accuracy</p>
      <QualityBar tally={data.tally} />
      {decisions && scale && (
        <DecisionProfile side={side} decisions={decisions} chain={chain} scale={scale} />
      )}
    </div>
  )
}

function PlayerSummary({ white, black, accuracy, decisions = null, chains = null }: PlayerSummaryProps) {
  const scale = useMemo(
    () => (decisions ? computeProfileScale(decisions, chains) : null),
    [decisions, chains],
  )

  return (
    <div className="player-summary">
      <PlayerCard
        name={white}
        side="white"
        data={accuracy.white}
        decisions={decisions}
        chain={chains?.white ?? null}
        scale={scale}
      />
      <div className="player-summary__divider" aria-hidden="true" />
      <PlayerCard
        name={black}
        side="black"
        data={accuracy.black}
        decisions={decisions}
        chain={chains?.black ?? null}
        scale={scale}
      />
    </div>
  )
}

export default PlayerSummary
