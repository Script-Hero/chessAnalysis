import { summarizeCorridor } from '../../lib/corridor'
import type { DecisionNode } from '../../lib/moveGraph'
import type { GameChain } from '../../lib/markov'
import type { Side } from '../../lib/analysis'
import './CorridorHeadline.css'

type CorridorHeadlineProps = {
  decisions: DecisionNode[]
  whiteLabel: string
  blackLabel: string
  chains: Record<Side, GameChain> | null
}

function SideCard({
  label,
  side,
  decisions,
  chain,
}: {
  label: string
  side: Side
  decisions: DecisionNode[]
  chain: GameChain | null
}) {
  const summary = summarizeCorridor(decisions, side)
  const holdRate = summary.decisions > 0 ? (summary.decisions - summary.exits) / summary.decisions : null

  return (
    <div className={`corridor-headline__card corridor-headline__card--${side}`}>
      <p className="corridor-headline__name">{label}</p>

      <div className="corridor-headline__stat">
        <span className="corridor-headline__value">
          {holdRate === null ? '—' : `${Math.round(holdRate * 100)}%`}
        </span>
        <span className="corridor-headline__label">of decisions stayed in the corridor</span>
        {/* The comparison that belongs next to this is within the game: how much
            room the side had on the decisions it got right against the ones it
            got wrong. A rate compared against other games would be a claim about
            a player, which one game cannot support. */}
        <span className="corridor-headline__ref">
          {summary.meanWidth !== null && summary.meanWidthOnFailure !== null
            ? summary.meanWidthOnFailure < summary.meanWidth
              ? 'the errors came in the tighter positions'
              : 'the errors came with room to spare — not a calculation problem'
            : ''}
        </span>
      </div>

      <dl className="corridor-headline__grid">
        <div>
          <dt>Room to work with</dt>
          <dd>
            {summary.meanWidth === null ? '—' : `${summary.meanWidth.toFixed(1)} real choices`}
          </dd>
        </div>
        <div>
          <dt>Room when they erred</dt>
          <dd>
            {summary.meanWidthOnFailure === null ? '—' : `${summary.meanWidthOnFailure.toFixed(1)} real choices`}
          </dd>
        </div>
        <div>
          <dt>Only-move tests</dt>
          <dd>{summary.cutsFaced === 0 ? 'none' : `${summary.cutsSurvived}/${summary.cutsFaced} found`}</dd>
        </div>
        <div>
          <dt>Costliest decision</dt>
          <dd>{chain && chain.ranked.length ? `−${chain.ranked[0].leverage.toFixed(0)} win%` : '—'}</dd>
        </div>
      </dl>

      {chain && chain.ranked.length > 0 && chain.ranked[0].leverage > 0.5 && (
        <p className="corridor-headline__chain">
          Largest single share of the swing: <strong>{moveLabel(chain.ranked[0])}</strong>, −
          {chain.ranked[0].leverage.toFixed(0)} win%.
        </p>
      )}
    </div>
  )
}

function moveLabel(point: GameChain['ranked'][number]): string {
  const n = Math.floor(point.index / 2) + 1
  return point.mover === 'white' ? `${n}.${point.san}` : `${n}…${point.san}`
}

function CorridorHeadline({ decisions, whiteLabel, blackLabel, chains }: CorridorHeadlineProps) {
  return (
    <div className="corridor-headline">
      <SideCard label={whiteLabel} side="white" decisions={decisions} chain={chains?.white ?? null} />
      <SideCard label={blackLabel} side="black" decisions={decisions} chain={chains?.black ?? null} />
    </div>
  )
}

export default CorridorHeadline
