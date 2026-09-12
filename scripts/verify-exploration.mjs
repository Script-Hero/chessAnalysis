import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

// Run against Vite; PLAYWRIGHT_MODULE can point to an existing Playwright install.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', error => errors.push(String(error)))
const output = path.resolve('artifacts/ui-audit/exploration')
await fs.mkdir(output, { recursive: true })
const shots = []
async function shot(name) {
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true })
  shots.push(name)
}
try {
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5175/')
  const checks = await page.evaluate(async () => {
    const { legalExchanges, replayMoves, materialBalance, convergingRoutes, commonPrefixLength } = await import('/src/lib/exploration.ts')
    const { buildPositionDag, positionKey } = await import('/src/lib/positionDag.ts')
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    check(replayMoves(start, ['e2e5']).length === 1, 'Illegal move rejected')
    check(replayMoves(start, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'e1g1']).at(-1).san === 'O-O', 'Legal castling')
    const exchangeFen = '7k/8/2p5/3p4/4P3/8/8/7K w - - 0 1'
    const exchange = legalExchanges(exchangeFen).find(item => item.moves[0] === 'e4d5')
    check(exchange.moves.join(' ') === 'e4d5 c6d5', 'Legal capture and recapture')
    check(materialBalance(exchange.positions.at(-1).fen) === materialBalance(exchangeFen), 'Equal pawn exchange')
    check(!legalExchanges('4r1k1/8/8/8/8/8/3pR3/4K3 w - - 0 1').some(item => item.moves[0] === 'e2d2'), 'Pinned capture excluded')
    const epFen = replayMoves(start, ['e2e4', 'a7a6', 'e4e5', 'd7d5']).at(-1).fen
    const ep = legalExchanges(epFen).find(item => item.moves[0] === 'e5d6')
    check(!!ep, 'En passant included')
    check(materialBalance(ep.positions[1].fen) - materialBalance(epFen) === 1, 'En passant material')
    const promotions = legalExchanges('r6k/1P6/8/8/8/8/8/7K w - - 0 1')
    check(promotions.filter(item => item.moves[0].startsWith('b7a8')).length === 4, 'Four capture promotions')
    const pv1 = ['g1f3', 'g8f6', 'g2g3']
    const pv2 = ['g2g3', 'g8f6', 'g1f3']
    const line = pv => ({ pv, move: pv[0], score: 0, mateIn: null })
    const dag = buildPositionDag([start], [[line(pv1), line(pv2)]])
    const destination = positionKey(replayMoves(start, pv1).at(-1).fen)
    const routes = convergingRoutes(dag, destination)
    check(routes.length === 2 && commonPrefixLength(routes) === 0, 'Two real converging routes')
    check(routes.every(route => positionKey(replayMoves(start, route.map(edge => edge.uci)).at(-1).fen) === destination), 'Matching legal endpoints')
    check(convergingRoutes(dag, dag.root).length === 0, 'Root repetition excluded')
    return 'PASS legal replay, recaptures, pins, en passant, promotions, converging routes'
  })
  console.log(checks)
  const pgn = process.env.TEST_PGN
  if (!pgn) throw new Error('Set TEST_PGN to a saved PGN for the UI walkthrough')
  await page.locator('input[type=file]').setInputFiles(pgn)
  await page.locator('.overview--report').waitFor({ timeout: 180000 })
  await page.locator('.dashboard-tabs').getByRole('button', { name: 'Explore', exact: false }).click()
  await page.locator('.exploration-board [data-square="e2"]').click()
  await page.locator('.exploration-board [data-square="e4"]').click()
  assert.match(await page.locator('.exploration-status').innerText(), /Black to move/)
  await page.getByLabel('Legal move', { exact: true }).selectOption('e7e5')
  await page.getByRole('button', { name: 'Play selected move' }).click()
  await page.getByRole('button', { name: 'Previous variation position' }).click()
  await page.getByLabel('Legal move', { exact: true }).selectOption('c7c5')
  await page.getByRole('button', { name: 'Play selected move' }).click()
  assert(!await page.locator('.exploration-moves').innerText().then(text => text.includes('e5')))
  await page.getByLabel('Analyze this position').check()
  await page.locator('.exploration-engine button').first().waitFor({ timeout: 45000 })
  await shot('desktop-practice')
  await page.getByLabel('Analyze this position').uncheck()
  await page.getByRole('tab', { name: 'Exchanges', exact: true }).click()
  assert.match(await page.locator('.exploration-content').innerText(), /No legal captures/)
  await page.getByLabel('Starting decision').selectOption('20')
  await page.getByRole('tab', { name: 'Exchanges', exact: true }).click()
  await page.locator('.exchange-sequences button').first().click()
  await page.getByRole('button', { name: 'Next variation position' }).click()
  await shot('desktop-exchanges')
  await page.getByRole('tab', { name: 'Convergences', exact: true }).click()
  await page.locator('.convergence-routes button').first().waitFor({ timeout: 30000 })
  await page.getByRole('button', { name: 'View endpoint', exact: true }).first().click()
  const endpoint1 = await page.locator('.exploration-board [data-square]').evaluateAll(elements => elements.map(element => [element.getAttribute('data-square'), element.querySelector('[data-piece]')?.getAttribute('data-piece')]))
  await page.getByRole('button', { name: 'View endpoint', exact: true }).nth(1).click()
  const endpoint2 = await page.locator('.exploration-board [data-square]').evaluateAll(elements => elements.map(element => [element.getAttribute('data-square'), element.querySelector('[data-piece]')?.getAttribute('data-piece')]))
  assert(endpoint1.length > 0, 'Board squares exist')
  assert(endpoint1.some(([, piece]) => piece), 'Board pieces exist')
  assert.deepEqual(endpoint1, endpoint2)
  await shot('desktop-convergences')
  await page.setViewportSize({ width: 390, height: 844 })
  for (const mode of ['Try a move', 'Exchanges', 'Convergences']) {
    await page.getByRole('tab', { name: mode, exact: true }).click()
    await shot(`mobile-${mode.replaceAll(' ', '-')}`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${mode} mobile overflow`)
  }
  await page.getByRole('button', { name: 'Back to move review' }).click()
  assert.equal(await page.locator('.exploration-board').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Return to game', exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Open another', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles({ name: 'promotion-test.pgn', mimeType: 'application/x-chess-pgn', buffer: Buffer.from('[White "Promotion test"]\n[Black "Black"]\n[Result "*"]\n\n1. a4 h5 2. a5 h4 3. a6 h3 4. axb7 hxg2 5. bxa8=Q *') })
  await page.locator('.overview--report').waitFor({ timeout: 180000 })
  await page.locator('.dashboard-tabs').getByRole('button', { name: 'Explore', exact: false }).click()
  await page.getByLabel('Starting decision').selectOption('8')
  await page.locator('.exploration-board [data-square="b7"]').click()
  await page.locator('.exploration-board [data-square="a8"]').click()
  await page.getByRole('group', { name: 'Choose promotion' }).waitFor()
  await shot('mobile-promotion')
  await page.getByRole('button', { name: 'Knight', exact: true }).click()
  await page.locator('.exploration-board [data-square="a8"] [data-piece="wN"]').waitFor()
  assert.match(await page.locator('.exploration-moves').innerText(), /bxa8=N/)
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Exploration UI</title><style>body{font:16px system-ui}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}img{width:100%}</style><h1>Exploration screenshots</h1><main>${shots.map(name => `<a href="${name}.png"><h2>${name}</h2><img src="${name}.png"></a>`).join('')}</main>`)
  console.log(`PASS practice, history branching, live engine, exchanges, graph endpoints, mobile layout, game isolation; ${shots.length} screenshots`)
} finally {
  await browser.close()
}
