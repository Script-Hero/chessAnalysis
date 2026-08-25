import { buildIncidence } from './incidence'
import { coordinationOf } from './pieceGraph'
import { defenceFlow } from './flow'
import type { NarrowingEpisode } from './corridor'
import type { TemporalSeries } from './temporal'
import type { Side } from './analysis'

/**
 * Why the corridor narrowed.
 *
 * This module is the join, and the join is the point. The corridor chart knows
 * that a player's options collapsed between moves 18 and 24. The structural
 * measures know that the defence became over-subscribed at move 20, that
 * control concentrated onto one knight at 21, and that the attack-and-defence
 * relations were rebuilt at 22. Neither says anything a player can use. Held
 * against each other they produce the sentence the whole app exists to write:
 *
 *   "Your options collapsed from six to one over moves 18-24. The defence went
 *    a unit short at move 20 — the rook on e1 was holding two loose pieces at
 *    once — and by 22 more than half the position's relations had been rebuilt."
 *
 * Nothing here is a threshold on an evaluation. Every finding is a structural
 * event with a ply attached, ranked by how far it moved against the game's own
 * baseline, so the explanation is derived rather than asserted.
 */

const SIDES: Side[] = ['white', 'black']

export type StructureDigest = {
  index: number
  coordination: Record<Side, number>
  /** Units by which the defence is over-subscribed — see `flow.ts`. */
  deficit: Record<Side, number>
  /** Min-cut defenders, when the defence is stretched. */
  deflections: Record<Side, string[]>
  /** Gini of load-bearing across the army: 1 means one piece holds everything. */
  concentration: Record<Side, number>
  coverage: Record<Side, number>
  kingContested: Record<Side, number>
  /** The piece carrying the most uncontested ground. */
  anchor: Record<Side, string | null>
}

/**
 * A cheap structural reading of every position in the game.
 *
 * Deliberately excludes the expensive measures — percolation curves and null
 * models — which are only ever wanted for the position on screen. What remains
 * is a handful of attacker lookups and one small eigenvalue problem per ply.
 */
export function structureSeries(positions: string[]): StructureDigest[] {
  return positions.map((fen, index) => {
    const digest: StructureDigest = {
      index,
      coordination: { white: 0, black: 0 },
      deficit: { white: 0, black: 0 },
      deflections: { white: [], black: [] },
      concentration: { white: 0, black: 0 },
      coverage: { white: 0, black: 0 },
      kingContested: { white: 0, black: 0 },
      anchor: { white: null, black: null },
    }

    let incidence
    try {
      incidence = buildIncidence(fen)
    } catch {
      return digest
    }

    for (const side of SIDES) {
      digest.coordination[side] = safely(() => coordinationOf(fen, side), 0)
      const flow = safely(() => defenceFlow(fen, side), null)
      digest.deficit[side] = flow?.deficit ?? 0
      digest.deflections[side] = flow?.deflections.map((d) => d.square) ?? []
      digest.concentration[side] = incidence[side].concentration
      digest.coverage[side] = incidence[side].weightedCoverage
      digest.anchor[side] = incidence[side].pieces[0]?.square ?? null
    }

    return digest
  })
}

function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export type Finding = {
  kind: 'oversubscribed' | 'reorganization' | 'coordination' | 'concentration' | 'coverage'
  ply: number
  /** How far this moved against the game's own baseline. Used only for ranking. */
  strength: number
  text: string
}

export type EpisodeExplanation = {
  episode: NarrowingEpisode
  findings: Finding[]
  /** One sentence joining the narrowing to its strongest structural cause. */
  summary: string
}

const PIECE_WORD: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

function moveNumber(ply: number): string {
  return String(Math.ceil(ply / 2))
}

/**
 * Structural events inside (and just before) a narrowing episode, ranked.
 *
 * The window opens two of the side's own decisions early, because a cause that
 * only appears once the corridor is already collapsing is a symptom.
 */
export function explainEpisodes(
  episodes: NarrowingEpisode[],
  digests: StructureDigest[],
  temporal: TemporalSeries,
): EpisodeExplanation[] {
  return episodes.map((episode) => {
    const from = Math.max(0, episode.startPly - 5)
    const to = Math.min(digests.length - 1, episode.endPly)
    const side = episode.mover
    const window = digests.slice(from, to + 1)
    const findings: Finding[] = []

    if (window.length >= 2) {
      // Onset of over-subscription: the first ply in the window where the
      // defence flow could no longer meet its demand.
      const onset = window.find((d) => d.deficit[side] > 0)
      if (onset && (digests[from]?.deficit[side] ?? 0) === 0) {
        const cut = onset.deflections[side]
        findings.push({
          kind: 'oversubscribed',
          ply: onset.index,
          strength: 1.5 + onset.deficit[side],
          text:
            `the defence went ${onset.deficit[side]} unit${onset.deficit[side] === 1 ? '' : 's'} short at move ` +
            `${moveNumber(onset.index)}` +
            (cut.length ? ` — ${cut.join(' and ')} ${cut.length === 1 ? 'was' : 'were'} holding more than one loose piece at once` : ''),
        })
      }

      const first = window[0]
      const last = window[window.length - 1]

      const coordinationDrop = first.coordination[side] - last.coordination[side]
      if (coordinationDrop > 0.05) {
        findings.push({
          kind: 'coordination',
          ply: last.index,
          strength: coordinationDrop * 6,
          text: `the pieces stopped defending one another — connectivity fell ${(coordinationDrop * 100).toFixed(0)}% over the span`,
        })
      }

      const concentrationRise = last.concentration[side] - first.concentration[side]
      if (concentrationRise > 0.06 && last.anchor[side]) {
        findings.push({
          kind: 'concentration',
          ply: last.index,
          strength: concentrationRise * 8,
          text: `control concentrated onto the piece on ${last.anchor[side]} — by the end of the span it was holding ground no other piece covered`,
        })
      }

      const coverageDrop = first.coverage[side] > 0 ? 1 - last.coverage[side] / first.coverage[side] : 0
      if (coverageDrop > 0.15) {
        findings.push({
          kind: 'coverage',
          ply: last.index,
          strength: coverageDrop * 4,
          text: `the side's control of the board shrank by ${(coverageDrop * 100).toFixed(0)}%`,
        })
      }
    }

    for (const change of temporal.changePoints) {
      if (change.index < from || change.index > to) continue
      findings.push({
        kind: 'reorganization',
        ply: change.index,
        strength: change.z,
        text: `the position was rebuilt at move ${moveNumber(change.index)} — ${Math.round(change.churn * 100)}% of its attack-and-defence relations changed in one ply`,
      })
    }

    findings.sort((a, b) => b.strength - a.strength)

    const span = `moves ${moveNumber(episode.startPly)}-${moveNumber(episode.endPly)}`
    const scale = `from about ${episode.startWidth.toFixed(1)} real choices to ${episode.endWidth.toFixed(1)}`
    const lead = `Options narrowed ${scale} over ${span}`
    const summary =
      findings.length === 0
        ? `${lead}. No single structural event accounts for it — the narrowing was gradual.`
        : `${lead}: ${findings
            .slice(0, 2)
            .map((f) => f.text)
            .join(', and ')}.${episode.collapsed ? ' The corridor then broke.' : ''}`

    return { episode, findings, summary }
  })
}


export type PressurePoint = {
  square: string
  type: string
  /** It is a min-cut defender: deflecting it breaks the defence. */
  isCut: boolean
  /** It carries ground no teammate covers. */
  loadBearing: number
  /** Share of the side's control lost if it disappears. */
  impact: number
  text: string
}

/**
 * Pieces that are load-bearing in the incidence graph *and* a min-cut defender
 * in the flow network.
 *
 * Either property alone is a curiosity. Together they name a piece whose
 * removal both drops the army's control and breaks a defence that has nothing
 * spare — which is a plan, stated in the form a player can act on.
 */
export function findPressurePoints(
  deflections: { square: string; type: string; serves: string[]; materialFreed: number }[],
  loadBearing: { square: string; type: string; loadBearing: number }[],
  impacts: { square: string; impact: number }[],
): PressurePoint[] {
  const load = new Map(loadBearing.map((p) => [p.square, p.loadBearing]))
  const impact = new Map(impacts.map((p) => [p.square, p.impact]))
  const peak = Math.max(1e-9, ...loadBearing.map((p) => p.loadBearing))

  return deflections
    .map((d) => {
      const weight = (load.get(d.square) ?? 0) / peak
      const drop = impact.get(d.square) ?? 0
      return {
        square: d.square,
        type: d.type,
        isCut: true,
        loadBearing: weight,
        impact: drop,
        // Kept to one line: this is the app's most actionable output, and a
        // paragraph per piece turned the panel into prose.
        text:
          `${PIECE_WORD[d.type] ?? d.type} on ${d.square} holds ${d.serves.join(' and ')} and covers ground nobody ` +
          `else does — deflecting it costs ${Math.round(drop * 100)}% control, frees ${d.materialFreed.toFixed(1)} pawns.`,
      }
    })
    .filter((p) => p.loadBearing > 0.25 || p.impact > 0.08)
    .sort((a, b) => b.impact + b.loadBearing - (a.impact + a.loadBearing))
}
