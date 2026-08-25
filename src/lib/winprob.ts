/**
 * Centipawn <-> win-probability conversion, shared by every metric in the app.
 *
 * Win% is the right common currency for decision metrics: a 1-pawn swing near
 * equality changes the outcome far more than a 1-pawn swing in a won game, so
 * measuring "how much did this move cost" or "how many moves keep me alive" in
 * pawns systematically distorts both. Everything downstream (entropy, corridor
 * width, loss) is computed in win% for that reason.
 */

/** Lichess's logistic fit, in centipawns, from the perspective of the scoring side. */
export function cpToWinProb(cp: number): number {
  return 100 / (1 + Math.pow(10, -cp / 400))
}

/**
 * Win% for a scored line, from the perspective of the side to move.
 *
 * Mate scores map to the 0/100 endpoints rather than to a saturated pawn value.
 * That distinction matters: the old approach clamped every mate to ±12 pawns,
 * so three different mating lines produced three identical scores and the
 * position registered as maximally ambiguous. Here they correctly register as
 * three moves that all win.
 */
export function scoreWinProb(scorePawns: number, mateIn: number | null): number {
  if (mateIn !== null) return mateIn > 0 ? 100 : 0
  return cpToWinProb(scorePawns * 100)
}
