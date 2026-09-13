import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { moveLabel, type Squeeze } from '../../lib/moments'
import { CORRIDOR_TOLERANCE_PCT, type DecisionNode } from '../../lib/moveGraph'
import type { ParsedGame } from '../../lib/pgn'
import type { SurveyPosition } from '../../lib/stockfish'
import { CHOICE_TEXT } from './labels'

type Props = {
  game: ParsedGame
  index: number
  decision: DecisionNode | null
  survey: SurveyPosition | null
  squeeze: Squeeze | null
  reviewed: boolean
  onSelect: (index: number) => void
  onOpen: (index: number) => void
}

const PAD = 16
const ROW = 9
const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${tail}`
}

/**
 * The selected move against every move that was legal there.
 *
 * The timeline says how much room a position offered; this shows the room
 * itself. A lone dot at the right edge is an only move; a ring far to the left
 * of the pack is a miss. It sits under the timeline rather than in a tooltip
 * because thirty dots need more space than a hover card can give.
 */
export default function SelectedMovePanel({ game, index, decision, survey, squeeze, reviewed, onSelect, onOpen }: Props) {
  const [hoverUci, setHoverUci] = useState<string | null>(null)
  // Drawn at the width it's given rather than scaled, so text stays its size.
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => setW(Math.max(300, Math.floor(entry.contentRect.width))))
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frame])
  const move = game.moves[index]
  if (!move) return null
  const label = moveLabel(index, move.san)
  const side = index % 2 ? 'Black' : 'White'
  const scored = survey?.moves ?? []

  // Zoom to where the moves actually are: in a lost position every move sits
  // below 10%, and a 0-100 axis would crush the whole spread into one column.
  const wins = scored.map((m) => m.winProb)
  let lo = wins.length ? Math.max(0, Math.min(...wins) - 4) : 0
  let hi = wins.length ? Math.min(100, Math.max(...wins) + 4) : 100
  if (hi - lo < 20) {
    lo = Math.max(0, Math.min(80, (lo + hi) / 2 - 10))
    hi = lo + 20
  }
  const x = (win: number) => PAD + ((win - lo) / (hi - lo)) * (W - 2 * PAD)
  const step = hi - lo <= 25 ? 5 : hi - lo <= 50 ? 10 : 25
  const ticks = Array.from({ length: Math.floor(hi / step) - Math.ceil(lo / step) + 1 }, (_, k) => (Math.ceil(lo / step) + k) * step)

  // Stack dots that would overlap. The played move is placed first so its ring
  // always sits on the baseline, then the rest best first.
  const rows: number[][] = []
  const order = [...scored].sort((a, b) => Number(b.uci === decision?.uci) - Number(a.uci === decision?.uci))
  const placed = order.map((m) => {
    const cx = x(m.winProb)
    let row = rows.findIndex((xs) => xs.every((other) => Math.abs(other - cx) >= ROW))
    if (row === -1) row = rows.push([]) - 1
    rows[row].push(cx)
    return { m, cx, row }
  })
  const depth = Math.min(8, Math.max(1, rows.length))
  const top = 40
  const base = top + depth * ROW
  const H = base + 30
  const best = scored[0]
  const safeFrom = best ? x(Math.max(lo, best.winProb - CORRIDOR_TOLERANCE_PCT)) : 0
  const anchor = (px: number) => (px < W * 0.2 ? 'start' : px > W * 0.8 ? 'end' : 'middle')
  const hovered = placed.find((p) => p.m.uci === hoverUci)
  const played = placed.find((p) => p.m.uci === decision?.uci)

  return (
    <section ref={setFrame} className="selected-move" aria-label={`Selected move ${label}`}>
      <header className="selected-move__head">
        <div>
          <p className="selected-move__eyebrow">Selected move</p>
          <h3>
            <span className={`selected-move__side is-${side.toLowerCase()}`}>● {side}</span> {label}
            {reviewed && <span className="game-timeline__tag is-muted">Reviewed</span>}
          </h3>
        </div>
        <button type="button" className="selected-move__open" onClick={() => onOpen(index)}>
          Open in The Move <ArrowRight size={16} />
        </button>
      </header>

      {scored.length && decision ? (
        <>
          <p className="selected-move__summary">
            {decision.corridorWidth} of {decision.legalCount} moves kept the position
            {decision.playedRank != null && decision.playedLossPct != null && (
              <>
                {' · '}played {move.san}
                {decision.playedRank === 1 ? ', the best move' : `, ${ordinal(decision.playedRank)} best, −${Math.round(decision.playedLossPct)}%`}
                {decision.choice && decision.choice !== 'best' && ` (${CHOICE_TEXT[decision.choice]})`}
              </>
            )}
          </p>
          <svg className="selected-move__spread" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Win chances for each of the ${scored.length} legal moves`}>
            {best && <rect className="selected-move__safe" x={safeFrom} y={top - 6} width={x(best.winProb) - safeFrom + 5} height={base - top + 12} />}
            <line className="selected-move__axis" x1={PAD} x2={W - PAD} y1={base + 8} y2={base + 8} />
            {ticks.map((v) => (
              <text key={v} className="selected-move__tick" x={x(v)} y={H - 6} textAnchor="middle">{v}%</text>
            ))}
            {best && (
              <text className="selected-move__label is-best" x={x(best.winProb)} y={12} textAnchor={anchor(x(best.winProb))}>
                best {best.san} {Math.round(best.winProb)}%
              </text>
            )}
            {played && played.m.uci !== best?.uci && (
              <>
                <line className="selected-move__leader" x1={played.cx} x2={played.cx} y1={30} y2={base - 7} />
                <text className="selected-move__label is-played" x={played.cx} y={26} textAnchor={anchor(played.cx)}>
                  played {played.m.san} {Math.round(played.m.winProb)}%
                </text>
              </>
            )}
            {placed.filter((p) => p.row < depth).map(({ m, cx, row }) => (
              <circle
                key={m.uci}
                className={`selected-move__dot${m.uci === decision.uci ? ' is-played' : ''}${m.lossPct > CORRIDOR_TOLERANCE_PCT ? ' is-outside' : ''}`}
                cx={cx}
                cy={base - row * ROW}
                r={m.uci === decision.uci ? 5.5 : 3.5}
                onPointerEnter={() => setHoverUci(m.uci)}
                onPointerLeave={() => setHoverUci(null)}
              >
                <title>{`${m.san} · ${Math.round(m.winProb)}%`}</title>
              </circle>
            ))}
          </svg>
          <p className="selected-move__hint">
            {hovered
              ? `${hovered.m.san}: ${Math.round(hovered.m.winProb)}% for ${side}${hovered.m.lossPct > 0 ? `, ${Math.round(hovered.m.lossPct)}% worse than best` : ', the best move'}`
              : `Each dot is a legal move, placed by ${side}'s win chances after it. Shaded: within ${CORRIDOR_TOLERANCE_PCT}% of the best move.`}
          </p>
        </>
      ) : (
        <p className="selected-move__summary">No move survey for this position.</p>
      )}

      {squeeze && (
        <p className="selected-move__cause">
          Options cut to {Math.max(1, Math.round(squeeze.to))} (usually about {Math.round(squeeze.from)}) by{' '}
          <button type="button" className="review-moment__ref" onClick={() => onSelect(squeeze.setter)}>
            {moveLabel(squeeze.setter, game.moves[squeeze.setter].san)}
          </button>
        </p>
      )}
    </section>
  )
}
