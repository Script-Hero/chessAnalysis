import type { EngineLine, MoveClassification, MoveJudgment } from './stockfish'
import type { ParsedGame } from './pgn'
import { moverOf } from './analysis'
import type { Side } from './analysis'

/**
 * What a move's position in its own candidate tree says about it, independent
 * of whether it was tagged a mistake:
 *  - forced / mid: position wasn't genuinely open, nothing to read into it.
 *  - precise: genuinely open position, played move was the engine's exact top choice.
 *  - near-tie: genuinely open position, played move was a top-line alternative within a few pawns.
 *  - drift: genuinely open position, played move isn't among the stored candidates at all —
 *           a real cost even when no blunder/mistake tag fired.
 *  - blunder-forced / blunder-mid / blunder-open: tagged inaccuracy-or-worse, split by how
 *    open the position was — "should've been found" vs "genuinely hard to find".
 *  - unrated: fewer than 2 stored candidate lines, not enough to say anything about entropy.
 */
export type MoveBucket =
  | 'forced'
  | 'mid'
  | 'precise'
  | 'near-tie'
  | 'drift'
  | 'blunder-forced'
  | 'blunder-mid'
  | 'blunder-open'
  | 'unrated'

export type PlyMetric = {
  /** 0-indexed move index, matching `judgments`/`lines` array indexing. */
  index: number
  /** 1-indexed, matching `GameTreeRow.ply` / `AnalysisContext.ply` conventions. */
  ply: number
  san: string
  mover: Side
  classification: MoveClassification | null
  /** Shannon entropy of the candidate lines' softmax weights, normalized to [0,1] by ln(n). Null if <2 lines stored. */
  entropy: number | null
  /** Pawn gap between the top two candidate lines. Null if <2 lines stored. */
  topGapPawns: number | null
  branchingFactor: number
  /** 1-indexed rank of the played move among stored candidates; null when it isn't among them ("off-graph"). */
  playedRank: number | null
  rawLossPct: number | null
  adjustedLossPct: number | null
  bucket: MoveBucket
}

export const LOW_ENTROPY = 0.6
export const HIGH_ENTROPY = 0.75
const SOFTMAX_TEMPERATURE = 1 // pawns
/** Below this many samples, a rate/mean comparison is noted as too thin to trust rather than hidden outright. */
const MIN_TRUSTWORTHY_N = 5

function entropyFraction(scoresPawns: number[]): number {
  if (scoresPawns.length < 2) return NaN
  const best = Math.max(...scoresPawns)
  const weights = scoresPawns.map((s) => Math.exp((s - best) / SOFTMAX_TEMPERATURE))
  const total = weights.reduce((a, b) => a + b, 0)
  const probs = weights.map((w) => w / total)
  const h = -probs.reduce((sum, p) => (p > 0 ? sum + p * Math.log(p) : sum), 0)
  const hMax = Math.log(scoresPawns.length)
  return hMax > 0 ? h / hMax : 0
}

function findPlayedRank(candidates: EngineLine[], from: string, to: string): number | null {
  const prefix = from + to
  const idx = candidates.findIndex((line) => line.move?.startsWith(prefix))
  return idx === -1 ? null : idx + 1
}

const BAD_CLASSIFICATIONS: ReadonlySet<MoveClassification> = new Set(['inaccuracy', 'mistake', 'blunder'])

function classifyBucket(isBad: boolean, entropy: number, rank: number | null): MoveBucket {
  if (isBad) {
    if (entropy < LOW_ENTROPY) return 'blunder-forced'
    if (entropy >= HIGH_ENTROPY) return 'blunder-open'
    return 'blunder-mid'
  }
  if (entropy < LOW_ENTROPY) return 'forced'
  if (entropy >= HIGH_ENTROPY) {
    if (rank === 1) return 'precise'
    if (rank !== null) return 'near-tie'
    return 'drift'
  }
  return 'mid'
}

/** Per-move graph metrics, one entry per played move (mirrors `buildGameTreeRows`' indexing). */
export function computePlyMetrics(
  game: ParsedGame,
  judgments: (MoveJudgment | null)[],
  lines: EngineLine[][],
): PlyMetric[] {
  return game.moves.map((move, i) => {
    const judgment = judgments[i] ?? null
    const candidates = lines[i] ?? []
    const scores = candidates.map((l) => l.score)
    const entropy = scores.length >= 2 ? entropyFraction(scores) : null
    const topGapPawns = scores.length >= 2 ? scores[0] - scores[1] : null
    const playedRank = candidates.length > 0 ? findPlayedRank(candidates, move.from, move.to) : null
    const isBad = !!judgment && BAD_CLASSIFICATIONS.has(judgment.classification)

    return {
      index: i,
      ply: i + 1,
      san: move.san,
      mover: moverOf(i),
      classification: judgment?.classification ?? null,
      entropy,
      topGapPawns,
      branchingFactor: candidates.length,
      playedRank,
      rawLossPct: judgment?.rawLossPct ?? null,
      adjustedLossPct: judgment?.adjustedLossPct ?? null,
      bucket: entropy === null ? 'unrated' : classifyBucket(isBad, entropy, playedRank),
    }
  })
}

/** A comparison between two groups, carrying its own sample sizes so the UI can flag thin data. */
export type Comparison = { a: number | null; nA: number; b: number | null; nB: number }

export type AggregateInsights = {
  /** Mean decision entropy: flagged-bad moves vs. everything else. */
  entropyByOutcome: Comparison
  /** Mean pawn gap between the top two lines: flagged-bad moves vs. everything else. */
  gapByOutcome: Comparison
  /** Share of moves absent from the stored candidate list: flagged-bad moves vs. everything else. */
  offGraphRateByOutcome: Comparison
  /** Among non-flagged moves, P(played move = engine's #1 line): narrow positions vs. wide-open ones. */
  rank1RateByOpenness: Comparison
  /** Among non-flagged moves in wide-open positions, mean loss-vs-best by candidate-list standing. */
  lossByStanding: { precise: number | null; nPrecise: number; nearTie: number | null; nNearTie: number; drift: number | null; nDrift: number }
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

function rate(values: boolean[]): number | null {
  return values.length ? values.filter(Boolean).length / values.length : null
}

/**
 * Group-level comparisons behind the taxonomy: the numbers that justify treating
 * "off-graph in an open position" as a real signal rather than an arbitrary bucket,
 * distilled from the graph-theory research pass on this app's own game data.
 */
export function computeAggregateInsights(metrics: PlyMetric[]): AggregateInsights {
  const rated = metrics.filter((m) => m.entropy !== null)
  const bad = rated.filter((m) => m.classification && BAD_CLASSIFICATIONS.has(m.classification))
  const clean = rated.filter((m) => !m.classification || !BAD_CLASSIFICATIONS.has(m.classification))

  const cleanNarrow = clean.filter((m) => m.entropy! < LOW_ENTROPY)
  const cleanOpen = clean.filter((m) => m.entropy! >= HIGH_ENTROPY)

  const precise = cleanOpen.filter((m) => m.bucket === 'precise' && m.rawLossPct !== null)
  const nearTie = cleanOpen.filter((m) => m.bucket === 'near-tie' && m.rawLossPct !== null)
  const drift = cleanOpen.filter((m) => m.bucket === 'drift' && m.rawLossPct !== null)

  return {
    entropyByOutcome: {
      a: mean(bad.map((m) => m.entropy!)),
      nA: bad.length,
      b: mean(clean.map((m) => m.entropy!)),
      nB: clean.length,
    },
    gapByOutcome: {
      a: mean(bad.filter((m) => m.topGapPawns !== null).map((m) => m.topGapPawns!)),
      nA: bad.filter((m) => m.topGapPawns !== null).length,
      b: mean(clean.filter((m) => m.topGapPawns !== null).map((m) => m.topGapPawns!)),
      nB: clean.filter((m) => m.topGapPawns !== null).length,
    },
    offGraphRateByOutcome: {
      a: rate(bad.map((m) => m.playedRank === null)),
      nA: bad.length,
      b: rate(clean.map((m) => m.playedRank === null)),
      nB: clean.length,
    },
    rank1RateByOpenness: {
      a: rate(cleanNarrow.map((m) => m.playedRank === 1)),
      nA: cleanNarrow.length,
      b: rate(cleanOpen.map((m) => m.playedRank === 1)),
      nB: cleanOpen.length,
    },
    lossByStanding: {
      precise: mean(precise.map((m) => m.rawLossPct!)),
      nPrecise: precise.length,
      nearTie: mean(nearTie.map((m) => m.rawLossPct!)),
      nNearTie: nearTie.length,
      drift: mean(drift.map((m) => m.rawLossPct!)),
      nDrift: drift.length,
    },
  }
}

export function isThinSample(n: number): boolean {
  return n < MIN_TRUSTWORTHY_N
}

export const BUCKET_INFO: Record<MoveBucket, { label: string; colorVar: string }> = {
  forced: { label: 'Forced (expected)', colorVar: '--parchment-dim' },
  mid: { label: 'Middling', colorVar: '--parchment-dim' },
  precise: { label: 'Precise (needle found)', colorVar: '--status-good' },
  'near-tie': { label: 'Near-tie alternative', colorVar: '--white-accent' },
  drift: { label: 'Silent drift', colorVar: '--status-warning' },
  'blunder-forced': { label: 'Should’ve been found', colorVar: '--status-critical' },
  'blunder-mid': { label: 'Bad, ambiguous position', colorVar: '--status-serious' },
  'blunder-open': { label: 'Genuinely hard', colorVar: '--status-serious' },
  unrated: { label: 'Not enough candidate lines', colorVar: '--parchment-dim' },
}
