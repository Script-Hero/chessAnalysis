# Analysis Screen: Persistent Board + Tabbed Dashboard

## Goal

On the analysis screen, the chess board should always occupy a fixed left
pane at 1/3 of the horizontal width. The remaining 2/3 of the screen is a
dashboard that can switch between tabs, but the board (and its immediate
controls/moves list) never leaves the screen when switching tabs.

## Current State

- `AnalysisLayout.tsx` is the shared shell (top nav with "Board"/"Report"
  `NavLink` tabs) wrapping a react-router `<Outlet/>`.
- `/analysis` (index route) renders `GameView.tsx`: a two-column grid
  (`minmax(320px,560px) minmax(260px,340px)`) containing the board, move
  controls, live-engine panel, and eval chart on the left; player header +
  scrollable moves list on the right (`aside.viewer__panel`).
- `/analysis/report` renders `ReportView.tsx`: a separate full-width page
  (player summary, phase accuracy, material chart, critical moments) with no
  board.
- Switching tabs today means the board disappears entirely on the Report
  route.

## Target Layout

`AnalysisLayout` becomes a two-pane grid at the top level:

- **Left pane (1/3 width, persistent)**: board frame, move controls, player
  header, and the moves list — stacked vertically, resized to fit the
  narrower column. This content moves out of `GameView` and into
  `AnalysisLayout` so it renders once regardless of which dashboard tab is
  active.
- **Right pane (2/3 width, dashboard)**: tab-switchable content, driven by
  in-page React state (not routing/URL) since tabs are not independently
  bookmarkable — just view toggles within one screen.
  - **Analysis tab**: live-engine panel + eval chart (what remains of
    `GameView` after the board/moves move out).
  - **Report tab**: `ReportView`'s existing content, unchanged internally,
    just rendered inside the narrower 2/3 column instead of its own
    `min(1080px, 100%)` centered page.

Below an ~860px breakpoint, the layout collapses to a single stacked column
(left pane content, then the active dashboard tab content) — same responsive
pattern already used in `GameView.css`.

## Component/Data Changes

- Game state, current move index, and other data currently owned by
  `GameView` that both the board (left pane) and the live-engine/eval tab
  (right pane) need, moves up into `AnalysisLayout` and is passed down as
  props to the left-pane content and to whichever dashboard tab is active.
- `AnalysisLayout` holds `activeTab` state (`'analysis' | 'report'`) and
  renders the corresponding right-pane component directly — no more
  `react-router` `Outlet`/nested routes for these two views. The `/analysis`
  and `/analysis/report` routes collapse to a single `/analysis` route.
- `GameView.tsx` is trimmed to just the live-engine panel + eval chart
  (or its logic is inlined into a small new component/file if what remains
  is thin enough that a standalone file no longer earns its keep — decide
  during implementation based on remaining size).
- `ReportView.tsx` keeps its internal structure; only its outer container
  width/centering CSS changes to fit the 2/3 column instead of its own
  full-width page.

## CSS Changes

- `AnalysisLayout.css` gains the top-level grid:
  `grid-template-columns: 1fr 2fr` (1/3 vs 2/3), collapsing to `1fr` under
  ~860px.
- `GameView.css`'s `.viewer` two-column grid is removed/simplified since the
  board+moves and live-engine/eval are no longer siblings in one grid — the
  left pane's internal stacking (board → controls → player header → moves)
  becomes a simple flex column, and the right pane's live-engine/eval
  content becomes its own flex column sized to the 2/3 pane.
- `ReportView.css`'s `.report` outer width rule (`min(1080px, 100%)`,
  centered margin) is replaced with a rule that just fills its parent (the
  2/3 dashboard pane).

## Out of Scope

- No new tabs beyond Analysis/Report are being added now; the tab
  mechanism should be simple enough to extend later but no extra tabs are
  built speculatively.
- No changes to the underlying analysis/report data logic, only to layout
  and where components render.
