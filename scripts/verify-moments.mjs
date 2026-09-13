import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

// Run against Vite; PLAYWRIGHT_MODULE can point to an existing Playwright install.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const APP = process.env.APP_URL || 'http://127.0.0.1:5173'
const output = path.resolve('artifacts/ui-audit/moments')
await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const errors = []

async function open(options) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(APP)
  await page.evaluate(async (opts) => {
    const { mountFixture } = await import('/scripts/moments-fixture.jsx')
    mountFixture(opts)
  }, options)
  await page.locator('.game-timeline').waitFor()
  return page
}

try {
  // Pure calculations, against the modules Vite serves.
  const page = await open({ clocks: true })
  const pure = await page.evaluate(async () => {
    const { computeCompensation } = await import('/src/lib/compensation.ts')
    const { trackPieces } = await import('/src/lib/pieceLanes.ts')
    const { parsePgn } = await import('/src/lib/pgn.ts')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const upKnight = 'rnbqkb1r/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    const comp = computeCompensation(
      [{ score: 0, mateIn: null }, { score: 0.5, mateIn: null }, { score: 0.5, mateIn: null }, { score: 12, mateIn: 3 }],
      [start, upKnight, upKnight, upKnight],
    )
    check(Math.abs(comp.points[1].value + 2.5) < 1e-9, 'Up a knight at +0.5 is 2.5 below material')
    check(comp.points[3].value === null, 'Forced mate has no compensation value')
    check(comp.regions.length === 1 && comp.regions[0].side === 'black' && comp.regions[0].from === 1 && comp.regions[0].to === 2, 'One Black region over the two positions')
    const game = parsePgn('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O Nf6 5. d4 exd4 6. e5 d5 7. exf6 *')
    const lanes = trackPieces(game)
    const lane = (id) => lanes.find((l) => l.id === id)
    check(lane('white-e1').moves.includes(6) && lane('white-h1').moves.includes(6), 'Castling moves king and rook')
    check(lane('white-g1').moves.join() === '2', 'g1 knight tracked')
    check(lane('white-pawns').moves.includes(12), 'Pawn capture on f6 in pawns lane')
    return 'PASS compensation values and regions, piece tracking through castling and captures'
  })
  console.log(pure)

  const position = () => page.locator('#board-position').innerText()
  const bars = page.locator('.game-timeline__move')
  const bar = (label) => page.locator(`.game-timeline__move[aria-label^="${label},"]`)
  assert.equal(await page.locator('.game-timeline__lane-label', { hasText: 'choices' }).count(), 2)
  assert.equal(await bars.count(), 20)

  // Hover reads a move without moving the board; click selects it.
  await bar('7.Bb3').hover()
  assert.match(await page.locator('.game-timeline__readout').innerText(), /7\.Bb3/)
  assert.equal(await position(), '0')
  await bar('7.Bb3').click()
  assert.equal(await position(), '12')
  assert.match(await page.locator('.selected-move h3').innerText(), /7\.Bb3/)
  assert.match(await page.locator('.selected-move__summary').innerText(), /played Bb3, 5th best/)
  assert.equal(await page.locator('.selected-move__dot.is-played').count(), 1)

  // Worth reviewing pins the blunder, and hovering its row shades the span.
  const row = page.locator('.review-moment').first()
  await row.waitFor()
  assert(await page.locator('.game-timeline__pin').count() >= 1, 'Moment pinned on the timeline')
  await row.hover()
  assert.equal(await page.locator('.game-timeline__highlight').count(), 1)
  await page.mouse.move(0, 0)
  assert.equal(await page.locator('.game-timeline__highlight').count(), 0)

  // Opening from the panel goes through studyDecision and marks the move reviewed.
  await page.locator('.selected-move__open').click()
  assert.deepEqual(await page.evaluate(() => window.__studied), [12])
  assert.equal(await page.locator('.selected-move .game-timeline__tag.is-muted').count(), 1)
  await bar('2.Nf3').click()
  assert.match(await bar('7.Bb3').getAttribute('class'), /is-dim/)

  // Compensation lane and piece lanes.
  assert(await page.locator('.game-timeline__comp-region').count() >= 1, 'Compensation region after the blunder')
  assert.equal(await page.locator('.game-timeline__piece-dot').count(), 0)
  await page.getByRole('button', { name: 'Show pieces' }).click()
  assert.equal(await page.locator('.game-timeline__piece-dot').count(), 22) // 20 moves plus two castling rooks
  await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true })

  // Scatter: brushing marks bars in the timeline.
  const scatter = page.locator('.think-scatter__svg')
  await scatter.scrollIntoViewIfNeeded()
  const box = await scatter.boundingBox()
  await page.mouse.move(box.x + box.width * 0.05, box.y + box.height * 0.02)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.99, box.y + box.height * 0.3, { steps: 6 })
  await page.mouse.up()
  const brushed = await page.locator('.game-timeline__bar.is-brushed').count()
  assert(brushed > 0 && brushed < 20, `Brush marks some moves (got ${brushed})`)
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  assert.equal(await page.locator('.game-timeline__bar.is-brushed').count(), 0)

  // Player filter.
  await page.getByLabel('Player filter fixture').selectOption('white')
  assert.equal(await page.locator('.game-timeline__lane-label', { hasText: 'choices' }).count(), 1)
  assert.equal(await bars.count(), 10)
  assert.equal(await page.locator('.game-timeline__cause').count(), 0)

  // Mobile: the timeline scrolls, the page does not.
  await page.setViewportSize({ width: 400, height: 900 })
  await page.waitForTimeout(200)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No page-level horizontal scroll')
  await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true })
  await page.close()

  // Without clocks there is no scatter.
  const noClock = await open({ clocks: false })
  assert.equal(await noClock.locator('.think-scatter').count(), 0)
  await noClock.close()

  assert.deepEqual(errors, [])
  console.log('PASS timeline hover/select, pins and row highlight, open and reviewed, compensation, pieces, brush, filter, mobile, no-clock')
} finally {
  await browser.close()
}
