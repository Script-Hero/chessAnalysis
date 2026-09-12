import { useState } from 'react'
import StretchExplorer from '../../components/corridor/StretchExplorer'
import type { NarrowingEpisode } from '../../lib/corridor'
import { useAnalysis } from '../../context/AnalysisContext'
import CorridorChart from '../../components/corridor/CorridorChart'
import ReviewMoments from '../../components/corridor/ReviewMoments'
import DecisionMatrix from '../../components/corridor/DecisionMatrix'
import CutMoments from '../../components/corridor/CutMoments'
import LeverageList from '../../components/corridor/LeverageList'
import { findCutMoments } from '../../lib/corridor'
import '../shared/Dashboard.css'

const stretchKey = (episode: NarrowingEpisode) => `${episode.mover}-${episode.startPly}`

export default function MomentsTab() {
  const { game, decisions, corridor, evals, explanations, chains, moveFilter, decisionIndex, studyDecision, goTo } = useAnalysis()
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [nearOne, setNearOne] = useState(false)
  if (!decisions || !corridor) return <p>Analyzing decisions...</p>
  const own = decisions.filter(d => moveFilter === 'both' || d.mover === moveFilter)
  const points = corridor.filter(d => moveFilter === 'both' || d.mover === moveFilter)
  const episodes = (explanations ?? []).filter(e => (moveFilter === 'both' || e.episode.mover === moveFilter) && (!nearOne || e.episode.endWidth <= 2))
  const selected = episodes.find(e => stretchKey(e.episode) === selectedKey)?.episode ?? null
  const selectStretch = (episode: NarrowingEpisode, reveal = false) => {
    setSelectedKey(stretchKey(episode))
    goTo(episode.startPly - 1)
    if (reveal) requestAnimationFrame(() => document.getElementById(`stretch-${stretchKey(episode)}`)?.scrollIntoView({ block: 'nearest' }))
  }
  const selectDecision = (index: number) => {
    const episode = episodes.find(e => e.episode.mover === corridor.find(p => p.index === index)?.mover && index >= e.episode.startPly - 1 && index < e.episode.endPly)?.episode
    setSelectedKey(episode ? stretchKey(episode) : null)
    goTo(index)
  }
  const peak = Math.max(1, ...Object.values(chains ?? {}).flatMap(c => c.ranked.map(p => p.leverage)))
  return <div className="overview moments-overview">
    <ReviewMoments />
    <section><h2>Choices across the game</h2><CorridorChart points={points} decisions={own} episodes={episodes.map(e => e.episode)} evals={evals} currentPly={decisionIndex} onSelect={selectDecision} selectedEpisode={selected} onSelectEpisode={episode => selectStretch(episode, true)} /></section>
    <details className="method-details"><summary>Decision breakdown</summary><DecisionMatrix decisions={own} currentPly={decisionIndex} onSelect={studyDecision} /></details>
    <details className="method-details"><summary>Effectively one-choice decisions</summary><CutMoments moments={findCutMoments(own)} currentPly={decisionIndex} onSelect={studyDecision} whiteLabel={game.headers.White ?? 'White'} blackLabel={game.headers.Black ?? 'Black'} /></details>
    {chains && <details className="method-details"><summary>Model-based impact ranking</summary><p>Expected-value changes under a fixed softmax policy, in percentage points. This baseline is not fitted to either player. Each side uses its own outcome perspective.</p><div className="overview__leverage">{(['white','black'] as const).filter(side => moveFilter === 'both' || side === moveFilter).map(side => <section key={side}><h3>{side === 'white' ? game.headers.White : game.headers.Black}</h3><LeverageList chain={chains[side]} label={side} currentPly={decisionIndex} onSelect={studyDecision} scale={peak} /></section>)}</div></details>}
  </div>
}
