import { execFile } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

test.use({ launcherOptions: { locale: 'es-ES', recordVideo: false }, trace: 'off', video: 'off' })

test('Windows GPU engines and adapter memory correlate with a real 60-second video workload', async ({ launcher }, testInfo) => {
  test.setTimeout(120_000)
  expect(process.platform).toBe('win32')
  const page = launcher.main
  await seedReactLibrary(page)
  await page.getByTestId('nav-settings').click()
  await page.getByRole('checkbox', { name: 'Presentación automática', exact: true }).uncheck()
  await page.getByTestId('nav-home').click(); await page.getByTestId('nav-home').focus(); await page.mouse.move(20, 20)
  const win = await launcher.app.browserWindow(page)
  await win.evaluate(win => { win.setContentSize(1200, 720); win.show(); win.focus(); win.webContents.focus() })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0.2)
  expect(page.video()).toBeNull()
  const identities: { pid: number; creationTime: number; type: string }[] = await launcher.app.evaluate(({ app }) => app.getAppMetrics().map((metric: { pid: number; creationTime: number; type: string }) => ({ pid: metric.pid, creationTime: metric.creationTime, type: metric.type })))
  const output = testInfo.outputPath('gpu-counters.json')
  let finished = false, failure: Error | undefined
  const monitor = execFile('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('../../helpers/gpu-counters.ps1', import.meta.url)), '-ProcessIds', identities.map(process => process.pid).join(','), '-OutputPath', output], { windowsHide: true, timeout: 90_000 }, error => { failure = error || undefined; finished = true })
  try {
    await expect.poll(() => stat(output + '.ready').then(() => true, () => false), { timeout: 15_000 }).toBe(true)
    const samples: { utcMs: number; time: number; frames: number; dropped: number; paused: boolean; focused: boolean; nativeActive: boolean }[] = []
    const start = Date.now(), deadline = performance.now() + 60_000
    for (;;) {
      samples.push(await page.evaluate(() => {
        const video = document.querySelector('video')!, state = JSON.parse(document.querySelector('[data-motion-state]')!.getAttribute('data-motion-state')!)
        return { utcMs: Date.now(), time: video.currentTime, frames: video.getVideoPlaybackQuality().totalVideoFrames, dropped: video.getVideoPlaybackQuality().droppedVideoFrames, paused: video.paused, focused: state.focused, nativeActive: state.nativeActive }
      }))
      if (performance.now() >= deadline) break
      await delay(Math.min(2000, Math.max(1, deadline - performance.now())))
    }
    const end = Date.now()
    await expect.poll(() => finished, { timeout: 15_000 }).toBe(true)
    expect(failure).toBeUndefined()
    const counters = JSON.parse((await readFile(output, 'utf8')).replace(/^\uFEFF/, ''))
    expect(counters.samples.length).toBeGreaterThanOrEqual(32)
    expect(counters.samples[0].utcMs).toBeLessThanOrEqual(start)
    expect(counters.samples.at(-1).utcMs).toBeGreaterThanOrEqual(end)
    expect(samples.every(sample => !sample.paused && sample.focused && sample.nativeActive)).toBe(true)
    const engines = counters.samples.flatMap((sample: { counters: { instance: string; counter: string; status: number }[] }) => sample.counters.filter(counter => counter.counter === 'utilization percentage' && counter.status === 0))
    expect(engines.length).toBeGreaterThan(0)
    const processIdentitiesAfter: { pid: number; creationTime: number; type: string }[] = await launcher.app.evaluate(({ app }) => app.getAppMetrics().map((metric: { pid: number; creationTime: number; type: string }) => ({ pid: metric.pid, creationTime: metric.creationTime, type: metric.type })))
    expect(processIdentitiesAfter).toEqual(identities)
    await writeFile(testInfo.outputPath('gpu-window.json'), JSON.stringify({ startUtcMs: start, endUtcMs: end, identities, mediaSamples: samples, scope: 'Per-app GPU engines; adapter memory is machine-wide. Process memory is diagnostic only,KB4490156.' }, null, 2))
  } finally {
    if (!finished) monitor.kill()
  }
})
