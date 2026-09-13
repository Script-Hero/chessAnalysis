import { useMemo, useState } from 'react'
import type { NarrowingEpisode } from '../../lib/corridor'
import { useAnalysis } from '../../context/AnalysisContext'
import ReviewMoments from '../../components/corridor/ReviewMoments'
import GameTimeline, { type Span } from '../../components/moments/GameTimeline'
import SelectedMovePanel from '../../components/moments/SelectedMovePanel'
import ThinkTimeScatter from '../../components/moments/ThinkTimeScatter'
import { useReviewed } from '../../components/moments/useReviewed'
import { hasClockData } from '../../lib/analysis'
import { computeCompensation } from '../../lib/compensation'
import { findMoments, findSqueezes } from '../../lib/moments'
import { trackPieces } from '../../lib/pieceLanes'
import '../shared/Dashboard.css'
import '../../components/moments/moments.css'

/**
 * Step two: which moves to open.
 *
 * Worth reviewing tells the story; everything under it exists to find the moves
 * that story didn't mention. The lanes share one move axis and the whole page
 * shares one selected move, so a pin, a bar, a compensation spike and a scatter
 * dot are all ways of pointing at the same thing.
 */
export default function MomentsTab() {
  const { game, gameKey, decisions, corridor, evals, judgments, lines, survey, explanations, moveFilter, decisionIndex, studyDecision, goTo } = useAnalysis()
  const [hover, setHover] = useState<number | null>(null)
  const [highlight, setHighlight] = useState<Span | null>(null)
  const [brushed, setBrushed] = useState<Set<number>>(new Set())
  const [episodeKey, setEpisodeKey] = useState<string | null>(null)
  const { reviewed, markReviewed } = useReviewed(gameKey)

  const moments = useMemo(
    () => (evals && judgments && lines ? findMoments({ game, evals, judgments, lines, decisions, explanations }, moveFilter) : null),
    [game, evals, judgments, lines, decisions, explanations, moveFilter],
  )
  const squeezes = useMemo(() => (evals && decisions ? [...findSqueezes(evals, decisions).values()] : []), [evals, decisions])
  const compensation = useMemo(() => (evals ? computeCompensation(evals, game.positions) : null), [evals, game.positions])
  const pieces = useMemo(() => trackPieces(game), [game])

  if (!decisions || !corridor) return <p>Analyzing decisions...</p>

  const shows = (side: 'white' | 'black') => moveFilter === 'both' || side === moveFilter
  const sides = (['white', 'black'] as const).filter(shows)
  const own = decisions.filter((d) => shows(d.mover))
  const points = corridor.filter((p) => shows(p.mover))
  const episodes = (explanations ?? []).map((e) => e.episode).filter((e) => shows(e.mover))
  const selectedEpisode = episodes.find((e) => `${e.mover}-${e.startPly}` === episodeKey) ?? null

  const select = (index: number) => {
    setEpisodeKey(null)
    goTo(index)
  }
  const selectEpisode = (episode: NarrowingEpisode) => {
    setEpisodeKey(`${episode.mover}-${episode.startPly}`)
    goTo(episode.startPly - 1)
  }
  const open = (index: number) => {
    markReviewed(index)
    studyDecision(index)
  }
  const span = highlight ?? (selectedEpisode ? { from: selectedEpisode.startPly - 1, to: selectedEpisode.endPly } : null)

  return (
    <div className="overview moments-overview">
      <ReviewMoments moments={moments} onHover={setHighlight} reviewed={reviewed} onOpen={open} />

      <section>
        <h2>Game timeline</h2>
        <GameTimeline
          game={game}
          sides={sides}
          points={points}
          decisions={decisions}
          episodes={episodes}
          moments={moments ?? []}
          squeezes={squeezes}
          compensation={compensation}
          pieces={pieces.filter((l) => shows(l.side))}
          selected={decisionIndex}
          hover={hover}
          onHover={setHover}
          onSelect={select}
          highlight={span}
          brushed={brushed}
          reviewed={reviewed}
          selectedEpisode={selectedEpisode}
          onSelectEpisode={selectEpisode}
        />
        <SelectedMovePanel
          game={game}
          index={decisionIndex}
          decision={decisions[decisionIndex] ?? null}
          survey={survey?.[decisionIndex] ?? null}
          squeeze={squeezes.find((s) => s.target === decisionIndex) ?? null}
          reviewed={reviewed.has(decisionIndex)}
          onSelect={select}
          onOpen={open}
        />
      </section>

      {hasClockData(game.moves) && (
        <ThinkTimeScatter
          game={game}
          decisions={own}
          selected={decisionIndex}
          hover={hover}
          onHover={setHover}
          onSelect={select}
          brushed={brushed}
          onBrush={setBrushed}
          reviewed={reviewed}
        />
      )}
    </div>
  )
}
