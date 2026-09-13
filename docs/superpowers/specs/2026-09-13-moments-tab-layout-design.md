# Moments tab: one timeline, one selected move

## Problem

The Moments tab exists to point the player at moves worth opening in The Move
tab. Its first two sections do that: **Worth reviewing** tells the story of the
moves that decided the game, and **Choices across the game** shows where the
room to move was. The three folded sections below them do not:

- **Decision breakdown** (openness × choice grid) gives counts with no
  takeaway, and "corridor" is never explained.
- **Effectively one-choice decisions** largely repeats Worth reviewing's hard
  saves and cracks, in jargon ("87% outside tolerance").
- **Model-based impact ranking** repeats Worth reviewing's biggest swings with
  a less legible number and a model the reader has to take on faith.

Separately, every section is its own island: nothing shows that a Worth
reviewing moment sits inside a narrowing stretch, and a spike on one chart
can't be lined up against another without counting move numbers.

The Report tab already shows evaluation, material and clock over time, so the
replacements must add information those charts don't carry.

## Change

Remove the three folded sections. The tab becomes three blocks, top to bottom,
sharing one notion of the selected move:

```
1. Worth reviewing          the story — unchanged content
2. Game timeline            one shared move axis, stacked lanes
     Choices lanes          existing chart, plus pins and cause links
     Compensation lane      new
     Piece lanes            new, collapsed by default
   Selected-move panel      candidate spread + "Open in The Move"
3. Think time vs difficulty new, only for games with clock data
```

No engine work changes. Everything is derived from data already in
`AnalysisContext`: `evals`, `judgments`, `survey`, `decisions`, `corridor`,
`explanations`, `game.moves[].clockSeconds`, `game.positions`.

### Page state and interaction model

- **Selected move** is the app's existing `decisionIndex`. Selecting a move
  anywhere on the tab calls `goTo(index)`, so the board shows the position
  before that move, exactly as today. No new selection state.
- **Hover** is local page state (`hoverIndex: number | null`) owned by
  `MomentsTab`. Hovering a bar, a piece-lane dot or a scatter dot sets it; every
  lane draws a hairline at the hovered move, and the timeline readout describes
  it. Hover does not move the board — the board follows selection only, so
  sweeping the mouse across the chart never throws away the position the reader
  is studying.
- **Highlighted moments** is local state (`highlight: { from, to } | null`),
  set by hovering a Worth reviewing row. The timeline shades that span in every
  lane.
- **Brushed moves** is local state (`brushed: Set<number>`), set by dragging a
  rectangle on the scatter. Brushed moves are outlined in the choices lanes;
  everything else dims. Clicking empty scatter space clears it.
- **Click on a graph selects; the panel opens.** Clicking a bar, dot or pin
  selects that move (`goTo`). Only the selected-move panel's **Open in The
  Move →** button calls `studyDecision`. Worth reviewing rows keep opening the
  move directly: their explanation is already written, so there's nothing to
  preview first.
- **Reviewed moves fade.** Any move opened from this tab (a Worth reviewing row,
  a detail reference, or the panel button) is recorded as reviewed in
  `localStorage` under `moments-reviewed:<gameKey>`. Reviewed moves render at
  reduced opacity in the timeline lanes and scatter, and their Worth reviewing
  row shows a "Reviewed" tag. Storage failures are ignored (the page renders
  as if nothing was reviewed). No game key → no persistence.
- The existing White/Black **move filter** applies to every block.

### 1. Worth reviewing

Content and detection unchanged. Two additions:

- `MomentsTab` computes `findMoments(...)` once and passes the result down, so
  the timeline can pin the same moments. `ReviewMoments` accepts optional
  `moments`, `onHover(span | null)`, `reviewed` and `onOpen` props and falls
  back to computing its own list when `moments` isn't given.
- Row hover reports `{ from: swing.from, to: swing.to }` for highlighting.

### 2. Game timeline

A new `GameTimeline` component owns the horizontal scale and the single scroll
container. All lanes render inside that container at the same width, so they
scroll together and a move sits at the same x in every lane.

**Scale.** Same as today's `CorridorChart`: one column per full move,
`width = max(available, 640, fullMoves × 14)`, a 48px left gutter for labels.
A move with index `i` is centred at `x(i + 1)`; a position `p` sits at the
column boundary `48 + (p / 2) / fullMoves × (width − 64)`.

**Readout** (above the lanes, not scrolled): for the hovered move, else the
selected move — move label, effective choices, the played move's result
(best / held / left the safe moves), compensation at that position, and a
"Worth reviewing" tag if a pinned moment covers it.

**Choices lanes.** The existing chart's bars, × marks and narrowing-stretch
intervals, moved into the shared scale. New:

- **Pins.** Each Worth reviewing moment draws a small marker above its move in
  the mover's lane, and a faint band over its swing span across all lanes. Pins
  are how the timeline avoids repeating the list: a striking bar with no pin is
  the thing the list didn't mention.
- **Cause links.** Where an accurate move by one side cut the other side's next
  decision to ≤ 2.5 effective choices from a recent typical ≥ 4 (the detector
  `findMoments` already uses for "set a problem"), draw a thin curved connector
  from the setter's bar to the squeezed bar. The detector is extracted from
  `findMoments` into an exported `findSqueezes(...)` in `lib/moments.ts` and
  `findMoments` calls it, so the two can't disagree.

**Compensation lane.** One line: evaluation minus material, in pawns, White's
perspective, per position.

- `compensation[p] = clamp(eval[p], ±12) − materialBalance(positions[p])`,
  plotted on a symmetric axis clamped to ±6.
- Positions with a forced mate are skipped (gap in the line).
- **Regions** where `|compensation| ≥ 2` for at least 2 consecutive positions
  are shaded in the favoured side's accent colour. These are where the position
  was worth more or less than the material count — sacrifices, material that
  couldn't be used, attacks.
- Readout text: "White down 3 in material, evaluation −0.4: worth +2.6 beyond
  material".
- Derived in a new pure module `lib/compensation.ts`:
  `computeCompensation(evals, positions)` → per-position values and regions.

**Piece lanes.** Collapsed behind a "Show pieces" toggle placed below the scroll
container. When open, one lane per piece that moved at least once, grouped by
side (filter-aware): king, queen, rooks, bishops and knights individually,
all pawns in one "Pawns" lane, and each promoted piece in its own lane. Each
move is a dot coloured by its survey choice (best / held / left the safe moves;
neutral when unknown). Castling puts a dot on both king and rook lanes.

- Piece identity is tracked by a new pure function `trackPieces(game)` in
  `lib/pieceLanes.ts`: pieces are named by starting square ("g1 knight"), and
  followed square to square through each move; captured pieces stop; en passant
  and promotion handled.

**Selected-move panel** (below the timeline, not scrolled). For
`decisionIndex`, filter permitting:

- **Candidate spread:** every legal move from `survey[index].moves` as a dot on a
  horizontal 0–100 win% axis for the mover. Dots that would overlap stack
  vertically. The safe band (within `CORRIDOR_TOLERANCE_PCT` of best) is shaded.
  The played move is ringed and labelled; the best move is labelled. Hovering a
  dot shows its SAN and win%.
- **Summary line:** "12 of 31 moves kept the position · played Nf5, 6th best,
  −11%". Uses `corridorWidth`, `legalCount`, `playedRank`, `playedLossPct`.
- **Cause line**, when a squeeze targets this move: "Options cut by 17…Nd4" as a
  link that selects that move.
- **Open in The Move →** calls `studyDecision(index)` and marks it reviewed.
- With no survey for the move: "No move survey for this position" and the button
  only.

### 3. Think time vs difficulty

Rendered only when `hasClockData(game.moves)`.

- One dot per move (filter-aware). x = seconds spent,
  `clock[i−2] − clock[i] + increment` (first two moves omitted), on a sqrt scale
  capped at the 98th percentile so one long think doesn't flatten the rest.
  y = effective choices on a log scale with few choices at the top, so "hard"
  is up. Colour = choice result.
- A faint label marks the top-left region "Hard position, quick move".
- Hover a dot → `hoverIndex`; click → select. Drag a rectangle → `brushed`.
- Caption states what the axes mean in one sentence.

## Removed

From `MomentsTab`: `DecisionMatrix`, `CutMoments`, `LeverageList` sections,
and the unused `StretchExplorer` import. `CorridorChart` is replaced by
`GameTimeline`. Component files with no remaining importer are deleted along
with their CSS; `lib/` functions stay (other code uses them).
`scripts/verify-stretches.mjs` and its fixture test `StretchExplorer`, which is
no longer rendered; they are replaced by `scripts/verify-moments.mjs` against
the new tab.

## Out of scope

- Switching the Report tab's evaluation chart to a win% axis (noted during
  brainstorming as the right home for the "waterfall" idea).
- Board heat map, filmstrip, and a candidate-spread column for every move.
- Changes to `findMoments` detection or scoring.

## Verification

No unit test runner exists. Verification is:

- `npm run build` (type check) and `npm run lint` clean for touched files.
- `scripts/verify-moments.mjs` (Playwright, deterministic fixture): lanes share
  one scroll width; hover sets the readout without moving the board; clicking a
  bar selects; the panel button calls `studyDecision` and fades the move;
  Worth reviewing row hover shades the span; filter hides the other side;
  scatter absent without clocks, present with clocks, brush outlines bars;
  mobile width has no page-level horizontal scroll.
- A real-game pass: load `EliteCubedX_vs_AngelP116_2026.08.10.pgn` in the dev
  server, let analysis finish, screenshot desktop and mobile.
