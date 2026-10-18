// Teste de fumaça: abre o app compilado (out/) e salva uma captura de tela.
// Uso: node scripts/smoke.mjs <arquivo.png> [script-de-passos.mjs]
import { _electron as electron } from 'playwright-core'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const shot = resolve(process.argv[2] ?? 'smoke.png')
const stepsFile = process.argv[3]

const app = await electron.launch({
  args: [resolve('.')],
  env: { ...process.env, ALCINABI_E2E: '1' }
})
const logs = []
try {
  const page = await app.firstWindow()
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`))
  await page.waitForLoadState('domcontentloaded')
  await page.setViewportSize({ width: 1600, height: 900 }).catch(() => undefined)
  await page.waitForTimeout(1500)
  if (stepsFile) {
    const mod = await import(pathToFileURL(resolve(stepsFile)).href)
    await mod.default(page, { shot: (p) => page.screenshot({ path: resolve(p) }) })
  }
  await page.screenshot({ path: shot })
  console.log('screenshot:', shot)
} finally {
  if (logs.length) console.log(logs.join('\n'))
  await app.close().catch(() => undefined)
}
