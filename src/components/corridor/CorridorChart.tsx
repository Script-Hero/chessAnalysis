import { useEffect, useRef, useState } from 'react'
import type { CorridorPoint, NarrowingEpisode } from '../../lib/corridor'
import type { DecisionNode } from '../../lib/moveGraph'
import type { PositionEval } from '../../lib/stockfish'
import './CorridorChart.css'

type Props = { points: CorridorPoint[]; decisions: DecisionNode[]; episodes: NarrowingEpisode[]; evals: PositionEval[] | null; currentPly: number; onSelect: (index: number) => void; selectedEpisode?: NarrowingEpisode | null; onSelectEpisode?: (episode: NarrowingEpisode) => void }
export default function CorridorChart({points, decisions, episodes, evals, currentPly, onSelect, selectedEpisode, onSelectEpisode}: Props) {
  const [hover, setHover] = useState<number | null>(null)
  // The chart fills the column it's given: the pixel width per move is a floor,
  // not the drawing width, so a short game spreads out instead of sitting in a
  // 640px box, and a long one still scrolls.
  const scrollRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(0)
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setAvailable(Math.floor(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const selected = points.find(p => p.index === (hover ?? currentPly)) ?? points[0]
  const maxMove = Math.max(1, ...points.map(p => Math.ceil(p.ply / 2)))
  const width = Math.max(available, 640, maxMove * 14)
  const x = (ply: number) => 48 + (Math.ceil(ply / 2) - 0.5) / maxMove * (width - 64)
  const maxWidth = Math.max(2, ...points.map(p => p.width))
  const height = (n: number) => Math.log2(Math.max(1, n)) / Math.log2(maxWidth) * 75
  const sides = (['white','black'] as const).filter(s => points.some(p => p.mover === s))
  return <div className="choice-timeline">
    <div className="timeline-readout">{selected && <><strong>{Math.ceil(selected.ply / 2)}{selected.mover === 'white' ? '.' : '...'} {selected.san}</strong><span>{selected.width.toFixed(1)} effective choices</span><span>{selected.countedWidth} acceptable moves</span><span>Before: {evals?.[selected.index]?.mateIn != null ? `mate ${evals[selected.index].mateIn}` : `${evals?.[selected.index]?.score.toFixed(2) ?? '-'} pawns (White)`}</span><button onClick={() => onSelect(selected.index)}>Review decision</button></>}</div>
    <div className="timeline-scroll" ref={scrollRef} tabIndex={0} aria-label="Choice timelines">
      <svg width={width} height={sides.length * 130 + 36} role="group" aria-label="Effective choices by player and move">
        {sides.map((side, lane) => {
          const base = lane * 130 + 105
          return <g key={side}><text x={48} y={base - 88} fill="currentColor">{side === 'white' ? 'White' : 'Black'}</text>
            {[1,2,4,8,16,32].filter(n => n <= maxWidth).map(n => <g key={n}><line x1={48} x2={width-16} y1={base-height(n)} y2={base-height(n)} stroke="var(--rule)" /><text x={8} y={base-height(n)+4} fill="var(--parchment-dim)" fontSize={12}>{n}</text></g>)}
            {episodes.filter(e => e.mover === side).map(e => {
              const active = selectedEpisode?.mover === e.mover && selectedEpisode.startPly === e.startPly
              return <g key={e.startPly} role={onSelectEpisode ? 'button' : undefined} tabIndex={onSelectEpisode ? 0 : undefined} aria-label={`${side === 'white' ? 'White' : 'Black'} narrowing stretch, moves ${Math.ceil(e.startPly / 2)} to ${Math.ceil(e.endPly / 2)}`} aria-pressed={active} onClick={() => onSelectEpisode?.(e)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectEpisode?.(e) } }}>
                <rect x={x(e.startPly)-6} y={base-80} width={Math.max(12,x(e.endPly)-x(e.startPly)+12)} height={84} fill={active ? 'rgba(232,195,117,.22)' : 'var(--wash)'} stroke={active ? 'var(--brass-bright)' : 'none'} />
                <rect x={x(e.startPly)-6} y={base+22} width={Math.max(12,x(e.endPly)-x(e.startPly)+12)} height={10} rx={3} fill={active ? 'var(--brass-bright)' : 'var(--brass)'} />
              </g>
            })}
            {points.filter(p => p.mover === side).map(p => {
              const d = decisions.find(d => d.index === p.index)
              const loss = d?.choice === 'outside'
              return <g key={p.index} role="button" tabIndex={0} aria-label={`${Math.ceil(p.ply/2)} ${side} ${p.san}, ${p.width.toFixed(1)} effective choices${loss ? ', outside tolerance' : ''}`} onMouseEnter={() => setHover(p.index)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p.index)} onBlur={() => setHover(null)} onClick={() => onSelect(p.index)} onKeyDown={e => { if(e.key === 'Enter' || e.key === ' ') {e.preventDefault();onSelect(p.index)} }}>
                <rect x={x(p.ply)-6} y={base-80} width={12} height={86} fill="transparent" />
                <rect x={x(p.ply)-3} y={base-Math.max(3,height(p.width))} width={6} height={Math.max(3,height(p.width))} fill={loss ? 'var(--status-critical)' : side === 'white' ? 'var(--white-accent)' : 'var(--black-accent)'} />
                {loss && <text x={x(p.ply)} y={base+16} textAnchor="middle" fill="var(--status-critical)" fontSize={12}>×</text>}
                {p.index === currentPly && <line x1={x(p.ply)} x2={x(p.ply)} y1={base-80} y2={base+4} stroke="var(--parchment)" strokeDasharray="3 3" />}
              </g>
            })}
          </g>
        })}
        {Array.from({length:Math.ceil(maxMove/5)},(_,i) => i*5+1).map(n => <text key={n} x={x(n*2-1)} y={sides.length*130+24} fill="var(--parchment-dim)" fontSize={12}>{n}</text>)}
      </svg>
    </div>
    <p className="timeline-key">Move number · effective choices (log scale) · × outside tolerance · gold interval markers: select a narrowing stretch</p>
    <details><summary>How choices are estimated</summary><p>Quality-weighted choices from the depth-8 survey. A width near one means effectively one choice, not necessarily one legal move or a difficult decision. Acceptable moves are within 10 percentage points of the best estimate. Width describes options relative to the best move, including in lost positions.</p></details>
  </div>
}
