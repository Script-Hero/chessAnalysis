import { computeAggregateInsights, isThinSample, HIGH_ENTROPY, LOW_ENTROPY } from '../../lib/graphMetrics'
import type { PlyMetric, Comparison } from '../../lib/graphMetrics'
import './GraphInsights.css'

type GraphInsightsProps = { metrics: PlyMetric[] }

function ComparisonBar({
  comparison,
  labelA,
  labelB,
  format,
  max,
}: {
  comparison: Comparison
  labelA: string
  labelB: string
  format: (v: number) => string
  max: number
}) {
  const { a, nA, b, nB } = comparison
  const thin = isThinSample(nA) || isThinSample(nB)
  return (
    <div className="graph-insights__row">
      <div className="graph-insights__bar-group">
        <div className="graph-insights__bar-line">
          <span className="graph-insights__bar-label">
            {labelA} <span className="graph-insights__n">(n={nA})</span>
          </span>
          <div className="graph-insights__bar-track">
            <div
              className="graph-insights__bar-fill graph-insights__bar-fill--a"
              style={{ width: a === null ? 0 : `${Math.min(100, (a / max) * 100)}%` }}
            />
          </div>
          <span className="graph-insights__bar-value">{a === null ? '—' : format(a)}</span>
        </div>
        <div className="graph-insights__bar-line">
          <span className="graph-insights__bar-label">
            {labelB} <span className="graph-insights__n">(n={nB})</span>
          </span>
          <div className="graph-insights__bar-track">
            <div
              className="graph-insights__bar-fill graph-insights__bar-fill--b"
              style={{ width: b === null ? 0 : `${Math.min(100, (b / max) * 100)}%` }}
            />
          </div>
          <span className="graph-insights__bar-value">{b === null ? '—' : format(b)}</span>
        </div>
      </div>
      {thin && <p className="graph-insights__caveat">Sample too thin to trust yet — needs more analyzed games.</p>}
    </div>
  )
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function GraphInsights({ metrics }: GraphInsightsProps) {
  const insights = computeAggregateInsights(metrics)
  const standing = insights.lossByStanding
  const standingThin =
    isThinSample(standing.nPrecise) || isThinSample(standing.nNearTie) || isThinSample(standing.nDrift)
  const standingMax = Math.max(standing.precise ?? 0, standing.nearTie ?? 0, standing.drift ?? 0, 10)

  return (
    <div className="graph-insights">
      <div className="graph-insights__block">
        <h4 className="graph-insights__title">How often bad moves came from nowhere</h4>
        <p className="graph-insights__desc">
          Share of moves that weren't even among the engine's top candidates, split by whether the move was
          flagged bad or not.
        </p>
        <ComparisonBar
          comparison={insights.offGraphRateByOutcome}
          labelA="Flagged bad"
          labelB="Not flagged"
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
        <ComparisonBar
          comparison={insights.entropyByOutcome}
          labelA="Flagged bad"
          labelB="Not flagged"
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
        <ComparisonBar
          comparison={insights.rank1RateByOpenness}
          labelA="Narrow position"
          labelB="Wide-open position"
          format={pct}
          max={1}
        />
      </div>

      <div className="graph-insights__block">
        <h4 className="graph-insights__title">Missing the top move still costs you, even unflagged</h4>
        <p className="graph-insights__desc">
          Non-flagged moves in wide-open positions, split by whether the played move matched the engine exactly,
          was a near-tied alternative, or wasn't among the engine's candidates at all ("silent drift"). Silent
          drift still costs real evaluation even when nothing gets tagged a mistake.
        </p>
        <div className="graph-insights__standing">
          {(
            [
              ['Exact match', standing.precise, standing.nPrecise, '--status-good'],
              ['Near-tie', standing.nearTie, standing.nNearTie, '--white-accent'],
              ['Silent drift', standing.drift, standing.nDrift, '--status-warning'],
            ] as const
          ).map(([label, value, n, colorVar]) => (
            <div key={label} className="graph-insights__standing-col">
              <div className="graph-insights__standing-track">
                <div
                  className="graph-insights__standing-fill"
                  style={{
                    height: value === null ? 0 : `${Math.min(100, (value / standingMax) * 100)}%`,
                    background: `var(${colorVar})`,
                  }}
                />
              </div>
              <span className="graph-insights__standing-value">{value === null ? '—' : `${value.toFixed(0)}%`}</span>
              <span className="graph-insights__standing-label">
                {label} <span className="graph-insights__n">(n={n})</span>
              </span>
            </div>
          ))}
        </div>
        {standingThin && (
          <p className="graph-insights__caveat">Sample too thin to trust yet — needs more analyzed games.</p>
        )}
      </div>
    </div>
  )
}

export default GraphInsights
