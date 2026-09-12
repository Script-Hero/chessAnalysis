import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { ChevronLeft, ChevronRight, FlipVertical2, Play, RotateCcw } from 'lucide-react'
import { useAnalysis } from '../../context/AnalysisContext'
import { LAST_MOVE_HIGHLIGHT, SQUARE_DARK, SQUARE_LIGHT } from '../../lib/boardTheme'
import { ANALYSIS_DEPTH, LiveEngine, SURVEY_DEPTH } from '../../lib/stockfish'
import type { EngineLine } from '../../lib/stockfish'
import { commonPrefixLength, convergingRoutes, legalExchanges, materialBalance, moveUci, replayMoves } from '../../lib/exploration'
import type { ReplayPosition } from '../../lib/exploration'
import { buildPositionDag, positionKey } from '../../lib/positionDag'
import './ExploreTab.css'

type Mode = 'practice' | 'exchanges' | 'joins'
const MODES: { value: Mode; label: string }[] = [{ value: 'practice', label: 'Try a move' }, { value: 'exchanges', label: 'Exchanges' }, { value: 'joins', label: 'Convergences' }]
const scoreLabel = (line: EngineLine, whiteToMove: boolean) => line.mateIn !== null
  ? `Mate ${line.mateIn * (whiteToMove ? 1 : -1)} (White)`
  : `${(line.score * (whiteToMove ? 1 : -1)).toFixed(2)} pawns (White)`

export default function ExploreTab() {
  const { game, decisionIndex, goTo, setActiveTab } = useAnalysis()
  return <div className="exploration">
    <header className="exploration-heading"><h2>Explore the game</h2><label>Starting decision <select aria-label="Starting decision" value={decisionIndex} onChange={event => goTo(Number(event.target.value))}>{game.moves.map((move, index) => <option key={index} value={index}>{Math.floor(index / 2) + 1}{index % 2 ? '...' : '.'} {move.san}</option>)}</select></label><button className="text-command" onClick={() => setActiveTab('move')}>Back to move review</button></header>
    <ExplorePosition key={`${game.positions[0]}-${decisionIndex}`} />
  </div>
}

function ExplorePosition() {
  const { game, decisionIndex, orientation, setOrientation, lines, survey } = useAnalysis()
  const base = game.positions[decisionIndex]
  const [mode, setMode] = useState<Mode>('practice')
  const [trail, setTrail] = useState<ReplayPosition[]>(() => replayMoves(base, []))
  const [step, setStep] = useState(0)
  const [source, setSource] = useState<string | null>(null)
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null)
  const [legalChoice, setLegalChoice] = useState('')
  const [notice, setNotice] = useState('')
  const [replayLabel, setReplayLabel] = useState('Your variation')
  const [engineEnabled, setEngineEnabled] = useState(false)
  const current = trail[step]
  const chess = useMemo(() => {
    const board = new Chess(trail[0].fen)
    for (const position of trail.slice(1, step + 1)) {
      const uci = position.uci!
      board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    }
    return board
  }, [trail, step])
  const legal = useMemo(() => chess.moves({ verbose: true }), [chess])
  const load = (positions: ReplayPosition[], label: string, cursor = 0) => {
    setTrail(positions); setStep(cursor); setReplayLabel(label); setSource(null); setPromotion(null); setLegalChoice(''); setNotice('')
  }
  const seek = (index: number) => { setStep(index); setSource(null); setPromotion(null); setLegalChoice(''); setNotice('') }
  const play = (uci: string) => {
    const result = replayMoves(current.fen, [uci])
    if (result.length !== 2) { setNotice('That move is not legal in this position.'); return false }
    setTrail([...trail.slice(0, step + 1), result[1]]); setStep(step + 1)
    setSource(null); setPromotion(null); setLegalChoice(''); setNotice(''); setReplayLabel('Your variation')
    return true
  }
  const attempt = (from: string, to: string) => {
    const options = legal.filter(move => move.from === from && move.to === to)
    if (!options.length) { setNotice('That move is not legal in this position.'); return false }
    if (options.some(move => move.promotion)) { setPromotion({ from, to }); return false }
    return play(moveUci(options[0]))
  }
  const styles: Record<string, CSSProperties> = {}
  if (current.uci) for (const square of [current.uci.slice(0, 2), current.uci.slice(2, 4)]) styles[square] = { background: LAST_MOVE_HIGHLIGHT }
  if (source) {
    styles[source] = { boxShadow: 'inset 0 0 0 3px var(--brass-bright)' }
    for (const move of legal.filter(move => move.from === source)) styles[move.to] = { boxShadow: 'inset 0 0 0 3px var(--status-good)' }
  }
  const first = trail[1]?.uci
  const sameStart = positionKey(trail[0].fen) === positionKey(base)
  const firstScore = survey?.[decisionIndex]?.moves.find(move => move.uci === first)
  const played = game.moves[decisionIndex]
  const playedUci = played ? played.from + played.to + (played.promotion ?? '') : ''
  const playedScore = survey?.[decisionIndex]?.moves.find(move => move.uci === playedUci)
  const best = lines?.[decisionIndex]?.[0]
  const materialDelta = (materialBalance(current.fen) - materialBalance(trail[0].fen)) * (new Chess(trail[0].fen).turn() === 'w' ? 1 : -1)
  const status = chess.isCheckmate() ? 'Checkmate' : chess.isStalemate() ? 'Stalemate' : chess.isInsufficientMaterial() ? 'Insufficient material' : chess.isThreefoldRepetition() ? 'Threefold repetition in this variation' : chess.isDrawByFiftyMoves() ? 'Fifty-move draw threshold' : `${chess.turn() === 'w' ? 'White' : 'Black'} to move${chess.isCheck() ? ' · Check' : ''}`
  return <>
    <div className="exploration-modes" role="tablist" aria-label="Exploration view">{MODES.map(item => <button role="tab" aria-selected={mode === item.value} key={item.value} onClick={() => { if (item.value === mode) return; setMode(item.value); load(replayMoves(base, []), item.value === 'practice' ? 'Your variation' : item.value === 'exchanges' ? 'No exchange selected' : 'No route selected') }}>{item.label}</button>)}</div>
    <div className="exploration-grid">
      <section className="exploration-board" aria-label="Exploration board">
        <div className="exploration-status"><strong>{status}</strong><span>{mode === 'practice' ? 'Analysis variation' : replayLabel}</span></div>
        <Chessboard options={{ id: 'exploration-board', position: current.fen, boardOrientation: orientation, allowDragging: mode === 'practice' && !promotion, onPieceDrop: ({ sourceSquare, targetSquare }) => !!targetSquare && attempt(sourceSquare, targetSquare), onSquareClick: ({ square }) => { if (mode !== 'practice' || promotion) return; if (source && legal.some(move => move.from === source && move.to === square)) attempt(source, square); else setSource(source === square ? null : square) }, darkSquareStyle: { backgroundColor: SQUARE_DARK }, lightSquareStyle: { backgroundColor: SQUARE_LIGHT }, squareStyles: styles, animationDurationInMs: 150 }} />
        <div className="exploration-transport"><button aria-label="Previous variation position" title="Previous position" disabled={step === 0} onClick={() => seek(step - 1)}><ChevronLeft size={18} /></button><span>{step} / {trail.length - 1}</span><button aria-label="Next variation position" title="Next position" disabled={step === trail.length - 1} onClick={() => seek(step + 1)}><ChevronRight size={18} /></button><button aria-label="Reset variation" title="Reset variation" onClick={() => load(replayMoves(base, []), 'Your variation')}><RotateCcw size={18} /></button><button aria-label="Flip exploration board" title="Flip board" onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}><FlipVertical2 size={18} /></button></div>
        {mode !== 'practice' && trail.length > 1 && <button onClick={() => { setMode('practice'); setReplayLabel('Your variation') }}>Continue from here</button>}
        {promotion && <div className="exploration-promotion" role="group" aria-label="Choose promotion">{[['q', 'Queen'], ['r', 'Rook'], ['b', 'Bishop'], ['n', 'Knight']].map(([piece, label]) => <button key={piece} onClick={() => play(promotion.from + promotion.to + piece)}>{label}</button>)}<button onClick={() => setPromotion(null)}>Cancel</button></div>}
        {mode === 'practice' && <form className="exploration-legal" onSubmit={event => { event.preventDefault(); if (legalChoice) play(legalChoice) }}><select aria-label="Legal move" value={legalChoice} onChange={event => setLegalChoice(event.target.value)}><option value="">Choose a legal move</option>{legal.map(move => <option key={moveUci(move)} value={moveUci(move)}>{move.san}</option>)}</select><button aria-label="Play selected move" title="Play selected move" disabled={!legalChoice}><Play size={18} /></button></form>}
        <p role="status" className="exploration-notice">{notice}</p>
        <div className="exploration-moves" aria-label="Variation moves">{trail.map((position, index) => <button key={index} aria-pressed={step === index} onClick={() => seek(index)}>{index === 0 ? 'Start' : `${trail[index - 1].fen.split(' ')[5]}${trail[index - 1].fen.split(' ')[1] === 'w' ? '.' : '...'} ${position.san}`}</button>)}</div>
      </section>
      <div className="exploration-content">
        {mode === 'practice' && !sameStart && <p>This variation starts at a graph convergence. <button onClick={() => load(replayMoves(base, []), 'Your variation')}>Return to starting decision</button></p>}
        {mode === 'practice' && sameStart && <section><h3>Compare with the game</h3><div className="exploration-comparisons">
          <div><strong>Variation first move</strong><span>{trail[1]?.san ?? 'Not played'}</span><small>{firstScore ? `${firstScore.lossPct.toFixed(1)} pp loss · ${firstScore.winProb.toFixed(1)}% win estimate` : first ? 'Not scored in the stored survey' : 'No move selected'}</small></div>
          <div><strong>Played in the game</strong><span>{played?.san ?? 'No move'}</span><small>{playedScore ? `${playedScore.lossPct.toFixed(1)} pp loss · ${playedScore.winProb.toFixed(1)}% win estimate` : 'Survey unavailable'}</small><button disabled={!playedUci} onClick={() => load(replayMoves(base, [playedUci]), 'Played move', 1)}>Replay played move</button></div>
          <div><strong>Stored engine choice</strong><span>{best?.pv[0] ? replayMoves(base, [best.pv[0]])[1]?.san : 'Unavailable'}</span><small>Depth {ANALYSIS_DEPTH}</small><button disabled={!best?.pv.length} onClick={() => best && load(replayMoves(base, best.pv), 'Engine continuation', 1)}>Replay engine line</button></div>
        </div><p className="exploration-note">First-move losses use the depth-{SURVEY_DEPTH} survey and the original mover's perspective. Win estimates are model-based, not personalized.</p></section>}
        {mode === 'exchanges' && <ExchangeView fen={base} onReplay={load} />}
        {mode === 'joins' && <ConvergenceView onReplay={load} />}
        <section className="exploration-evaluation"><h3>Position on the board</h3><p>Material change: <strong>{materialDelta > 0 ? '+' : ''}{materialDelta.toFixed(2)} pawns</strong> for {new Chess(trail[0].fen).turn() === 'w' ? 'White' : 'Black'} since replay start.</p><label className="exploration-engine-toggle"><input type="checkbox" checked={engineEnabled} onChange={event => setEngineEnabled(event.target.checked)} /> Analyze this position</label>{engineEnabled && <PositionEngine key={current.fen} fen={current.fen} onPlay={uci => { setMode('practice'); play(uci) }} />}</section>
      </div>
    </div>
  </>
}

function PositionEngine({ fen, onPlay }: { fen: string; onPlay: (uci: string) => void }) {
  const [result, setResult] = useState<{ lines: EngineLine[]; depth: number } | null>(null)
  const [error, setError] = useState('')
  const terminal = new Chess(fen).isCheckmate() || new Chess(fen).isStalemate()
  useEffect(() => {
    if (terminal) return
    let engine: LiveEngine | undefined
    let active = true
    const timeout = window.setTimeout(() => { if (active) setError('Engine is taking longer than expected. Toggle analysis to retry.') }, 30000)
    try {
      engine = new LiveEngine(3)
      void engine.go(fen, ANALYSIS_DEPTH, (next, depth) => { if (active) { clearTimeout(timeout); setResult({ lines: next, depth }); setError('') } }).catch(() => { if (active) setError('Engine unavailable. Toggle analysis to retry.') })
    } catch { setTimeout(() => { if (active) setError('Engine unavailable.') }, 0) }
    return () => { active = false; clearTimeout(timeout); engine?.terminate() }
  }, [fen, terminal])
  if (terminal) return <p>No legal continuation.</p>
  return <div className="exploration-engine" aria-live="polite">{error ? <p>{error}</p> : !result ? <p>Analyzing...</p> : <><p>Live depth {result.depth} / {ANALYSIS_DEPTH}</p>{result.lines.map((line, index) => <button key={index} disabled={!line.move} onClick={() => line.move && onPlay(line.move)}><strong>{replayMoves(fen, line.pv.slice(0, 1))[1]?.san ?? 'No move'}</strong><span>{scoreLabel(line, new Chess(fen).turn() === 'w')}</span><small>{replayMoves(fen, line.pv.slice(0, 6)).slice(1).map(position => position.san).join(' ')}</small></button>)}</>}</div>
}

function ExchangeView({ fen, onReplay }: { fen: string; onReplay: (positions: ReplayPosition[], label: string, cursor?: number) => void }) {
  const exchanges = useMemo(() => legalExchanges(fen), [fen])
  return <section><h3>Legal capture sequences</h3><p className="exploration-note">{new Chess(fen).turn() === 'w' ? 'White' : 'Black'} moves first. Recaptures use the least valuable legal attacker on the same square. These are illustrative exchanges, not forced lines or engine recommendations.</p>{!exchanges.length ? <p>No legal captures from this starting decision.</p> : <div className="exchange-sequences">{exchanges.map(exchange => <button key={exchange.moves[0]} onClick={() => onReplay(exchange.positions, `${exchange.san} exchange`)}><strong>{exchange.san} on {exchange.target}</strong><span>{exchange.positions.slice(1).map(position => position.san).join(' ')}</span><small>{exchange.moves.length} legal captures · Replay</small></button>)}</div>}<p className="exploration-note">A sequence ends when no legal recapture remains on the target square. Other replies and counter-threats are not searched. Material change is not an evaluation of the position.</p></section>
}

function ConvergenceView({ onReplay }: { onReplay: (positions: ReplayPosition[], label: string, cursor?: number) => void }) {
  const { game, lines } = useAnalysis()
  const dag = useMemo(() => lines ? buildPositionDag(game.positions, lines, 4) : null, [game.positions, lines])
  const joins = useMemo(() => dag ? dag.transpositions.map(node => ({ node, routes: convergingRoutes(dag, node.key) })).filter(join => join.routes.length > 1) : [], [dag])
  const [selection, setSelection] = useState(0)
  const join = joins[selection]
  const routes = join?.routes.slice(0, 3) ?? []
  const prefix = commonPrefixLength(routes)
  const startFen = routes[0] && dag ? dag.nodes.get(prefix ? routes[0][prefix - 1].to : dag.root)!.fen : ''
  const replay = (index: number, end = false) => {
    const positions = replayMoves(startFen, routes[index].slice(prefix).map(edge => edge.uci))
    onReplay(positions, `Convergence route ${index + 1}`, end ? positions.length - 1 : 0)
  }
  return <section><h3>Different routes, same position</h3><p className="exploration-note">Played game plus four plies of each stored engine line. Only routes that do not revisit the destination are included.</p>{!lines ? <p>Waiting for stored engine lines.</p> : !join ? <p>No distinct converging routes found in this sample. This does not mean the game has no transpositions.</p> : <>
    <label>Convergence <select aria-label="Convergence" value={selection} onChange={event => { const index = Number(event.target.value); setSelection(index); const nextRoutes = joins[index].routes.slice(0, 3); const nextPrefix = commonPrefixLength(nextRoutes); const nextStart = dag!.nodes.get(nextPrefix ? nextRoutes[0][nextPrefix - 1].to : dag!.root)!.fen; onReplay(replayMoves(nextStart, nextRoutes[0].slice(nextPrefix).map(edge => edge.uci)), 'Convergence route 1') }}>{joins.map((item, index) => <option key={item.node.key} value={index}>{index + 1}. {item.routes.length} routes · earliest ply {item.node.depth}</option>)}</select></label>
    <div className="convergence-diagram"><svg viewBox={`0 0 600 ${routes.length * 80 + 30}`} role="img" aria-label={`${routes.length} routes branch from a common position and merge into one position`}><defs><marker id="join-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" /></marker></defs>{routes.map((route, index) => <g key={index}><path d={`M 75 ${routes.length * 40} L 180 ${index * 80 + 40} L 420 ${index * 80 + 40} L 525 ${routes.length * 40}`} fill="none" stroke="currentColor" markerEnd="url(#join-arrow)" /><rect x="180" y={index * 80 + 20} width="240" height="40" /><text x="300" y={index * 80 + 45} textAnchor="middle">Route {index + 1} · {route.length - prefix} plies</text></g>)}<circle cx="65" cy={routes.length * 40} r="10" /><circle cx="535" cy={routes.length * 40} r="10" /><text x="65" y={routes.length * 40 + 30} textAnchor="middle">Start</text><text x="535" y={routes.length * 40 + 30} textAnchor="middle">Same position</text></svg></div>
    <div className="convergence-mobile"><svg viewBox="0 0 340 260" role="img" aria-label={`${routes.length} routes merge into the same position`}><circle cx="170" cy="30" r="8" /><text x="170" y="15" textAnchor="middle">Start</text>{routes.map((route, index) => { const x = (index + .5) * (340 / routes.length); return <g key={index}><path d={`M 170 38 L ${x} 100 M ${x} 140 L 170 220`} fill="none" stroke="currentColor" /><rect x={x - 48} y="100" width="96" height="40" /><text x={x} y="118" textAnchor="middle">Route {index + 1}</text><text x={x} y="133" textAnchor="middle">{route.length - prefix} plies</text></g> })}<circle cx="170" cy="220" r="8" /><text x="170" y="248" textAnchor="middle">Same position</text></svg></div>
    <div className="convergence-routes">{routes.map((route, index) => <div key={index}><button onClick={() => replay(index)}><Play size={16} /> Route {index + 1}</button><span>{route.slice(prefix).map(edge => edge.san).join(' ')}</span><button onClick={() => replay(index, true)}>View endpoint</button></div>)}</div>
    <p className="exploration-note">Showing {routes.length} of {join.routes.length} routes from their common prefix. The merged position has identical pieces, turn, castling and en-passant rights; move counters and repetition histories may differ.</p>
  </>}</section>
}
