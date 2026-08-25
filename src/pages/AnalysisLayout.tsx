import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import BoardPane from './BoardPane'
import OverviewTab from './OverviewTab'
import ExploreTab from './ExploreTab'
import StructureTab from './StructureTab'
import LibraryTab from './LibraryTab'
import { parsePgn } from '../lib/pgn'
import type { ParsedGame } from '../lib/pgn'
import { analyzeGame, LiveEngine } from '../lib/stockfish'
import type { EngineLine, MoveJudgment, PositionEval, SurveyPosition } from '../lib/stockfish'
import { computeDecisionNodes } from '../lib/moveGraph'
import { computeCorridor, findNarrowingEpisodes } from '../lib/corridor'
import { analyzeRobustness, analyzeStructure } from '../lib/structure'
import { analyzeTemporal } from '../lib/temporal'
import { explainEpisodes, structureSeries } from '../lib/causes'
import { buildGameChain } from '../lib/markov'
import { scoreWinProb } from '../lib/winprob'
import {
  clearLastOpenedId,
  deleteGame,
  gameId,
  getLastOpenedId,
  listGames,
  loadAnalysis,
  saveAnalysis,
  saveGameMeta,
  setLastOpenedId,
} from '../lib/library'
import type { GameMeta } from '../lib/library'
import { AnalysisContext } from '../context/AnalysisContext'
import type { AnalysisContextValue, BoardOverlay, DashboardTab, MoveFilter } from '../context/AnalysisContext'
import './AnalysisLayout.css'

const LIVE_DEPTH = 20

const TABS: { value: DashboardTab; label: string }[] = [
  { value: 'overview', label: 'Corridor' },
  { value: 'structure', label: 'Structure' },
  { value: 'explore', label: 'Explore' },
  { value: 'library', label: 'Library' },
]

function AnalysisLayout() {
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [game, setGame] = useState<ParsedGame | null>(null)
  const [gameKey, setGameKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [evals, setEvals] = useState<PositionEval[] | null>(null)
  const [judgments, setJudgments] = useState<(MoveJudgment | null)[] | null>(null)
  const [lines, setLines] = useState<EngineLine[][] | null>(null)
  const [survey, setSurvey] = useState<SurveyPosition[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [liveEngineEnabled, setLiveEngineEnabled] = useState(false)
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [moveFilter, setMoveFilter] = useState<MoveFilter>('both')
  const [overlay, setOverlay] = useState<BoardOverlay>('none')
  const [library, setLibrary] = useState<GameMeta[]>([])
  const liveEngineRef = useRef<LiveEngine | null>(null)
  const [liveLines, setLiveLines] = useState<EngineLine[]>([])
  const [liveDepth, setLiveDepth] = useState(0)

  // Set when a game is opened from the library with an analysis already stored,
  // so the analysis effect knows not to re-run the engine over it.
  const analysisPreloadedRef = useRef(false)

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await listGames())
    } catch {
      // A blocked or unavailable IndexedDB costs the library, not the session.
    }
  }, [])

  const clearAnalysisState = useCallback(() => {
    setEvals(null)
    setJudgments(null)
    setLines(null)
    setSurvey(null)
    setAnalysisError(null)
  }, [])

  const loadPgnText = useCallback(
    async (text: string, nameHint: string | ((headers: Record<string, string>) => string)) => {
      setError(null)
      let parsed: ParsedGame
      try {
        parsed = parsePgn(text)
      } catch {
        setGame(null)
        setError("Couldn't read that as a PGN game.")
        return
      }

      const id = gameId(text)
      const name = typeof nameHint === 'function' ? nameHint(parsed.headers) : nameHint

      // The stored analysis is looked up *before* the game is put on screen.
      // Setting the game first would let the analysis effect fire against a
      // still-unresolved lookup and re-run the engine over a game already
      // analysed — minutes of work to recompute what was on disk.
      const stored = await loadAnalysis(id).catch(() => null)

      analysisPreloadedRef.current = stored !== null
      clearAnalysisState()
      if (stored) {
        setEvals(stored.evals)
        setJudgments(stored.judgments)
        setLines(stored.lines)
        setSurvey(stored.survey)
      }
      setFileName(name)
      setGame(parsed)
      setGameKey(id)
      setPly(parsed.moves.length)
      setLastOpenedId(id)

      const meta: GameMeta = {
        id,
        fileName: name,
        pgn: text,
        headers: parsed.headers,
        savedAt: Date.now(),
        analyzed: stored !== null,
      }
      saveGameMeta(meta)
        .then(refreshLibrary)
        .catch(() => undefined)
    },
    [clearAnalysisState, refreshLibrary],
  )

  const acceptFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return
      loadPgnText(await file.text(), file.name)
    },
    [loadPgnText],
  )

  const pasteFromClipboard = useCallback(async () => {
    setError(null)
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setError('Clipboard is empty.')
        return
      }
      loadPgnText(text, (headers) => {
        const { White, Black } = headers
        if (White && Black) return `${White} vs ${Black}.pgn`
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
        return `Pasted ${stamp}.pgn`
      })
    } catch {
      setError("Couldn't read from clipboard. Check your browser's clipboard permissions.")
    }
  }, [loadPgnText])

  const openGame = useCallback(
    (id: string) => {
      const meta = library.find((g) => g.id === id)
      if (!meta) return
      loadPgnText(meta.pgn, meta.fileName)
      setActiveTab('overview')
    },
    [library, loadPgnText],
  )

  const removeGame = useCallback(
    (id: string) => {
      deleteGame(id)
        .then(refreshLibrary)
        .catch(() => undefined)
      if (id === gameKey) {
        setGame(null)
        setGameKey(null)
        setFileName(null)
        clearAnalysisState()
      }
    },
    [gameKey, refreshLibrary, clearAnalysisState],
  )

  // On first mount, restore the last game opened, along with its analysis.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const games = await listGames().catch(() => [])
      if (cancelled) return
      setLibrary(games)

      const lastId = getLastOpenedId()
      const meta = lastId ? games.find((g) => g.id === lastId) : undefined
      if (!meta) return

      let parsed: ParsedGame
      try {
        parsed = parsePgn(meta.pgn)
      } catch {
        return
      }

      // Same ordering rule as loadPgnText: resolve the stored analysis before
      // the game reaches state, so the analysis effect sees a settled answer.
      const stored = await loadAnalysis(meta.id).catch(() => null)
      if (cancelled) return

      analysisPreloadedRef.current = stored !== null
      if (stored) {
        setEvals(stored.evals)
        setJudgments(stored.judgments)
        setLines(stored.lines)
        setSurvey(stored.survey)
      }
      setFileName(meta.fileName)
      setGame(parsed)
      setGameKey(meta.id)
      setPly(parsed.moves.length)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Analysis runs automatically as soon as a game without a stored analysis loads.
  useEffect(() => {
    if (!game || !gameKey) return
    if (analysisPreloadedRef.current) {
      analysisPreloadedRef.current = false
      return
    }
    let cancelled = false

    setAnalyzing(true)
    setAnalysisError(null)
    setProgress({ done: 0, total: game.positions.length })

    analyzeGame(game.positions, (done, total) => {
      if (!cancelled) setProgress({ done, total })
    })
      .then((result) => {
        if (cancelled) return
        setEvals(result.evals)
        setJudgments(result.judgments)
        setLines(result.lines)
        setSurvey(result.survey)
        return saveAnalysis({
          id: gameKey,
          evals: result.evals,
          judgments: result.judgments,
          lines: result.lines,
          survey: result.survey,
        }).then(refreshLibrary)
      })
      .catch(() => {
        if (!cancelled) setAnalysisError("Couldn't run the engine analysis.")
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false)
      })

    return () => {
      cancelled = true
    }
  }, [game, gameKey, refreshLibrary])

  const decisions = useMemo(() => {
    if (!game || !survey) return null
    return computeDecisionNodes(game, survey)
  }, [game, survey])

  const corridor = useMemo(() => (decisions ? computeCorridor(decisions) : null), [decisions])

  const position = game?.positions[ply]

  // Structure is recomputed per viewed position rather than for the whole game:
  // it is cheap for one position and quadratic-ish in pieces, and only the
  // position on the board is ever displayed.
  const structure = useMemo(() => {
    if (!position) return null
    try {
      return analyzeStructure(position)
    } catch {
      return null
    }
  }, [position])

  // Percolation rebuilds the incidence graph a few hundred times, so it is the
  // one measure computed on demand — when the panel that shows it is open, or
  // when the overlay that paints it is selected.
  const wantsRobustness = activeTab === 'structure' || overlay === 'fragility'
  const robustness = useMemo(() => {
    if (!position || !wantsRobustness) return null
    try {
      return analyzeRobustness(position)
    } catch {
      return null
    }
  }, [position, wantsRobustness])

  // The temporal network and the per-ply structural digest are properties of
  // the whole game, so they are keyed on the game rather than on the ply.
  const temporal = useMemo(() => (game ? analyzeTemporal(game.positions) : null), [game])
  const digests = useMemo(() => (game ? structureSeries(game.positions) : null), [game])

  const explanations = useMemo(() => {
    if (!corridor || !digests || !temporal) return null
    return explainEpisodes(findNarrowingEpisodes(corridor), digests, temporal)
  }, [corridor, digests, temporal])

  const chains = useMemo(() => {
    if (!decisions || !survey || !evals || evals.length === 0) return null
    const final = evals[evals.length - 1]
    const terminal = scoreWinProb(final.score, final.mateIn)
    return {
      white: buildGameChain(decisions, survey, terminal, 'white'),
      black: buildGameChain(decisions, survey, terminal, 'black'),
    }
  }, [decisions, survey, evals])

  useEffect(() => {
    if (!liveEngineEnabled || !position) {
      liveEngineRef.current?.stop()
      setLiveLines([])
      setLiveDepth(0)
      return
    }
    if (!liveEngineRef.current) liveEngineRef.current = new LiveEngine(3)
    setLiveLines([])
    setLiveDepth(0)
    liveEngineRef.current.go(position, LIVE_DEPTH, (nextLines, depth) => {
      setLiveLines(nextLines)
      setLiveDepth(depth)
    })
  }, [liveEngineEnabled, position])

  useEffect(() => {
    return () => {
      liveEngineRef.current?.terminate()
      liveEngineRef.current = null
    }
  }, [])

  const reset = () => {
    clearLastOpenedId()
    setGame(null)
    setGameKey(null)
    setFileName(null)
    setError(null)
    clearAnalysisState()
    setLiveEngineEnabled(false)
    setOverlay('none')
    setPly(0)
    setOrientation('white')
    setMoveFilter('both')
    if (inputRef.current) inputRef.current.value = ''
  }

  const goTo = (target: number) => {
    if (!game) return
    setPly(Math.max(0, Math.min(game.moves.length, target)))
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current <= 0) {
      dragDepth.current = 0
      setIsDragging(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    acceptFile(e.dataTransfer.files?.[0])
  }

  if (!game || !fileName) {
    return (
      <div className="page-analysis">
        <div className="board-glow" aria-hidden="true" />

        <div
          className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
        >
          <span className="dropzone__corner dropzone__corner--tl" />
          <span className="dropzone__corner dropzone__corner--tr" />
          <span className="dropzone__corner dropzone__corner--bl" />
          <span className="dropzone__corner dropzone__corner--br" />

          <span className="dropzone__glyph" aria-hidden="true">
            ♞
          </span>

          <h1 className="dropzone__title">Postmortem</h1>
          <p className="dropzone__subtitle">
            Drop a PGN anywhere on this page. What comes back is the stretch where the position stopped offering
            choices, and the thing that closed them.
          </p>

          <div className="dropzone__actions">
            <button
              type="button"
              className="dropzone__browse"
              onClick={(e) => {
                e.stopPropagation()
                inputRef.current?.click()
              }}
            >
              Browse files
            </button>

            <button
              type="button"
              className="dropzone__browse"
              onClick={(e) => {
                e.stopPropagation()
                pasteFromClipboard()
              }}
            >
              Paste from clipboard
            </button>
          </div>

          {library.length > 0 && (
            <div className="dropzone__library">
              <p className="dropzone__library-title">Or pick up where you left off</p>
              <ul className="dropzone__library-list">
                {library.slice(0, 5).map((meta) => (
                  <li key={meta.id}>
                    <button
                      type="button"
                      className="dropzone__library-item"
                      onClick={(e) => {
                        e.stopPropagation()
                        loadPgnText(meta.pgn, meta.fileName)
                      }}
                    >
                      <span>
                        {meta.headers.White ?? '?'} — {meta.headers.Black ?? '?'}
                      </span>
                      {!meta.analyzed && <span className="dropzone__library-flag">unanalysed</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <p className="dropzone__error">{error}</p>}

          <input
            ref={inputRef}
            type="file"
            accept=".pgn,.txt"
            className="dropzone__input"
            onChange={(e) => acceptFile(e.target.files?.[0])}
          />
        </div>
      </div>
    )
  }

  const contextValue: AnalysisContextValue = {
    game,
    fileName,
    gameKey,
    ply,
    goTo,
    orientation,
    setOrientation,
    evals,
    judgments,
    lines,
    survey,
    decisions,
    corridor,
    structure,
    robustness,
    temporal,
    digests,
    explanations,
    chains,
    overlay,
    setOverlay,
    analyzing,
    progress,
    analysisError,
    onReset: reset,
    liveEngineEnabled,
    setLiveEngineEnabled,
    liveLines,
    liveDepth,
    activeTab,
    setActiveTab,
    moveFilter,
    setMoveFilter,
    library,
    openGame,
    removeGame,
  }

  return (
    <div className="page-analysis page-analysis--app">
      <div className="board-glow" aria-hidden="true" />

      {/* The game is the title of the page. It used to sit fourth down the left
          column, under the board and the overlay pills, while this bar held
          nothing but a spinner. */}
      <header className="gamebar">
        <div className="gamebar__game">
          <h1 className="gamebar__players">
            <span className={ply % 2 === 0 ? 'is-to-move' : ''}>{game.headers.White ?? 'White'}</span>
            <span className="gamebar__against">against</span>
            <span className={ply % 2 === 1 ? 'is-to-move' : ''}>{game.headers.Black ?? 'Black'}</span>
          </h1>
          <p className="gamebar__meta">
            {[game.headers.Event, game.headers.Date].filter(Boolean).join(' · ')}
            {game.headers.Result && <span className="gamebar__result">{game.headers.Result}</span>}
          </p>
        </div>

        <div className="analysis-nav__status">
          {analyzing && (
            <span className="analysis-nav__progress">
              <span className="spinner" aria-hidden="true" />
              {progress.done} of {progress.total} positions
              <span className="analysis-nav__hint">deep eval, then a full-width survey of every legal move</span>
            </span>
          )}
          {analysisError && <span className="analysis-nav__error">{analysisError}</span>}
          <button type="button" className="gamebar__reset" onClick={reset}>
            Open another
          </button>
        </div>
      </header>

      <AnalysisContext.Provider value={contextValue}>
        <div className="analysis-split">
          <div className="analysis-split__board">
            <BoardPane />
          </div>

          <div className="analysis-split__dashboard">
            <div className="dashboard-tabs">
              {TABS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  className={`dashboard-tabs__tab${activeTab === value ? ' is-active' : ''}`}
                  onClick={() => setActiveTab(value)}
                >
                  {label}
                </button>
              ))}

              {activeTab === 'overview' && (
                <div className="move-filter" role="group" aria-label="Filter graphs by mover">
                  {(
                    [
                      ['white', game.headers.White || 'White'],
                      ['both', 'Both'],
                      ['black', game.headers.Black || 'Black'],
                    ] as [MoveFilter, string][]
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={`move-filter__option${moveFilter === value ? ' is-active' : ''}`}
                      onClick={() => setMoveFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="dashboard-tabs__content">
              {activeTab === 'overview' && <OverviewTab />}
              {activeTab === 'structure' && <StructureTab />}
              {activeTab === 'explore' && <ExploreTab />}
              {activeTab === 'library' && <LibraryTab />}
            </div>
          </div>
        </div>
      </AnalysisContext.Provider>
    </div>
  )
}

export default AnalysisLayout
