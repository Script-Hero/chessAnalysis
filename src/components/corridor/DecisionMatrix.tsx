import { useState } from 'react'
import { CHOICE_COLOR, CHOICE_LABEL, OPENNESS_LABEL, computeDecisionMatrix } from '../../lib/moveGraph'
import type { Choice, DecisionCell, DecisionNode, Openness } from '../../lib/moveGraph'
import './DecisionMatrix.css'

type DecisionMatrixProps = {
  decisions: DecisionNode[]
  currentPly: number
  onSelect: (positionIndex: number) => void
}

const OPENNESS_ORDER: Openness[] = ['forced', 'narrow', 'open']
const CHOICE_ORDER: Choice[] = ['best', 'inside', 'outside']

const OPENNESS_SHORT: Record<Openness, string> = {
  forced: 'Forced',
  narrow: 'Narrow',
  open: 'Open',
}

const CHOICE_SHORT: Record<Choice, string> = {
  best: 'Best move',
  inside: 'In corridor',
  outside: 'Left corridor',
}

function moveLabel(d: DecisionNode): string {
  const n = Math.floor(d.index / 2) + 1
  return d.mover === 'white' ? `${n}.${d.san}` : `${n}…${d.san}`
}

/**
 * Decisions laid out by how much room the position offered against what the
 * player did with it.
 *
 * The two axes replace the previous nine named buckets, which needed nine prose
 * labels sharing five colours — three of them identical — to say the same
 * thing. Here openness is a position on the grid and only the three choice
 * outcomes carry colour, so the encoding can't collide with itself.
 */
function DecisionMatrix({ decisions, currentPly, onSelect }: DecisionMatrixProps) {
  const [selected, setSelected] = useState<DecisionCell | null>(null)
  const matrix = computeDecisionMatrix(decisions)

  const matching = selected ? decisions.filter((d) => d.cell === selected) : []
  const maxCount = Math.max(1, ...Object.values(matrix.counts))

  return (
    <div className="decision-matrix">
      <div className="decision-matrix__grid">
        <span />
        {CHOICE_ORDER.map((choice) => (
          <span key={choice} className="decision-matrix__col-head" style={{ color: `var(${CHOICE_COLOR[choice]})` }}>
            {CHOICE_SHORT[choice]}
          </span>
        ))}

        {OPENNESS_ORDER.map((openness) => (
          <RowFragment
            key={openness}
            openness={openness}
            counts={matrix.counts}
            total={matrix.byOpenness[openness]}
            maxCount={maxCount}
            selected={selected}
            onSelect={setSelected}
          />
        ))}
      </div>

      <p className="decision-matrix__caption">{matrix.total} decisions · click a cell to list its moves</p>

      {selected && (
        <div className="decision-matrix__drill">
          <p className="decision-matrix__drill-head">
            {OPENNESS_LABEL[selected.split('-')[0] as Openness]} ·{' '}
            {CHOICE_LABEL[selected.slice(selected.indexOf('-') + 1) as Choice]}
          </p>
          {matching.length === 0 ? (
            <p className="decision-matrix__empty">No decisions in this cell.</p>
          ) : (
            <ul className="decision-matrix__chips">
              {matching.map((d) => (
                <li key={d.index}>
                  <button
                    type="button"
                    className={`decision-matrix__chip decision-matrix__chip--${d.mover}${currentPly === d.index ? ' is-current' : ''}`}
                    onClick={() => onSelect(d.index)}
                    title={`${d.corridorWidth} of ${d.legalCount} legal moves held the position`}
                  >
                    {moveLabel(d)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function RowFragment({
  openness,
  counts,
  total,
  maxCount,
  selected,
  onSelect,
}: {
  openness: Openness
  counts: Record<DecisionCell, number>
  total: number
  maxCount: number
  selected: DecisionCell | null
  onSelect: (cell: DecisionCell | null) => void
}) {
  return (
    <>
      <span className="decision-matrix__row-head" title={OPENNESS_LABEL[openness]}>
        {OPENNESS_SHORT[openness]}
        <span className="decision-matrix__row-n">{total}</span>
      </span>
      {CHOICE_ORDER.map((choice) => {
        const cell = `${openness}-${choice}` as DecisionCell
        const count = counts[cell]
        const share = total > 0 ? count / total : 0
        return (
          <button
            key={cell}
            type="button"
            className={`decision-matrix__cell${selected === cell ? ' is-selected' : ''}`}
            style={{
              // Intensity encodes the count; hue encodes the outcome. Sharing
              // one channel between the two would make an empty "left the
              // corridor" cell look like a full one.
              background: `color-mix(in srgb, var(${CHOICE_COLOR[choice]}) ${Math.round((count / maxCount) * 55)}%, transparent)`,
            }}
            onClick={() => onSelect(selected === cell ? null : cell)}
            disabled={count === 0}
          >
            <span className="decision-matrix__count">{count}</span>
            <span className="decision-matrix__share">{total > 0 ? `${Math.round(share * 100)}%` : '—'}</span>
          </button>
        )
      })}
    </>
  )
}

export default DecisionMatrix
