import type { GameChain, LeveragePoint } from '../../lib/markov'
import './LeverageList.css'

type LeverageListProps = {
  chain: GameChain
  label: string
  currentPly: number
  onSelect: (positionIndex: number) => void
}

function moveLabel(point: LeveragePoint): string {
  const n = Math.floor(point.index / 2) + 1
  return point.mover === 'white' ? `${n}.${point.san}` : `${n}…${point.san}`
}

/**
 * Decisions ranked by what they cost against the player's own expectation.
 *
 * Not against the engine's best move — that is the eval-drop number every
 * analysis site already shows. This is the chain's decomposition: how much the
 * move moved the expected final outcome, given a player of this strength was
 * making it. A blunder in a position that was already decided moves it barely
 * at all, because there was little left to lose; a small slip in a position
 * still worth playing moves it a lot. The terms sum exactly to the game's whole
 * swing, so nothing here is a threshold or a weighting chosen by hand.
 */
function LeverageList({ chain, label, currentPly, onSelect }: LeverageListProps) {
  const top = chain.ranked.filter((p) => p.leverage > 0.05).slice(0, 6)

  if (top.length === 0) {
    return <p className="leverage__empty">No single decision by {label} moved the outcome measurably.</p>
  }

  const peak = top[0].leverage

  return (
    <div className="leverage">
      <ol className="leverage__list">
        {top.map((point) => (
          <li key={point.index}>
            <button
              type="button"
              className={`leverage__row${currentPly === point.index ? ' is-current' : ''}`}
              onClick={() => onSelect(point.index)}
            >
              <span className="leverage__move">{moveLabel(point)}</span>
              <span className="leverage__bar">
                <span className="leverage__fill" style={{ width: `${(point.leverage / peak) * 100}%` }} />
              </span>
              <span className="leverage__value">−{point.leverage.toFixed(1)}</span>
              <span className="leverage__detail">
                {point.valueBefore.toFixed(0)}→{point.valueAfter.toFixed(0)} win% · engine loss{' '}
                {point.lossPct.toFixed(0)}
              </span>
            </button>
          </li>
        ))}
      </ol>

    </div>
  )
}

export default LeverageList
