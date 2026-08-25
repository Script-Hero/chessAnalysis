import { useMemo } from 'react'
import InfoNote from '../components/InfoNote'
import PieceGraphView from '../components/network/PieceGraphView'
import MetricStat from '../components/network/MetricStat'
import PercolationChart from '../components/network/PercolationChart'
import CoordinationChart from '../components/network/CoordinationChart'
import ChurnChart from '../components/network/ChurnChart'
import { useAnalysis } from '../context/AnalysisContext'
import { findPressurePoints } from '../lib/causes'
import { coordinationSeries } from '../lib/structure'
import type { Side } from '../lib/analysis'
import './StructureTab.css'

const PIECE_WORD: Record<string, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

function moveNumber(ply: number): string {
  return String(Math.ceil(ply / 2))
}

/**
 * The position read as a set of graphs over the same board.
 *
 * Ordered by what a player can do with it. The pressure points come first
 * because they are the only section that states a plan; the graph drawing comes
 * second because it is where that plan is checked; the measures come last,
 * each against a null model, because they are evidence rather than conclusions.
 */
function StructureTab() {
  const { game, ply, goTo, structure, robustness, temporal, orientation } = useAnalysis()

  const white = game.headers.White ?? 'White'
  const black = game.headers.Black ?? 'Black'
  const nameOf = (side: Side) => (side === 'white' ? white : black)

  const series = useMemo(() => coordinationSeries(game.positions), [game.positions])

  const pressure = useMemo(() => {
    if (!structure) return { white: [], black: [] }
    const build = (side: Side) =>
      findPressurePoints(
        structure.flow[side].deflections,
        structure.incidence[side].pieces,
        robustness?.[side].criticality ?? [],
      )
    return { white: build('white'), black: build('black') }
  }, [structure, robustness])

  if (!structure) {
    return <p className="structure__empty">No position on the board.</p>
  }

  const sideSection = (side: Side) => {
    const flow = structure.flow[side]
    const points = pressure[side]
    const trapped = structure.trapped[side]
    const king = structure.king[side]

    return (
      <section className="structure__side" key={side}>
        <h4 className={`structure__side-name structure__side-name--${side}`}>{nameOf(side)}</h4>

        <div className="structure__flow">
          <p className="structure__flow-head">
            Defence flow: <strong>{flow.supply}</strong> of <strong>{flow.demand}</strong> units met
            {flow.deficit > 0 && <span className="structure__deficit"> — {flow.deficit} short</span>}
          </p>
          {flow.demand === 0 ? (
            <p className="structure__none">Nothing attacked.</p>
          ) : flow.deficit === 0 ? (
            <p className="structure__none">Every attacked piece can be covered at once.</p>
          ) : (
            <ul className="structure__list">
              {flow.targets
                .filter((t) => t.unheld)
                .map((t) => (
                  <li key={t.square}>
                    <span className="structure__square">{t.square}</span>
                    {PIECE_WORD[t.type] ?? t.type} can't be held · {t.attackers.length}a/{t.defenders.length}d
                    {t.materialAtRisk > 0.01 && <em> · {t.materialAtRisk.toFixed(1)} pawns</em>}
                  </li>
                ))}
            </ul>
          )}
        </div>

        {points.length > 0 && (
          <div className="structure__pressure">
            <h5 className="structure__sub">Pressure points</h5>
            <ul className="structure__list structure__list--prose">
              {points.map((p) => (
                <li key={p.square}>{p.text}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="structure__metrics">
          <MetricStat
            label="Coordination"
            scored={structure.coordination[side]}
            help="Algebraic connectivity of the mutual-defence graph, over the normalized Laplacian. Zero means the army has split into groups that no longer defend one another."
          />
          <MetricStat
            label="Board control"
            scored={structure.coverage[side]}
            format={(v) => v.toFixed(0)}
            help="Weighted count of squares this side bears on, with central squares and the enemy king's neighbourhood counting for more."
          />
          <MetricStat
            label="Control concentration"
            scored={structure.concentration[side]}
            higherIsBetter={false}
            help="How unevenly the uncontested ground is divided between the pieces. High means one or two pieces are carrying the position and the rest are passengers."
          />
        </div>

        <dl className="structure__king">
          <div>
            <dt>King zone contested</dt>
            <dd>
              {king.contestedSquares.length}/{king.zone.length}
            </dd>
          </div>
          <div>
            <dt>Safe flight squares</dt>
            <dd>{king.flightSquares}</dd>
          </div>
          <div>
            <dt>Zone attackers / defenders</dt>
            <dd>
              {king.attackerCount} / {king.defenderCount}
            </dd>
          </div>
        </dl>

        {trapped.length > 0 && (
          <div className="structure__trapped">
            <h5 className="structure__sub">Nowhere safe to go</h5>
            <ul className="structure__list">
              {trapped.map((p) => (
                <li key={p.square}>
                  <span className="structure__square">{p.square}</span>
                  {PIECE_WORD[p.type] ?? p.type} · {p.mobility} legal move{p.mobility === 1 ? '' : 's'}, none safe
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="structure">
      {structure.loose.length > 0 && (
        <section className="structure__section">
          <h3 className="structure__heading">Material winnable right now</h3>
          <ul className="structure__list">
            {structure.loose.map((piece) => (
              <li key={piece.square}>
                <span className="structure__square">{piece.square}</span>
                {nameOf(piece.color)}'s {PIECE_WORD[piece.type] ?? piece.type} · {piece.loss.toFixed(1)} pawns
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="structure__section">
        <h3 className="structure__heading">
          The attack-and-defence network
          <InfoNote label="the attack-and-defence network">
            Nodes sit on board coordinates rather than in a force layout, so the drawing overlays the same position the
            board shows and any claim about a piece can be checked by looking at its square. Node size is the ground
            that piece is the only one covering.
          </InfoNote>
        </h3>
        <PieceGraphView structure={structure} orientation={orientation} />
      </section>

      <div className="structure__sides">
        {sideSection('white')}
        {sideSection('black')}
      </div>

      <section className="structure__section">
        <h3 className="structure__heading">
          How fast control collapses
          <InfoNote label="the removal curves">
            Pieces are removed one at a time, worst-first against random. The gap between the two curves is the part
            that is about structure rather than material — how much an opponent gains by choosing what to take rather
            than taking whatever is available.
          </InfoNote>
        </h3>
        {!robustness ? (
          <p className="structure__none">
            <span className="spinner" aria-hidden="true" /> Running removal curves…
          </p>
        ) : (
          <div className="structure__percolation">
            <PercolationChart percolation={robustness.white} label={white} />
            <PercolationChart percolation={robustness.black} label={black} />
          </div>
        )}
      </section>

      <section className="structure__section">
        <h3 className="structure__heading">
          Coordination across the game
          <InfoNote label="the coordination series">
            The second eigenvalue of each side's defence-graph Laplacian, normalized so a sixteen-piece middlegame and a
            six-piece endgame sit on the same scale. Falling means the army is splitting into groups that no longer
            defend one another.
          </InfoNote>
        </h3>
        <CoordinationChart series={series} currentPly={ply} onSelectPly={goTo} />
      </section>

      {temporal && (
        <section className="structure__section">
          <h3 className="structure__heading">When the position was rebuilt</h3>
          <ChurnChart series={temporal} currentPly={ply} onSelectPly={goTo} />

          <div className="structure__temporal-stats">
            <div>
              <span className="structure__stat-value">{temporal.medianTieLife}</span>
              <span className="structure__stat-label">median plies a relation survived</span>
            </div>
            <div>
              <span className="structure__stat-value">{temporal.changePoints.length}</span>
              <span className="structure__stat-label">structural change points</span>
            </div>
            <div>
              <span className="structure__stat-value">{Math.round(temporal.meanChurn * 100)}%</span>
              <span className="structure__stat-label">mean relations replaced per ply</span>
            </div>
          </div>

          {temporal.skeleton.length > 0 && (
            <>
              <h5 className="structure__sub">The game's skeleton</h5>
              <ul className="structure__list">
                {temporal.skeleton.slice(0, 5).map((tie) => (
                  <li key={`${tie.from}${tie.to}${tie.kind}`}>
                    <span className="structure__square">
                      {tie.from}→{tie.to}
                    </span>
                    {tie.kind === 'defend' ? 'defence' : 'attack'} · {tie.span} plies from move{' '}
                    {moveNumber(tie.startPly)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}

export default StructureTab
