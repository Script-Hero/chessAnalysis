import './CoordinationChart.css'

type CoordinationChartProps = {
  /** Algebraic connectivity per position, one entry per position in the game. */
  series: { white: number; black: number }[]
  currentPly: number
  onSelectPly: (ply: number) => void
}

const WIDTH = 900
const HEIGHT = 150
const PAD_L = 30
const PAD_R = 10
const PAD_T = 12
const PAD_B = 20

/**
 * Algebraic connectivity of each side's mutual-defence graph, across the game.
 *
 * The value is zero exactly when an army has split into groups that no longer
 * defend one another. It typically starts falling several moves before the
 * evaluation registers anything, which is the point of showing it beside the
 * board rather than as a summary number.
 */
function CoordinationChart({ series, currentPly, onSelectPly }: CoordinationChartProps) {
  const innerW = WIDTH - PAD_L - PAD_R
  const innerH = HEIGHT - PAD_T - PAD_B
  const count = series.length
  const max = Math.max(1, ...series.flatMap((s) => [s.white, s.black]))

  const xOf = (i: number) => PAD_L + (i / Math.max(1, count - 1)) * innerW
  const yOf = (v: number) => PAD_T + innerH - (v / max) * innerH

  const pathFor = (key: 'white' | 'black') =>
    series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(s[key]).toFixed(1)}`).join(' ')

  return (
    <div className="coordination-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="coordination-chart__svg"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const fraction = (e.clientX - rect.left) / rect.width
          const x = fraction * WIDTH
          const index = Math.round(((x - PAD_L) / innerW) * (count - 1))
          onSelectPly(Math.max(0, Math.min(count - 1, index)))
        }}
      >
        <line x1={PAD_L} x2={WIDTH - PAD_R} y1={yOf(0)} y2={yOf(0)} className="coordination-chart__axis" />
        <text x={PAD_L - 5} y={yOf(0) + 3} textAnchor="end" className="coordination-chart__tick">
          0
        </text>
        <text x={PAD_L - 5} y={yOf(max) + 3} textAnchor="end" className="coordination-chart__tick">
          {max.toFixed(1)}
        </text>

        <path d={pathFor('white')} className="coordination-chart__line coordination-chart__line--white" />
        <path d={pathFor('black')} className="coordination-chart__line coordination-chart__line--black" />

        <line
          x1={xOf(currentPly)}
          x2={xOf(currentPly)}
          y1={PAD_T}
          y2={PAD_T + innerH}
          className="coordination-chart__cursor"
        />
      </svg>
    </div>
  )
}

export default CoordinationChart
