import type { SurveyPosition } from './stockfish'
import type { DecisionNode } from './moveGraph'
import type { Side } from './analysis'

/**
 * The game as an absorbing Markov chain, and what each decision contributed.
 *
 * Every other readout in the app scores a decision against the engine's best
 * move: this one gave up 14 win%, that one 3. The chain scores it against
 * something more useful — what a player of this strength would have averaged in
 * the same position.
 *
 * The construction:
 *
 * - **States** are the positions the game actually occupied, in order.
 * - **Transitions** come from a softmax over each legal move's quality, which
 *   is the behaviour of a player who mostly finds good moves and occasionally
 *   does not. Playing the game's actual move advances to the next state.
 * - **Absorbing states** are every move not played, carrying the value the game
 *   would have reached there.
 *
 * Solving it gives `v_i`, the expected final outcome from each position under
 * continued play at that strength. The useful quantity falls out of the fact
 * that these telescope:
 *
 *     v_n - v_0 = sum of (v_{i+1} - v_i)
 *
 * so the game's whole swing decomposes exactly onto its individual moves, and
 * each move's term is what it gained or lost *against the player's own
 * expectation* rather than against perfection. Playing the best move earns a
 * positive contribution — you beat your average. A blunder in a position that
 * was already decided earns a small negative one, because there was little left
 * to lose. That damping is what makes the ranking a study list rather than a
 * restatement of the evaluation graph.
 *
 * Two things this deliberately does not do. It does not weight by the reach
 * probability from the fundamental matrix's first row: that decays
 * multiplicatively, sits near 1e-15 by move twenty, and would leave nothing but
 * the opening able to rank. And it does not compare the played move's full
 * continuation against an alternative's one-ply evaluation — those are
 * different quantities on different scales, and an earlier version of this
 * module did exactly that and could report that fixing a move made things
 * worse.
 */

/**
 * Softmax temperature in win%, matching `moveGraph`'s. It sets the strength of
 * the modelled player: lower is a player who nearly always finds the best move,
 * higher is one who picks more freely among plausible moves.
 */
export const DEFAULT_TEMPERATURE = 5

export type LeveragePoint = {
  index: number
  ply: number
  san: string
  mover: Side
  /**
   * Probability the chain reaches this position — the fundamental matrix's
   * first row. Legible only in the opening, and never used for ranking.
   */
  reach: number
  /** Modelled probability of playing the move that was actually played. */
  playedProbability: number
  /** Expected final outcome before the move, in win% for `side`. */
  valueBefore: number
  /** Expected final outcome after it. */
  valueAfter: number
  /**
   * `valueAfter - valueBefore`: what the move gained or lost against what a
   * player of this strength would have averaged in the same position. Positive
   * means the move beat that expectation.
   */
  contribution: number
  /** The loss half of `contribution`, for ranking. Zero for moves that gained. */
  leverage: number
  /** Win% the played move gave up against the engine's best, for context. */
  lossPct: number
}

export type GameChain = {
  side: Side
  temperature: number
  /** Expected final outcome at the start of the game, in win% for `side`. */
  rootValue: number
  /** Value of the position the game actually ended in. */
  terminalValue: number
  /** `terminalValue - rootValue` — the swing the contributions decompose. */
  totalSwing: number
  /**
   * Probability the chain reaches the final position along this exact path.
   * Decays multiplicatively and is astronomically small for any full game — a
   * diagnostic of the model, not something to show a player.
   */
  survivalToEnd: number
  /** One entry per decision by `side`; `ranked` is the same list worst-first. */
  points: LeveragePoint[]
  ranked: LeveragePoint[]
}

type Alternative = { probability: number; value: number; isPlayed: boolean; lossPct: number }

/** Softmax over quality loss, in the same currency (win%) as everything else. */
function policy(
  position: SurveyPosition,
  playedUci: string,
  mover: Side,
  side: Side,
  temperature: number,
): Alternative[] {
  const weights = position.moves.map((m) => Math.exp(-m.lossPct / temperature))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return []

  return position.moves.map((m, i) => ({
    probability: weights[i] / total,
    // Win% is always reported for the side to move, so the perspective flips
    // whenever the mover is not the side the chain is being solved for.
    value: mover === side ? m.winProb : 100 - m.winProb,
    isPlayed: m.uci === playedUci,
    lossPct: m.lossPct,
  }))
}

/**
 * Backward induction over the chain — the closed-form solve of (I - Q)v = R*b
 * for a chain whose transient states form a path.
 *
 * `values[i]` is the expected final outcome from state i under the modelled
 * player's behaviour; `reach[i]` is the fundamental matrix's first row.
 */
function solve(
  policies: (Alternative[] | null)[],
  terminalValue: number,
): { values: number[]; reach: number[] } {
  const n = policies.length
  const values = new Array(n + 1).fill(terminalValue)

  for (let i = n - 1; i >= 0; i--) {
    const alternatives = policies[i]
    if (!alternatives || alternatives.length === 0) {
      values[i] = values[i + 1]
      continue
    }
    let expected = 0
    for (const alt of alternatives) {
      // The played move is worth its continuation — the game goes on, and the
      // chain already knows what that is worth. Every other move absorbs at its
      // own evaluation.
      expected += alt.probability * (alt.isPlayed ? values[i + 1] : alt.value)
    }
    values[i] = expected
  }

  const reach = new Array(n + 1).fill(0)
  reach[0] = 1
  for (let i = 0; i < n; i++) {
    const alternatives = policies[i]
    if (!alternatives || alternatives.length === 0) {
      reach[i + 1] = reach[i]
      continue
    }
    const played = alternatives.find((a) => a.isPlayed)
    reach[i + 1] = reach[i] * (played?.probability ?? 0)
  }

  return { values, reach }
}

export function buildGameChain(
  decisions: DecisionNode[],
  survey: SurveyPosition[],
  terminalWinProbForWhite: number,
  side: Side,
  temperature = DEFAULT_TEMPERATURE,
): GameChain {
  const terminalValue = side === 'white' ? terminalWinProbForWhite : 100 - terminalWinProbForWhite

  const policies = decisions.map((decision) => {
    const position = survey[decision.index]
    if (!position || position.moves.length === 0) return null
    return policy(position, decision.uci, decision.mover, side, temperature)
  })

  const { values, reach } = solve(policies, terminalValue)

  const points: LeveragePoint[] = []
  decisions.forEach((decision, i) => {
    if (decision.mover !== side) return
    const alternatives = policies[i]
    if (!alternatives || alternatives.length === 0) return
    const played = alternatives.find((a) => a.isPlayed)

    const contribution = values[i + 1] - values[i]
    points.push({
      index: decision.index,
      ply: decision.ply,
      san: decision.san,
      mover: decision.mover,
      reach: reach[i],
      playedProbability: played?.probability ?? 0,
      valueBefore: values[i],
      valueAfter: values[i + 1],
      contribution,
      leverage: Math.max(0, -contribution),
      lossPct: played?.lossPct ?? decision.playedLossPct ?? 0,
    })
  })

  return {
    side,
    temperature,
    rootValue: values[0],
    terminalValue,
    totalSwing: terminalValue - values[0],
    survivalToEnd: reach[reach.length - 1],
    points,
    ranked: [...points].sort((a, b) => b.leverage - a.leverage),
  }
}
