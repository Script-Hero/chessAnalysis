# Analysis Screen Split-Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the analysis screen always show the board (with controls and moves list) in a persistent left pane at 1/3 width, with a 2/3-width right-hand dashboard that switches between an "Analysis" tab (live-engine panel + eval chart) and a "Report" tab (existing report content), via in-page state rather than routing.

**Architecture:** `AnalysisLayout` becomes the sole owner of all game/analysis state (it already owns most of it) plus the new `activeTab` state and the live-engine query state lifted up from `GameView`. It renders a two-column grid: a persistent `BoardPane` on the left and a tab-switched dashboard (`AnalysisTab` or `ReportView`) on the right. State is shared via a real React Context (`AnalysisContext`, converted from its current `useOutletContext`-based form) instead of `react-router` outlet context, since there is no longer a nested `<Outlet/>` for these two views. `GameView.tsx`/`GameView.css` are deleted and replaced by `BoardPane` (board/controls/header/moves/footer) and `AnalysisTab` (live-engine panel + eval chart).

**Tech Stack:** React 19 + TypeScript, Vite, react-router-dom v7, react-chessboard. No test framework is present in this repo — verification uses `npm run build` (runs `tsc -b`) and `npm run lint` after each task instead of unit tests.

## Global Constraints

- Follow the existing plain-CSS-per-component pattern (one `.css` file imported directly into its `.tsx`, using `var(--...)` design tokens from `src/index.css`). No CSS modules, no Tailwind.
- Follow the existing BEM-ish class naming used throughout (`.viewer__board-frame`, `.analysis-nav__tab`, etc.) for any new classes.
- Preserve the responsive collapse pattern already used in `GameView.css`/`ReportView.css`: single-column stacking under a mobile breakpoint.
- Do not add a testing framework; verify with `npm run build` and `npm run lint` (run from `frontend/`).
- Commit after each task with a working, typechecked, lint-clean state.

---

### Task 1: Convert `AnalysisContext` to a real React Context and add new fields

**Files:**
- Modify: `frontend/src/context/AnalysisContext.ts`

**Interfaces:**
- Produces: `AnalysisContext` (the `React.Context` object, exported), `AnalysisContextValue` type (extended), `useAnalysis(): AnalysisContextValue` (now throws if used outside a provider instead of relying on `useOutletContext`).

- [ ] **Step 1: Rewrite the file**

Replace the full contents of `frontend/src/context/AnalysisContext.ts` with:

```ts
import { createContext, useContext } from 'react'
import type { ParsedGame } from '../lib/pgn'
import type { EngineLine, MoveJudgment, PositionEval } from '../lib/stockfish'

export type DashboardTab = 'analysis' | 'report'

export type AnalysisContextValue = {
  game: ParsedGame
  fileName: string
  ply: number
  goTo: (target: number) => void
  orientation: 'white' | 'black'
  setOrientation: (orientation: 'white' | 'black') => void
  evals: PositionEval[] | null
  judgments: (MoveJudgment | null)[] | null
  analyzing: boolean
  progress: { done: number; total: number }
  analysisError: string | null
  onReset: () => void
  liveEngineEnabled: boolean
  setLiveEngineEnabled: (enabled: boolean) => void
  liveLines: EngineLine[]
  liveDepth: number
  activeTab: DashboardTab
  setActiveTab: (tab: DashboardTab) => void
}

export const AnalysisContext = createContext<AnalysisContextValue | null>(null)

export function useAnalysis(): AnalysisContextValue {
  const ctx = useContext(AnalysisContext)
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisContext.Provider')
  return ctx
}
```

Note: `EngineLine` must be exported from `../lib/stockfish` — confirm with `grep "export type EngineLine\|export interface EngineLine" frontend/src/lib/stockfish.ts` before writing this file; it is already imported as a type in the current `GameView.tsx` (`import type { EngineLine } from '../lib/stockfish'`), so it exists.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npm run build`
Expected: Fails at this point with errors in `AnalysisLayout.tsx`, `GameView.tsx`, `ReportView.tsx` (they still use the old `useOutletContext`-based API / reference now-missing pieces) — that's expected, later tasks fix those files. Confirm the *only* errors are in those three files, not in `AnalysisContext.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/context/AnalysisContext.ts
git commit -m "refactor: convert AnalysisContext to plain React context"
```

---

### Task 2: Create `BoardPane` (board, controls, player header, moves list, footer)

**Files:**
- Create: `frontend/src/pages/BoardPane.tsx`
- Create: `frontend/src/pages/BoardPane.css`
- Test: none (no test framework); verify via `npm run build` / `npm run lint` and a manual browser check in Task 6.

**Interfaces:**
- Consumes: `useAnalysis()` from `../context/AnalysisContext` (Task 1) — reads `game`, `fileName`, `ply`, `goTo`, `orientation`, `setOrientation`, `judgments`, `onReset`.
- Produces: default-exported `BoardPane` component, no props (reads everything from context).

- [ ] **Step 1: Create `BoardPane.tsx`**

This is `GameView.tsx`'s board frame, controls, keyboard-nav effect, `squareStyles`, `pairs` memo, player header, moves list, and footer — with the live-engine arrows computed from context's `liveEngineEnabled`/`liveLines` (Task 1/3) instead of owning that state itself, and with the live-engine panel and eval chart removed (they move to `AnalysisTab` in Task 3).

```tsx
import { useEffect, useMemo } from 'react'
import { Chessboard } from 'react-chessboard'
import type { Arrow } from 'react-chessboard'
import MoveBadge from '../components/MoveBadge'
import { useAnalysis } from '../context/AnalysisContext'
import { LAST_MOVE_HIGHLIGHT, SQUARE_DARK, SQUARE_LIGHT } from '../lib/boardTheme'
import './BoardPane.css'

const ARROW_COLORS = ['rgba(232, 195, 117, 0.9)', 'rgba(232, 195, 117, 0.55)', 'rgba(232, 195, 117, 0.3)']

function BoardPane() {
  const {
    game,
    fileName,
    ply,
    goTo,
    orientation,
    setOrientation,
    judgments,
    onReset,
    liveEngineEnabled,
    liveLines,
  } = useAnalysis()

  const total = game.moves.length
  const position = game.positions[ply]
  const currentMove = ply > 0 ? game.moves[ply - 1] : null

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(ply - 1)
      else if (e.key === 'ArrowRight') goTo(ply + 1)
      else if (e.key === 'Home') goTo(0)
      else if (e.key === 'End') goTo(total)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ply, total])

  const squareStyles = useMemo(() => {
    if (!currentMove) return {}
    return {
      [currentMove.from]: { background: LAST_MOVE_HIGHLIGHT },
      [currentMove.to]: { background: LAST_MOVE_HIGHLIGHT },
    }
  }, [currentMove])

  const pairs = useMemo(() => {
    const rows: { number: number; white?: { san: string; ply: number }; black?: { san: string; ply: number } }[] = []
    game.moves.forEach((move, i) => {
      const moveNumber = Math.floor(i / 2) + 1
      const isWhite = i % 2 === 0
      if (isWhite) {
        rows.push({ number: moveNumber, white: { san: move.san, ply: i + 1 } })
      } else {
        rows[rows.length - 1].black = { san: move.san, ply: i + 1 }
      }
    })
    return rows
  }, [game.moves])

  const arrows = useMemo<Arrow[]>(() => {
    if (!liveEngineEnabled) return []
    return liveLines
      .map((line, i) =>
        line.move
          ? { startSquare: line.move.slice(0, 2), endSquare: line.move.slice(2, 4), color: ARROW_COLORS[i] }
          : null,
      )
      .filter((a): a is Arrow => a !== null)
  }, [liveEngineEnabled, liveLines])

  const white = game.headers.White ?? 'White'
  const black = game.headers.Black ?? 'Black'
  const result = game.headers.Result
  const event = game.headers.Event
  const date = game.headers.Date

  return (
    <div className="board-pane">
      <div className="board-pane__frame">
        <Chessboard
          options={{
            id: 'analysis-board',
            position,
            boardOrientation: orientation,
            allowDragging: false,
            showAnimations: true,
            animationDurationInMs: 180,
            showNotation: true,
            darkSquareStyle: { backgroundColor: SQUARE_DARK },
            lightSquareStyle: { backgroundColor: SQUARE_LIGHT },
            darkSquareNotationStyle: { color: SQUARE_LIGHT },
            lightSquareNotationStyle: { color: SQUARE_DARK },
            squareStyles,
            arrows,
          }}
        />
      </div>

      <div className="board-pane__controls">
        <button type="button" className="board-pane__nav" onClick={() => goTo(0)} disabled={ply === 0} aria-label="Go to start">
          «
        </button>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(ply - 1)}
          disabled={ply === 0}
          aria-label="Previous move"
        >
          ‹
        </button>
        <span className="board-pane__ply">
          {ply} / {total}
        </span>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(ply + 1)}
          disabled={ply === total}
          aria-label="Next move"
        >
          ›
        </button>
        <button
          type="button"
          className="board-pane__nav"
          onClick={() => goTo(total)}
          disabled={ply === total}
          aria-label="Go to end"
        >
          »
        </button>
        <button
          type="button"
          className="board-pane__nav board-pane__nav--flip"
          onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}
          aria-label="Flip board"
        >
          ⇅
        </button>
      </div>

      <div className="board-pane__header">
        <p className="board-pane__players">
          <span className={ply % 2 === 0 ? 'is-active' : ''}>{white}</span>
          <span className="board-pane__vs">vs</span>
          <span className={ply % 2 === 1 ? 'is-active' : ''}>{black}</span>
        </p>
        {(event || date) && <p className="board-pane__meta">{[event, date].filter(Boolean).join(' — ')}</p>}
        {result && <p className="board-pane__result">{result}</p>}
      </div>

      <ol className="board-pane__moves">
        {pairs.map((row) => (
          <li key={row.number} className="board-pane__move-row">
            <span className="board-pane__move-number">{row.number}.</span>
            {row.white && (
              <button
                type="button"
                className={`board-pane__move${ply === row.white.ply ? ' is-current' : ''}`}
                onClick={() => goTo(row.white!.ply)}
              >
                {row.white.san}
                <MoveBadge judgment={judgments?.[row.white.ply - 1]} />
              </button>
            )}
            {row.black && (
              <button
                type="button"
                className={`board-pane__move${ply === row.black.ply ? ' is-current' : ''}`}
                onClick={() => goTo(row.black!.ply)}
              >
                {row.black.san}
                <MoveBadge judgment={judgments?.[row.black.ply - 1]} />
              </button>
            )}
          </li>
        ))}
      </ol>

      <div className="board-pane__footer">
        <p className="board-pane__filename">{fileName}</p>
        <button type="button" className="board-pane__reset" onClick={onReset}>
          Load another game
        </button>
      </div>
    </div>
  )
}

export default BoardPane
```

- [ ] **Step 2: Create `BoardPane.css`**

Ported from `GameView.css`, renaming `.viewer*` classes to `.board-pane*`, dropping the two-column `.viewer` grid (this is now a single vertical stack filling the left pane), and shrinking the moves list max-height since the pane is narrower:

```css
.board-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.board-pane__frame {
  position: relative;
  border: 1px solid rgba(201, 162, 75, 0.4);
  padding: 10px;
  background: rgba(23, 19, 15, 0.6);
  box-shadow: 0 30px 60px -30px rgba(0, 0, 0, 0.7);
}

.board-pane__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.board-pane__nav {
  font-family: var(--mono);
  font-size: 15px;
  color: var(--brass-bright);
  background: transparent;
  border: 1px solid rgba(201, 162, 75, 0.35);
  width: 38px;
  height: 34px;
  cursor: pointer;
  transition:
    background 160ms ease,
    color 160ms ease,
    border-color 160ms ease;
}

.board-pane__nav:hover:not(:disabled) {
  background: var(--brass);
  border-color: var(--brass);
  color: var(--ink);
}

.board-pane__nav:disabled {
  opacity: 0.3;
  cursor: default;
}

.board-pane__nav--flip {
  margin-left: 10px;
}

.board-pane__ply {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  letter-spacing: 0.6px;
  width: 64px;
  text-align: center;
}

.board-pane__header {
  padding: 16px 18px 14px;
  border: 1px solid rgba(201, 162, 75, 0.28);
  background: rgba(23, 19, 15, 0.55);
  text-align: left;
}

.board-pane__players {
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-size: 19px;
  color: var(--parchment-dim);
  margin: 0 0 6px;
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.board-pane__players .is-active {
  color: var(--brass-bright);
}

.board-pane__vs {
  font-family: var(--mono);
  font-style: normal;
  font-size: 11px;
  color: var(--parchment-dim);
  opacity: 0.6;
}

.board-pane__meta,
.board-pane__result {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  margin: 0;
  letter-spacing: 0.3px;
}

.board-pane__result {
  margin-top: 4px;
  color: var(--brass);
}

.board-pane__moves {
  list-style: none;
  margin: 0;
  padding: 8px 12px;
  overflow-y: auto;
  max-height: 240px;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(201, 162, 75, 0.28);
  border-top: none;
  background: rgba(23, 19, 15, 0.55);
}

.board-pane__move-row {
  display: grid;
  grid-template-columns: 34px 1fr 1fr;
  align-items: center;
  gap: 4px;
}

.board-pane__move-number {
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  opacity: 0.55;
  text-align: right;
  padding-right: 6px;
}

.board-pane__move {
  font-family: var(--mono);
  font-size: 13px;
  text-align: left;
  color: var(--parchment);
  background: transparent;
  border: none;
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 2px;
  transition:
    background 140ms ease,
    color 140ms ease;
}

.board-pane__move:hover {
  background: rgba(201, 162, 75, 0.12);
}

.board-pane__move.is-current {
  background: var(--brass);
  color: var(--ink);
}

.board-pane__move.is-current .move-badge {
  color: var(--ink);
  opacity: 0.85;
}

.board-pane__footer {
  padding: 14px 18px 18px;
  border: 1px solid rgba(201, 162, 75, 0.28);
  border-top: none;
  background: rgba(23, 19, 15, 0.55);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.board-pane__filename {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--parchment-dim);
  opacity: 0.6;
  margin: 0;
  word-break: break-all;
}

.board-pane__reset {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  background: transparent;
  border: 1px solid rgba(201, 162, 75, 0.3);
  padding: 10px 16px;
  cursor: pointer;
  align-self: flex-start;
  transition:
    border-color 160ms ease,
    color 160ms ease;
}

.board-pane__reset:hover {
  border-color: var(--brass-bright);
  color: var(--brass-bright);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/BoardPane.tsx frontend/src/pages/BoardPane.css
git commit -m "feat: add BoardPane component for the persistent left analysis pane"
```

(`npm run build` will still fail at this point — `AnalysisLayout.tsx` doesn't render `BoardPane` yet and still references the old context shape. That's resolved in Task 4.)

---

### Task 3: Create `AnalysisTab` (live-engine panel + eval chart dashboard tab)

**Files:**
- Create: `frontend/src/pages/AnalysisTab.tsx`
- Create: `frontend/src/pages/AnalysisTab.css`

**Interfaces:**
- Consumes: `useAnalysis()` — reads `game`, `ply`, `goTo`, `evals`, `judgments`, `liveEngineEnabled`, `setLiveEngineEnabled`, `liveLines`, `liveDepth`.
- Produces: default-exported `AnalysisTab` component, no props.

- [ ] **Step 1: Create `AnalysisTab.tsx`**

```tsx
import EvalChart from '../components/EvalChart'
import LiveEnginePanel from '../components/LiveEnginePanel'
import { useAnalysis } from '../context/AnalysisContext'
import './AnalysisTab.css'

function AnalysisTab() {
  const { game, ply, goTo, evals, judgments, liveEngineEnabled, setLiveEngineEnabled, liveLines, liveDepth } =
    useAnalysis()

  const position = game.positions[ply]

  return (
    <div className="analysis-tab">
      <LiveEnginePanel
        enabled={liveEngineEnabled}
        onToggle={setLiveEngineEnabled}
        lines={liveLines}
        depth={liveDepth}
        fen={position}
      />

      {evals ? (
        <EvalChart evals={evals} moves={game.moves} judgments={judgments} currentPly={ply} onSelectPly={goTo} />
      ) : (
        <div className="analysis-tab__pending">
          <span className="spinner" aria-hidden="true" />
          Running engine analysis…
        </div>
      )}
    </div>
  )
}

export default AnalysisTab
```

- [ ] **Step 2: Create `AnalysisTab.css`**

```css
.analysis-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.analysis-tab__pending {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--parchment-dim);
  border: 1px solid rgba(201, 162, 75, 0.28);
  background: rgba(23, 19, 15, 0.55);
  padding: 28px 18px;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AnalysisTab.tsx frontend/src/pages/AnalysisTab.css
git commit -m "feat: add AnalysisTab component for the dashboard's live-engine/eval tab"
```

---

### Task 4: Rewire `AnalysisLayout` — split-pane layout, tab state, lifted live-engine state

**Files:**
- Modify: `frontend/src/pages/AnalysisLayout.tsx`
- Modify: `frontend/src/pages/AnalysisLayout.css`

**Interfaces:**
- Consumes: `AnalysisContext` (Task 1), `BoardPane` (Task 2), `AnalysisTab` (Task 3), `ReportView` (unchanged export from Task 5, but Task 4 can be done first — `ReportView` still default-exports the same way).
- Produces: `AnalysisLayout` no longer renders `<Outlet/>`; it directly renders `BoardPane` and the active dashboard tab.

- [ ] **Step 1: Update imports and add live-engine + tab state**

In `frontend/src/pages/AnalysisLayout.tsx`, replace the `react-router-dom` import and add the new imports/state. Change:

```tsx
import { NavLink, Outlet } from 'react-router-dom'
```

to nothing (remove it — no more `NavLink`/`Outlet` usage in this file), and add:

```tsx
import BoardPane from './BoardPane'
import AnalysisTab from './AnalysisTab'
import ReportView from './ReportView'
import { LiveEngine } from '../lib/stockfish'
import type { EngineLine } from '../lib/stockfish'
import { AnalysisContext } from '../context/AnalysisContext'
import type { AnalysisContextValue, DashboardTab } from '../context/AnalysisContext'
```

(`AnalysisContextValue` was already imported before as a type-only import from `'../context/AnalysisContext'` — keep that single import line, just add `DashboardTab` to it and drop the old separate import if present.)

Add state, alongside the existing `useState` calls (after `liveEngineEnabled`):

```tsx
const [activeTab, setActiveTab] = useState<DashboardTab>('analysis')
const liveEngineRef = useRef<LiveEngine | null>(null)
const [liveLines, setLiveLines] = useState<EngineLine[]>([])
const [liveDepth, setLiveDepth] = useState(0)
```

- [ ] **Step 2: Lift the live-engine query effect from `GameView`**

Add this effect in `AnalysisLayout.tsx`, after the existing analysis-run `useEffect` (the one calling `analyzeGame`). It needs the current FEN, which depends on `game` and `ply`:

```tsx
const position = game?.positions[ply]

const LIVE_DEPTH = 20

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
```

Note: `game` is `ParsedGame | null` at this point in the component (the dropzone-vs-app branch happens further down), so `position` must be computed defensively (`game?.positions[ply]`) and the effect must bail out when it's `undefined`. Place the `const position = ...` line and the `LIVE_DEPTH` constant (or hoist `LIVE_DEPTH` to module scope above the component, matching how it was a module-level constant in the old `GameView.tsx`) before these effects but after the `game` state declaration.

- [ ] **Step 3: Build the context value and render the split-pane layout**

Update the `contextValue` object (in the `if (!game || !fileName)` early-return's sibling branch) to include the new fields:

```tsx
const contextValue: AnalysisContextValue = {
  game,
  fileName,
  ply,
  goTo,
  orientation,
  setOrientation,
  evals,
  judgments,
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
```

Replace the final return block (currently the `nav` + `<Outlet context={contextValue} />`) with:

```tsx
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
          </div>

          <div className="dashboard-tabs__content">{activeTab === 'analysis' ? <AnalysisTab /> : <ReportView />}</div>
        </div>
      </div>
    </AnalysisContext.Provider>
  </div>
)
```

- [ ] **Step 4: Add split-pane and dashboard-tab CSS**

Append to `frontend/src/pages/AnalysisLayout.css`:

```css
.analysis-nav {
  justify-content: flex-end;
}

.analysis-split {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 32px;
  width: 100%;
  margin: 0 auto;
  padding: 32px clamp(20px, 4vw, 56px);
  align-items: start;
}

@media (max-width: 860px) {
  .analysis-split {
    grid-template-columns: 1fr;
  }
}

.analysis-split__board {
  position: sticky;
  top: 76px;
}

@media (max-width: 860px) {
  .analysis-split__board {
    position: static;
  }
}

.analysis-split__dashboard {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

.dashboard-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(201, 162, 75, 0.2);
}

.dashboard-tabs__tab {
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  background: transparent;
  cursor: pointer;
  padding: 8px 18px;
  border: 1px solid transparent;
  border-bottom: none;
  transition:
    color 160ms ease,
    border-color 160ms ease,
    background 160ms ease;
}

.dashboard-tabs__tab:hover {
  color: var(--parchment);
}

.dashboard-tabs__tab.is-active {
  color: var(--brass-bright);
  border-color: rgba(201, 162, 75, 0.4);
  background: rgba(201, 162, 75, 0.08);
}

.dashboard-tabs__content {
  min-width: 0;
}
```

`.analysis-nav { justify-content: flex-end; }` overrides the existing `space-between` from the base rule (kept, since the tabs `<div>` that used to occupy the start side is gone but `.analysis-nav__status` should still sit at the end) — this appended rule is later in the cascade so it wins over the earlier `justify-content: space-between` for the same selector.

- [ ] **Step 5: Typecheck and lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: Still fails — `ReportView.tsx` (Task 5) still calls `useNavigate`/`navigate('/analysis')` and `App.tsx` (Task 6) still declares nested routes referencing the now-deleted `GameView`. Confirm remaining errors are confined to `ReportView.tsx`, `App.tsx`, and (if not yet deleted) `GameView.tsx`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/AnalysisLayout.tsx frontend/src/pages/AnalysisLayout.css
git commit -m "feat: split analysis screen into persistent board pane + tabbed dashboard"
```

---

### Task 5: Update `ReportView` for in-page tab switching and fill-width layout

**Files:**
- Modify: `frontend/src/pages/ReportView.tsx`
- Modify: `frontend/src/pages/ReportView.css`

**Interfaces:**
- Consumes: `useAnalysis()` — now also reads `setActiveTab` (Task 1/4) instead of importing `useNavigate` from `react-router-dom`.

- [ ] **Step 1: Replace routing-based tab jump with context-based tab switch**

In `frontend/src/pages/ReportView.tsx`, remove:

```tsx
import { useNavigate } from 'react-router-dom'
```

and remove `const navigate = useNavigate()`. Change the destructured `useAnalysis()` call from:

```tsx
const { game, ply, goTo, judgments, evals } = useAnalysis()
```

to:

```tsx
const { game, ply, goTo, judgments, evals, setActiveTab } = useAnalysis()
```

Change `jumpToBoard`:

```tsx
const jumpToBoard = (targetPly: number) => {
  goTo(targetPly)
  setActiveTab('analysis')
}
```

- [ ] **Step 2: Adjust `.report` container to fill its dashboard column instead of centering as its own page**

In `frontend/src/pages/ReportView.css`, replace the `.report` rule:

```css
.report {
  width: min(1080px, 100%);
  margin: 40px auto 0;
  padding: 0 clamp(20px, 4vw, 56px);
  display: flex;
  flex-direction: column;
  gap: 24px;
}
```

with:

```css
.report {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
```

(The `.report__grid` breakpoint at 780px stays as-is — with the dashboard column now roughly 2/3 of the viewport instead of the full width, that breakpoint still triggers appropriately on narrow/tablet widths.)

- [ ] **Step 3: Typecheck and lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: Still fails only in `App.tsx`/`GameView.tsx` (Task 6 not yet done).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ReportView.tsx frontend/src/pages/ReportView.css
git commit -m "refactor: switch ReportView's board-jump to in-page tab state"
```

---

### Task 6: Simplify routing and delete `GameView`

**Files:**
- Modify: `frontend/src/App.tsx`
- Delete: `frontend/src/pages/GameView.tsx`
- Delete: `frontend/src/pages/GameView.css`

**Interfaces:**
- Produces: single `/analysis` route rendering `AnalysisLayout` with no children.

- [ ] **Step 1: Simplify `App.tsx`**

Replace the full contents of `frontend/src/App.tsx` with:

```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import AnalysisLayout from './pages/AnalysisLayout'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/analysis" replace />} />
      <Route path="/analysis" element={<AnalysisLayout />} />
    </Routes>
  )
}

export default App
```

- [ ] **Step 2: Delete `GameView.tsx` and `GameView.css`**

```bash
rm frontend/src/pages/GameView.tsx frontend/src/pages/GameView.css
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd frontend && npm run build && npm run lint`
Expected: Both PASS with zero errors. If `tsc -b` reports unused-import or unused-variable errors anywhere touched in this plan, fix them before proceeding (do not suppress with `eslint-disable` beyond the one pre-existing `react-hooks/exhaustive-deps` line carried over into `BoardPane.tsx`).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git rm frontend/src/pages/GameView.tsx frontend/src/pages/GameView.css
git commit -m "refactor: collapse /analysis and /analysis/report into one route"
```

---

### Task 7: Manual verification in the browser

**Files:** none (manual QA only).

- [ ] **Step 1: Start the dev server**

Run: `cd frontend && npm run dev`

- [ ] **Step 2: Load a PGN and verify layout**

Open the printed local URL, drop/browse a `.pgn` file, and confirm:
- The board, move controls, player header, and moves list sit in a left pane that is visually ~1/3 of the screen width.
- The right ~2/3 of the screen shows the dashboard with "Analysis" and "Report" tabs.
- Clicking "Report" swaps only the right pane's content — the board/left pane does not re-render or disappear (e.g. scroll the moves list, then switch to Report and back — scroll position and board position should be undisturbed).
- Clicking a critical-moment or material-chart point in the Report tab jumps the board to that ply AND switches back to the Analysis tab.
- Toggling the live-engine panel (in the Analysis tab) shows arrows on the board in the left pane.
- Resize the window below ~860px and confirm the layout collapses to a single stacked column without breaking.

- [ ] **Step 3: Stop the dev server**

Kill the `npm run dev` process (Ctrl-C).

No commit for this task — it's verification only.
