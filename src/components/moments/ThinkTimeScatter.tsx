import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { moveLabel } from '../../lib/moments'
import type { DecisionNode } from '../../lib/moveGraph'
import type { ParsedGame } from '../../lib/pgn'
import { CHOICE_TEXT } from './labels'

type Props = {
  game: ParsedGame
  /** Decisions already filtered to the visible side(s). */
  decisions: DecisionNode[]
  selected: number
  hover: number | null
  onHover: (index: number | null) => void
  onSelect: (index: number) => void
  brushed: Set<number>
  onBrush: (indices: Set<number>) => void
  reviewed: Set<number>
}

const H = 300
const PAD = { left: 52, right: 16, top: 16, bottom: 36 }

type Dot = { d: DecisionNode; seconds: number; width: number; cx: number; cy: number }

/**
 * Where the clock went, against where it was needed.
 *
 * The Report tab's clock chart shows time remaining; the time a move actually
 * took is only its slope, and never sits next to how hard the position was.
 * Here each move is placed by both. The top-left corner — few real choices,
 * a few seconds spent — is where rushing shows up.
 */
export default function ThinkTimeScatter({ game, decisions, selected, hover, onHover, onSelect, brushed, onBrush, reviewed }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  // Drawn at the width it's given rather than scaled, so text stays its size
  // and a wide screen gets a wider plot instead of a taller one.
  const [frame, setFrame] = useState<HTMLDivElement | null>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    if (!frame) return
    const observer = new ResizeObserver(([entry]) => setW(Math.max(300, Math.floor(entry.contentRect.width))))
    observer.observe(frame)
    return () => observer.disconnect()
  }, [frame])
  const increment = Number(game.headers.TimeControl?.split('+')[1] ?? 0) || 0
  const clocks = game.moves.map((m) => m.clockSeconds)

  const raw = decisions.flatMap((d) => {
    const now = clocks[d.index]
    const before = d.index >= 2 ? clocks[d.index - 2] : null
    if (now == null || before == null) return []
    return [{ d, seconds: Math.max(0, before - now + increment), width: d.softWidth ?? d.corridorWidth }]
  })
  if (!raw.length) return null

  const sorted = raw.map((r) => r.seconds).sort((a, b) => a - b)
  const cap = Math.max(5, sorted[Math.floor((sorted.length - 1) * 0.98)])
  const maxWidth = Math.max(4, ...raw.map((r) => r.width))
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const xs = (s: number) => PAD.left + Math.sqrt(Math.min(s, cap) / cap) * plotW
  // Few choices at the top: "hard" reads as up.
  const ys = (w: number) => PAD.top + (Math.log2(Math.max(1, w)) / Math.log2(maxWidth)) * plotH
  const dots: Dot[] = raw.map((r) => ({ ...r, cx: xs(r.seconds), cy: ys(r.width) }))

  const toSvg = (e: ReactPointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H }
  }
  const color = (d: DecisionNode) =>
    d.choice === 'outside' ? 'var(--status-critical)' : d.choice === 'best' ? 'var(--status-good)' : d.choice === 'inside' ? 'var(--brass)' : 'var(--parchment-dim)'
  const xTicks = [0, 5, 15, 30, 60, 120, 300].filter((s) => s <= cap)
  const yTicks = [1, 2, 4, 8, 16, 32].filter((w) => w <= maxWidth)
  const active = hover !== null ? dots.find((dot) => dot.d.index === hover) : null

  return (
    <section className="think-scatter">
      <h2>Think time vs difficulty</h2>
      <p className="think-scatter__caption">
        Each dot is a move: further right took longer, higher had fewer good options. Drag a box to mark those moves on the timeline.
      </p>
      <div className="think-scatter__readout">
        {active ? (
          <>
            <strong>{moveLabel(active.d.index, active.d.san)}</strong>
            <span>{Math.round(active.seconds)}s</span>
            <span>{active.width.toFixed(1)} effective choices</span>
            {active.d.choice && <span className={`game-timeline__verdict is-${active.d.choice}`}>{CHOICE_TEXT[active.d.choice]}</span>}
          </>
        ) : brushed.size ? (
          <>
            <span>{brushed.size} moves marked on the timeline</span>
            <button type="button" className="text-command" onClick={() => onBrush(new Set())}>Clear</button>
          </>
        ) : (
          <span>Hover a dot to read it.</span>
        )}
      </div>
      <div ref={setFrame}>
        <svg
          ref={svgRef}
          className="think-scatter__svg"
          viewBox={`0 0 ${W} ${H}`}
          role="group"
          aria-label="Seconds spent against effective choices for each move"
          onPointerDown={(e) => {
            if ((e.target as Element).closest('circle')) return
            const p = toSvg(e)
            e.currentTarget.setPointerCapture(e.pointerId)
            setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
          }}
          onPointerMove={(e) => {
            if (!drag) return
            const p = toSvg(e)
            setDrag({ ...drag, x1: p.x, y1: p.y })
          }}
          onPointerUp={() => {
            if (!drag) return
            const [left, right] = [Math.min(drag.x0, drag.x1), Math.max(drag.x0, drag.x1)]
            const [top, bottom] = [Math.min(drag.y0, drag.y1), Math.max(drag.y0, drag.y1)]
            setDrag(null)
            // A click without a drag clears the marks.
            if (right - left < 4 && bottom - top < 4) return onBrush(new Set())
            onBrush(new Set(dots.filter((dot) => dot.cx >= left && dot.cx <= right && dot.cy >= top && dot.cy <= bottom).map((dot) => dot.d.index)))
          }}
          onPointerLeave={() => onHover(null)}
        >
          <rect className="think-scatter__zone" x={PAD.left} y={PAD.top} width={plotW * 0.35} height={plotH * 0.4} />
          <text className="think-scatter__zone-label" x={PAD.left + 6} y={PAD.top + 14}>Hard position, quick move</text>
          {xTicks.map((s) => (
            <g key={s}>
              <line className="game-timeline__grid" x1={xs(s)} x2={xs(s)} y1={PAD.top} y2={H - PAD.bottom} />
              <text className="game-timeline__tick" x={xs(s)} y={H - PAD.bottom + 14} textAnchor="middle">{s}s</text>
            </g>
          ))}
          {yTicks.map((w) => (
            <g key={w}>
              <line className="game-timeline__grid" x1={PAD.left} x2={W - PAD.right} y1={ys(w)} y2={ys(w)} />
              <text className="game-timeline__tick" x={PAD.left - 8} y={ys(w) + 4} textAnchor="end">{w}</text>
            </g>
          ))}
          <text className="game-timeline__tick" x={PAD.left + plotW / 2} y={H - 4} textAnchor="middle">seconds spent</text>
          <text className="game-timeline__tick" x={12} y={PAD.top + plotH / 2} textAnchor="middle" transform={`rotate(-90 12 ${PAD.top + plotH / 2})`}>effective choices</text>
          {dots.map(({ d, cx, cy }) => (
            <circle
              key={d.index}
              className={`think-scatter__dot is-${d.mover}${brushed.size && !brushed.has(d.index) ? ' is-dim' : ''}${reviewed.has(d.index) && d.index !== selected ? ' is-reviewed' : ''}${d.index === selected ? ' is-selected' : ''}${d.index === hover ? ' is-hover' : ''}`}
              cx={cx}
              cy={cy}
              r={d.index === selected ? 6 : 4.5}
              fill={color(d)}
              role="button"
              tabIndex={0}
              aria-label={`${moveLabel(d.index, d.san)}`}
              onPointerEnter={() => onHover(d.index)}
              onFocus={() => onHover(d.index)}
              onClick={() => onSelect(d.index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(d.index)
                }
              }}
            />
          ))}
          {drag && (
            <rect
              className="think-scatter__brush"
              x={Math.min(drag.x0, drag.x1)}
              y={Math.min(drag.y0, drag.y1)}
              width={Math.abs(drag.x1 - drag.x0)}
              height={Math.abs(drag.y1 - drag.y0)}
            />
          )}
        </svg>
      </div>
    </section>
  )
}
