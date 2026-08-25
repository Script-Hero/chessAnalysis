import type { CutMoment } from '../../lib/corridor'
import './CutMoments.css'

type CutMomentsProps = {
  moments: CutMoment[]
  currentPly: number
  onSelect: (positionIndex: number) => void
  whiteLabel: string
  blackLabel: string
}

function moveLabel(m: CutMoment): string {
  const n = Math.floor(m.index / 2) + 1
  return m.mover === 'white' ? `${n}.${m.san}` : `${n}…${m.san}`
}

/**
 * Positions where every surviving continuation ran through a single move.
 *
 * These are critical by structure rather than by outcome, which is why the list
 * includes the ones the player found. A threshold on evaluation drop can only
 * ever surface the half that went wrong, and so systematically hides the
 * moments where someone was one move from losing and played it.
 */
function CutMoments({ moments, currentPly, onSelect, whiteLabel, blackLabel }: CutMomentsProps) {
  if (moments.length === 0) {
    return (
      <p className="cut-moments__empty">
        No position pinched to a single surviving move.
      </p>
    )
  }

  const survived = moments.filter((m) => m.survived).length

  return (
    <div className="cut-moments">
      <p className="cut-moments__summary">
        {moments.length} position{moments.length === 1 ? '' : 's'} where exactly one move held — {survived} found,{' '}
        {moments.length - survived} missed.
      </p>

      <ul className="cut-moments__list">
        {moments.map((m) => (
          <li key={m.index}>
            <button
              type="button"
              className={`cut-moments__item${currentPly === m.index ? ' is-current' : ''}${m.survived ? '' : ' is-missed'}`}
              onClick={() => onSelect(m.index)}
            >
              <span className={`cut-moments__mover cut-moments__mover--${m.mover}`}>
                {m.mover === 'white' ? whiteLabel : blackLabel}
              </span>
              <span className="cut-moments__move">{moveLabel(m)}</span>
              <span className="cut-moments__detail">
                1 of {m.legalCount} moves held — {Math.round(m.criticality * 100)}% of the move set lost it
              </span>
              <span className={`cut-moments__verdict${m.survived ? ' is-good' : ''}`}>
                {m.survived ? 'found it' : 'missed it'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default CutMoments
