import { useMemo } from 'react'
import InfoNote from '../components/InfoNote'
import PlayerSummary from '../components/overview/PlayerSummary'
import PhaseAccuracy from '../components/overview/PhaseAccuracy'
import MaterialChart from '../components/overview/MaterialChart'
import TimePressureChart from '../components/overview/TimePressureChart'
import CorridorChart from '../components/corridor/CorridorChart'
import CorridorHeadline from '../components/corridor/CorridorHeadline'
import CutMoments from '../components/corridor/CutMoments'
import DecisionMatrix from '../components/corridor/DecisionMatrix'
import LeverageList from '../components/corridor/LeverageList'
import { useAnalysis } from '../context/AnalysisContext'
import { computeAccuracy, computePhaseAccuracy, hasClockData } from '../lib/analysis'
import type { Side } from '../lib/analysis'
import { findCutMoments } from '../lib/corridor'
import { SURVEY_UNCERTAINTY_PCT } from '../lib/moveGraph'
import './OverviewTab.css'

function OverviewTab() {
  const { game, ply, goTo, judgments, evals, decisions, corridor, moveFilter, explanations, chains } = useAnalysis()

  const white = game.headers.White ?? 'White'
  const black = game.headers.Black ?? 'Black'

  const accuracy = useMemo(() => (judgments ? computeAccuracy(judgments) : null), [judgments])
  const phaseAccuracy = useMemo(
    () => (judgments ? computePhaseAccuracy(game.positions, judgments) : null),
    [game.positions, judgments],
  )
  const showClock = useMemo(() => hasClockData(game.moves), [game.moves])

  const filteredPoints = useMemo(() => {
    if (!corridor) return null
    return moveFilter === 'both' ? corridor : corridor.filter((p) => p.mover === moveFilter)
  }, [corridor, moveFilter])

  const filteredDecisions = useMemo(() => {
    if (!decisions) return null
    return moveFilter === 'both' ? decisions : decisions.filter((d) => d.mover === moveFilter)
  }, [decisions, moveFilter])

  const cuts = useMemo(() => (decisions ? findCutMoments(decisions) : []), [decisions])

  if (!evals || !judgments || !accuracy || !phaseAccuracy || !decisions || !corridor || !filteredPoints || !filteredDecisions) {
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

  const leverageSides: Side[] =
    moveFilter === 'both' ? ['white', 'black'] : [moveFilter as Side]

  return (
    <div className="overview">
      <CorridorHeadline decisions={decisions} whiteLabel={white} blackLabel={black} chains={chains} />

      {/* The explanations come before the chart. The chart shows that options
          collapsed; only this section says why, and the why is the deliverable. */}
      {visibleExplanations.length > 0 && (
        <section className="overview__section">
          <h3 className="overview__heading overview__heading--lead">
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
                  <span
                    className={`overview__episode-mover overview__episode-mover--${explanation.episode.mover}`}
                  >
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

      <section className="overview__section">
        <h3 className="overview__heading">
          How many real choices each position offered
          <InfoNote label="how width is measured">
            Width is the perplexity of a softmax over every legal move's win% loss — how many moves genuinely competed,
            not how many cleared a cutoff. A move on the boundary contributes a fraction of a choice rather than
            flipping a whole one, which matters because the survey runs shallow enough that a hard count would be
            reporting search noise; the hard count is carried in the tooltips with the band it spans when the tolerance
            moves by ±{SURVEY_UNCERTAINTY_PCT} win%. Shaded spans mark sustained narrowing, and the thin blue trace is
            the evaluation.
          </InfoNote>
        </h3>
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
        <h3 className="overview__heading">
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
        <h3 className="overview__heading">Only-move tests</h3>
        <CutMoments moments={visibleCuts} currentPly={ply} onSelect={goTo} whiteLabel={white} blackLabel={black} />
      </section>

      <section className="overview__section">
        <h3 className="overview__heading">Room offered, and what was done with it</h3>
        <DecisionMatrix decisions={filteredDecisions} currentPly={ply} onSelect={goTo} />
      </section>

      {/* Accuracy, phase splits, material and clock are commodity readouts every
          analysis site already provides. They are kept because they are cheap
          and occasionally wanted, and folded away because leaving them in the
          main flow diluted the one thing this app does that others don't. */}
      <details className="overview__standard">
        <summary>The usual numbers</summary>
        <div className="overview__standard-body">
          <PlayerSummary white={white} black={black} accuracy={accuracy} />
          <div className="overview__grid">
            <PhaseAccuracy white={white} black={black} phases={phaseAccuracy} />
            <MaterialChart positions={game.positions} currentPly={ply} onSelectPly={goTo} />
          </div>
          {showClock && (
            <TimePressureChart
              moves={game.moves}
              judgments={judgments}
              timeControl={game.headers.TimeControl}
              currentPly={ply}
              onSelectPly={goTo}
            />
          )}
        </div>
      </details>

    </div>
  )
}

export default OverviewTab
