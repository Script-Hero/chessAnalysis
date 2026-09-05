import { useMemo } from 'react'
import InfoNote from '../../components/InfoNote'
import MoveBadge from '../../components/MoveBadge'
import CorridorChart from '../../components/corridor/CorridorChart'
import CutMoments from '../../components/corridor/CutMoments'
import DecisionMatrix from '../../components/corridor/DecisionMatrix'
import LeverageList from '../../components/corridor/LeverageList'
import { useAnalysis } from '../../context/AnalysisContext'
import type { Side } from '../../lib/analysis'
import { findCutMoments } from '../../lib/corridor'
import { SURVEY_UNCERTAINTY_PCT } from '../../lib/moveGraph'
import '../shared/Dashboard.css'

/**
 * Step two: which moves decided it.
 *
 * Everything here is a list of plies, and every entry is a link onto the board.
 * The ranked list comes first because it is the shortlist a player actually
 * works from; the charts that justify the ranking come after it, not before.
 * The bar at the top of the tab is the hand-off to step three — it names the
 * move currently on the board and offers to open it.
 */
function MomentsTab() {
  const { game, ply, goTo, judgments, evals, decisions, corridor, moveFilter, explanations, chains, setActiveTab } =
    useAnalysis()

  const white = game.headers.White ?? 'White'
  const black = game.headers.Black ?? 'Black'

  const filteredPoints = useMemo(() => {
    if (!corridor) return null
    return moveFilter === 'both' ? corridor : corridor.filter((p) => p.mover === moveFilter)
  }, [corridor, moveFilter])

  const filteredDecisions = useMemo(() => {
    if (!decisions) return null
    return moveFilter === 'both' ? decisions : decisions.filter((d) => d.mover === moveFilter)
  }, [decisions, moveFilter])

  const cuts = useMemo(() => (decisions ? findCutMoments(decisions) : []), [decisions])

  if (!evals || !judgments || !decisions || !corridor || !filteredPoints || !filteredDecisions) {
    return (
      <div className="overview">
        <div className="overview__pending">
          <span className="spinner" aria-hidden="true" />
          The engine is still working through the game.
        </div>
      </div>
    )
  }

  const visibleExplanations = (explanations ?? []).filter(
    (e) => moveFilter === 'both' || e.episode.mover === moveFilter,
  )
  const visibleEpisodes = visibleExplanations.map((e) => e.episode)
  const visibleCuts = moveFilter === 'both' ? cuts : cuts.filter((c) => c.mover === moveFilter)

  const leverageSides: Side[] = moveFilter === 'both' ? ['white', 'black'] : [moveFilter as Side]

  const selected = ply > 0 ? game.moves[ply - 1] : null
  const selectedLabel = selected
    ? ply % 2 === 1
      ? `${Math.floor((ply - 1) / 2) + 1}.${selected.san}`
      : `${Math.floor((ply - 1) / 2) + 1}…${selected.san}`
    : null

  return (
    <div className="overview">

      {/* The hand-off. It follows the board rather than the list, so whichever
          entry was last clicked is the one this offers to open. */}
      <div className="step-handoff">
        {selectedLabel ? (
          <p className="step-handoff__move">
            On the board: <strong>{selectedLabel}</strong>
            <MoveBadge judgment={judgments[ply - 1]} />
          </p>
        ) : (
          <p className="step-handoff__move step-handoff__move--empty">Nothing selected — pick a move from a list below.</p>
        )}
        <button
          type="button"
          className="step-next__button"
          onClick={() => setActiveTab('move')}
          disabled={selectedLabel === null}
        >
          03 · Study this move →
        </button>
      </div>
      <section className="overview__section">
        <h3 className="overview__heading">
          How many real choices each position offered
          <InfoNote label="how width is measured">
            <strong>Width</strong> is a perplexity — a softmax over every legal move&rsquo;s win% loss, read as how
            many moves genuinely competed rather than how many cleared a cutoff. It is continuous on purpose: a move
            sitting on the boundary counts as a fraction of a choice instead of flipping a whole one, because the
            survey runs shallow enough that a hard count sliding between 3 and 4 would be reporting search noise.
            <br />
            <br />
            The hard count is still there, in the readout above the chart, with the band it spans when the tolerance
            moves by ±{SURVEY_UNCERTAINTY_PCT} win%.
            <br />
            <br />
            The scale is logarithmic — every gridline is double the one below it — so &ldquo;the corridor halved&rdquo;
            is the same size of drop wherever in the game it happens.
          </InfoNote>
        </h3>
        <p className="overview__lede">
          One bar per move: the taller it is, the more moves were genuinely playable. Bars rise for White and drop for
          Black, and the colour is what was actually played. Shaded spans are stretches where a side&rsquo;s options
          only ever narrowed — red where the run ended with the player stepping out.
        </p>
        <CorridorChart
          points={filteredPoints}
          decisions={filteredDecisions}
          episodes={visibleEpisodes}
          evals={evals}
          currentPly={ply}
          onSelect={goTo}
        />
      </section>

      <section className="overview__section">
        <h3 className="overview__heading">Room offered, and what was done with it</h3>
        <DecisionMatrix decisions={filteredDecisions} currentPly={ply} onSelect={goTo} />
      </section>

      <section className="overview__section">
        <h3 className="overview__heading overview__heading--lead">
          What was worth fixing
          <InfoNote label="how decisions are ranked">
            The game is solved as an absorbing Markov chain: states are the positions it occupied, transitions are a
            softmax over move quality, and every move not played absorbs at its own evaluation. Each number is what the
            move gained or lost against what a player of this strength would have averaged in the same position, so
            both sides' terms sum exactly to the swing the game actually took. A blunder in an already-decided position
            ranks below a small slip in one still worth playing.
          </InfoNote>
        </h3>
        <div className="overview__leverage">
          {chains ? (
            leverageSides.map((side) => (
              <div key={side} className="overview__leverage-side">
                <h4 className={`overview__leverage-name overview__leverage-name--${side}`}>
                  {side === 'white' ? white : black}
                </h4>
                <LeverageList
                  chain={chains[side]}
                  label={side === 'white' ? white : black}
                  currentPly={ply}
                  onSelect={goTo}
                />
              </div>
            ))
          ) : (
            <p className="overview__lede">No chain was solved for this game.</p>
          )}
        </div>
      </section>

      <section className="overview__section">
        <h3 className="overview__heading">The moves there was only one of</h3>
        <p className="overview__lede">
          Positions where a single move held and everything else lost ground. Whether each was found is the sharpest
          read on how the game was played.
        </p>
        <CutMoments moments={visibleCuts} currentPly={ply} onSelect={goTo} whiteLabel={white} blackLabel={black} />
      </section>

      {visibleExplanations.length > 0 && (
        <section className="overview__section">
          <h3 className="overview__heading">
            Where the position closed, and what closed it
            <InfoNote label="how causes are attributed">
              Each run is a stretch over which one side's options only ever narrowed. The sentence after it names the
              structural event that accounts for it — a defence that ran short, control collapsing onto one piece, the
              network being rebuilt — located by ply and ranked against the game's own baseline rather than against a
              fixed threshold.
            </InfoNote>
          </h3>
          <ul className="overview__explanations">
            {visibleExplanations.map((explanation) => (
              <li
                key={`${explanation.episode.mover}-${explanation.episode.startPly}`}
                className={explanation.episode.collapsed ? 'is-collapsed' : ''}
              >
                <button type="button" onClick={() => goTo(explanation.episode.startPly - 1)}>
                  <span className={`overview__episode-mover overview__episode-mover--${explanation.episode.mover}`}>
                    {explanation.episode.mover === 'white' ? white : black}
                  </span>
                  <span className="overview__explanation-text">{explanation.summary}</span>
                </button>
                {explanation.findings.length > 2 && (
                  <ul className="overview__findings">
                    {explanation.findings.slice(2).map((finding, i) => (
                      <li key={`${finding.kind}-${i}`}>{finding.text}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}


      <footer className="step-next">
        <p className="step-next__text">Got a move worth understanding? Step three is where it gets taken apart.</p>
        <button type="button" className="step-next__button" onClick={() => setActiveTab('move')}>
          03 · Inside the move →
        </button>
      </footer>
    </div>
  )
}

export default MomentsTab
