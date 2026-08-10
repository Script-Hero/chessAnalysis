import { ANALYSIS_DEPTH, sanLineFromUci } from '../lib/stockfish'
import type { EngineLine } from '../lib/stockfish'
import './LiveEnginePanel.css'

type LiveEnginePanelProps = {
  enabled: boolean
  onToggle: (enabled: boolean) => void
  /** The 3 lines from the initial batch analysis, for the currently viewed position. */
  storedLines: EngineLine[] | null
  liveLines: EngineLine[]
  liveDepth: number
  fen: string
}

function formatLineScore(line: EngineLine): string {
  if (line.mateIn !== null) return `M${Math.abs(line.mateIn)}`
  return (line.score >= 0 ? '+' : '') + line.score.toFixed(2)
}

function LiveEnginePanel({ enabled, onToggle, storedLines, liveLines, liveDepth, fen }: LiveEnginePanelProps) {
  const lines = enabled ? liveLines : (storedLines ?? [])
  const depthLabel = enabled ? `depth ${liveDepth} · live` : `depth ${ANALYSIS_DEPTH} · analyzed`

  return (
    <div className="live-engine">
      <label className="live-engine__toggle-row">
        <span className="live-engine__toggle-label">
          <span className="live-engine__dot" aria-hidden="true" />
          Live engine
        </span>
        <span className={`live-engine__switch${enabled ? ' is-on' : ''}`}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            aria-label="Toggle live engine analysis"
          />
          <span className="live-engine__switch-track">
            <span className="live-engine__switch-thumb" />
          </span>
        </span>
      </label>

      <div className="live-engine__body">
        {enabled && lines.length === 0 ? (
          <p className="live-engine__thinking">
            <span className="spinner" aria-hidden="true" /> Thinking…
          </p>
        ) : !enabled && !storedLines ? (
          <p className="live-engine__thinking">Not yet analyzed.</p>
        ) : (
          <>
            <ol className="live-engine__lines">
              {lines.map((line, i) => (
                <li key={i} className={`live-engine__line live-engine__line--${i}`}>
                  <span className="live-engine__score">{formatLineScore(line)}</span>
                  <span className="live-engine__pv">{sanLineFromUci(fen, line.pv, 6) || '—'}</span>
                </li>
              ))}
            </ol>
            <p className="live-engine__depth">{depthLabel}</p>
          </>
        )}
      </div>
    </div>
  )
}

export default LiveEnginePanel
