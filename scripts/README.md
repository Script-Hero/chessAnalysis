# Exploration browser checks

Start Vite, then run with an installed Playwright package and Chromium:

```sh
APP_URL=http://127.0.0.1:5175 TEST_PGN=/path/to/EliteCubedX_vs_AngelP116_2026.08.10.pgn node scripts/verify-exploration.mjs
```

`PLAYWRIGHT_MODULE` optionally specifies the absolute path to an existing Playwright
`index.mjs`. The walkthrough uses the named 90-ply game for its exchange fixture.
The script does not change the PGN or the user's browser storage: it uses a fresh
browser context. Screenshots are written to `artifacts/ui-audit/exploration/`.

Checks cover illegal moves, pinned captures, en passant, castling, promotion,
material bookkeeping, actual converging route endpoints, click-to-move, alternate
history branches, live engine output, exchange replay, mobile layout, return to
the game, and the underpromotion picker. Pure calculation checks run against the
same TypeScript modules served by Vite, not a separate reimplementation.

For the Moments stretch explorer, run:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/verify-stretches.mjs
```

This uses a deterministic analysis fixture (`stretches-fixture.jsx`) with the real
Moments components and a context navigation recorder. It checks interval and row
selection, keyboard activation, stepping through both players' moves to the
endpoint, finding links, player and near-one filters, empty states, and mobile
bounds. It does not test engine estimates or board rendering. Desktop/mobile
screenshots are saved under `artifacts/ui-audit/stretches/`.
