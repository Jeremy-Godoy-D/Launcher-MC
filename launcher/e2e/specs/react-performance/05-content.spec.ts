import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { test, expect } from '../../helpers/scratch'
import { makeReactMod } from '../../helpers/react-content'

const name = 'PerformanceModsQA'
test.use({ launcherOptions: { locale: 'es-ES', recordVideo: false, seed: { name, minecraft: '1.21.1' }, prepareGameData: async root => {
  const path = join(root, 'instances', name)
  for (let offset = 0; offset < 500; offset += 20) await Promise.all(Array.from({ length: 20 }, (_, index) => makeReactMod(path, `perfmod_${offset + index}`, `Performance mod ${offset + index}`)))
} }, trace: 'off', video: 'off' })

test('large Mods and streamed console each remain usable over a 60-second window', async ({ launcher, shell }, info) => {
  const page = launcher.main, errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  const path = join(launcher.gameDataPath, 'instances', name)
  const win = await launcher.app.browserWindow(page)
  const rendererPid = await win.evaluate(win => win.webContents.getOSProcessId())
  async function measure(work: (index: number) => Promise<void>) {
    const start = performance.now(), samples: unknown[] = []
    for (let index = 0; performance.now() - start < 60_000; index++) {
      await work(index)
      samples.push(await launcher.app.evaluate(({ app }) => app.getAppMetrics()))
      await delay(Math.min(2000, Math.max(1, 60_000 - (performance.now() - start))))
    }
    return { seconds: (performance.now() - start) / 1000, samples }
  }

  await shell.goto('/instance/mods')
  const mods = page.getByTestId('instance-mods'), rows = mods.locator('li[data-file-name]')
  await expect(rows).toHaveCount(500, { timeout: 60_000 })
  const search = mods.getByRole('textbox')
  const modSamples = await measure(async index => {
    if (index % 5 !== 0) return
    await search.fill('perfmod_499')
    await expect(rows).toHaveCount(1, { timeout: 3000 })
    await search.clear()
    await expect(rows).toHaveCount(500, { timeout: 3000 })
  })

  await shell.goto('/instance/console')
  const output = page.getByTestId('instance-console'), entries = output.getByTestId('console-entry')
  await expect(output).toBeVisible()
  let last = 0
  const consoleSamples = await measure(async index => {
    last = index
    await launcher.app.evaluate(({ BrowserWindow }, { path, index }) => {
      const identity = { pid: 82, launchId: 'perf-console', gameDirectory: path, side: 'client' }
      const send = (event: string, payload: object) => BrowserWindow.getAllWindows().forEach((win: { webContents: { send(channel: string, data: object): void } }) => win.webContents.send('service-event', { service: 'LaunchService', event, args: [payload] }))
      if (index === 0) send('minecraft-start', identity)
      send('minecraft-stdout', { ...identity, sequence: index + 1, stdout: Array.from({ length: 400 }, (_, line) => `perf-${index}-${line}\n`).join('') })
    }, { path, index })
  })
  await expect(entries.filter({ hasText: `perf-${last}-399` })).toBeVisible()
  expect(await entries.count()).toBeLessThan(100)
  expect(errors).toEqual([])
  await writeFile(info.outputPath('content-performance.json'), JSON.stringify({ rendererPid, modCount: 500, eventBatches: last + 1, modSamples, consoleSamples, errors }, null, 2))
})
