import { materialBalance, type Side } from './analysis'
import type { PositionEval } from './stockfish'

/**
 * What a position was worth beyond its material count.
 *
 * The Report tab already draws evaluation and material as separate charts, but
 * on different scales, so the interesting thing — where the two disagree — can
 * only be found by lining them up by eye. Subtracting one from the other leaves
 * a line that sits near zero while the evaluation is just counting pieces, and
 * leaves it exactly where something else is going on: a sacrifice that paid,
 * extra material that couldn't be used, an attack worth a pawn or two.
 */

/** Pawns, White's perspective. Mate scores are saturated at this in `PositionEval`. */
const EVAL_CAP = 12
/** A region is a run of positions at least this far from material. */
export const COMPENSATION_PAWNS = 2
const MIN_REGION_POSITIONS = 2

export type CompensationPoint = {
  /** Position index. */
  position: number
  /** Evaluation minus material, pawns, White's perspective. Null where a forced mate makes it meaningless. */
  value: number | null
  eval: number
  material: number
}

export type CompensationRegion = {
  /** Inclusive position range. */
  from: number
  to: number
  /** The side the position favoured beyond material. */
  side: Side
  /** Largest |value| in the region. */
  peak: number
}

export type Compensation = {
  points: CompensationPoint[]
  regions: CompensationRegion[]
}

export function computeCompensation(evals: PositionEval[], positions: string[]): Compensation {
  const count = Math.min(evals.length, positions.length)
  const points: CompensationPoint[] = []
  for (let p = 0; p < count; p++) {
    const e = evals[p]
    const material = materialBalance(positions[p])
    const clamped = Math.max(-EVAL_CAP, Math.min(EVAL_CAP, e.score))
    points.push({ position: p, value: e.mateIn !== null ? null : clamped - material, eval: clamped, material })
  }

  const regions: CompensationRegion[] = []
  let start = -1
  let side: Side = 'white'
  const close = (end: number) => {
    if (start >= 0 && end - start + 1 >= MIN_REGION_POSITIONS) {
      const peak = Math.max(...points.slice(start, end + 1).map((pt) => Math.abs(pt.value ?? 0)))
      regions.push({ from: start, to: end, side, peak })
    }
    start = -1
  }
  for (const pt of points) {
    const v = pt.value
    const here: Side | null = v === null || Math.abs(v) < COMPENSATION_PAWNS ? null : v > 0 ? 'white' : 'black'
    if (here && start >= 0 && here === side) continue
    close(pt.position - 1)
    if (here) {
      start = pt.position
      side = here
    }
  }
  close(count - 1)
  return { points, regions }
}

/** "White down 3 in material, evaluation −0.4: worth +2.6 beyond material". */
export function describeCompensation(point: CompensationPoint): string {
  if (point.value === null) return 'Forced mate on the board'
  const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`
  const materialText =
    point.material === 0 ? 'Material level' : `${point.material > 0 ? 'White' : 'Black'} up ${Math.abs(point.material)} in material`
  if (Math.abs(point.value) < COMPENSATION_PAWNS) return `${materialText}, evaluation ${fmt(point.eval)}: in line with material`
  const favoured = point.value > 0 ? 'White' : 'Black'
  return `${materialText}, evaluation ${fmt(point.eval)}: ${favoured} worth ${Math.abs(point.value).toFixed(1)} beyond material`
}
