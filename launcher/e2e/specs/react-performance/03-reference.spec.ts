import { _electron, type ElectronApplication, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { test, expect } from '../../helpers/scratch'
import { waitForAppWindow } from '../../fixtures/launcher'

test.use({ launcherOptions: { locale: 'es-ES', recordVideo: false, seed: { name: 'Performance Vanilla', minecraft: '1.21.1' } }, trace: 'off', video: 'off' })

test('equivalent static profile: 60-second memory window and five warm packaged starts', async ({ launcher, shell }, testInfo) => {
  test.setTimeout(240_000)
  const renderer = process.env.LAUNCHER_RENDERER
  expect(['react', 'vue']).toContain(renderer)
  const react = renderer === 'react', page = launcher.main
  async function ready(page: Page) {
    await expect(page.locator(react ? '.featured' : '[data-testid="launch-center"]').getByRole('heading', { name: 'Performance Vanilla', exact: true })).toBeVisible()
  }
  await shell.dismissTutorial()
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  const win = await launcher.app.browserWindow(page)
  await win.evaluate(win => { win.setContentSize(1200, 720); win.show(); win.focus(); win.webContents.focus() })
  if (react) {
    await page.getByTestId('nav-settings').click()
    await page.getByLabel('Apariencia', { exact: true }).selectOption('dark')
    await page.getByRole('checkbox', { name: 'Vídeo ambiental', exact: true }).uncheck()
    await page.getByRole('checkbox', { name: 'Presentación automática', exact: true }).uncheck()
    await page.getByTestId('nav-home').click()
  } else {
    await shell.goto('/setting')
    await page.getByRole('combobox', { name: 'Tema', exact: true }).focus(); await page.keyboard.press('Enter')
    await page.getByRole('option', { name: 'Tema Oscuro', exact: true }).click()
    await shell.goto('/')
  }
  await ready(page)
  expect(page.video()).toBeNull()
  if (react) await expect(page.locator('video')).toHaveCount(0)
  else await expect(page.locator('.aurora-bubbles')).toHaveAttribute('data-state', 'paused')
  const rendererPid = await win.evaluate(win => win.webContents.getOSProcessId())
  const executablePath = await launcher.app.evaluate(() => process.execPath)
  const samples: { utcMs: number; pid: number; creationTime: number; workingSetKiB: number; privateKiB?: number }[] = []
  const sample = () => launcher.app.evaluate(({ app }, pid) => {
    const metric = app.getAppMetrics().find((metric: { pid: number }) => metric.pid === pid)!
    return { utcMs: Date.now(), pid: metric.pid as number, creationTime: metric.creationTime as number, workingSetKiB: metric.memory.workingSetSize as number, privateKiB: metric.memory.privateBytes as number | undefined }
  }, rendererPid)
  await delay(2000)
  const deadline = performance.now() + 60_000
  for (;;) {
    samples.push(await sample())
    if (performance.now() >= deadline) break
    await delay(Math.min(2000, Math.max(1, deadline - performance.now())))
  }
  await page.screenshot({ path: testInfo.outputPath('reference-static.png') })
  const runtime = await launcher.app.evaluate(({ app }) => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome }))
  expect(new Set(samples.map(sample => sample.creationTime)).size).toBe(1)
  expect(samples.at(-1)!.utcMs - samples[0].utcMs).toBeGreaterThanOrEqual(60_000)
  const starts: { wallReadySeconds: number; mainReadyUptimeSeconds: number }[] = []
  await launcher.app.close()
  await delay(500)
  const result = () => ({ renderer, runtime, profile: { instances: 1, name: 'Performance Vanilla', minecraft: '1.21.1', size: '1200x720', reducedMotion: true, dark: true, recorder: false, gameNotLaunched: true }, memorySamples: samples, starts,
    startupDefinition: 'Five warm same-profile restarts after unmeasured preparation; parent wall clock until correct saved instance heading visible. Static visual composition differs between redesigned UI and reference.' })
  await writeFile(testInfo.outputPath('reference-comparison.json'), JSON.stringify(result(), null, 2))
  for (let index = 0; index < 5; index++) {
    const began = performance.now()
    const app: ElectronApplication = await _electron.launch({ executablePath, args: [], env: { ...process.env, XMCL_E2E: '1', XMCL_E2E_APP_DATA: launcher.appDataPath, XMCL_E2E_GAME_DATA: launcher.gameDataPath, XMCL_E2E_NO_LAUNCH: '1', XMCL_E2E_LOCALE: 'es-ES', NODE_ENV: 'production' }, timeout: 60_000 })
    try {
      const next = await waitForAppWindow(app, /\/index\.html(\?|#|$)/, 30_000)
      await next.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
      await ready(next)
      const wallReadySeconds = (performance.now() - began) / 1000
      const mainReadyUptimeSeconds = await app.evaluate(() => process.uptime())
      expect(next.video()).toBeNull()
      starts.push({ wallReadySeconds, mainReadyUptimeSeconds })
      await writeFile(testInfo.outputPath('reference-comparison.json'), JSON.stringify(result(), null, 2))
    } finally { await app.close() }
    await delay(500)
  }
  expect(starts).toHaveLength(5)
})
