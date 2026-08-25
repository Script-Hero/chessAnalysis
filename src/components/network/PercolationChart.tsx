import type { Percolation } from '../../lib/percolation'
import './PercolationChart.css'

type PercolationChartProps = {
  percolation: Percolation
  label: string
}

const WIDTH = 260
const HEIGHT = 110
const PAD = 18

/**
 * Control retained as pieces are removed, targeted against random.
 *
 * The two curves are the whole reading, and the gap between them is the part
 * that is about the position rather than about the material. A wide gap means
 * the opponent gains a lot by choosing what to take — there is a target, and
 * the panel names it. Curves that sit on top of each other mean the control is
 * genuinely distributed and there is nothing to aim at, which is a useful thing
 * to know and something no evaluation ever says.
 */
function PercolationChart({ percolation, label }: PercolationChartProps) {
  const { targeted, random } = percolation
  if (targeted.length < 2) {
    return <p className="percolation__empty">Not enough material left to measure.</p>
  }

  const steps = targeted.length - 1
  const x = (removed: number) => PAD + (removed / steps) * (WIDTH - PAD * 2)
  const y = (retained: number) => HEIGHT - PAD - retained * (HEIGHT - PAD * 2)

  const path = (points: typeof targeted) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.removed).toFixed(1)},${y(p.retained).toFixed(1)}`).join(' ')

  const band =
    `${path(random)} L${x(targeted[targeted.length - 1].removed).toFixed(1)},` +
    `${y(targeted[targeted.length - 1].retained).toFixed(1)} ` +
    targeted
      .slice()
      .reverse()
      .map((p) => `L${x(p.removed).toFixed(1)},${y(p.retained).toFixed(1)}`)
      .join(' ') +
    ' Z'

  return (
    <div className="percolation">
      <p className="percolation__label">{label}</p>
      <svg
        className="percolation__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${label}: control retained under targeted and random piece removal`}
      >
        <line x1={PAD} y1={y(0)} x2={WIDTH - PAD} y2={y(0)} className="percolation__axis" />
        <line x1={PAD} y1={y(1)} x2={WIDTH - PAD} y2={y(1)} className="percolation__axis percolation__axis--faint" />
        <path d={band} className="percolation__band" />
        <path d={path(random)} className="percolation__curve percolation__curve--random" />
        <path d={path(targeted)} className="percolation__curve percolation__curve--targeted" />
      </svg>

      <dl className="percolation__stats">
        <div>
          <dt>Fragility</dt>
          <dd>{Math.round(percolation.fragility * 100)}%</dd>
        </div>
        <div>
          <dt>Gain from aiming</dt>
          <dd>{Math.round(percolation.concentration * 100)}%</dd>
        </div>
      </dl>

      <p className="percolation__reading">
        {percolation.concentration < 0.04
          ? 'Control is spread across the army — no single piece to aim at.'
          : `Held up by ${namePieces(percolation)}.`}
      </p>
    </div>
  )
}

const PIECE_WORD: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

function namePieces(percolation: Percolation): string {
  const top = percolation.criticality.filter((c) => c.impact > 0.05).slice(0, 2)
  if (top.length === 0) return 'no one piece in particular'
  return top.map((c) => `the ${PIECE_WORD[c.type] ?? c.type} on ${c.square}`).join(' and ')
}

export default PercolationChart
