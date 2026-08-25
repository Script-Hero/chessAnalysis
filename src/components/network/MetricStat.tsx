import InfoNote from '../InfoNote'
import type { Scored } from '../../lib/nullModel'
import { describeZ } from '../../lib/nullModel'
import './MetricStat.css'

type MetricStatProps = {
  label: string
  scored: Scored
  /** How to render the raw value. */
  format?: (value: number) => string
  /** Whether a higher value is the good direction, for the tone of the reading. */
  higherIsBetter?: boolean
  /** What the measure is. Available behind the marker, not printed under every value. */
  help: string
}

/**
 * A statistic shown with its scale, its direction and its baseline.
 *
 * The panels this replaces printed "Coordination 2.31" and left the reader to
 * work out whether that was good, whether higher was better, and what it would
 * have been for a position like this one. All three are part of the number: a
 * value with no reference class is not a weaker claim than one with a reference
 * class, it is not a claim at all.
 *
 * The bar shows where the observed value falls against the null model — the
 * same material scattered at random — with the null's mean marked. Reading it
 * takes no statistics: right of the mark is more structure than the material
 * alone would give, left of it is less. That leaves the definition of the
 * measure as the only text, and it sits behind the marker rather than under
 * every value — six copies of the same paragraph is what made these panels
 * read as an essay.
 */
function MetricStat({ label, scored, format, higherIsBetter = true, help }: MetricStatProps) {
  const render = format ?? ((v: number) => v.toFixed(2))
  const { reference, z } = scored

  // The bar spans four null-model standard deviations either side of its mean,
  // which is wide enough that a genuinely extreme value pins the end rather
  // than falling off it.
  const position =
    reference && reference.sd > 1e-9
      ? Math.max(0, Math.min(1, 0.5 + (scored.value - reference.mean) / (8 * reference.sd)))
      : null

  const tone = z === null ? 'neutral' : (z > 0) === higherIsBetter ? 'good' : 'poor'

  return (
    <div className={`metric-stat metric-stat--${tone}`}>
      <div className="metric-stat__head">
        <span className="metric-stat__label">
          {label}
          <InfoNote label={label}>{help}</InfoNote>
        </span>
        <span className="metric-stat__value">{render(scored.value)}</span>
      </div>

      {position === null ? (
        <p className="metric-stat__reading">No reference for this material.</p>
      ) : (
        <>
          <div className="metric-stat__bar">
            <span className="metric-stat__baseline" style={{ left: '50%' }} />
            <span className="metric-stat__marker" style={{ left: `${position * 100}%` }} />
          </div>
          <p className="metric-stat__reading">
            {describeZ(z)}
            {z !== null && (
              <span className="metric-stat__z">
                {' '}
                ({z > 0 ? '+' : ''}
                {z.toFixed(1)} sd, baseline {render(reference!.mean)})
              </span>
            )}
          </p>
        </>
      )}

    </div>
  )
}

export default MetricStat
