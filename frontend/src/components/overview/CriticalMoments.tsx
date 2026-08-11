import { useMemo, useState } from 'react'
import { Chessboard } from 'react-chessboard'
import MoveBadge, { classificationLabel, judgmentTitle } from '../MoveBadge'
import type { CriticalMoment } from '../../lib/analysis'
import { SQUARE_DARK, SQUARE_LIGHT } from '../../lib/boardTheme'
import './CriticalMoments.css'

type SideFilter = 'all' | 'white' | 'black'

type CriticalMomentsProps = {
  moments: CriticalMoment[]
  positions: string[]
  currentPly: number
  onJump: (ply: number) => void
}

function CriticalMoments({ moments, positions, currentPly, onJump }: CriticalMomentsProps) {
  const [filter, setFilter] = useState<SideFilter>('all')

  const whiteCount = useMemo(() => moments.filter((m) => m.mover === 'white').length, [moments])
  const blackCount = useMemo(() => moments.filter((m) => m.mover === 'black').length, [moments])
  const filtered = useMemo(
    () => (filter === 'all' ? moments : moments.filter((m) => m.mover === filter)),
    [moments, filter],
  )

  const prevMoment = [...filtered].reverse().find((m) => m.ply < currentPly)
  const nextMoment = filtered.find((m) => m.ply > currentPly)

  if (moments.length === 0) {
    return (
      <div className="critical-moments critical-moments--empty">
        <h2 className="critical-moments__title">Critical moments</h2>
        <p className="critical-moments__empty-text">No mistakes or blunders found — a clean game.</p>
      </div>
    )
  }

  return (
    <div className="critical-moments">
      <div className="critical-moments__header">
        <h2 className="critical-moments__title">
          Critical moments <span className="critical-moments__count">{moments.length}</span>
        </h2>

        <div className="critical-moments__controls">
          <div className="critical-moments__filters" role="tablist" aria-label="Filter critical moments by side">
            {(
              [
                ['all', 'All', moments.length],
                ['white', 'White', whiteCount],
                ['black', 'Black', blackCount],
              ] as const
            ).map(([value, label, count]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={`critical-moments__filter critical-moments__filter--${value}${filter === value ? ' is-active' : ''}`}
                onClick={() => setFilter(value)}
                disabled={count === 0}
              >
                {label} <span className="critical-moments__filter-count">{count}</span>
              </button>
            ))}
          </div>

          <div className="critical-moments__nav">
            <button
              type="button"
              className="critical-moments__nav-btn"
              onClick={() => prevMoment && onJump(prevMoment.ply)}
              disabled={!prevMoment}
              title="Jump to previous critical moment"
            >
              ‹ Prev
            </button>
            <button
              type="button"
              className="critical-moments__nav-btn"
              onClick={() => nextMoment && onJump(nextMoment.ply)}
              disabled={!nextMoment}
              title="Jump to next critical moment"
            >
              Next ›
            </button>
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="critical-moments__empty-text">No critical moments for {filter} on this filter.</p>
      ) : (
        <div className="critical-moments__grid">
          {filtered.map((moment) => {
            const moveNumber = Math.floor((moment.ply - 1) / 2) + 1
            const label = moment.mover === 'white' ? `${moveNumber}.` : `${moveNumber}...`
            const isActive = moment.ply === currentPly
            return (
              <button
                key={moment.ply}
                type="button"
                className={`critical-moments__card critical-moments__card--${moment.mover}${isActive ? ' is-active' : ''}`}
                onClick={() => onJump(moment.ply)}
                aria-current={isActive}
              >
                <div className="critical-moments__thumb">
                  <Chessboard
                    options={{
                      id: `critical-${moment.ply}`,
                      position: positions[moment.ply],
                      boardOrientation: moment.mover === 'white' ? 'white' : 'black',
                      allowDragging: false,
                      showAnimations: false,
                      showNotation: false,
                      darkSquareStyle: { backgroundColor: SQUARE_DARK },
                      lightSquareStyle: { backgroundColor: SQUARE_LIGHT },
                    }}
                  />
                </div>
                <div className="critical-moments__info">
                  <p className="critical-moments__meta">
                    <span className={`critical-moments__side critical-moments__side--${moment.mover}`}>
                      {moment.mover === 'white' ? 'White' : 'Black'}
                    </span>
                    <span className="critical-moments__classification">
                      {classificationLabel(moment.judgment.classification)}
                    </span>
                  </p>
                  <p className="critical-moments__move">
                    {label} {moment.san}
                    <MoveBadge judgment={moment.judgment} />
                  </p>
                  <p className="critical-moments__detail" title={judgmentTitle(moment.judgment)}>
                    {moment.judgment.bestMoveSan
                      ? `Best was ${moment.judgment.bestMoveSan}`
                      : `Lost ~${Math.round(moment.judgment.adjustedLossPct)}%`}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default CriticalMoments
