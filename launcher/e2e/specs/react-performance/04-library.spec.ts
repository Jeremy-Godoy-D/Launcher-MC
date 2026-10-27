import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { test, expect } from '../../helpers/scratch'

test.use({ launcherOptions: { locale: 'es-ES', recordVideo: false }, trace: 'off', video: 'off' })

test('a thousand instances remain bounded through repeated navigation and a 60-second idle window', async ({ launcher }, testInfo) => {
  test.setTimeout(180_000)
  const page = launcher.main, errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('nav-library').click()
  await page.evaluate(async () => {
    const service = (window as any).serviceChannels.open('InstanceService')
    for (let index = 0; index < 1000; index++) await service.call('createInstance', { name: `Performance ${String(index).padStart(4, '0')}`, runtime: { minecraft: '1.21.1' } })
  })
  await expect(page.locator('.library-count')).toHaveText('1000 instancias')
  const win = await launcher.app.browserWindow(page)
  await win.evaluate(win => { win.setContentSize(1200, 720); win.show(); win.focus(); win.webContents.focus() })
  const pid = await win.evaluate(win => win.webContents.getOSProcessId())
  const listeners = () => launcher.app.evaluate(({ ipcMain }) => ipcMain.eventNames().filter((name: string | symbol) => typeof name === 'string').sort().map((name: string) => [name, ipcMain.listenerCount(name)]))
  const memory = () => launcher.app.evaluate(({ app }, pid) => {
    const metric = app.getAppMetrics().find((metric: { pid: number }) => metric.pid === pid)!
    return { utcMs: Date.now(), pid: metric.pid as number, creationTime: metric.creationTime as number, workingSetKiB: metric.memory.workingSetSize as number, privateKiB: metric.memory.privateBytes as number }
  }, pid)
  const batches: unknown[] = []
  for (let batch = 0; batch < 4; batch++) {
    for (let cycle = 0; cycle < 10; cycle++) {
      await page.getByTestId('nav-home').click(); await expect(page.locator('.featured h2')).toBeVisible()
      await expect(page.locator('.recent-section .instance-card')).toHaveCount(3)
      await page.getByTestId('nav-library').click()
      await expect(page.getByTestId('library-window')).toHaveAttribute('data-virtualized', 'true')
      expect(await page.locator('.instance-card').count()).toBeLessThan(40)
      expect(await page.locator('video').count()).toBe(0)
    }
    batches.push({ batch, memory: await memory(), nativeIPCListeners: await listeners(), domElements: await page.locator('*').count() })
  }
  const baselineListeners = await listeners(), samples = [await memory()], deadline = performance.now() + 60_000
  while (performance.now() < deadline) {
    await delay(Math.min(2000, Math.max(1, deadline - performance.now())))
    samples.push(await memory())
  }
  expect(new Set(samples.map(sample => sample.creationTime)).size).toBe(1)
  expect(samples.at(-1)!.utcMs - samples[0].utcMs).toBeGreaterThanOrEqual(60_000)
  expect(await listeners()).toEqual(baselineListeners)
  expect(new Set(batches.map((batch: any) => JSON.stringify(batch.nativeIPCListeners))).size).toBe(1)
  expect(new Set(batches.map((batch: any) => batch.domElements)).size).toBe(1)
  expect(errors).toEqual([])
  expect(page.video()).toBeNull()
  await writeFile(testInfo.outputPath('large-library-performance.json'), JSON.stringify({ size: 1000, roundTrips: 40, recorder: false, batches, idleSamples: samples, nativeIPCListeners: baselineListeners, errors,
    limitation: 'Native IPC counts and bounded DOM are observed here. All renderer event targets are not introspected; shared subscription cleanup has separate StrictMode/unit evidence. Working set/private memory observations require trend review,not forced GC.' }, null, 2))
})
