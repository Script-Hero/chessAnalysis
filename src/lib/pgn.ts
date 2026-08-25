import { Chess } from 'chess.js'

export type ParsedMove = {
  san: string
  from: string
  to: string
  /** Promotion piece letter ('q', 'r', 'b', 'n'), when this move promotes. */
  promotion: string | null
  /** Clock remaining after this move, in seconds. Null if the PGN has no [%clk] data. */
  clockSeconds: number | null
}

export type ParsedGame = {
  headers: Record<string, string>
  moves: ParsedMove[]
  positions: string[]
}

function stripBalanced(text: string, open: string, close: string): string {
  let result = ''
  let depth = 0
  for (const ch of text) {
    if (ch === open) {
      depth++
      continue
    }
    if (ch === close) {
      if (depth > 0) depth--
      continue
    }
    if (depth === 0) result += ch
  }
  return result
}

// Strip comments ({...}, e.g. lichess's [%eval] / [%clk] annotations) and
// variations ((...)) before parsing: chess.js's PGN parser chokes on some
// real-world exports (e.g. two adjacent comments after one move), and the
// viewer only needs the mainline moves anyway.
function stripAnnotations(pgn: string): string {
  const withoutComments = stripBalanced(pgn, '{', '}')
  const withoutVariations = stripBalanced(withoutComments, '(', ')')
  return withoutVariations.replace(/[ \t]+/g, ' ')
}

function stripHeaderTags(pgn: string): string {
  return pgn
    .split('\n')
    .filter((line) => !line.trim().startsWith('['))
    .join('\n')
}

const RESULT_TOKENS = new Set(['1-0', '0-1', '1/2-1/2', '*'])

// Scan the mainline (variations dropped, comments kept) and pull a %clk
// value for each move in order. Returns one entry per move token seen, so it
// can be zip-aligned with chess.js's move list — or discarded wholesale if
// the counts don't match (non-lichess PGNs simply won't have this data).
function extractClockSeconds(mainlineWithComments: string): (number | null)[] {
  const clocks: (number | null)[] = []
  const tokenRe = /\{[^}]*\}|\S+/g
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(mainlineWithComments))) {
    const token = match[0]

    if (token.startsWith('{')) {
      if (clocks.length === 0) continue
      const clk = token.match(/%clk (\d+):(\d{2}):(\d{2})/)
      if (clk && clocks[clocks.length - 1] === null) {
        const [, h, m, s] = clk
        clocks[clocks.length - 1] = Number(h) * 3600 + Number(m) * 60 + Number(s)
      }
      continue
    }

    if (/^\d+\.+$/.test(token)) continue // move number, e.g. "12." or "12..."
    if (RESULT_TOKENS.has(token)) continue
    if (/^\$\d+$/.test(token)) continue // NAG token, e.g. "$1"

    clocks.push(null)
  }

  return clocks
}

export function parsePgn(pgn: string): ParsedGame {
  const game = new Chess()
  game.loadPgn(stripAnnotations(pgn))

  const headers = game.getHeaders()
  const verboseHistory = game.history({ verbose: true })

  const mainlineWithComments = stripBalanced(stripHeaderTags(pgn), '(', ')')
  const rawClocks = extractClockSeconds(mainlineWithComments)
  const clocks = rawClocks.length === verboseHistory.length ? rawClocks : verboseHistory.map(() => null)

  const replay = new Chess()
  const positions = [replay.fen()]
  const moves: ParsedMove[] = []

  verboseHistory.forEach((move, i) => {
    replay.move({ from: move.from, to: move.to, promotion: move.promotion })
    positions.push(replay.fen())
    moves.push({
      san: move.san,
      from: move.from,
      to: move.to,
      promotion: move.promotion ?? null,
      clockSeconds: clocks[i],
    })
  })

  if (moves.length === 0) {
    throw new Error('No moves found in PGN')
  }

  return { headers, moves, positions }
}
