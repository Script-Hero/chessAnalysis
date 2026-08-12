# Design Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the visual-design fixes from the 2026-08-11 component audit ("The Scoresheet") — ten components, each a scoped CSS/JSX change, no behavior or data-pipeline changes.

**Architecture:** Pure presentation-layer edits across existing components. No new components, no new dependencies, no changes to `lib/stockfish.ts`, `lib/analysis.ts`, `lib/graphMetrics.ts`, `lib/tree.ts`, or the engine pipeline. Each task touches one component's `.tsx`/`.css` pair (or, for Task 3, the parent `OverviewTab.tsx` that owns the stat-tile markup directly). Two new CSS custom properties are added to `index.css` (Task 2) because the existing palette doesn't have enough hue separation for the fixes that need it; everything else reuses existing tokens.

**Tech Stack:** React 19, TypeScript, Vite, react-chessboard. No test runner is configured — verification is `pnpm run build` (tsc -b + vite build) and `pnpm run lint` after each task, plus a Playwright screenshot re-check (reusing the same method and PGNs as the audit) as the final task.

## Global Constraints

- Package manager is `pnpm`. Run all commands from `frontend/`.
- Verify every task with `pnpm run build` and `pnpm run lint` before committing — no test runner exists in this repo.
- Do not touch `lib/stockfish.ts`, `lib/analysis.ts`, `lib/graphMetrics.ts`, `lib/tree.ts`, the engine worker, routing, or PGN parsing — this plan is visual-only.
- Reuse existing CSS custom properties from `frontend/src/index.css` wherever the fix doesn't specifically require a new one. Only Task 2 adds new tokens (`--tier-inaccuracy-warm`, `--tier-mistake-warm` — see Task 2 for why).
- Follow existing conventions: BEM-ish class naming (`component__part--modifier`), one `.tsx` + co-located `.css` per component, `var(--mono)` for labels/data, `var(--display)` for headings.
- Every task ends with a working, visually-verifiable app — no task should leave the dashboard in a broken state.
- Source review this plan implements: `docs/superpowers/plans/../../../` conversation — "The Scoresheet" audit (not saved as a repo file; findings are restated in full in each task below, so no external doc lookup is needed).

---

## File Structure

Files touched, grouped by task:

- **Task 1** — `frontend/src/pages/AnalysisLayout.css` (dropzone corner brackets)
- **Task 2** — `frontend/src/index.css` (two new color tokens), `frontend/src/components/overview/PlayerSummary.css` (segment palette + gaps)
- **Task 3** — `frontend/src/pages/OverviewTab.tsx` (stat-tile markup), `frontend/src/pages/OverviewTab.css` (stat-tile valence styling)
- **Task 4** — `frontend/src/components/overview/MaterialChart.tsx`, `frontend/src/components/overview/MaterialChart.css` (header hierarchy to match Phase Accuracy)
- **Task 5** — `frontend/src/pages/OverviewTab.tsx` (move the scatter section above the stat-tile/phase grid), `frontend/src/components/overview/GraphScatter.css` (tick legibility)
- **Task 6** — `frontend/src/pages/BoardPane.css` (move-pair grid + row grouping)
- **Task 7** — `frontend/src/pages/AnalysisLayout.css` (`.dashboard-tabs__tab` inactive-state affordance)
- **Task 8** — `frontend/src/components/explore/EvalChart.tsx`, `frontend/src/components/explore/EvalChart.css` (y-axis gridlines, cursor color)
- **Task 9** — `frontend/src/pages/BoardPane.tsx` (`ARROW_COLORS`)
- **Task 10** — `frontend/src/components/explore/GameTree.tsx` (auto-scroll to current ply)
- **Task 11** — Playwright visual re-check across all ten fixes (verification only, no source changes)

---

### Task 1: Dropzone corner brackets

**Files:**
- Modify: `frontend/src/pages/AnalysisLayout.css:147-188` (`.dropzone__corner` and its 4 direction variants)

**Context:** The empty-state dropzone (`AnalysisLayout.tsx:199-244`) uses four `<span className="dropzone__corner dropzone__corner--tl|tr|bl|br">` elements to draw viewfinder-style corner brackets. At `1.5px` border width and `opacity: 0.55`, they're nearly invisible against the card edge — the detail that should read as "precise instrument" currently reads as unfinished.

- [ ] **Step 1: Thicken the bracket stroke and raise resting opacity**

In `frontend/src/pages/AnalysisLayout.css`, find:

```css
.dropzone__corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 1.5px solid var(--brass);
  opacity: 0.55;
  transition:
    opacity 220ms ease,
    width 220ms ease,
    height 220ms ease;
}

.dropzone--active .dropzone__corner {
  opacity: 1;
  width: 30px;
  height: 30px;
}
```

Replace with:

```css
.dropzone__corner {
  position: absolute;
  width: 22px;
  height: 22px;
  border: 2px solid var(--brass);
  opacity: 0.85;
  transition:
    opacity 220ms ease,
    width 220ms ease,
    height 220ms ease,
    border-color 220ms ease;
}

.dropzone:hover .dropzone__corner {
  border-color: var(--brass-bright);
}

.dropzone--active .dropzone__corner {
  opacity: 1;
  width: 30px;
  height: 30px;
  border-color: var(--brass-bright);
}
```

- [ ] **Step 2: Verify in the browser**

Run: `pnpm run dev` (from `frontend/`), open `http://localhost:5173`, and look at the empty dropzone. The four corner brackets should read clearly against the card edge at rest, brighten further on hover, and brighten again while dragging a file over the card.

- [ ] **Step 3: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

Expected: both succeed with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AnalysisLayout.css
git commit -m "style: strengthen dropzone corner-bracket contrast"
```

---

### Task 2: Player summary quality-bar segment palette

**Files:**
- Modify: `frontend/src/index.css:1-31` (add two tokens)
- Modify: `frontend/src/components/overview/PlayerSummary.css:1-129` (segment colors + gaps)

**Context:** `PlayerSummary.tsx`'s `QualityBar` renders six segments (`Best → Blunder`) side by side with `flexGrow` proportional to move counts. The middle three — Good, Inaccuracy, Mistake — currently use `--tier-good` (`#8a7038`), `--status-warning` (`#fab219`), `--status-serious` (`#ec835a`) respectively, all warm hues within ~15° of each other, abutting with no gap (`margin-right: 2px` only). Best/Excellent use `--brass-bright`/`--brass` (also warm-adjacent). The whole six-step scale needs wider hue spacing, and segments need a visible boundary independent of color.

- [ ] **Step 1: Add two new tokens to the palette**

In `frontend/src/index.css`, inside the `:root` block, find:

```css
  --status-warning: #fab219;
  --status-serious: #ec835a;
  --status-critical: #d03b3b;
  --status-good: #4caf7d;
  --tree-alt: #8b6fe0;
```

Replace with:

```css
  --status-warning: #fab219;
  --status-serious: #ec835a;
  --status-critical: #d03b3b;
  --status-good: #4caf7d;
  --tree-alt: #8b6fe0;

  /* Wider-spaced warm ramp for the player-summary quality bar (Task 2 of the
     2026-08-11 design review) — the existing warning/serious pair sit too
     close in hue to read as distinct segments at a glance. */
  --tier-inaccuracy-warm: #e08a2e;
  --tier-mistake-warm: #c65a3a;
```

- [ ] **Step 2: Widen the segment hue ramp and add inter-segment gaps**

In `frontend/src/components/overview/PlayerSummary.css`, find:

```css
.player-summary__segment {
  height: 100%;
  margin-right: 2px;
}
.player-summary__segment:last-child {
  margin-right: 0;
}
```

Replace with:

```css
.player-summary__bar {
  gap: 2px;
}

.player-summary__segment {
  height: 100%;
}
```

(Note: `.player-summary__bar` already exists earlier in the file as `display: flex; height: 12px; width: 100%;` — add the `gap: 2px;` line into that existing rule rather than creating a duplicate selector. Remove the `margin-right`/`:last-child` rules entirely; `gap` on the flex container replaces them.)

Then find:

```css
.player-summary__segment--best {
  background: var(--brass-bright);
}
.player-summary__segment--excellent {
  background: var(--brass);
}
.player-summary__segment--good {
  background: var(--tier-good);
}
.player-summary__segment--inaccuracy {
  background: var(--status-warning);
}
.player-summary__segment--mistake {
  background: var(--status-serious);
}
.player-summary__segment--blunder {
  background: var(--status-critical);
}
```

Replace with:

```css
.player-summary__segment--best {
  background: var(--brass-bright);
}
.player-summary__segment--excellent {
  background: var(--brass);
}
.player-summary__segment--good {
  background: var(--tier-good);
}
.player-summary__segment--inaccuracy {
  background: var(--tier-inaccuracy-warm);
}
.player-summary__segment--mistake {
  background: var(--tier-mistake-warm);
}
.player-summary__segment--blunder {
  background: var(--status-critical);
}
```

Then find the matching swatch rules further down and apply the same substitution:

```css
.player-summary__swatch--inaccuracy {
  background: var(--status-warning);
}
.player-summary__swatch--mistake {
  background: var(--status-serious);
}
```

Replace with:

```css
.player-summary__swatch--inaccuracy {
  background: var(--tier-inaccuracy-warm);
}
.player-summary__swatch--mistake {
  background: var(--tier-mistake-warm);
}
```

- [ ] **Step 3: Verify in the browser**

Load a game with a mix of move qualities (e.g. `EliteCubedX_vs_AngelP116_2026.08.06.pgn` from the audit — it has Excellent/Good/Inaccuracy/Mistake/Blunder all present for at least one player). Confirm the four middle segments (Good/Inaccuracy/Mistake/Blunder) are each distinguishable at a glance, and a visible gap separates every segment.

- [ ] **Step 4: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/components/overview/PlayerSummary.css
git commit -m "style: widen quality-bar segment hues and add inter-segment gaps"
```

---

### Task 3: Stat-tile row valence coding

**Files:**
- Modify: `frontend/src/pages/OverviewTab.tsx:76-95` (stat-tile JSX)
- Modify: `frontend/src/pages/OverviewTab.css:48-75` (`.overview__stat*`)

**Context:** The four-tile row (`should've been found` / `genuinely hard misses` / `silent drift, untagged` / `precise, needle found`) renders all four numbers in identical `--brass-bright`, identical weight, identical size — despite the four having different implications (good news, neutral/expected, cautionary, complimentary). This is the single biggest missed opportunity from the audit: the row should be scannable by valence in under a second.

- [ ] **Step 1: Add a `tone` field to each tile and thread it through the class name**

In `frontend/src/pages/OverviewTab.tsx`, find:

```tsx
      <section className="overview__section">
        <div className="overview__stat-row">
          <div className="overview__stat">
            <span className="overview__stat-n">{counts['blunder-forced'] ?? 0}</span>
            <span className="overview__stat-label">should've been found</span>
          </div>
          <div className="overview__stat">
            <span className="overview__stat-n">{counts['blunder-open'] ?? 0}</span>
            <span className="overview__stat-label">genuinely hard misses</span>
          </div>
          <div className="overview__stat">
            <span className="overview__stat-n">{counts['drift'] ?? 0}</span>
            <span className="overview__stat-label">silent drift, untagged</span>
          </div>
          <div className="overview__stat">
            <span className="overview__stat-n">{counts['precise'] ?? 0}</span>
            <span className="overview__stat-label">precise, needle found</span>
          </div>
        </div>
      </section>
```

Replace with:

```tsx
      <section className="overview__section">
        <div className="overview__stat-row">
          <div className="overview__stat overview__stat--caution">
            <span className="overview__stat-n">{counts['blunder-forced'] ?? 0}</span>
            <span className="overview__stat-label">should've been found</span>
          </div>
          <div className="overview__stat overview__stat--neutral">
            <span className="overview__stat-n">{counts['blunder-open'] ?? 0}</span>
            <span className="overview__stat-label">genuinely hard misses</span>
          </div>
          <div className="overview__stat overview__stat--caution">
            <span className="overview__stat-n">{counts['drift'] ?? 0}</span>
            <span className="overview__stat-label">silent drift, untagged</span>
          </div>
          <div className="overview__stat overview__stat--good">
            <span className="overview__stat-n">{counts['precise'] ?? 0}</span>
            <span className="overview__stat-label">precise, needle found</span>
          </div>
        </div>
      </section>
```

(`should've been found` is a blunder the engine says was findable — that's the tile you want to be zero, so it's flagged `--caution`. `genuinely hard misses` is expected/unavoidable, so `--neutral`. `silent drift, untagged` is the caveat metric the audit called out by name, so `--caution`. `precise, needle found` is a compliment, so `--good`.)

- [ ] **Step 2: Style the three tones with a top-edge accent, not a font-color change**

In `frontend/src/pages/OverviewTab.css`, find:

```css
.overview__stat {
  flex: 1 1 130px;
  border: 1px solid rgba(201, 162, 75, 0.18);
  background: rgba(236, 226, 206, 0.02);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.overview__stat-n {
  font-family: var(--mono);
  font-size: 22px;
  font-weight: 600;
  color: var(--brass-bright);
}
```

Replace with:

```css
.overview__stat {
  flex: 1 1 130px;
  border: 1px solid rgba(201, 162, 75, 0.18);
  border-top: 2px solid rgba(201, 162, 75, 0.18);
  background: rgba(236, 226, 206, 0.02);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.overview__stat--good {
  border-top-color: var(--status-good);
}

.overview__stat--caution {
  border-top-color: var(--status-warning);
}

.overview__stat--neutral {
  border-top-color: rgba(201, 162, 75, 0.18);
}

.overview__stat-n {
  font-family: var(--mono);
  font-size: 22px;
  font-weight: 600;
  color: var(--brass-bright);
}
```

(A top-edge stripe rather than recoloring the numeral itself: the numeral stays legible in the brand's brass regardless of tone, and the stripe gives the half-second scan cue the audit asked for without turning the row into a traffic-light wall.)

- [ ] **Step 3: Verify in the browser**

Load any analyzed game. The four tiles should show three distinct top-border treatments: green (good), amber (caution) on two tiles, and the default muted brass (neutral) on one — all clearly visible without reading the caption text first.

- [ ] **Step 4: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/OverviewTab.tsx frontend/src/pages/OverviewTab.css
git commit -m "style: valence-code the overview stat tile row"
```

---

### Task 4: Match Material Balance's header weight to Phase Accuracy

**Files:**
- Modify: `frontend/src/components/overview/MaterialChart.tsx:48-54` (header markup)
- Modify: `frontend/src/components/overview/MaterialChart.css:8-29` (header styles)

**Context:** `PhaseAccuracy` and `MaterialChart` sit side by side in `.overview__grid` as visual equals, but `PhaseAccuracy` uses a large italic serif title (`.phase-accuracy__title`, 18px, `var(--display)`) while `MaterialChart` uses a small mono uppercase label (`.material-chart__title`, 11px, `var(--mono)`) — the same treatment `EvalChart` uses for its own small caption. Give Material Balance the same header formality as its neighbor.

- [ ] **Step 1: Split Material Balance's header into a display-font title plus a separate small readout**

In `frontend/src/components/overview/MaterialChart.tsx`, find:

```tsx
      <div className="material-chart">
        <div className="material-chart__header">
          <span className="material-chart__title">Material balance</span>
          <span className="material-chart__readout">
            {activeValue > 0 ? `White +${activeValue}` : activeValue < 0 ? `Black +${-activeValue}` : 'Even'}
          </span>
        </div>
```

Replace with:

```tsx
      <div className="material-chart">
        <div className="material-chart__header">
          <h3 className="material-chart__title">Material balance</h3>
          <span className="material-chart__readout">
            {activeValue > 0 ? `White +${activeValue}` : activeValue < 0 ? `Black +${-activeValue}` : 'Even'}
          </span>
        </div>
```

- [ ] **Step 2: Give the title the same display-font treatment as `.phase-accuracy__title`**

In `frontend/src/components/overview/MaterialChart.css`, find:

```css
.material-chart__title {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--parchment-dim);
  opacity: 0.75;
}
```

Replace with:

```css
.material-chart__title {
  font-family: var(--display);
  font-style: italic;
  font-weight: 500;
  font-size: 18px;
  color: var(--parchment);
  margin: 0;
}
```

Then find the header container rule:

```css
.material-chart__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
```

Replace with:

```css
.material-chart__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
```

(Larger bottom margin because `.phase-accuracy__title` carries `margin: 0 0 20px` below it — the two cards should now breathe similarly before their respective chart/table content starts.)

- [ ] **Step 3: Verify in the browser**

With the Overview tab open, `Accuracy by phase` and `Material balance` should now read as two cards of equal formality — same size/weight of title, similar spacing before the content below.

- [ ] **Step 4: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/overview/MaterialChart.tsx frontend/src/components/overview/MaterialChart.css
git commit -m "style: promote Material Balance header to match Phase Accuracy"
```

---

### Task 5: Move the scatter chart above the fold; improve axis-tick legibility

**Files:**
- Modify: `frontend/src/pages/OverviewTab.tsx:72-137` (section order)
- Modify: `frontend/src/components/overview/GraphScatter.css:16-28` (tick sizing/padding)

**Context:** `Move quality vs. how open the position was` (`GraphScatter` + its legend + `GraphTimeline`) is the last section on the Overview tab. Across all five audited games, at both 1600×1000 and 1024×800 viewports, this section sat entirely below the fold with no scroll cue anywhere on the page. Note for implementers: `GraphScatter` already has a working legend (rendered separately in `OverviewTab.tsx:115-130`) and axis ticks/gridlines (`GraphScatter.tsx:39-51`) — the audit's live screenshots simply never scrolled far enough to see them. The real fix here is placement, not adding missing chart features. While in the file, also widen the tick label's hit area slightly since it's genuinely small at 8px in a 560-viewBox SVG.

- [ ] **Step 1: Move the scatter section to sit directly after Player Summary, before the stat-tile row**

In `frontend/src/pages/OverviewTab.tsx`, the current order is: `PlayerSummary` → stat-tile `<section>` → `.overview__grid` (Phase + Material) → `TimePressureChart` (conditional) → scatter `<section>` → Signals `<section>` → `CriticalMoments`.

Cut the entire scatter `<section>` block (from `<section className="overview__section">` containing the `<h3>Move quality...` heading through its closing `</section>`, currently lines ~112–132) and the stat-tile `<section>` block (lines ~76–95), then reinsert them in this order, immediately after `<PlayerSummary ... />` and before `<div className="overview__grid">`:

```tsx
  return (
    <div className="overview">
      <PlayerSummary white={white} black={black} accuracy={accuracy} />

      <section className="overview__section">
        <h3 className="overview__heading">Move quality vs. how open the position was</h3>
        <GraphScatter metrics={metrics} selectedIndex={null} onSelect={(index) => jumpToBoard(index)} />
        <div className="overview__legend">
          {LEGEND_BUCKETS.map((bucket) => (
            <span key={bucket} className="overview__legend-item">
              <span className="overview__legend-dot" style={{ background: `var(${BUCKET_INFO[bucket].colorVar})` }} />
              {BUCKET_INFO[bucket].label}
            </span>
          ))}
          <span className="overview__legend-item">
            <span className="overview__legend-dot overview__legend-dot--mover" style={{ borderColor: 'var(--white-accent)' }} />
            White to move
          </span>
          <span className="overview__legend-item">
            <span className="overview__legend-dot overview__legend-dot--mover" style={{ borderColor: 'var(--black-accent)' }} />
            Black to move
          </span>
        </div>
        <GraphTimeline metrics={metrics} selectedIndex={null} onSelect={(index) => jumpToBoard(index)} />
      </section>

      <section className="overview__section">
        <div className="overview__stat-row">
          <div className="overview__stat overview__stat--caution">
            <span className="overview__stat-n">{counts['blunder-forced'] ?? 0}</span>
            <span className="overview__stat-label">should've been found</span>
          </div>
          <div className="overview__stat overview__stat--neutral">
            <span className="overview__stat-n">{counts['blunder-open'] ?? 0}</span>
            <span className="overview__stat-label">genuinely hard misses</span>
          </div>
          <div className="overview__stat overview__stat--caution">
            <span className="overview__stat-n">{counts['drift'] ?? 0}</span>
            <span className="overview__stat-label">silent drift, untagged</span>
          </div>
          <div className="overview__stat overview__stat--good">
            <span className="overview__stat-n">{counts['precise'] ?? 0}</span>
            <span className="overview__stat-label">precise, needle found</span>
          </div>
        </div>
      </section>

      <div className="overview__grid">
        <PhaseAccuracy white={white} black={black} phases={phaseAccuracy} />
        <MaterialChart positions={game.positions} currentPly={ply} onSelectPly={jumpToBoard} />
      </div>

      {showClock && (
        <TimePressureChart
          moves={game.moves}
          judgments={judgments}
          timeControl={game.headers.TimeControl}
          currentPly={ply}
          onSelectPly={jumpToBoard}
        />
      )}

      <section className="overview__section">
        <h3 className="overview__heading">Signals</h3>
        <GraphInsights metrics={metrics} />
      </section>

      <CriticalMoments
        moments={criticalMoments}
        positions={game.positions}
        currentPly={ply}
        onJump={(momentPly) => jumpToBoard(momentPly - 1)}
      />
    </div>
  )
```

(Stat-tile JSX above already includes the `--caution`/`--neutral`/`--good` classes from Task 3 — if Task 3 hasn't run yet when you do this step, use the plain `overview__stat` classes and Task 3 will add the modifiers later; either order works since they touch non-overlapping lines once Task 3 lands.)

- [ ] **Step 2: Increase the scatter chart's tick label size slightly**

In `frontend/src/components/overview/GraphScatter.css`, find:

```css
.graph-scatter__tick {
  font-family: var(--mono);
  font-size: 8px;
  fill: var(--parchment-dim);
}
```

Replace with:

```css
.graph-scatter__tick {
  font-family: var(--mono);
  font-size: 9px;
  fill: var(--parchment-dim);
  opacity: 0.85;
}
```

- [ ] **Step 3: Verify in the browser**

Load a game. `Move quality vs. how open the position was`, its legend, and the timeline strip below it should now be visible immediately below the player-accuracy cards, without scrolling, on a 1600×1000 viewport.

- [ ] **Step 4: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/OverviewTab.tsx frontend/src/components/overview/GraphScatter.css
git commit -m "style: promote move-quality scatter above the fold on Overview"
```

---

### Task 6: Board pane move-pair grouping

**Files:**
- Modify: `frontend/src/pages/BoardPane.css:120-134` (`.board-pane__move-row`, `.board-pane__move-number`)

**Context:** `.board-pane__move-row` is `grid-template-columns: 34px 1fr 1fr` inside a ~480px-wide panel. On a typical row, White's SAN button sits flush-left in the second column and Black's sits flush-left in the third — with `1fr`/`1fr` splitting the remaining ~440px in half, the two SAN entries for the same move end up roughly 200–300px apart, reading as two independent lists rather than one move-pair.

- [ ] **Step 1: Narrow the SAN columns so both moves sit close together, left-aligned as a pair**

In `frontend/src/pages/BoardPane.css`, find:

```css
.board-pane__move-row {
  display: grid;
  grid-template-columns: 34px 1fr 1fr;
  align-items: center;
  gap: 4px;
}
```

Replace with:

```css
.board-pane__move-row {
  display: grid;
  grid-template-columns: 34px minmax(64px, auto) minmax(64px, auto) 1fr;
  align-items: center;
  gap: 4px;
  padding: 1px 4px;
  border-radius: 2px;
}

.board-pane__move-row:hover {
  background: rgba(201, 162, 75, 0.05);
}
```

(The trailing `1fr` is a spacer column that absorbs the rest of the row width, so White and Black's SAN buttons now sit adjacent — each sized to its content via `minmax(64px, auto)` — instead of each being stretched to fill half the panel. The row-level hover background is new: it gives the whole move-pair a single highlight on mouse-over, reinforcing that it's one unit, and costs nothing since `.board-pane__move:hover` already exists as a separate finer-grained highlight on the individual SAN button.)

- [ ] **Step 2: Verify in the browser**

Load any game and look at the move list. White and Black's SAN entries for the same move number should now sit close together near the left edge of the row, with empty space pushed to the right rather than split between them.

- [ ] **Step 3: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/BoardPane.css
git commit -m "style: group move-pairs in the board pane move list"
```

---

### Task 7: Tab bar inactive-state affordance

**Files:**
- Modify: `frontend/src/pages/AnalysisLayout.css:308-334` (`.dashboard-tabs__tab`)

**Context:** `Overview`/`Explore` is the entire primary navigation of the app — two destinations, no more. The active tab gets a border + tinted background (`.dashboard-tabs__tab.is-active`); the inactive tab gets `border: 1px solid transparent` and dimmed text only, with no persistent affordance marking it as clickable. At rest it can read as a disabled label rather than "the other view."

- [ ] **Step 1: Add a persistent underline to both tabs, filled for the active one**

In `frontend/src/pages/AnalysisLayout.css`, find:

```css
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
```

Replace with:

```css
.dashboard-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid rgba(201, 162, 75, 0.2);
}

.dashboard-tabs__tab {
  position: relative;
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

.dashboard-tabs__tab::after {
  content: '';
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: -1px;
  height: 2px;
  background: rgba(201, 162, 75, 0.35);
  transition: background 160ms ease;
}

.dashboard-tabs__tab:hover {
  color: var(--parchment);
}

.dashboard-tabs__tab.is-active {
  color: var(--brass-bright);
  border-color: rgba(201, 162, 75, 0.4);
  background: rgba(201, 162, 75, 0.08);
}

.dashboard-tabs__tab.is-active::after {
  background: var(--brass-bright);
}
```

(Both tabs now carry a visible bottom rule at rest — a dim brass line on the inactive one, a bright solid line on the active one — so the inactive tab reads as "the other live view" instead of a disabled label. The `::after` sits at `bottom: -1px` to align with the shared `.dashboard-tabs` border, and inherits the tab's own horizontal padding via the `left/right: 18px` offsets so it doesn't need a magic width value.)

- [ ] **Step 2: Verify in the browser**

With a game loaded, look at the Overview/Explore tab bar. Both tabs should show a visible underline at rest; the active tab's should be brighter/solid, the inactive one dimmer but still clearly present.

- [ ] **Step 3: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AnalysisLayout.css
git commit -m "style: add persistent underline to both dashboard tabs"
```

---

### Task 8: Engine evaluation chart — gridlines and cursor color

**Files:**
- Modify: `frontend/src/components/explore/EvalChart.tsx:87-127` (add gridline `<line>`/`<text>` elements, per-instance `maxAbs`)
- Modify: `frontend/src/components/explore/EvalChart.css:62-99` (`.eval-chart__cursor`, new `.eval-chart__gridline`/`.eval-chart__gridline-label`)

**Context:** The area chart has no y-axis reference at all beyond a single zero baseline — no tick marks, no indication of score range, so a reader can see the shape of a game's swings but can't calibrate their size without hovering every point. Separately, the current-ply cursor (`.eval-chart__cursor`) is styled `stroke: var(--brass-bright)`, which is the exact same hex value as `--white-accent` (`#e8c375` — check `index.css:7` and `:11`) used for the "White ahead" fill/line, so the cursor visually merges into the area fill on frames where White is ahead.

- [ ] **Step 1: Add reference gridlines at ±1 and ±3 (clamped to the chart's own scale) with edge labels**

In `frontend/src/components/explore/EvalChart.tsx`, find:

```tsx
  const n = evals.length

  const maxAbs = Math.min(12, Math.max(1.5, ...evals.map((e) => Math.abs(e.score))))

  const xAt = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * INNER_W)
  const yAt = (score: number) => MID_Y - (Math.max(-maxAbs, Math.min(maxAbs, score)) / maxAbs) * (INNER_H / 2)
```

Replace with:

```tsx
  const n = evals.length

  const maxAbs = Math.min(12, Math.max(1.5, ...evals.map((e) => Math.abs(e.score))))

  const xAt = (i: number) => PAD.left + (n === 1 ? 0 : (i / (n - 1)) * INNER_W)
  const yAt = (score: number) => MID_Y - (Math.max(-maxAbs, Math.min(maxAbs, score)) / maxAbs) * (INNER_H / 2)

  const gridScores = [1, 3].filter((v) => v < maxAbs)
```

- [ ] **Step 2: Render the gridlines and edge labels, and add a neutral cursor color**

Still in `EvalChart.tsx`, find:

```tsx
        <line
          className="eval-chart__baseline"
          x1={PAD.left}
          y1={MID_Y}
          x2={VIEW_W - PAD.right}
          y2={MID_Y}
        />

        <path className="eval-chart__area eval-chart__area--white" d={areaPath} clipPath={`url(#${clipId}-above)`} />
```

Replace with:

```tsx
        <line
          className="eval-chart__baseline"
          x1={PAD.left}
          y1={MID_Y}
          x2={VIEW_W - PAD.right}
          y2={MID_Y}
        />

        {gridScores.map((v) => (
          <g key={v}>
            <line
              className="eval-chart__gridline"
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={yAt(v)}
              y2={yAt(v)}
            />
            <line
              className="eval-chart__gridline"
              x1={PAD.left}
              x2={VIEW_W - PAD.right}
              y1={yAt(-v)}
              y2={yAt(-v)}
            />
            <text className="eval-chart__gridline-label" x={VIEW_W - PAD.right - 4} y={yAt(v) - 3} textAnchor="end">
              +{v}
            </text>
            <text className="eval-chart__gridline-label" x={VIEW_W - PAD.right - 4} y={yAt(-v) - 3} textAnchor="end">
              -{v}
            </text>
          </g>
        ))}

        <path className="eval-chart__area eval-chart__area--white" d={areaPath} clipPath={`url(#${clipId}-above)`} />
```

- [ ] **Step 3: Give the cursor a neutral color independent of both accent colors**

Still in `EvalChart.tsx`, find:

```tsx
        <line
          className="eval-chart__cursor"
          x1={xAt(currentPly)}
          y1={PAD.top}
          x2={xAt(currentPly)}
          y2={VIEW_H - PAD.bottom}
        />
```

No change needed here — the class name stays `eval-chart__cursor`; the color fix happens entirely in CSS in the next step. This step is a no-op check: confirm this block is unchanged before moving to Step 4.

- [ ] **Step 4: Update the CSS — cursor color and new gridline styles**

In `frontend/src/components/explore/EvalChart.css`, find:

```css
.eval-chart__cursor {
  stroke: var(--brass-bright);
  stroke-width: 1;
  opacity: 0.7;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
```

Replace with:

```css
.eval-chart__cursor {
  stroke: var(--parchment);
  stroke-width: 1.5;
  opacity: 0.9;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.eval-chart__gridline {
  stroke: rgba(236, 226, 206, 0.08);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}

.eval-chart__gridline-label {
  font-family: var(--mono);
  font-size: 8px;
  fill: var(--parchment-dim);
  opacity: 0.6;
  pointer-events: none;
}
```

(`--parchment` — the app's off-white body-text color — reads clearly against both the gold-tinted "White ahead" fill and the blue-tinted "Black ahead" fill, unlike `--brass-bright` which was identical to `--white-accent`. Bumping `stroke-width` from `1` to `1.5` and opacity from `0.7` to `0.9` keeps the cursor legible now that it's competing visually with two new gridlines per side.)

- [ ] **Step 5: Verify in the browser**

Open the Explore tab on a game with evals outside ±1 (most real games qualify). Faint dashed gridlines with `+1`/`-1` (and `+3`/`-3` if the game's swings are large enough) should appear behind the area fill, and the current-ply cursor should read as an off-white line clearly distinct from the gold "White ahead" fill.

- [ ] **Step 6: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/explore/EvalChart.tsx frontend/src/components/explore/EvalChart.css
git commit -m "style: add reference gridlines to eval chart, fix cursor/fill color collision"
```

---

### Task 9: Distinct hues for overlapping live-engine board arrows

**Files:**
- Modify: `frontend/src/pages/BoardPane.tsx:9` (`ARROW_COLORS`)

**Context:** The board draws up to three candidate-move arrows (one per live-engine line) using `ARROW_COLORS`, currently three opacities of the same gold: `'rgba(232, 195, 117, 0.9)'`, `'rgba(232, 195, 117, 0.55)'`, `'rgba(232, 195, 117, 0.3)'`. When two of the top lines share a first move or cross the same squares — common early in a search — the arrows overlap and the opacity-only distinction collapses into one blurred shape. `CandidateLines`/`PositionTree` already solves exactly this problem elsewhere in the app with a three-hue palette (gold / blue / violet, via `--brass-bright`, `--white-accent`/`--black-accent`-adjacent tones, and `--tree-alt`); reuse that same separation strategy here instead of inventing a new one.

- [ ] **Step 1: Replace the three-opacity gold scale with three distinct hues**

In `frontend/src/pages/BoardPane.tsx`, find:

```tsx
const ARROW_COLORS = ['rgba(232, 195, 117, 0.9)', 'rgba(232, 195, 117, 0.55)', 'rgba(232, 195, 117, 0.3)']
```

Replace with:

```tsx
// Three distinct hues (not three opacities of one hue) so overlapping
// candidate-line arrows stay separable when two lines share squares — the
// same problem PositionTree already solves with --brass-bright / --tree-alt.
const ARROW_COLORS = ['rgba(232, 195, 117, 0.85)', 'rgba(127, 168, 232, 0.8)', 'rgba(139, 111, 224, 0.75)']
```

(`rgba(232, 195, 117, ...)` is `--brass-bright`/`--white-accent`, `rgba(127, 168, 232, ...)` is `--black-accent`, `rgba(139, 111, 224, ...)` is `--tree-alt` — all three already-established colors in the app's palette, expressed as rgba because `Arrow`'s `color` prop (from `react-chessboard`) takes a literal color string, not a CSS custom property reference. Opacity is kept high and close together across all three (0.85/0.8/0.75) since hue now does the separating work, not fade.)

- [ ] **Step 2: Verify in the browser**

Open Explore → Live on a middlegame position with the live-engine toggle on. The top three candidate lines should draw as gold, blue, and violet arrows respectively — where two arrows share squares, both remain individually identifiable by color rather than merging into one shape.

- [ ] **Step 3: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/BoardPane.tsx
git commit -m "style: give live-engine board arrows distinct hues instead of opacity steps"
```

---

### Task 10: Auto-scroll the game tree to the current ply

**Files:**
- Modify: `frontend/src/components/explore/GameTree.tsx:1-84` (add a ref + scroll effect)

**Context:** `GameTree` (rendered under Explore → Tree) already implements `.is-current` styling on the active node (`GameTree.tsx:109,120-121`; `GameTree.css:37-40,68-72,88-92` — larger radius, `var(--parchment)` stroke) — the marker exists and is correctly wired to `currentPly`. What's missing is that the scrollable container (`.game-tree`, `max-height: 480px; overflow-y: auto` in `GameTree.css:1-8`) never scrolls to bring that node into view — on a long game, the current-ply marker can be hundreds of pixels below the visible area on tab-open, making the tree look like it has no "you are here" indicator at all even though the code already draws one.

- [ ] **Step 1: Add a ref to the scroll container and a ref to the current node's row**

In `frontend/src/components/explore/GameTree.tsx`, find:

```tsx
import { useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
```

Replace with:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
```

- [ ] **Step 2: Track the current row's vertical position and scroll to it when `currentPly` changes**

Find:

```tsx
function GameTree({ rows, currentPly, onSelectPly, collapseThreshold }: GameTreeProps) {
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set())
```

Replace with:

```tsx
function GameTree({ rows, currentPly, onSelectPly, collapseThreshold }: GameTreeProps) {
  const [hover, setHover] = useState<HoverTarget | null>(null)
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
```

Then find the `renderItems`/`height`/`width` block:

```tsx
  const renderItems: RenderItem[] = items.flatMap((item): RenderItem[] => {
    if (item.kind === 'row') return [{ type: 'row', row: item.row }]
    if (expandedRuns.has(item.startPly)) return item.rows.map((row) => ({ type: 'row', row }))
    return [{ type: 'collapsed', startPly: item.startPly, endPly: item.endPly, rows: item.rows }]
  })

  const height = PAD_TOP * 2 + renderItems.length * ROW_PITCH
  const width = RAIL_X + BRANCH_DX * (DEFAULT_BRANCH_PLIES + 1) + 160
```

Replace with:

```tsx
  const renderItems: RenderItem[] = items.flatMap((item): RenderItem[] => {
    if (item.kind === 'row') return [{ type: 'row', row: item.row }]
    if (expandedRuns.has(item.startPly)) return item.rows.map((row) => ({ type: 'row', row }))
    return [{ type: 'collapsed', startPly: item.startPly, endPly: item.endPly, rows: item.rows }]
  })

  const height = PAD_TOP * 2 + renderItems.length * ROW_PITCH
  const width = RAIL_X + BRANCH_DX * (DEFAULT_BRANCH_PLIES + 1) + 160

  const currentRowIndex = renderItems.findIndex((item) =>
    item.type === 'row' ? item.row.ply === currentPly : currentPly >= item.startPly && currentPly <= item.endPly,
  )

  // Keep the current-ply marker in view whenever the viewed ply changes
  // (including on first mount) — otherwise, on a long game, the marker
  // GameTree already draws for `currentPly` can sit far below the visible
  // 480px scroll window with no indication it exists.
  useEffect(() => {
    if (currentRowIndex < 0) return
    const container = containerRef.current
    if (!container) return
    const rowY = PAD_TOP + currentRowIndex * ROW_PITCH
    const targetScrollTop = rowY - container.clientHeight / 2
    container.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' })
  }, [currentRowIndex])
```

- [ ] **Step 3: Attach the ref to the scrollable container**

Find:

```tsx
  return (
    <div className="game-tree">
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="game-tree__svg">
```

Replace with:

```tsx
  return (
    <div className="game-tree" ref={containerRef}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} className="game-tree__svg">
```

- [ ] **Step 4: Verify in the browser**

Load the longest audited game (`EliteCubedX_vs_AngelP116_2026.08.10.pgn`, 90 plies), jump to a late-game move via the board's move list (e.g. move 40+), then open Explore → Tree. The tree should auto-scroll so the current-ply node (larger radius, pale stroke) is visible near the vertical center of the panel, without any manual scrolling. Click a different move in the move list while Tree is open — the tree should smoothly re-scroll to follow.

- [ ] **Step 5: Build and lint**

```bash
cd frontend && pnpm run build && pnpm run lint
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/explore/GameTree.tsx
git commit -m "fix: auto-scroll game tree to keep the current ply in view"
```

---

### Task 11: Visual regression check across all five audited games

**Files:** None modified — verification only, reusing the audit's own method.

**Context:** The original audit used Playwright to screenshot Overview, Explore → Live, Explore → Tree, and Explore → Lines across five PGNs of varying length (`AngelP116_vs_EliteCubedX_2026.08.06.pgn`, `EliteCubedX_vs_AngelP116_2026.08.06.pgn`, `EliteCubedX_vs_AngelP116_2026.08.10.pgn`, and the two `lichess_pgn_*` files, all in `~/Downloads/`). Re-run the same pass now that all ten fixes are in, to confirm nothing regressed and that Tasks 3/5's reordering didn't break the conditional `TimePressureChart` rendering (only some of the five PGNs carry `%clk` annotations) or any responsive breakpoint.

- [ ] **Step 1: Start the dev server**

```bash
cd frontend && pnpm run dev
```

Leave it running in the background.

- [ ] **Step 2: Manually walk through one game covering every change**

Using a browser (or Playwright, matching the audit's original script pattern — launch Chromium, `setInputFiles` on `.dropzone__input`, wait for `.analysis-split`), load `EliteCubedX_vs_AngelP116_2026.08.10.pgn` (the 90-ply game — it exercises Task 10's auto-scroll most clearly) and check, in order:

1. Empty dropzone (before loading) — corner brackets visibly brighter (Task 1).
2. Overview tab — stat tiles show three distinct top-border tones (Task 3); scatter chart + legend visible without scrolling (Task 5); Material Balance card header now matches Phase Accuracy's size/weight (Task 4); quality bar segments in the top player-summary cards are visually distinct with gaps (Task 2).
3. Dashboard tab bar — both "Overview" and "Explore" show a visible underline at rest (Task 7).
4. Board pane move list — White/Black SAN pairs sit close together per row (Task 6).
5. Explore → Live, with the live-engine toggle on at a middlegame position — board arrows render in gold/blue/violet, not three shades of one gold (Task 9); eval chart shows faint dashed gridlines and an off-white (not gold) current-ply cursor (Task 8).
6. Explore → Tree, jumping to a late move first — tree auto-scrolls to the current node on open (Task 10).

- [ ] **Step 3: Repeat the dropzone/Overview/tab-bar checks on the shortest game**

Load `AngelP116_vs_EliteCubedX_2026.08.06.pgn` (13 moves, no `%clk` data) and confirm the Overview tab still renders correctly with `TimePressureChart` absent (since Task 5 reordered sections around its conditional render) and that the stat-tile row doesn't visually break with all-zero or low counts.

- [ ] **Step 4: Check the stat-tile row below 1024px**

The original audit only tested 1600×1000 and 1024×800 and noted the four-across `.overview__stat-row` (`OverviewTab.css:48-52`, `flex-wrap: wrap` with `flex: 1 1 130px` per tile) had no explicit breakpoint, without confirming whether it actually breaks. Resize the browser (or set a Playwright viewport) to 480px wide and confirm the tiles wrap to 2-across or 1-across cleanly rather than overflowing or clipping the top-border valence stripe added in Task 3. No source change is expected here — this step is confirming the existing `flex-wrap` already handles it; only file a fix if it visibly doesn't.

- [ ] **Step 5: Confirm the full build is clean**

```bash
cd frontend && pnpm run build && pnpm run lint
```

Expected: both succeed with zero errors and zero new lint warnings.

- [ ] **Step 6: Commit (if Step 2/3/4 surfaced any follow-up fixes)**

If the walkthrough is clean, this task needs no commit — Tasks 1–10 already committed their own changes. If the walkthrough surfaces a regression, fix it in the relevant task's files and commit as:

```bash
git add <fixed files>
git commit -m "fix: address regression found in design-fixes visual walkthrough"
```

