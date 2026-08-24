import { computeAggregateInsights, isThinSample, HIGH_ENTROPY, LOW_ENTROPY } from '../../lib/graphMetrics'
import type { PlyMetric, Comparison } from '../../lib/graphMetrics'
import type { Side } from '../../lib/analysis'
import './GraphInsights.css'

type GraphInsightsProps = { metrics: PlyMetric[]; whiteLabel: string; blackLabel: string }

function MoverBar({
  mover,
  moverLabel,
  n,
  value,
  format,
  max,
}: {
  mover: Side
  moverLabel: string
  n: number
  value: number | null
  format: (v: number) => string
  max: number
}) {
  return (
    <div className="graph-insights__bar-line">
      <span className={`graph-insights__bar-label graph-insights__bar-label--${mover}`}>
        <span className="graph-insights__bar-label-name">{moverLabel}</span>
        <span className="graph-insights__n">n={n}</span>
      </span>
      <div className="graph-insights__bar-track">
        <div
          className={`graph-insights__bar-fill graph-insights__bar-fill--${mover}`}
          style={{ width: value === null ? 0 : `${Math.min(100, (value / max) * 100)}%` }}
        />
      </div>
      <span className="graph-insights__bar-value">{value === null ? '—' : format(value)}</span>
    </div>
  )
}

function SplitComparisonBar({
  labelA,
  labelB,
  whiteLabel,
  blackLabel,
  white,
  black,
  format,
  max,
}: {
  labelA: string
  labelB: string
  whiteLabel: string
  blackLabel: string
  white: Comparison
  black: Comparison
  format: (v: number) => string
  max: number
}) {
  const thin = [white.nA, white.nB, black.nA, black.nB].some(isThinSample)
  return (
    <div className="graph-insights__row">
      <div className="graph-insights__group">
        <span className="graph-insights__group-label">{labelA}</span>
        <div className="graph-insights__bar-group">
          <MoverBar mover="white" moverLabel={whiteLabel} n={white.nA} value={white.a} format={format} max={max} />
          <MoverBar mover="black" moverLabel={blackLabel} n={black.nA} value={black.a} format={format} max={max} />
        </div>
      </div>
      <div className="graph-insights__group">
        <span className="graph-insights__group-label">{labelB}</span>
        <div className="graph-insights__bar-group">
          <MoverBar mover="white" moverLabel={whiteLabel} n={white.nB} value={white.b} format={format} max={max} />
          <MoverBar mover="black" moverLabel={blackLabel} n={black.nB} value={black.b} format={format} max={max} />
        </div>
      </div>
      {thin && <p className="graph-insights__caveat">Sample too thin to trust yet — needs more analyzed games.</p>}
    </div>
  )
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function GraphInsights({ metrics, whiteLabel, blackLabel }: GraphInsightsProps) {
  const whiteMetrics = metrics.filter((m) => m.mover === 'white')
  const blackMetrics = metrics.filter((m) => m.mover === 'black')
  const white = computeAggregateInsights(whiteMetrics)
  const black = computeAggregateInsights(blackMetrics)

  const standingWhite = white.lossByStanding
  const standingBlack = black.lossByStanding
  const standingThin = [
    standingWhite.nPrecise,
    standingWhite.nNearTie,
    standingWhite.nDrift,
    standingBlack.nPrecise,
    standingBlack.nNearTie,
    standingBlack.nDrift,
  ].some(isThinSample)
  const standingMax = Math.max(
    standingWhite.precise ?? 0,
    standingWhite.nearTie ?? 0,
    standingWhite.drift ?? 0,
    standingBlack.precise ?? 0,
    standingBlack.nearTie ?? 0,
    standingBlack.drift ?? 0,
    10,
  )

  return (
    <div className="graph-insights">
      <div className="graph-insights__block">
        <h4 className="graph-insights__title">How often bad moves came from nowhere</h4>
        <p className="graph-insights__desc">
          Share of moves that weren't even among the engine's top candidates, split by whether the move was
          flagged bad or not.
        </p>
        <SplitComparisonBar
          labelA="Flagged bad"
          labelB="Not flagged"
          whiteLabel={whiteLabel}
          blackLabel={blackLabel}
          white={white.offGraphRateByOutcome}
          black={black.offGraphRateByOutcome}
          format={pct}
          max={1}
        />
      </div>

      <div className="graph-insights__block">
        <h4 className="graph-insights__title">Bad moves cluster in narrower positions</h4>
        <p className="graph-insights__desc">
          How forced the position looked to the engine, for flagged-bad moves vs. everything else. Lower means the
          position looked more "obviously forced" — there was less to choose between.
        </p>
        <SplitComparisonBar
          labelA="Flagged bad"
          labelB="Not flagged"
          whiteLabel={whiteLabel}
          blackLabel={blackLabel}
          white={white.entropyByOutcome}
          black={black.entropyByOutcome}
          format={(v) => v.toFixed(2)}
          max={1}
        />
      </div>

      <div className="graph-insights__block">
        <h4 className="graph-insights__title">Finding the exact best move gets harder in open positions</h4>
        <p className="graph-insights__desc">
          Among non-flagged moves, how often the played move was the engine's exact top choice — forced-looking
          positions (entropy&nbsp;&lt;&nbsp;{LOW_ENTROPY}) vs. wide-open ones (entropy&nbsp;≥&nbsp;{HIGH_ENTROPY}). A
          drop here means "not blundering" is an easier bar to clear than "finding the single best move."
        </p>
        <SplitComparisonBar
          labelA="Narrow position"
          labelB="Wide-open position"
          whiteLabel={whiteLabel}
          blackLabel={blackLabel}
          white={white.rank1RateByOpenness}
          black={black.rank1RateByOpenness}
          format={pct}
          max={1}
        />
      </div>

      <div className="graph-insights__block">
        <h4 className="graph-insights__title">Missing the top move still costs evaluation, even unflagged</h4>
        <p className="graph-insights__desc">
          Non-flagged moves in wide-open positions, split by whether the played move matched the engine exactly,
          was a near-tied alternative, or wasn't among the engine's candidates at all ("silent drift"). Silent
          drift still costs real evaluation even when nothing gets tagged a mistake.
        </p>
        <div className="graph-insights__standing">
          {(
            [
              ['Exact match', standingWhite.precise, standingWhite.nPrecise, standingBlack.precise, standingBlack.nPrecise],
              ['Near-tie', standingWhite.nearTie, standingWhite.nNearTie, standingBlack.nearTie, standingBlack.nNearTie],
              ['Silent drift', standingWhite.drift, standingWhite.nDrift, standingBlack.drift, standingBlack.nDrift],
            ] as const
          ).map(([label, valueWhite, nWhite, valueBlack, nBlack]) => (
            <div key={label} className="graph-insights__standing-col">
              <div className="graph-insights__standing-bars">
                <div className="graph-insights__standing-track">
                  <div
                    className="graph-insights__standing-fill graph-insights__standing-fill--white"
                    style={{ height: valueWhite === null ? 0 : `${Math.min(100, (valueWhite / standingMax) * 100)}%` }}
                  />
                </div>
                <div className="graph-insights__standing-track">
                  <div
                    className="graph-insights__standing-fill graph-insights__standing-fill--black"
                    style={{ height: valueBlack === null ? 0 : `${Math.min(100, (valueBlack / standingMax) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="graph-insights__standing-values">
                <span className="graph-insights__standing-value">
                  {valueWhite === null ? '—' : `${valueWhite.toFixed(0)}%`} <span className="graph-insights__n">(n={nWhite})</span>
                </span>
                <span className="graph-insights__standing-value">
                  {valueBlack === null ? '—' : `${valueBlack.toFixed(0)}%`} <span className="graph-insights__n">(n={nBlack})</span>
                </span>
              </div>
              <span className="graph-insights__standing-label">{label}</span>
            </div>
          ))}
        </div>
        <div className="graph-insights__standing-legend">
          <span className="graph-insights__legend-item">
            <span className="graph-insights__legend-dot graph-insights__legend-dot--white" />
            {whiteLabel}
          </span>
          <span className="graph-insights__legend-item">
            <span className="graph-insights__legend-dot graph-insights__legend-dot--black" />
            {blackLabel}
          </span>
        </div>
        {standingThin && (
          <p className="graph-insights__caveat">Sample too thin to trust yet — needs more analyzed games.</p>
        )}
      </div>
    </div>
  )
}

export default GraphInsights
