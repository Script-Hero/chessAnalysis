// Deterministic browser fixture for verify-moments.mjs.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Chess } from 'chess.js'
import { AnalysisContext } from '../src/context/AnalysisContext'
import MomentsTab from '../src/pages/MomentsTab/MomentsTab'
import { parsePgn } from '../src/lib/pgn'
import { computeDecisionNodes } from '../src/lib/moveGraph'
import { computeCorridor } from '../src/lib/corridor'
import { cpToWinProb } from '../src/lib/winprob'

const SAN = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7'.split(' ')
// White's 7th move (index 12) is the fixture's blunder; everything else holds.
const BLUNDER = 12
// Positions where only a couple of moves hold, to give the timeline narrow bars.
const NARROW = new Set([5, 9, 13])

export function mountFixture({ clocks = true } = {}) {
  const clock = 180
  const pgnMoves = SAN.map((san, i) => `${i % 2 ? '' : `${i / 2 + 1}. `}${san}${clocks ? ` { [%clk 0:${String(Math.floor((clock - i * 4 - (i === 13 ? 30 : 0)) / 60)).padStart(2, '0')}:${String((clock - i * 4 - (i === 13 ? 30 : 0)) % 60).padStart(2, '0')}] }` : ''}`)
  const game = parsePgn(`[White "White fixture"]\n[Black "Black fixture"]\n[TimeControl "180+0"]\n\n${pgnMoves.join(' ')} *`)

  // White's evaluation: level, then the blunder hands Black three pawns.
  const evals = game.positions.map((_, p) => ({ score: p <= BLUNDER ? 0.3 : -3, mateIn: null }))
  const survey = game.positions.slice(0, -1).map((fen, i) => {
    const chess = new Chess(fen)
    const legal = chess.moves({ verbose: true })
    const played = game.moves[i]
    const playedUci = played.from + played.to + (played.promotion ?? '')
    const moverWin = i % 2 ? 100 - cpToWinProb(evals[i].score * 100) : cpToWinProb(evals[i].score * 100)
    const others = legal.filter((m) => m.lan !== playedUci)
    const ordered = i === BLUNDER ? [...others.slice(0, 4), legal.find((m) => m.lan === playedUci), ...others.slice(4)] : [legal.find((m) => m.lan === playedUci), ...others]
    const step = NARROW.has(i) ? 12 : 1.2
    return {
      legalCount: legal.length,
      moves: ordered.map((m, rank) => {
        const win = Math.max(0, moverWin - (i === BLUNDER && m.lan === playedUci ? 40 : rank * step))
        return { uci: m.lan, san: m.san, score: 0, mateIn: null, winProb: win, lossPct: moverWin - win }
      }),
    }
  })
  const decisions = computeDecisionNodes(game, survey)
  const corridor = computeCorridor(decisions)
  const judgments = game.moves.map(() => null)
  const lines = game.positions.map(() => [])

  window.__studied = []
  function Fixture() {
    const [ply, setPly] = React.useState(0)
    const [moveFilter, setMoveFilter] = React.useState('both')
    const decisionIndex = Math.min(ply, game.moves.length - 1)
    const value = {
      game, gameKey: `fixture-${clocks}`, ply, decisionIndex, goTo: setPly,
      studyDecision: (index) => window.__studied.push(index),
      decisions, corridor, evals, judgments, lines, survey, explanations: null, moveFilter,
    }
    return React.createElement(AnalysisContext.Provider, { value },
      React.createElement('div', { className: 'page-analysis', style: { display: 'block', minHeight: 0 } },
        React.createElement('output', { id: 'board-position' }, `${ply}`),
        React.createElement('select', { 'aria-label': 'Player filter fixture', value: moveFilter, onChange: (e) => setMoveFilter(e.target.value) },
          ...['both', 'white', 'black'].map((s) => React.createElement('option', { key: s, value: s }, s))),
        React.createElement(MomentsTab)))
  }
  document.getElementById('root').style.display = 'none'
  const host = document.createElement('div')
  host.id = 'fixture-host'
  host.style.padding = '16px'
  document.body.append(host)
  createRoot(host).render(React.createElement(Fixture))
}
