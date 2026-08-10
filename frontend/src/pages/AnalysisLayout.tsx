import { useCallback, useEffect, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import BoardPane from './BoardPane'
import AnalysisTab from './AnalysisTab'
import ReportView from './ReportView'
import TreeTab from './TreeTab'
import { parsePgn } from '../lib/pgn'
import type { ParsedGame } from '../lib/pgn'
import { analyzeGame, LiveEngine } from '../lib/stockfish'
import type { EngineLine, MoveJudgment, PositionEval } from '../lib/stockfish'
import { AnalysisContext } from '../context/AnalysisContext'
import type { AnalysisContextValue, DashboardTab } from '../context/AnalysisContext'
import './AnalysisLayout.css'

const LIVE_DEPTH = 20

function AnalysisLayout() {
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [game, setGame] = useState<ParsedGame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dragDepth = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const [ply, setPly] = useState(0)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [evals, setEvals] = useState<PositionEval[] | null>(null)
  const [judgments, setJudgments] = useState<(MoveJudgment | null)[] | null>(null)
  const [lines, setLines] = useState<EngineLine[][] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [liveEngineEnabled, setLiveEngineEnabled] = useState(false)
  const [activeTab, setActiveTab] = useState<DashboardTab>('analysis')
  const liveEngineRef = useRef<LiveEngine | null>(null)
  const [liveLines, setLiveLines] = useState<EngineLine[]>([])
  const [liveDepth, setLiveDepth] = useState(0)

  const acceptFile = useCallback(async (file: File | undefined) => {
    if (!file) return
    setFileName(file.name)
    setError(null)
    try {
      const text = await file.text()
      const parsed = parsePgn(text)
      setGame(parsed)
      setPly(parsed.moves.length)
    } catch {
      setGame(null)
      setError("Couldn't read that as a PGN game.")
    }
  }, [])

  // Analysis runs automatically as soon as a game loads — no button to click.
  useEffect(() => {
    if (!game) return
    let cancelled = false

    setAnalyzing(true)
    setAnalysisError(null)
    setEvals(null)
    setJudgments(null)
    setLines(null)
    setProgress({ done: 0, total: game.positions.length })

    analyzeGame(game.positions, (done, total) => {
      if (!cancelled) setProgress({ done, total })
    })
      .then((result) => {
        if (cancelled) return
        setEvals(result.evals)
        setJudgments(result.judgments)
        setLines(result.lines)
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
  }, [game])

  const position = game?.positions[ply]

  // Live engine: a persistent worker that re-queries whenever the toggle is on
  // and the position changes, streaming candidate lines as depth increases.
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
    liveEngineRef.current.go(position, LIVE_DEPTH, (lines, depth) => {
      setLiveLines(lines)
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
    setGame(null)
    setFileName(null)
    setError(null)
    setEvals(null)
    setJudgments(null)
    setLines(null)
    setAnalysisError(null)
    setLiveEngineEnabled(false)
    setPly(0)
    setOrientation('white')
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

          <h1 className="dropzone__title">Drop your PGN</h1>
          <p className="dropzone__subtitle">Drag a game file anywhere on this board</p>

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

          {error && <p className="dropzone__error">{error}</p>}

          <input
            ref={inputRef}
            type="file"
            accept=".pgn"
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
    ply,
    goTo,
    orientation,
    setOrientation,
    evals,
    judgments,
    lines,
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
  }

  return (
    <div className="page-analysis page-analysis--app">
      <div className="board-glow" aria-hidden="true" />

      <nav className="analysis-nav">
        <div className="analysis-nav__status">
          {analyzing && (
            <span className="analysis-nav__progress">
              <span className="spinner" aria-hidden="true" />
              Analyzing… {progress.done}/{progress.total}
            </span>
          )}
          {analysisError && <span className="analysis-nav__error">{analysisError}</span>}
        </div>
      </nav>

      <AnalysisContext.Provider value={contextValue}>
        <div className="analysis-split">
          <div className="analysis-split__board">
            <BoardPane />
          </div>

          <div className="analysis-split__dashboard">
            <div className="dashboard-tabs">
              <button
                type="button"
                className={`dashboard-tabs__tab${activeTab === 'analysis' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('analysis')}
              >
                Analysis
              </button>
              <button
                type="button"
                className={`dashboard-tabs__tab${activeTab === 'report' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('report')}
              >
                Report
              </button>
              <button
                type="button"
                className={`dashboard-tabs__tab${activeTab === 'tree' ? ' is-active' : ''}`}
                onClick={() => setActiveTab('tree')}
              >
                Tree
              </button>
            </div>

            <div className="dashboard-tabs__content">
              {activeTab === 'analysis' ? <AnalysisTab /> : activeTab === 'report' ? <ReportView /> : <TreeTab />}
            </div>
          </div>
        </div>
      </AnalysisContext.Provider>
    </div>
  )
}

export default AnalysisLayout
