import { cpus, release, totalmem } from 'node:os'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

type ProcessSample = {
  pid: number; creationTime: number; type: string
  cpu: { cumulativeCPUUsage?: number; percentCPUUsage: number }
  memory: { workingSetSize: number; peakWorkingSetSize: number; privateBytes?: number }
}

test.use({ launcherOptions: { locale: 'es-ES', recordVideo: false }, trace: 'off', video: 'off' })

test('reference Windows: five 60-second Home workloads without recorder, including GPU and all app processes', async ({ launcher }, testInfo) => {
  test.setTimeout(420_000)
  const page = launcher.main
  await seedReactLibrary(page)
  const win = await launcher.app.browserWindow(page)
  await win.evaluate(win => { win.setContentSize(1200, 720); win.show(); win.focus(); win.webContents.focus() })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const rendererPid = await win.evaluate(win => win.webContents.getOSProcessId())
  const environment = { platform: process.platform, os: release(), arch: process.arch, cpu: cpus()[0].model, logicalCpus: cpus().length, totalMemoryBytes: totalmem(), recorder: false,
    runtime: await launcher.app.evaluate(({ app }) => ({ version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome, gpu: app.getGPUFeatureStatus() })) }
  const workloads: unknown[] = []
  async function settings(video: boolean, carousel: boolean, performance: boolean) {
    await page.getByTestId('nav-settings').click()
    for (const [name, enabled] of [['Vídeo ambiental', video], ['Presentación automática', carousel], ['Modo rendimiento', performance]] as const)
      await page.getByRole('checkbox', { name, exact: true }).setChecked(enabled)
    await page.getByTestId('nav-home').click()
    await page.getByTestId('nav-home').focus(); await page.mouse.move(20, 20)
    await win.evaluate(win => { win.show(); win.focus(); win.webContents.focus() })
  }
  async function sample() {
    const at = performance.now()
    const processes: ProcessSample[] = await launcher.app.evaluate(({ app }) => app.getAppMetrics().map(({ pid, creationTime, type, cpu, memory }: ProcessSample) => ({ pid, creationTime, type, cpu, memory })))
    return { at, processes,
      media: await page.evaluate(() => {
        const video = document.querySelector('video')
        return { featured: document.querySelector('.featured h2')?.textContent, src: video?.getAttribute('src'), scene: video?.dataset.scene, paused: video?.paused,
          time: video?.currentTime, frames: video?.getVideoPlaybackQuality().totalVideoFrames, dropped: video?.getVideoPlaybackQuality().droppedVideoFrames,
          state: JSON.parse(document.querySelector('[data-motion-state]')!.getAttribute('data-motion-state')!) }
      }) }
  }
  for (const workload of ['poster', 'video', 'rotation', 'minimized', 'performance']) {
    await settings(workload !== 'poster', ['rotation', 'minimized'].includes(workload), workload === 'performance')
    if (workload !== 'poster' && workload !== 'performance') await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(false)
    if (workload === 'minimized') {
      await win.evaluate(win => win.minimize())
      await expect.poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true)
    }
    await delay(2000)
    const samples = [await sample()], deadline = performance.now() + 60_000
    while (performance.now() < deadline) {
      await delay(Math.min(2000, Math.max(1, deadline - performance.now())))
      samples.push(await sample())
    }
    const first = samples[0], last = samples.at(-1)!, elapsedSeconds = (last.at - first.at) / 1000
    const before = first.processes.find(process => process.pid === rendererPid)!, after = last.processes.find(process => process.pid === rendererPid)!
    expect(before).toBeTruthy(); expect(after).toBeTruthy()
    expect(typeof before.cpu.cumulativeCPUUsage).toBe('number'); expect(typeof after.cpu.cumulativeCPUUsage).toBe('number')
    const rendererCPUPercentOfOneCore = 100 * (after.cpu.cumulativeCPUUsage! - before.cpu.cumulativeCPUUsage!) / elapsedSeconds
    const processCPU: Record<string, number> = {}
    for (let i = 1; i < samples.length; i++) for (const process of samples[i].processes) {
      const previous = samples[i - 1].processes.find(value => value.pid === process.pid && value.creationTime === process.creationTime)
      if (previous && typeof previous.cpu.cumulativeCPUUsage === 'number' && typeof process.cpu.cumulativeCPUUsage === 'number')
        processCPU[process.type] = (processCPU[process.type] || 0) + Math.max(0, process.cpu.cumulativeCPUUsage - previous.cpu.cumulativeCPUUsage)
    }
    const summary = { workload, elapsedSeconds, rendererCPUPercentOfOneCore,
      processCPUPercentOfOneCore: Object.fromEntries(Object.entries(processCPU).map(([type, seconds]) => [type, seconds / elapsedSeconds * 100])),
      rendererWorkingSetKiB: samples.map(sample => sample.processes.find(process => process.pid === rendererPid)!.memory.workingSetSize),
      mediaFramesPerSecond: workload === 'video' ? (last.media.frames! - first.media.frames!) / elapsedSeconds : undefined }
    workloads.push({ summary, samples })
    await writeFile(testInfo.outputPath('home-performance.json'), JSON.stringify({ environment, workloads }, null, 2))
    console.log(JSON.stringify(summary))
    expect.soft(elapsedSeconds).toBeGreaterThanOrEqual(60)
    if (workload === 'video') {
      expect.soft(samples.every(sample => !sample.media.paused && sample.media.state.focused && sample.media.state.nativeActive)).toBe(true)
      expect.soft(rendererCPUPercentOfOneCore).toBeLessThan(8)
      expect.soft(summary.mediaFramesPerSecond!).toBeGreaterThan(20)
      expect.soft(summary.mediaFramesPerSecond!).toBeLessThanOrEqual(24.5)
    }
    if (workload === 'minimized' || workload === 'performance') {
      expect.soft(samples.every(sample => sample.media.paused)).toBe(true)
      expect.soft(Math.abs(last.media.time! - first.media.time!)).toBeLessThan(0.05)
    }
    if (workload === 'minimized') await win.evaluate(win => win.restore())
  }
})
