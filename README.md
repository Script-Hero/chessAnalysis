# Chess Analysis — a graph-theoretic game review

A browser-only chess analysis tool that describes a game as a **network** rather than as a
sequence of evaluations. Stockfish runs in a Web Worker; nothing leaves the machine.

The premise is that an evaluation graph tells you *where* a game turned but never *why*.
A blunder is usually not where a game was lost — it is where a corridor of surviving
continuations that had been narrowing for several moves finally reached one, and the
player stepped out of it. Measuring that requires treating positions, moves and pieces as
graphs and asking graph questions of them.

## The analysis pipeline

Each position gets **two engine passes**:

| Pass | Depth | MultiPV | Used for |
| --- | --- | --- | --- |
| Deep | 12 | 3 | evaluation, move classification, candidate variations |
| Survey | 8 | every legal move | decision shape: corridor width, rank, branching |

The survey pass is what makes the rest honest. Metrics measured against three stored lines
cannot distinguish a position with three near-equal candidates from one with thirty, and
report "outside the top 3" as though it meant "unplayable". Every rate, rank and branching
figure here is measured against the full legal move set.

Scores are converted to **win probability** before anything is computed from them. A pawn
near equality is worth far more than a pawn in a won game, and mate scores map to the 0/100
endpoints rather than to a saturated pawn value — otherwise three different mating lines
score identically and the position registers as maximally ambiguous.

## Metrics

**Corridor width** — legal moves that stay within 10% win probability of the best move.
The count of moves that still hold the position. Plotted in bits (log2), because the number
of surviving plans over several moves is a *product* of the per-move widths.

**Cut (only-move) positions** — corridor width 1 with more than one legal move: an
articulation point of the surviving-line graph. These are critical by structure rather than
by outcome, which is why the list includes the ones the player found. An eval-drop threshold
can only ever surface the half that went wrong.

**Effective branching** — perplexity of the softmax over move quality (temperature 5 win%).
Reads as "this position offered about N real choices", which a normalized 0–1 entropy does not.

**Narrowing episodes** — maximal runs of one side's consecutive decisions over which the
corridor never widened, long enough and steep enough to be a trend rather than noise.

**Position DAG** — the game and its analysed variations merged on position rather than on
path, so transpositions collapse onto one node. Yields confluence (in-degree), path share,
and gateways: nodes every analysed continuation runs through.

**Piece network** — nodes are occupied squares, edges are attacks and defences.
Standard measures land on real chess ideas without reinterpretation:

- sole defender of several attacked pieces = articulation point of the defence graph (overload)
- betweenness = how much of the position's tactical traffic runs through a piece
- algebraic connectivity (Fiedler value) of the mutual-defence graph = army cohesion; zero
  exactly when the pieces have split into groups that no longer defend one another
- reachable-square count = trapped pieces

Every network measure is also a board overlay, because a claim about a square should be
checkable on that square.

**Repertoire graph** — positions across the whole library, edge-weighted by how often each
move was chosen. Surfaces highest-leverage positions (visits × points dropped), repertoire
scatter (out-degree where the player is on move), and where preparation ran out (the first
position in a game occurring in no other stored game).

## Statistics and reference classes

Per-game statistics are not reported as findings. Forty decisions split into outcome groups
cannot support a claim about how someone plays, so all rate comparisons live in the Library
tab, aggregated across analysed games, and are withheld below 30 decisions per group. Single
figures are shown with a percentile against the player's own history, or with an explicit
note that no reference class exists yet.

## Layout

```
src/lib/
  stockfish.ts    engine workers, both analysis passes
  winprob.ts      centipawn -> win% (the common currency)
  moveGraph.ts    per-decision metrics over the full legal move set
  corridor.ts     corridor width, narrowing episodes, cut moments
  positionDag.ts  FEN-keyed DAG with transpositions, gateways, path share
  pieceGraph.ts   attack/defence network, betweenness, overload, coordination
  repertoire.ts   cross-game position graph
  corpusStats.ts  library-wide decision aggregates and percentiles
  library.ts      IndexedDB multi-game store
```

Tabs: **Corridor** (the game's shape), **Network** (the position as a piece graph),
**Explore** (engine lines, trees, graph shape), **Library** (corpus and repertoire).

## Development

```sh
pnpm install
pnpm dev
pnpm build
```
