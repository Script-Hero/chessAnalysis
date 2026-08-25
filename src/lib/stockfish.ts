import { Chess } from 'chess.js'
import { scoreWinProb } from './winprob'

export type PositionEval = {
  /** Evaluation in pawns, from White's perspective. Saturated for mate scores. */
  score: number
  /** Set when the line is forced mate; positive = White mates, negative = Black mates. */
  mateIn: number | null
}

export type MoveClassification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'

export type MoveJudgment = {
  classification: MoveClassification
  /** Win% (for the side who moved) held by the engine's top choice at this position. */
  bestWinProb: number
  /** Win% held by the best *practical* alternative — the 2nd-best line, or the top line if forced. */
  fieldWinProb: number
  /** Win% the played move actually reached. */
  playedWinProb: number
  /** Raw loss vs the single best line — can be large even for a fine practical move. */
  rawLossPct: number
  /** Loss vs the field of reasonable alternatives — what classification is based on. */
  adjustedLossPct: number
  /** True when the gap between the best line and the field is large: a narrow, hard-to-find save/win. */
  onlyMove: boolean
  /** SAN of the engine's top choice, when it differs from the move actually played. */
  bestMoveSan: string | null
}

export type GameAnalysis = {
  evals: PositionEval[]
  /** One entry per position; null for the final position (no move follows it). */
  judgments: (MoveJudgment | null)[]
  /** Up to `multiPv` candidate lines per position, one entry per position. */
  lines: EngineLine[][]
  /** Full-width shallow scores for every legal move, one entry per position. */
  survey: SurveyPosition[]
}

const ENGINE_URL = '/stockfish/stockfish-18-lite-single.js'
const MATE_SCORE = 12
// Win% gap between the best line and the field that marks a "narrow" position —
// i.e. one line is much better than everything else, so missing it is easy to forgive.
const ONLY_MOVE_GAP = 15

export type EngineLine = {
  /** Pawns, from the perspective of the side to move in the analyzed position. */
  score: number
  mateIn: number | null
  /** First move of the line, in UCI form (e.g. "e2e4"), if reported. */
  move: string | null
  /** Full principal variation, in UCI form. */
  pv: string[]
}

/**
 * One legal move's shallow score, from the full-width survey pass.
 *
 * Unlike `EngineLine`, this carries no PV — the survey exists to describe the
 * *shape* of the decision (how many moves were playable, where the played move
 * ranked among all of them), not to supply variations, and dropping the PV
 * keeps a whole game's survey small enough to persist.
 */
export type MoveScore = {
  /** UCI form, including any promotion suffix — matched exactly, never by prefix. */
  uci: string
  san: string
  /** Pawns, from the mover's perspective. */
  score: number
  mateIn: number | null
  /** Win% for the mover if this move is played. */
  winProb: number
  /** Win% given up versus the best legal move. 0 for the best move itself. */
  lossPct: number
}

/**
 * Every legal move in one position, scored at `SURVEY_DEPTH`, best first.
 *
 * `legalCount` is the true legal-move count from the rules, which can exceed
 * `moves.length` if the engine reports fewer lines than requested; metrics use
 * `moves.length` as their denominator so a truncated survey never silently
 * inflates a branching figure.
 */
export type SurveyPosition = {
  legalCount: number
  moves: MoveScore[]
}

/** Parses one `info ... multipv N score ... pv ...` UCI line, if it is one. */
function parseInfoLine(data: string): { idx: number; line: EngineLine } | null {
  const mpvMatch = data.match(/\bmultipv (\d+)/)
  const scoreMatch = data.match(/\bscore (cp|mate) (-?\d+)/)
  const pvMatch = data.match(/\bpv (.+)$/)
  if (!mpvMatch || !scoreMatch) return null

  const kind = scoreMatch[1] as 'cp' | 'mate'
  const value = Number(scoreMatch[2])
  const pv = pvMatch ? pvMatch[1].trim().split(/\s+/) : []

  return {
    idx: Number(mpvMatch[1]),
    line: {
      score: kind === 'mate' ? Math.sign(value) * MATE_SCORE : value / 100,
      mateIn: kind === 'mate' ? value : null,
      move: pv[0] ?? null,
      pv,
    },
  }
}

function parseSearchDepth(data: string): number | null {
  const match = data.match(/^info depth (\d+)/)
  return match ? Number(match[1]) : null
}

/** Renders a line's PV as SAN text, e.g. "Nf3 Nc6 e4", for display. */
export function sanLineFromUci(fen: string, uciMoves: string[], maxPlies = 5): string {
  const chess = new Chess(fen)
  const sans: string[] = []
  for (const uci of uciMoves.slice(0, maxPlies)) {
    try {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4, 5) || undefined,
      })
      if (!move) break
      sans.push(move.san)
    } catch {
      break
    }
  }
  return sans.join(' ')
}

/** Win% held by a line, from the perspective of the side to move in the analyzed position. */
function lineWinProb(line: EngineLine): number {
  return scoreWinProb(line.score, line.mateIn)
}

function toWhiteRelative(fen: string, line: EngineLine): PositionEval {
  const sideToMove = fen.split(' ')[1]
  const sign = sideToMove === 'b' ? -1 : 1
  if (line.mateIn !== null) {
    const mateIn = sign * line.mateIn
    return { score: Math.sign(mateIn) * MATE_SCORE, mateIn }
  }
  return { score: sign * line.score, mateIn: null }
}

function sanFromUci(fen: string, uci: string | null): string | null {
  if (!uci) return null
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    })
    return move?.san ?? null
  } catch {
    return null
  }
}

/** Applies one UCI move to `fen`, returning the resulting SAN and FEN, or null if illegal. */
export function stepUci(fen: string, uci: string): { san: string; fen: string } | null {
  try {
    const chess = new Chess(fen)
    const move = chess.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci.slice(4, 5) || undefined,
    })
    if (!move) return null
    return { san: move.san, fen: chess.fen() }
  } catch {
    return null
  }
}

function classify(adjustedLossPct: number, rawLossPct: number): MoveClassification {
  if (rawLossPct <= 1) return 'best'
  if (adjustedLossPct <= 2) return 'excellent'
  if (adjustedLossPct <= 5) return 'good'
  if (adjustedLossPct <= 10) return 'inaccuracy'
  if (adjustedLossPct <= 20) return 'mistake'
  return 'blunder'
}

class StockfishEngine {
  private worker: Worker
  private ready: Promise<void>
  private currentMultiPv: number

  constructor(multiPv: number) {
    this.currentMultiPv = multiPv
    this.worker = new Worker(ENGINE_URL)
    this.ready = new Promise((resolve) => {
      const onMessage = (e: MessageEvent<string>) => {
        if (e.data === 'uciok') {
          this.worker.postMessage(`setoption name MultiPV value ${multiPv}`)
          this.worker.postMessage('isready')
        } else if (e.data === 'readyok') {
          this.worker.removeEventListener('message', onMessage)
          resolve()
        }
      }
      this.worker.addEventListener('message', onMessage)
      this.worker.postMessage('uci')
    })
  }

  /**
   * The survey pass needs a different MultiPV for every position (one line per
   * legal move), so MultiPV can't stay a construction-time constant. Skipping
   * the `setoption` when the value is unchanged avoids a needless engine
   * round-trip on the common case of two consecutive same-width positions.
   */
  private setMultiPv(multiPv: number) {
    if (multiPv === this.currentMultiPv) return
    this.worker.postMessage(`setoption name MultiPV value ${multiPv}`)
    this.currentMultiPv = multiPv
  }

  async searchLines(fen: string, depth: number, multiPv: number): Promise<EngineLine[]> {
    await this.ready
    this.setMultiPv(multiPv)

    return new Promise((resolve) => {
      const lines = new Map<number, EngineLine>()

      const onMessage = (e: MessageEvent<string>) => {
        const data = e.data
        const parsed = parseInfoLine(data)
        if (parsed) lines.set(parsed.idx, parsed.line)

        if (data.startsWith('bestmove')) {
          this.worker.removeEventListener('message', onMessage)
          const sorted = [...lines.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([, line]) => line)
            .slice(0, multiPv)
          resolve(sorted)
        }
      }

      this.worker.addEventListener('message', onMessage)
      this.worker.postMessage('position fen ' + fen)
      this.worker.postMessage('go depth ' + depth)
    })
  }

  terminate() {
    this.worker.postMessage('quit')
    this.worker.terminate()
  }
}

export const ANALYSIS_DEPTH = 12

/**
 * Depth for the full-width pass that scores every legal move.
 *
 * Shallower than `ANALYSIS_DEPTH` on purpose: this pass runs with MultiPV equal
 * to the legal-move count, which disables most of the alpha-beta cutoffs that
 * make deep search affordable. Depth 8 is enough to separate playable moves
 * from losing ones — which is all the decision-shape metrics need — while
 * keeping a full game's analysis to roughly twice the old runtime.
 */
export const SURVEY_DEPTH = 8

/**
 * Ceiling on survey width. Legal-move counts above this are vanishingly rare
 * (and always come from wide-open winning positions where the exact count adds
 * nothing), so capping bounds the worst-case search cost.
 */
const MAX_SURVEY_WIDTH = 64

/** Every legal move in `fen`, as UCI + SAN pairs. */
function legalMovesOf(fen: string): { uci: string; san: string }[] {
  try {
    const chess = new Chess(fen)
    return chess.moves({ verbose: true }).map((m) => ({
      uci: m.from + m.to + (m.promotion ?? ''),
      san: m.san,
    }))
  } catch {
    return []
  }
}

/**
 * Joins the survey pass's engine lines back to the legal move list.
 *
 * Engine lines are keyed by their full UCI first move (promotion suffix
 * included) rather than by a from+to prefix: prefix matching silently collapses
 * the four promotion choices onto whichever one the engine happened to report
 * first, which is exactly the kind of position where the choice matters.
 */
function buildSurvey(fen: string, lines: EngineLine[]): SurveyPosition {
  const legal = legalMovesOf(fen)
  const sanByUci = new Map(legal.map((m) => [m.uci, m.san]))

  const scored = lines
    .filter((line) => line.move !== null && sanByUci.has(line.move))
    .map((line) => ({
      uci: line.move!,
      san: sanByUci.get(line.move!)!,
      score: line.score,
      mateIn: line.mateIn,
      winProb: lineWinProb(line),
    }))
    .sort((a, b) => b.winProb - a.winProb)

  const bestWinProb = scored.length ? scored[0].winProb : 0
  return {
    legalCount: legal.length,
    moves: scored.map((m) => ({ ...m, lossPct: bestWinProb - m.winProb })),
  }
}

export async function analyzeGame(
  positions: string[],
  onProgress: (done: number, total: number) => void,
  depth = ANALYSIS_DEPTH,
  multiPv = 3,
  surveyDepth = SURVEY_DEPTH,
): Promise<GameAnalysis> {
  const engine = new StockfishEngine(multiPv)
  try {
    const perPosition: EngineLine[][] = []
    const evals: PositionEval[] = []
    const survey: SurveyPosition[] = []

    // Both passes run per position rather than as two sweeps over the game, so
    // the second search reuses the transposition table the first just filled,
    // and progress stays monotone instead of restarting halfway through.
    for (let i = 0; i < positions.length; i++) {
      const lines = await engine.searchLines(positions[i], depth, multiPv)
      perPosition.push(lines)
      evals.push(toWhiteRelative(positions[i], lines[0] ?? { score: 0, mateIn: null, move: null, pv: [] }))

      // The final position has no played move to describe, so its survey would
      // never be read — skipping it saves the most expensive search in the game.
      const isFinal = i === positions.length - 1
      const width = isFinal ? 0 : Math.min(legalMovesOf(positions[i]).length, MAX_SURVEY_WIDTH)
      if (width > 0) {
        const wide = await engine.searchLines(positions[i], surveyDepth, width)
        survey.push(buildSurvey(positions[i], wide))
      } else {
        survey.push({ legalCount: 0, moves: [] })
      }

      onProgress(i + 1, positions.length)
    }

    const judgments: (MoveJudgment | null)[] = perPosition.map((lines, i) => {
      if (i === positions.length - 1) return null

      const best = lines[0]
      if (!best) return null
      const field = lines[1] ?? best

      const bestWinProb = lineWinProb(best)
      const fieldWinProb = lineWinProb(field)

      const resultTop = perPosition[i + 1]?.[0]
      const playedWinProb = resultTop ? 100 - lineWinProb(resultTop) : bestWinProb

      const rawLossPct = bestWinProb - playedWinProb
      const adjustedLossPct = Math.max(0, fieldWinProb - playedWinProb)
      const onlyMove = bestWinProb - fieldWinProb >= ONLY_MOVE_GAP

      return {
        classification: classify(adjustedLossPct, rawLossPct),
        bestWinProb,
        fieldWinProb,
        playedWinProb,
        rawLossPct,
        adjustedLossPct,
        onlyMove,
        bestMoveSan: sanFromUci(positions[i], best.move),
      }
    })

    return { evals, judgments, lines: perPosition, survey }
  } finally {
    engine.terminate()
  }
}

/**
 * Interactive engine for the live analysis panel: stays warm across calls and
 * streams candidate lines as the search deepens, rather than resolving once
 * at a fixed depth. Each `go()` call invalidates any still-running search
 * (via a generation counter) so rapid ply changes don't race stale results.
 */
export class LiveEngine {
  private worker: Worker
  private ready: Promise<void>
  private multiPv: number
  private generation = 0

  constructor(multiPv = 3) {
    this.multiPv = multiPv
    this.worker = new Worker(ENGINE_URL)
    this.ready = new Promise((resolve) => {
      const onMessage = (e: MessageEvent<string>) => {
        if (e.data === 'uciok') {
          this.worker.postMessage(`setoption name MultiPV value ${multiPv}`)
          this.worker.postMessage('isready')
        } else if (e.data === 'readyok') {
          this.worker.removeEventListener('message', onMessage)
          resolve()
        }
      }
      this.worker.addEventListener('message', onMessage)
      this.worker.postMessage('uci')
    })
  }

  async go(fen: string, depth: number, onUpdate: (lines: EngineLine[], depth: number) => void) {
    await this.ready
    this.generation += 1
    const myGeneration = this.generation
    const lines = new Map<number, EngineLine>()

    const onMessage = (e: MessageEvent<string>) => {
      const data = e.data
      if (myGeneration !== this.generation) {
        if (data.startsWith('bestmove')) this.worker.removeEventListener('message', onMessage)
        return
      }

      const parsed = parseInfoLine(data)
      if (parsed) {
        lines.set(parsed.idx, parsed.line)
        const sorted = [...lines.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, line]) => line)
          .slice(0, this.multiPv)
        const depthSeen = parseSearchDepth(data)
        onUpdate(sorted, depthSeen ?? 0)
      }

      if (data.startsWith('bestmove')) {
        this.worker.removeEventListener('message', onMessage)
      }
    }

    this.worker.addEventListener('message', onMessage)
    this.worker.postMessage('stop')
    this.worker.postMessage('position fen ' + fen)
    this.worker.postMessage('go depth ' + depth)
  }

  /** Halts the current search to save CPU without tearing down the engine. */
  stop() {
    this.generation += 1
    this.worker.postMessage('stop')
  }

  terminate() {
    this.worker.postMessage('quit')
    this.worker.terminate()
  }
}
