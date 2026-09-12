import { summarizeCorridor } from '../../lib/corridor'
import type { DecisionNode } from '../../lib/moveGraph'
import type { GameChain } from '../../lib/markov'
import type { Side } from '../../lib/analysis'
import './DecisionProfile.css'

/**
 * How a side handled the decisions it was given, drawn rather than written.
 *
 * This is the corridor headline reduced to marks: a ring for the share of
 * decisions that stayed inside the corridor, a pair of bars for how much room
 * the side had on average against how much it had when it erred, a pip per
 * only-move test, and one bar for the costliest single decision. The prose
 * version said the same things in four sentences; sitting inside a player card
 * it has room for a caption apiece and nothing more.
 *
 * Both sides share one scale for the room bars and one for the leverage bar, so
 * the two cards can be read against each other rather than each against itself.
 */

export type ProfileScale = {
  /** Upper bound of the room bars, in real choices. */
  width: number
  /** Upper bound of the leverage bar, in win%. */
  leverage: number
}

const RING_RADIUS = 26
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
/** Beyond this many only-move tests the pips stop being countable at a glance. */

function HoldRing({ rate, side }: { rate: number | null; side: Side }) {
  const filled = rate === null ? 0 : rate
  return (
    <div className="decision-profile__ring">
      <svg viewBox="0 0 64 64" role="img" aria-label={
        rate === null ? 'No decisions measured' : `${Math.round(rate * 100)}% of decisions stayed in the corridor`
      }>
        <circle className="decision-profile__ring-track" cx="32" cy="32" r={RING_RADIUS} />
        <circle
          className={`decision-profile__ring-arc decision-profile__ring-arc--${side}`}
          cx="32"
          cy="32"
          r={RING_RADIUS}
          strokeDasharray={`${filled * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
        />
      </svg>
      <span className="decision-profile__ring-value">
        {rate === null ? '—' : Math.round(rate * 100)}
        {rate !== null && <span className="decision-profile__ring-unit">%</span>}
      </span>
    </div>
  )
}

function RoomBar({
  caption,
  value,
  scale,
  tone,
}: {
  caption: string
  value: number | null
  scale: number
  tone: 'all' | 'erred'
}) {
  const pct = value === null ? 0 : Math.min(1, value / scale) * 100
  return (
    <div className="decision-profile__row">
      <span className="decision-profile__caption">{caption}</span>
      <div className="decision-profile__track">
        <div
          className={`decision-profile__fill decision-profile__fill--${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="decision-profile__figure">{value === null ? '—' : value.toFixed(1)}</span>
    </div>
  )
}

type DecisionProfileProps = {
  side: Side
  decisions: DecisionNode[]
  chain: GameChain | null
  scale: ProfileScale
}

function DecisionProfile({ side, decisions, chain, scale }: DecisionProfileProps) {
  const summary = summarizeCorridor(decisions, side)
  const holdRate =
    summary.decisions > 0 ? (summary.decisions - summary.exits) / summary.decisions : null

  // The judgement the prose used to make, kept as a colour rather than a
  // sentence: errors in tighter-than-usual positions are a different problem
  // from errors made with room to spare.
  const tightErrors =
    summary.meanWidth !== null &&
    summary.meanWidthOnFailure !== null &&
    summary.meanWidthOnFailure < summary.meanWidth

  const worst = chain && chain.ranked.length ? chain.ranked[0] : null
  const leveragePct = worst ? Math.min(1, worst.leverage / scale.leverage) * 100 : 0


  return (
    <div className="decision-profile">
      <div className="decision-profile__hold">
        <HoldRing rate={holdRate} side={side} />
        <div className="decision-profile__hold-text">
          <span className="decision-profile__title">In corridor</span>
          <span className="decision-profile__sub">
            {summary.decisions - summary.exits}/{summary.decisions} decisions
          </span>
        </div>
      </div>

      <div className={`decision-profile__room${tightErrors ? ' is-tight' : ''}`}>
        <span className="decision-profile__title">Room to work with</span>
        <RoomBar caption="all" value={summary.meanWidth} scale={scale.width} tone="all" />
        <RoomBar caption="erred" value={summary.meanWidthOnFailure} scale={scale.width} tone="erred" />
      </div>

      <div className="decision-profile__foot">
        <div className="decision-profile__cuts">
          <span className="decision-profile__title">Narrow decisions held</span>
          {summary.cutsFaced === 0 ? (
            <span className="decision-profile__none">none faced</span>
          ) : (
            <div
              className="decision-profile__pips"
              role="img"
              aria-label={`${summary.cutsSurvived} of ${summary.cutsFaced} only-move tests found`}
            >
              <span className="decision-profile__figure">{summary.cutsSurvived} of {summary.cutsFaced}</span>
            </div>
          )}
        </div>

        <div className="decision-profile__cost">
          <span className="decision-profile__title">Costliest</span>
          <div className="decision-profile__row">
            <div className="decision-profile__track">
              <div
                className="decision-profile__fill decision-profile__fill--cost"
                style={{ width: `${leveragePct}%` }}
              />
            </div>
            <span className="decision-profile__figure">
              {worst ? `−${worst.leverage.toFixed(0)}` : '—'}
            </span>
          </div>
          <span className="decision-profile__sub">{worst ? moveLabel(worst) : 'no swing'}</span>
        </div>
      </div>
    </div>
  )
}

function moveLabel(point: GameChain['ranked'][number]): string {
  const n = Math.floor(point.index / 2) + 1
  return point.mover === 'white' ? `${n}.${point.san}` : `${n}…${point.san}`
}

export default DecisionProfile
