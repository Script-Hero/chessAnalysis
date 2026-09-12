// Deterministic browser fixture for verify-stretches.mjs.
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AnalysisContext } from '../src/context/AnalysisContext'
import MomentsTab from '../src/pages/MomentsTab/MomentsTab'
import { parsePgn } from '../src/lib/pgn'

export function mountFixture() {
    const game = parsePgn('[White "White fixture"]\n[Black "Black fixture"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 *')
    const widths = [12, 20, 6, 10, 1.5, 3, 10, 15, 6, 8, 2, 3]
    const corridor = game.moves.map((m, index) => ({ index, ply: index + 1, san: m.san, mover: index % 2 ? 'black' : 'white', width: widths[index], countedWidth: Math.ceil(widths[index]), leftCorridor: false }))
    const decisions = corridor.map(p => ({ ...p, choice: 'inside', cell: 'open-inside', openness: 'open', isCut: false, bestLoss: 0, loss: 0 }))
    const episodes = [
      { mover: 'white', startPly: 1, endPly: 5, startWidth: 12, endWidth: 1.5, decisions: 3, collapsed: false },
      { mover: 'black', startPly: 2, endPly: 6, startWidth: 20, endWidth: 3, decisions: 3, collapsed: false },
      { mover: 'white', startPly: 7, endPly: 11, startWidth: 10, endWidth: 2, decisions: 3, collapsed: false },
    ]
    const explanations = episodes.map((episode, i) => ({ episode, findings: i === 2 ? [] : [
      { kind: 'coverage', ply: 4, strength: 2, text: 'control of the board shrank' },
      { kind: 'concentration', ply: 5, strength: 1, text: 'control concentrated onto the bishop' },
    ] }))
    function Fixture() {
      const [ply, setPly] = React.useState(0)
      const [moveFilter, setMoveFilter] = React.useState('both')
      return React.createElement(AnalysisContext.Provider, { value: { game, corridor, decisions, explanations, ply, decisionIndex: Math.min(ply, 11), goTo: setPly, studyDecision: () => { throw Error('Unexpected tab navigation') }, moveFilter, evals: null, chains: null } },
        React.createElement('div', { className: 'page-analysis', style: { display: 'block', minHeight: 0 } },
          React.createElement('output', { id: 'board-position', style: { display: 'block', overflowWrap: 'anywhere', fontSize: '12px' } }, `${ply}: ${game.positions[ply]}`),
          React.createElement('select', { 'aria-label': 'Player filter fixture', value: moveFilter, onChange: e => setMoveFilter(e.target.value) }, ...['both', 'white', 'black'].map(s => React.createElement('option', { key: s, value: s }, s))),
          React.createElement(MomentsTab)))
    }
    document.getElementById('root').style.display = 'none'
    const host = document.createElement('div')
    host.style.padding = '16px'
    document.body.append(host)
    createRoot(host).render(React.createElement(Fixture))
}
