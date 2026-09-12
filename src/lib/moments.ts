import { Chess, type Move } from 'chess.js'
import type { Side } from './analysis'
import { hasClockData, moverOf } from './analysis'
import type { EpisodeExplanation } from './causes'
import type { DecisionNode } from './moveGraph'
import type { ParsedGame } from './pgn'
import type { EngineLine, MoveJudgment, PositionEval } from './stockfish'
import { scoreWinProb } from './winprob'

/**
 * The moments worth reviewing in one game.
 *
 * The old list filled three fixed slots ("a costly decision", ...) whether or
 * not the game had anything like them, so a regular reader learned to skip it.
 * Here every detector proposes candidates with a significance score, related
 * moves are told as one story, and only what clears the bar is shown — a clean
 * game shows one row, a chaotic one five, and the headline says what actually
 * happened rather than which slot the move was fitted to.
 *
 * All swings are in win% for the side that moved, the app's common currency.
 */

export type MomentKind =
  | 'decidingError'
  | 'threwAway'
  | 'collapse'
  | 'letOff'
  | 'missedWin'
  | 'timeTrouble'
  | 'rushed'
  | 'cracked'
  | 'unforced'
  | 'mistake'
  | 'slowBleed'
  | 'hardSave'
  | 'punished'
  | 'setProblem'
  | 'conversion'
  | 'comeback'

/** A fragment of a moment's detail line: plain text, or a move the reader can jump to. */
export type MomentPart = string | { index: number; label: string }

export type Moment = {
  kind: MomentKind
  /** The side the headline is about. */
  side: Side
  /** The move the row opens. */
  index: number
  headline: string
  detail: MomentPart[]
  score: number
  /** Other move indices this row's story already tells; used to avoid telling it twice. */
  covers: number[]
  /** The headline side's win% around the moment, for the row's sparkline. */
  swing: Swing
}

export type Swing = {
  /** Position index of `values[0]`. */
  start: number
  /** Positions bounding the change the row describes. */
  from: number
  to: number
  /** Win% for the headline side, one per position from `start`. */
  values: number[]
}

export type MomentInput = {
  game: ParsedGame
  evals: PositionEval[]
  judgments: (MoveJudgment | null)[]
  lines: EngineLine[][]
  decisions: DecisionNode[] | null
  explanations: EpisodeExplanation[] | null
}

/** A single move that gives up this much win% is an error in its own right. */
const ERROR_PCT = 15
/** Below this, a move is accurate for every purpose here. */
const ACCURATE_PCT = 3
const WINNING_PCT = 70
const LOSING_PCT = 30
/** Rows below this significance are noise, however few rows that leaves. */
const MIN_SCORE = 15
export const MAX_MOMENTS = 5

const PIECE: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
const NUMBER_WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten']

const sideName = (side: Side) => (side === 'white' ? 'White' : 'Black')
const other = (side: Side): Side => (side === 'white' ? 'black' : 'white')
const count = (n: number) => NUMBER_WORD[n] ?? String(n)
const pct = (p: number) => `${Math.round(p)}%`

export function moveLabel(index: number, san: string): string {
  return `${Math.floor(index / 2) + 1}${index % 2 ? '…' : '.'}${san}`
}

function playUci(chess: Chess, uci: string): Move | null {
  try {
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined })
  } catch {
    return null
  }
}

/** "rook takes queen with check", "knight to f5", "castles". */
export function describeMove(move: Move): string {
  let text: string
  if (move.isKingsideCastle() || move.isQueensideCastle()) text = 'castles'
  else if (move.isEnPassant()) text = 'pawn takes pawn en passant'
  else if (move.captured) text = `${PIECE[move.piece]} takes ${PIECE[move.captured]}`
  else if (move.promotion) text = `pawn to ${move.to}`
  else text = `${PIECE[move.piece]} to ${move.to}`
  if (move.promotion) text += ` and promotes to ${PIECE[move.promotion]}`
  if (move.san.endsWith('#')) text += ' with checkmate'
  else if (move.san.endsWith('+')) text += ' with check'
  return text
}

export function findMoments(input: MomentInput, filter: Side | 'both' = 'both'): Moment[] {
  const { game, evals, judgments, lines, decisions, explanations } = input
  const n = game.moves.length
  if (evals.length < n + 1) return []

  const whiteWin = evals.map((e) => scoreWinProb(e.score, e.mateIn))
  /** Win% for `side` in the position before move `p` (position `n` is the final one). */
  const win = (side: Side, p: number) => (side === 'white' ? whiteWin[p] : 100 - whiteWin[p])
  const loss = (i: number) => Math.max(0, win(moverOf(i), i) - win(moverOf(i), i + 1))
  const ref = (i: number): MomentPart => ({ index: i, label: moveLabel(i, game.moves[i].san) })
  const evalFor = (side: Side, p: number) => {
    const e = evals[p]
    if (e.mateIn !== null) return (e.mateIn > 0) === (side === 'white') ? 'a forced mate' : 'getting mated'
    const s = side === 'white' ? e.score : -e.score
    return `${s > 0 ? '+' : s < 0 ? '−' : ''}${Math.abs(s).toFixed(1)}`
  }

  const outcome = (side: Side): 'win' | 'loss' | 'draw' => {
    const result = game.headers.Result
    if (result === '1/2-1/2') return 'draw'
    if (result === '1-0' || result === '0-1') return (result === '1-0') === (side === 'white') ? 'win' : 'loss'
    const final = win(side, n)
    return final >= WINNING_PCT ? 'win' : final <= LOSING_PCT ? 'loss' : 'draw'
  }

  /**
   * What the engine's best reply to move `i` would have done, as a noun phrase
   * ("rook takes queen", "mate in 3"). The line is read from the position after
   * the move, so it is the punishment on offer, whether or not it was played.
   */
  const threat = (i: number): string | null => {
    const best = lines[i + 1]?.[0]
    if (!best || !best.pv.length) return null
    if (best.mateIn !== null && best.mateIn > 0 && best.mateIn <= 6) return `mate in ${best.mateIn}`
    const chess = new Chess(game.positions[i + 1])
    const first = playUci(chess, best.pv[0])
    if (!first) return null
    let text = describeMove(first)
    if (!first.captured && !first.san.includes('+') && best.pv.length >= 3 && playUci(chess, best.pv[1])) {
      const follow = playUci(chess, best.pv[2])
      if (follow && (follow.captured || follow.san.includes('+'))) text += `, then ${describeMove(follow)}`
    }
    return text
  }
  const playedMove = (i: number): Move | null => {
    const chess = new Chess(game.positions[i])
    const m = game.moves[i]
    try {
      return chess.move({ from: m.from, to: m.to, promotion: m.promotion ?? undefined })
    } catch {
      return null
    }
  }
  const matchesBest = (i: number) => {
    const best = lines[i]?.[0]?.move
    const m = game.moves[i]
    return !!best && best.slice(0, 4) === m.from + m.to
  }
  const openness = (i: number) => decisions?.[i]?.openness ?? null
  /** "only 2 of 30 moves held", or null without a survey. */
  const heldPhrase = (i: number) => {
    const d = decisions?.[i]
    if (!d || !d.legalCount) return null
    return d.corridorWidth <= 1
      ? `the only move of ${d.legalCount} that held`
      : `only ${d.corridorWidth} of ${d.legalCount} moves held`
  }

  const candidates: Moment[] = []
  /**
   * `change` is the span of positions the story is about — one move by default.
   * Single moves get two full moves of context either side so momentum shows.
   */
  const add = ({ change, ...m }: Omit<Moment, 'covers' | 'swing'> & { covers?: number[]; change?: [number, number] }) => {
    const [from, to] = change ?? [m.index, m.index + 1]
    const pad = to - from <= 2 ? 4 : 2
    const start = Math.max(0, from - pad)
    const end = Math.min(n, to + pad)
    const values = Array.from({ length: end - start + 1 }, (_, k) => win(m.side, start + k))
    candidates.push({ covers: [], ...m, swing: { start, from, to, values } })
  }

  // --- The shape of the game --------------------------------------------------

  /** The move after which the loser's result was never in doubt again. */
  let decidingIndex: number | null = null
  for (const side of ['white', 'black'] as const) {
    if (outcome(side) !== 'loss') continue
    let p = n
    while (p > 0 && win(side, p - 1) <= LOSING_PCT + 10) p--
    for (const i of [p - 1, p - 2]) {
      if (i >= 0 && moverOf(i) === side && loss(i) >= ERROR_PCT && win(side, i) > LOSING_PCT) {
        decidingIndex = i
        break
      }
    }
  }

  // Thrown-away wins: the biggest slip after the last time the side was clearly winning.
  const threwAt = new Map<number, number>()
  for (const side of ['white', 'black'] as const) {
    if (outcome(side) === 'win') continue
    let peak = -1
    for (let p = 1; p <= n; p++) if (win(side, p) >= 80) peak = p
    if (peak < 1 || peak === n) continue
    let anchor = -1
    for (let i = peak; i < n; i++) if (moverOf(i) === side && (anchor < 0 || loss(i) > loss(anchor))) anchor = i
    if (anchor < 0 || loss(anchor) < 8) continue
    threwAt.set(anchor, peak)
    const threatText = loss(anchor) >= ERROR_PCT ? threat(anchor) : null
    add({
      kind: 'threwAway',
      side,
      index: anchor,
      headline: 'threw away a winning position',
      detail: [
        `was ${evalFor(side, peak)} after `,
        ref(peak - 1),
        ...(threatText ? [`; this move allowed ${threatText}`] : []),
        outcome(side) === 'draw' ? ' · the game was drawn' : ` · ${sideName(other(side))} went on to win`,
      ],
      score: 25 + (win(side, peak) - win(side, n)) * 0.4,
      change: [peak, anchor + 1],
    })
  }

  // --- Single errors ------------------------------------------------------------

  const widths = (side: Side, before: number) =>
    (decisions ?? []).filter((d) => d.mover === side && d.index < before && d.softWidth != null).slice(-6).map((d) => d.softWidth!)
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 0
  }

  /** Moves after which the opponent's real options collapsed. */
  const problemSetBy = new Map<number, { from: number; to: number }>()
  for (let i = 0; i + 1 < n && decisions; i++) {
    const next = decisions[i + 1]
    if (loss(i) > ACCURATE_PCT || next?.softWidth == null) continue
    const typical = median(widths(next.mover, i + 1))
    if (next.softWidth <= 2.5 && typical >= 4 && typical >= next.softWidth * 2) {
      problemSetBy.set(i, { from: typical, to: next.softWidth })
    }
  }

  const clocks = hasClockData(game.moves) ? game.moves.map((m) => m.clockSeconds ?? 0) : null
  const increment = Number(game.headers.TimeControl?.split('+')[1] ?? 0) || 0
  const lowClock = clocks ? Math.max(10, Math.min(60, Math.max(clocks[0], clocks[1] ?? 0) * 0.1)) : 0
  const collapseEnds = new Map<number, EpisodeExplanation>()
  for (const e of explanations ?? []) if (e.episode.collapsed) collapseEnds.set(e.episode.endPly - 1, e)

  /** A stretched-defence finding just before move `i`, as a clause. */
  const overload = (i: number, side: Side) => {
    for (const e of explanations ?? []) {
      if (e.episode.mover !== side) continue
      const f = e.findings.find((f) => f.kind === 'oversubscribed' && Math.abs(f.ply - (i + 1)) <= 2)
      const clause = f?.text.split(' — ')[1]
      if (clause) return clause
    }
    return null
  }

  for (let i = 0; i < n; i++) {
    const lost = loss(i)
    if (lost < ERROR_PCT || threwAt.has(i)) continue
    const side = moverOf(i)
    const opp = other(side)
    const threatText = threat(i)
    const allowing = threatText ? `allowing ${threatText}` : `win chances fell from ${pct(win(side, i))} to ${pct(win(side, i + 1))}`
    let tail: MomentPart[] = []
    let covers: number[] = []

    // The reply: did the opponent cash in, or give it back?
    if (i + 1 < n) {
      const reply = loss(i + 1)
      if (reply <= ACCURATE_PCT) {
        tail.push(matchesBest(i + 1) ? ` · ${sideName(opp)} found it (` : ` · ${sideName(opp)} took advantage (`, ref(i + 1), ')')
        covers.push(i + 1)
      } else if (reply >= lost * 0.6) {
        tail.push(` · ${sideName(opp)} missed it (`, ref(i + 1), ')')
        covers.push(i + 1)
      }
    }
    const pressure = i > 0 ? problemSetBy.get(i - 1) : undefined
    if (pressure) {
      tail.push(' · under pressure after ', ref(i - 1), ` cut the options to ${Math.max(1, Math.round(pressure.to))}`)
      covers.push(i - 1)
    }
    const stretched = overload(i, side)
    const stretchedClause = stretched ? `; the ${stretched}` : null
    if (stretchedClause) tail.push(stretchedClause)

    const clock = clocks?.[i]
    const think = clocks && i >= 2 ? clocks[i - 2] - clocks[i] + increment : null
    const collapse = collapseEnds.get(i)
    const bestWin = win(side, i)

    let kind: MomentKind
    let headline: string
    let detail: MomentPart[]
    let score = lost

    if (i === decidingIndex) {
      kind = 'decidingError'
      headline = 'made a deciding error'
      detail = [allowing, ...tail]
      score += 25
    } else if (collapse) {
      kind = 'collapse'
      headline = 'collapsed after a squeeze'
      const e = collapse.episode
      detail = [
        `options narrowed from ${Math.round(e.startWidth)} to ${Math.max(1, Math.round(e.endWidth))} over ${count(e.decisions)} moves, then this move slipped, ${allowing}`,
        ...tail,
      ]
      score += 8
    } else if (i > 0 && moverOf(i - 1) === opp && loss(i - 1) >= ERROR_PCT && lost >= loss(i - 1) * 0.6) {
      kind = 'letOff'
      headline = `let ${sideName(opp)} off the hook`
      const missed = threat(i - 1)
      tail = stretchedClause ? [stretchedClause] : []
      detail = [ref(i - 1), missed ? ` allowed ${missed}, but this move missed it` : ' was a mistake, but this move gave it back', ...tail]
      score += 5
      covers = [i - 1]
    } else if (bestWin >= 80 && win(side, i + 1) <= 60) {
      kind = 'missedWin'
      headline = 'missed a win'
      const best = judgments[i]?.bestMoveSan
      detail = best
        ? [`${moveLabel(i, best)} kept ${sideName(side)} winning (${pct(bestWin)}); this move dropped to ${pct(win(side, i + 1))}`, ...tail]
        : [allowing, ...tail]
      score += 8
    } else if (clock != null && clock <= lowClock) {
      kind = 'timeTrouble'
      headline = 'erred in time trouble'
      detail = [`with ${Math.floor(clock / 60)}:${String(Math.floor(clock % 60)).padStart(2, '0')} left, ${allowing}`, ...tail]
    } else if (think != null && think <= 3 && openness(i) && openness(i) !== 'open') {
      kind = 'rushed'
      headline = 'rushed a critical move'
      detail = [`spent ${Math.max(0, Math.round(think))}s where ${heldPhrase(i) ?? 'few moves held'} · ${allowing}`, ...tail]
      score += 3
    } else if (openness(i) && openness(i) !== 'open') {
      kind = 'cracked'
      headline = 'cracked under pressure'
      const best = judgments[i]?.bestMoveSan
      detail = [`${heldPhrase(i) ?? 'few moves held'}${best ? ` · ${moveLabel(i, best)} was needed` : ''}; ${allowing}`, ...tail]
    } else if (openness(i) === 'open') {
      kind = 'unforced'
      headline = 'made an unforced error'
      const safe = decisions?.[i]?.corridorWidth
      detail = [`with ${safe ?? 'many'} safe moves available, ${allowing}`, ...tail]
      score += 3
    } else {
      kind = 'mistake'
      headline = 'made a costly mistake'
      detail = [allowing, ...tail]
    }

    if (Math.sign(win(side, i) - 50) !== Math.sign(win(side, i + 1) - 50)) score += 5
    const change: [number, number] = kind === 'letOff' ? [i - 1, i + 1] : collapse ? [Math.max(0, collapse.episode.startPly - 1), i + 1] : [i, i + 1]
    add({ kind, side, index: i, headline, detail, score, covers, change })
  }

  // --- Credit ------------------------------------------------------------------

  for (let i = 0; i < n; i++) {
    const side = moverOf(i)
    const opp = other(side)
    const j = judgments[i]
    const move = playedMove(i)
    if (!j || !move || loss(i) > ACCURATE_PCT) continue
    const alternatives = decisions?.[i]?.legalCount ?? lines[i]?.length ?? 0
    const gap = j.bestWinProb - j.fieldWinProb

    // Hard save: one move holds, and it was found. Recaptures and forced king moves are not saves.
    const prev = i > 0 ? playedMove(i - 1) : null
    const recapture = !!prev?.captured && move.captured != null && move.to === prev.to
    const forcedEvasion = new Chess(game.positions[i]).inCheck() && alternatives <= 3
    const stakes = win(side, i) > 8 && win(side, i) < 97
    if ((j.onlyMove || (decisions?.[i]?.isCut && gap >= 10)) && alternatives > 1 && stakes && !recapture && !forcedEvasion) {
      const field = lines[i]?.[1]
      const mate = field?.mateIn != null && field.mateIn < 0 ? -field.mateIn : null
      const setter = i > 0 ? problemSetBy.get(i - 1) : undefined
      add({
        kind: 'hardSave',
        side,
        index: i,
        headline: 'made a hard save',
        detail: [
          mate ? `the only move that avoided mate in ${mate}` : (heldPhrase(i) ?? `the next best move dropped to ${pct(j.fieldWinProb)}`),
          ...(setter ? [' · after ', ref(i - 1), ` cut ${sideName(side)}'s options to ${Math.max(1, Math.round(setter.to))}`] : []),
        ],
        score: Math.min(40, gap) + (Math.sign(j.bestWinProb - 50) !== Math.sign(j.fieldWinProb - 50) ? 8 : 0),
        covers: setter ? [i - 1] : [],
      })
    }

    // Punished: the opponent's error was answered, and the answer was not obvious.
    if (i > 0 && loss(i - 1) >= ERROR_PCT && !move.captured && !move.san.includes('+')) {
      const hard = j.onlyMove || (decisions?.[i]?.softWidth ?? 99) <= 2
      if (hard) {
        add({
          kind: 'punished',
          side,
          index: i,
          headline: 'punished the mistake',
          detail: [`found ${describeMove(move)} after `, ref(i - 1), ' allowed it', ...(heldPhrase(i) ? [` · ${heldPhrase(i)}`] : [])],
          score: loss(i - 1) + 10,
          covers: [i - 1],
          change: [i - 1, i + 1],
        })
      }
    }

    // Set a problem, and what the opponent did with it.
    const problem = problemSetBy.get(i)
    if (problem && i + 1 < n) {
      const replyLoss = loss(i + 1)
      const cracked = replyLoss >= ERROR_PCT
      const reply = threat(i + 1)
      add({
        kind: 'setProblem',
        side,
        index: i,
        headline: 'set a problem',
        detail: [
          `${sideName(opp)}'s real options dropped from about ${Math.round(problem.from)} to ${Math.max(1, Math.round(problem.to))}`,
          ...(cracked
            ? [` · ${sideName(opp)} cracked with `, ref(i + 1), reply ? `, allowing ${reply}` : '']
            : [` · ${sideName(opp)} found `, ref(i + 1)]),
        ],
        score: cracked ? replyLoss + 8 : 10,
        covers: [i + 1],
        change: [i, i + 2],
      })
    }
  }

  // --- Stretches -----------------------------------------------------------------

  for (const side of ['white', 'black'] as const) {
    const own = Array.from({ length: n }, (_, i) => i).filter((i) => moverOf(i) === side)

    // Slow bleed: no single error, but the small ones add up.
    let bleed: { start: number; end: number; slips: number; change: number } | null = null
    for (let a = 0; a < own.length; a++) {
      if (loss(own[a]) < ACCURATE_PCT) continue
      let slips = 0
      for (let b = a; b < Math.min(own.length, a + 12) && loss(own[b]) < ERROR_PCT; b++) {
        if (loss(own[b]) < ACCURATE_PCT) continue
        slips++
        const change = win(side, own[a]) - win(side, own[b] + 1)
        if (slips >= 3 && change >= 20 && (!bleed || change > bleed.change)) bleed = { start: own[a], end: own[b], slips, change }
      }
    }
    if (bleed) {
      add({
        kind: 'slowBleed',
        side,
        index: bleed.start,
        headline: 'slowly gave up the advantage',
        detail: [
          `${count(bleed.slips)} small slips from `,
          ref(bleed.start),
          ' to ',
          ref(bleed.end),
          ` took win chances from ${pct(win(side, bleed.start))} to ${pct(win(side, bleed.end + 1))}`,
        ],
        score: bleed.change * 0.8,
        change: [bleed.start, bleed.end + 1],
      })
    }

    // Conversion: clearly winning, and never let it slip to the end.
    if (outcome(side) === 'win') {
      let p = n
      while (p > 0 && win(side, p - 1) >= 60) p--
      while (p < n && win(side, p) < 75) p++
      const rest = own.filter((i) => i >= p)
      if (p < n && rest.length >= 6 && rest.every((i) => loss(i) <= 5)) {
        const mated = new Chess(game.positions[n]).isCheckmate()
        add({
          kind: 'conversion',
          side,
          index: rest[0],
          headline: 'converted cleanly',
          detail: [`stayed accurate for ${rest.length} moves from ${evalFor(side, p)} ${mated ? 'to checkmate' : 'to the finish'}`],
          score: 18,
          change: [p, n],
        })
      }
    }

    // Comeback: from clearly losing to level or better, and it held.
    if (outcome(side) !== 'loss') {
      let trough = 0
      for (let p = 1; p <= n; p++) if (win(side, p) < win(side, trough)) trough = p
      if (trough > 0 && win(side, trough) <= 25) {
        let back = -1
        for (let p = trough + 1; p <= n; p++) {
          if (win(side, p) >= 50) {
            let held = true
            for (let q = p; q <= n; q++) if (win(side, q) < 40) held = false
            if (held) {
              back = p
              break
            }
          }
        }
        const anchor = back > 0 ? own.filter((i) => i < back && i >= trough).pop() : undefined
        if (anchor !== undefined) {
          let gift = -1
          for (let i = trough; i < back; i++) if (moverOf(i) !== side && loss(i) >= ERROR_PCT && (gift < 0 || loss(i) > loss(gift))) gift = i
          add({
            kind: 'comeback',
            side,
            index: anchor,
            headline: 'came back',
            detail: [
              `from ${evalFor(side, trough)} after `,
              ref(trough - 1),
              ` to ${evalFor(side, back)} by `,
              ref(back - 1),
              ...(gift >= 0 ? [' · helped by ', ref(gift)] : []),
            ],
            score: outcome(side) === 'win' ? 30 : 22,
            covers: gift >= 0 ? [gift] : [],
            change: [trough, back],
          })
        }
      }
    }
  }

  // --- Selection -------------------------------------------------------------------

  const kept: Moment[] = []
  const told = new Set<number>()
  const ranked = candidates
    .filter((m) => m.score >= MIN_SCORE && (filter === 'both' || m.side === filter))
    .sort((a, b) => b.score - a.score)
  for (const m of ranked) {
    if (kept.length >= MAX_MOMENTS) break
    if (told.has(m.index)) continue
    kept.push(m)
    told.add(m.index)
    for (const c of m.covers) told.add(c)
  }
  return kept.sort((a, b) => a.index - b.index)
}
