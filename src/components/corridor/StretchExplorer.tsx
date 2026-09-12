import type { CorridorPoint, NarrowingEpisode } from '../../lib/corridor'
import type { EpisodeExplanation, Finding } from '../../lib/causes'
import { useAnalysis } from '../../context/AnalysisContext'
import './StretchExplorer.css'

const stretchKey = (episode: NarrowingEpisode) => `${episode.mover}-${episode.startPly}`

function Trend({ points }: { points: CorridorPoint[] }) {
  const max = Math.max(2, ...points.map(p => p.width))
  return <svg className="stretch-trend" viewBox="0 0 96 32" aria-hidden="true">
    <polyline points={points.map((p, i) => `${4 + i / Math.max(1, points.length - 1) * 88},${28 - p.width / max * 24}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
}

type Props = {
  episodes: EpisodeExplanation[]
  selectedKey: string | null
  nearOne: boolean
  onNearOne: (value: boolean) => void
  onSelect: (episode: NarrowingEpisode) => void
}

export default function StretchExplorer({ episodes, selectedKey, nearOne, onNearOne, onSelect }: Props) {
  const { game, corridor, ply, goTo } = useAnalysis()
  const finding = (f: Finding, i: number) => <button className="stretch-finding" key={`${f.kind}-${f.ply}-${i}`} onClick={() => goTo(f.ply)}>
    <span>After {Math.ceil(f.ply / 2)}{f.ply % 2 ? '.' : '…'} {game.moves[f.ply - 1]?.san}</span>
    <span>{f.text.charAt(0).toUpperCase() + f.text.slice(1)}</span>
  </button>

  return <section className="stretch-explorer" aria-labelledby="stretch-heading">
    <div className="stretch-heading"><div><h2 id="stretch-heading">Where options narrowed</h2>
      <p>Follow stretches where a player’s effective choices dwindled over several decisions.</p></div>
      <label><input type="checkbox" checked={nearOne} onChange={e => onNearOne(e.target.checked)} /> Ends near one choice</label>
    </div>
    <p className="stretch-caption">{episodes.length} {episodes.length === 1 ? 'stretch' : 'stretches'} · In game order{nearOne ? ' · Ends with at most 2 effective choices' : ''}</p>
    {!episodes.length && <p className="stretch-empty">{nearOne ? 'No stretches end near one choice for this player filter. Clear the checkbox to see all stretches.' : 'No narrowing stretches detected for this player filter.'}</p>}
    <div className="stretch-list">{episodes.map(({ episode, findings }) => {
      const key = stretchKey(episode)
      const selected = key === selectedKey
      const points = (corridor ?? []).filter(p => p.mover === episode.mover && p.ply >= episode.startPly && p.ply <= episode.endPly)
      const start = episode.startPly - 1
      const end = episode.endPly
      const inStretch = ply >= start && ply <= end
      const max = Math.max(2, ...points.map(p => p.width))
      return <article className={`stretch-item${selected ? ' is-selected' : ''}`} key={key} id={`stretch-${key}`}>
        <button className="stretch-row" aria-expanded={selected} aria-controls={`stretch-detail-${key}`} onClick={() => onSelect(episode)}>
          <span className={`stretch-player is-${episode.mover}`}><span aria-hidden="true">●</span> {episode.mover === 'white' ? 'White' : 'Black'}<small>{game.headers[episode.mover === 'white' ? 'White' : 'Black']}</small></span>
          <strong>Moves {Math.ceil(episode.startPly / 2)}–{Math.ceil(episode.endPly / 2)}</strong>
          <Trend points={points} />
          <span className="stretch-width"><strong>{episode.startWidth.toFixed(1)} → {episode.endWidth.toFixed(1)}</strong><small>effective choices</small></span>
          <span aria-hidden="true">{selected ? '−' : '+'}</span>
        </button>
        {selected && <div className="stretch-detail" id={`stretch-detail-${key}`}>
          <h3>{episode.mover === 'white' ? 'White' : 'Black'}’s options narrowed over {episode.decisions} decisions</h3>
          <p className="stretch-caption">Select a decision to see the position before that move. The trend measures options, not difficulty or whether the position is winning.</p>
          <div className="stretch-decisions" aria-label="Choices during selected stretch">{points.map(p => <button key={p.index} aria-pressed={ply === p.index} onClick={() => goTo(p.index)} aria-label={`${Math.ceil(p.ply / 2)}${p.mover === 'white' ? '.' : '...'} ${p.san}, ${p.width.toFixed(1)} effective choices`}>
            <strong>{p.width.toFixed(1)}</strong><span className="stretch-bar-track"><span style={{ height: `${Math.max(3, p.width / max * 100)}%` }} /></span><span>{Math.ceil(p.ply / 2)}{p.mover === 'white' ? '.' : '…'} {p.san}</span>
          </button>)}</div>
          <div className="stretch-playback">
            <button onClick={() => goTo(start)}>Review stretch</button>
            <button aria-label="Previous stretch move" disabled={!inStretch || ply === start} onClick={() => goTo(Math.max(start, ply - 1))}>← Previous</button>
            <button aria-label="Next stretch move" disabled={!inStretch || ply === end} onClick={() => goTo(Math.min(end, ply + 1))}>Next →</button>
            <span role="status">{!inStretch ? 'Board is outside this stretch' : ply === start ? 'Start position' : `${ply === end ? 'End of stretch · ' : ''}After ${Math.ceil(ply / 2)}${ply % 2 ? '.' : '…'} ${game.moves[ply - 1]?.san}`}<small>Includes both players’ moves</small></span>
          </div>
          <div className="stretch-findings"><h4>Nearby board changes</h4>
            {findings.length ? finding(findings[0], 0) : <p>No structural change met the detection thresholds.</p>}
            {findings.length > 1 && <details><summary>More board changes ({findings.length - 1})</summary>{findings.slice(1).map(finding)}</details>}
            <p className="stretch-caption">These changes occurred near the stretch; they do not establish why choices narrowed.</p>
          </div>
        </div>}
      </article>
    })}</div>
  </section>
}
