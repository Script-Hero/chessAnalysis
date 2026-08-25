import type { MoveScore, SurveyPosition } from './stockfish'
import type { ParsedGame } from './pgn'
import { moverOf } from './analysis'
import type { Side } from './analysis'

/**
 * Per-decision metrics derived from the full-width survey.
 *
 * The distinction from the old ply metrics is the denominator. Those measured
 * entropy and rank against the three lines the engine happened to store, so a
 * position with 3 near-equal candidates and one with 30 scored identically, and
 * "not in the top 3" was reported as if it meant "not playable". Everything
 * here is measured against every legal move, which is the only denominator that
 * makes a branching or rank figure mean what it says.
 */

/**
 * Softmax temperature, in win%. Two moves within a few win% of each other are
 * not distinguishable choices to a human, so the weighting has to be flat over
 * that range and fall away quickly outside it. 5 win% puts a move 15% worse
 * than best at ~5% of the best move's weight — present, but not counted as a
 * real option.
 */
const TEMPERATURE_WIN_PCT = 5

/**
 * How much win% a move may give up and still count as inside the corridor.
 * Set at the boundary where the app's own classifier stops calling a move fine
 * ('inaccuracy' begins above 10% lost versus the field), so corridor membership
 * and move classification can't contradict each other.
 */
export const CORRIDOR_TOLERANCE_PCT = 10

/**
 * How much of the survey's win% figure is search noise rather than signal.
 *
 * The survey runs at depth 8, which is shallow — shallow enough that a move
 * scored 10.1% worse than best and one scored 9.9% worse are not distinguishable
 * results. A hard count of moves inside a hard threshold turns that noise into a
 * discrete jump, so every corridor width is also reported as the band it would
 * span if the tolerance moved by this much either way. Where the band is wide,
 * the count should not be read closely.
 */
export const SURVEY_UNCERTAINTY_PCT = 4

/** Corridor widths at or below this are "narrow"; below `NARROW_MAX` and above 1 is the middle band. */
export const NARROW_MAX = 3

export type Openness = 'forced' | 'narrow' | 'open'
export type Choice = 'best' | 'inside' | 'outside'

/** A decision's cell in the 3x3 openness-by-choice matrix. */
export type DecisionCell = `${Openness}-${Choice}`

export type DecisionNode = {
  /** 0-indexed move index, matching `judgments` / `lines` / `survey` indexing. */
  index: number
  /** 1-indexed ply, matching `AnalysisContext.ply` conventions. */
  ply: number
  san: string
  uci: string
  mover: Side
  /** Legal moves in the position, from the rules — the denominator for every rate below. */
  legalCount: number
  /** Legal moves the engine actually scored. Equals `legalCount` unless the survey was capped. */
  scoredCount: number
  /**
   * Shannon entropy of the softmax over move quality, normalized by ln(scoredCount).
   * Retained for continuous plotting; `softWidth` is the legible form.
   */
  entropy: number | null
  /**
   * **The corridor's width, threshold-free.** exp(entropy in nats) — the
   * perplexity of the move distribution, in units of moves.
   *
   * This is the headline figure rather than `corridorWidth` for two reasons.
   * It reads directly as "this position offered about N real choices", which a
   * normalized 0-1 entropy never does; and unlike a hard count it degrades
   * gracefully under search noise, because a move on the tolerance boundary
   * contributes a fraction of a move instead of flipping a whole one.
   */
  softWidth: number | null
  /**
   * Participation ratio, 1/Σp². The same idea as `softWidth` with a heavier
   * penalty on the tail, so it reads as "how many moves carry most of the
   * probability" — usually a little below the perplexity, and further below it
   * the longer the tail of barely-playable moves.
   */
  participation: number | null
  /** Legal moves that stay within `CORRIDOR_TOLERANCE_PCT` of best: the width of the safe corridor. */
  corridorWidth: number
  /** Corridor width if the tolerance were `SURVEY_UNCERTAINTY_PCT` tighter. */
  widthLow: number
  /** Corridor width if the tolerance were `SURVEY_UNCERTAINTY_PCT` looser. */
  widthHigh: number
  /** Share of legal moves that leave the corridor — how much of the move set was a trap. */
  criticality: number | null
  /** 1-indexed rank of the played move among all scored legal moves; null if the survey missed it. */
  playedRank: number | null
  /** Win% the played move gave up versus the best legal move, at survey depth. */
  playedLossPct: number | null
  /** True when exactly one legal move holds the position and more than one move exists. */
  isCut: boolean
  openness: Openness
  choice: Choice | null
  cell: DecisionCell | null
}

/** Softmax over move quality — the distribution both width measures are taken from. */
function distribution(moves: MoveScore[]): number[] {
  const weights = moves.map((m) => Math.exp(-m.lossPct / TEMPERATURE_WIN_PCT))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return []
  return weights.map((w) => w / total)
}

function entropyNats(probabilities: number[]): number {
  return -probabilities.reduce((sum, p) => (p > 0 ? sum + p * Math.log(p) : sum), 0)
}

function participationRatio(probabilities: number[]): number {
  const sumSquares = probabilities.reduce((sum, p) => sum + p * p, 0)
  return sumSquares > 0 ? 1 / sumSquares : 0
}

/**
 * Openness bands, taken from the soft width rather than the hard count.
 *
 * The boundaries are the same, but a position whose second-best move is barely
 * playable now lands in "forced" instead of being counted as offering two real
 * choices — which is what a player experienced at the board.
 */
function opennessOf(softWidth: number | null, corridorWidth: number): Openness {
  const width = softWidth ?? corridorWidth
  if (width < 1.5) return 'forced'
  if (width <= NARROW_MAX) return 'narrow'
  return 'open'
}

function choiceOf(rank: number | null, lossPct: number | null): Choice | null {
  if (rank === null || lossPct === null) return null
  if (rank === 1) return 'best'
  return lossPct <= CORRIDOR_TOLERANCE_PCT ? 'inside' : 'outside'
}

/** One decision node per played move, mirroring `game.moves` indexing. */
export function computeDecisionNodes(game: ParsedGame, survey: SurveyPosition[]): DecisionNode[] {
  return game.moves.map((move, i) => {
    const position = survey[i] ?? { legalCount: 0, moves: [] }
    const scored = position.moves
    const playedUci = move.from + move.to + (move.promotion ?? '')

    const rankIndex = scored.findIndex((m) => m.uci === playedUci)
    const playedRank = rankIndex === -1 ? null : rankIndex + 1
    const playedLossPct = rankIndex === -1 ? null : scored[rankIndex].lossPct

    const widthAt = (tolerance: number) => scored.filter((m) => m.lossPct <= tolerance).length
    const corridorWidth = widthAt(CORRIDOR_TOLERANCE_PCT)
    const hasDistribution = scored.length >= 2
    const probabilities = hasDistribution ? distribution(scored) : []
    const h = probabilities.length ? entropyNats(probabilities) : null
    const hMax = hasDistribution ? Math.log(scored.length) : 0
    const softWidth = h === null ? null : Math.exp(h)

    const openness = opennessOf(softWidth, corridorWidth)
    const choice = choiceOf(playedRank, playedLossPct)

    return {
      index: i,
      ply: i + 1,
      san: move.san,
      uci: playedUci,
      mover: moverOf(i),
      legalCount: position.legalCount,
      scoredCount: scored.length,
      entropy: h === null ? null : hMax > 0 ? h / hMax : 0,
      softWidth,
      participation: probabilities.length ? participationRatio(probabilities) : null,
      corridorWidth,
      widthLow: widthAt(Math.max(0, CORRIDOR_TOLERANCE_PCT - SURVEY_UNCERTAINTY_PCT)),
      widthHigh: widthAt(CORRIDOR_TOLERANCE_PCT + SURVEY_UNCERTAINTY_PCT),
      criticality: position.legalCount > 0 ? 1 - corridorWidth / position.legalCount : null,
      playedRank,
      playedLossPct,
      // "Effectively one move" rather than "exactly one move inside the
      // threshold": a position whose second-best move loses most of the
      // advantage is an only-move test to the player sitting at the board,
      // whichever side of a hard cutoff the engine's depth-8 score fell on.
      isCut: openness === 'forced' && position.legalCount > 1,
      openness,
      choice,
      cell: choice === null ? null : (`${openness}-${choice}` as DecisionCell),
    }
  })
}

export const OPENNESS_LABEL: Record<Openness, string> = {
  forced: 'Forced (effectively one real choice)',
  narrow: `Narrow (about 2-${NARROW_MAX} real choices)`,
  open: `Open (more than ${NARROW_MAX} real choices)`,
}

export const CHOICE_LABEL: Record<Choice, string> = {
  best: 'Played the best move',
  inside: 'Stayed in the corridor',
  outside: 'Left the corridor',
}

/**
 * One colour per *choice*, with openness carried by the matrix axis instead.
 * The previous taxonomy needed nine prose labels sharing five colours, three of
 * them identical — here the encoding is injective by construction.
 */
export const CHOICE_COLOR: Record<Choice, string> = {
  best: '--status-good',
  inside: '--white-accent',
  outside: '--status-critical',
}

export type DecisionMatrix = {
  counts: Record<DecisionCell, number>
  byOpenness: Record<Openness, number>
  total: number
}

/** Counts of decisions in each openness-by-choice cell, for the 3x3 matrix view. */
export function computeDecisionMatrix(nodes: DecisionNode[]): DecisionMatrix {
  const counts = {} as Record<DecisionCell, number>
  const byOpenness: Record<Openness, number> = { forced: 0, narrow: 0, open: 0 }
  let total = 0

  for (const openness of ['forced', 'narrow', 'open'] as Openness[]) {
    for (const choice of ['best', 'inside', 'outside'] as Choice[]) {
      counts[`${openness}-${choice}`] = 0
    }
  }

  for (const node of nodes) {
    if (!node.cell) continue
    counts[node.cell] += 1
    byOpenness[node.openness] += 1
    total += 1
  }

  return { counts, byOpenness, total }
}
