import type { DecisionNode } from './moveGraph'
import type { Side } from './analysis'

/**
 * Corridor analysis: how wide the set of surviving continuations was at each
 * point, and how it changed over the game.
 *
 * A blunder is usually not where a game was lost — it's where a corridor that
 * had been narrowing for eight moves finally reached width 1 and the player
 * stepped out of it. An eval graph shows the step; only a width graph shows the
 * narrowing that made the step inevitable.
 *
 * Width is measured softly, as the perplexity of the move distribution, rather
 * than as a count of moves inside a threshold. The count is still carried, with
 * the band it would span if the tolerance moved by the survey's own noise, so
 * the reader can see where it is worth reading closely — but the soft figure is
 * what everything downstream is computed from, because a hard count moving
 * between 3 and 4 as a depth-8 score wobbles is not a fact about the position.
 */

/** How many of a side's own subsequent decisions the horizon product looks ahead over. */
export const HORIZON_DECISIONS = 4

/** A narrowing run must span at least this many of one side's own decisions to be reported. */
const MIN_EPISODE_DECISIONS = 3

/** ...and must shed at least this share of its starting width, so routine wobble isn't a trend. */
const MIN_EPISODE_SHARE = 0.5

export type CorridorPoint = {
  index: number
  ply: number
  san: string
  mover: Side
  /** Real choices the position offered, as a perplexity. The headline width. */
  width: number
  /** Legal moves inside the hard tolerance, and the band search noise leaves around it. */
  countedWidth: number
  countLow: number
  countHigh: number
  /** log2(width) — the corridor's width in bits, so multi-move products become sums. */
  bits: number
  /**
   * Bits of freedom this side holds over its next `HORIZON_DECISIONS` decisions
   * along the game's actual continuation, this one included. Null near the end
   * of the game, where the full horizon isn't available.
   *
   * This counts paths along the played line rather than over the whole game
   * tree: the survey only scores positions that actually occurred, so a true
   * k-ply path count over all branches isn't available without exploding the
   * search. Read it as "how much room this side had, given how the game went".
   */
  horizonBits: number | null
  /** 2^horizonBits — the same figure as a plan count, for display. */
  horizonPaths: number | null
  /** Effectively one move held the position. */
  isCut: boolean
  /** The played move left the corridor. */
  leftCorridor: boolean
}

/** The soft width, falling back to the hard count where the survey scored too little to form one. */
function widthOf(node: DecisionNode): number {
  return node.softWidth ?? node.corridorWidth
}

export function computeCorridor(nodes: DecisionNode[]): CorridorPoint[] {
  const ownIndex: Record<Side, number[]> = { white: [], black: [] }
  nodes.forEach((n, i) => ownIndex[n.mover].push(i))

  // Position of each node within its own mover's decision sequence, so the
  // horizon can step forward by "this side's next move" rather than by ply.
  const offsetInOwn = new Map<number, number>()
  for (const side of ['white', 'black'] as Side[]) {
    ownIndex[side].forEach((nodeIdx, k) => offsetInOwn.set(nodeIdx, k))
  }

  return nodes.map((node, i) => {
    const width = widthOf(node)
    const bits = width > 0 ? Math.log2(width) : 0

    const own = ownIndex[node.mover]
    const k = offsetInOwn.get(i)!
    let horizonBits: number | null = null
    if (k + HORIZON_DECISIONS <= own.length) {
      horizonBits = 0
      for (let step = 0; step < HORIZON_DECISIONS; step++) {
        const w = widthOf(nodes[own[k + step]])
        horizonBits += w > 0 ? Math.log2(w) : 0
      }
    }

    return {
      index: node.index,
      ply: node.ply,
      san: node.san,
      mover: node.mover,
      width,
      countedWidth: node.corridorWidth,
      countLow: node.widthLow,
      countHigh: node.widthHigh,
      bits,
      horizonBits,
      horizonPaths: horizonBits === null ? null : Math.pow(2, horizonBits),
      isCut: node.isCut,
      leftCorridor: node.choice === 'outside',
    }
  })
}

export type NarrowingEpisode = {
  mover: Side
  startPly: number
  endPly: number
  startWidth: number
  endWidth: number
  /** How many of this side's own decisions the narrowing spanned. */
  decisions: number
  /** The episode ended in a move that left the corridor — a narrowing the player didn't survive. */
  collapsed: boolean
}

/**
 * Maximal runs of one side's own consecutive decisions over which the corridor
 * never widened, long enough and steep enough to be a trend rather than noise.
 *
 * The steepness test is proportional rather than absolute. Shedding three moves
 * from a width of thirty is nothing; shedding three from five is the whole
 * position, and an absolute threshold reports the first and misses the second.
 */
export function findNarrowingEpisodes(points: CorridorPoint[]): NarrowingEpisode[] {
  const episodes: NarrowingEpisode[] = []

  for (const side of ['white', 'black'] as Side[]) {
    const own = points.filter((p) => p.mover === side)
    let start = 0

    for (let i = 1; i <= own.length; i++) {
      // A soft width almost never repeats exactly, so "did not widen" needs a
      // tolerance; without one every run is length 1.
      const continues = i < own.length && own[i].width <= own[i - 1].width * 1.05
      if (continues) continue

      const run = own.slice(start, i)
      const first = run[0].width
      const last = run[run.length - 1]
      const shed = first > 0 ? (first - last.width) / first : 0

      if (run.length >= MIN_EPISODE_DECISIONS && shed >= MIN_EPISODE_SHARE) {
        episodes.push({
          mover: side,
          startPly: run[0].ply,
          endPly: last.ply,
          startWidth: first,
          endWidth: last.width,
          decisions: run.length,
          collapsed: last.leftCorridor || run.some((p) => p.leftCorridor && p.width <= 2),
        })
      }
      start = i
    }
  }

  return episodes.sort((a, b) => a.startPly - b.startPly)
}

export type CutMoment = {
  index: number
  ply: number
  san: string
  mover: Side
  legalCount: number
  /** Share of legal moves that would have left the corridor. */
  criticality: number
  /** The player found the one move that held. */
  survived: boolean
}

/**
 * Decisions where the surviving-line graph pinched to a single node.
 *
 * These are critical moments by topology rather than by outcome: the position
 * is critical because every acceptable future ran through one move, which is
 * true whether or not the player happened to find it. An eval-drop threshold
 * only ever finds the half of these that went wrong.
 */
export function findCutMoments(nodes: DecisionNode[]): CutMoment[] {
  return nodes
    .filter((n) => n.isCut && n.criticality !== null)
    .map((n) => ({
      index: n.index,
      ply: n.ply,
      san: n.san,
      mover: n.mover,
      legalCount: n.legalCount,
      criticality: n.criticality!,
      survived: n.choice === 'best' || n.choice === 'inside',
    }))
    .sort((a, b) => b.criticality - a.criticality)
}

export type CorridorSummary = {
  /** Mean corridor width this side faced. */
  meanWidth: number | null
  /** Mean corridor width on the decisions where they left it — how much room they had when they erred. */
  meanWidthOnFailure: number | null
  cutsFaced: number
  cutsSurvived: number
  /** Decisions that left the corridor. */
  exits: number
  decisions: number
}

export function summarizeCorridor(nodes: DecisionNode[], side: Side): CorridorSummary {
  const own = nodes.filter((n) => n.mover === side && n.choice !== null)
  const exits = own.filter((n) => n.choice === 'outside')
  const cuts = own.filter((n) => n.isCut)

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

  return {
    meanWidth: avg(own.map(widthOf)),
    meanWidthOnFailure: avg(exits.map(widthOf)),
    cutsFaced: cuts.length,
    cutsSurvived: cuts.filter((n) => n.choice !== 'outside').length,
    exits: exits.length,
    decisions: own.length,
  }
}
