import { test, expect } from '../../helpers/scratch'

test.use({ launcherOptions: { seed: { name: 'Aurora Performance', minecraft: '1.20.4' }, locale: 'es-ES' } })
test('Windows idle budget and bubble pause on blur, minimize and reduced motion', async ({ launcher, shell }, testInfo) => {
  test.skip(process.platform !== 'win32', 'Windows reference measurement')
  await shell.dismissTutorial()
  await shell.goto('/')
  const win = await launcher.app.browserWindow(launcher.main)
  await win.evaluate(window => { window.setContentSize(1200, 720); window.focus() })
  const bubbles = launcher.main.locator('.aurora-bubbles')
  await expect(bubbles).toHaveAttribute('data-state', 'running')
  await launcher.main.evaluate(() => {
    const clear = CanvasRenderingContext2D.prototype.clearRect
    ;(window as any).__auroraFrames = 0
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('aurora-bubbles')) (window as any).__auroraFrames++
      return clear.apply(this, args)
    }
  })
  const sampleCpu = () => launcher.app.evaluate(({ app, BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find(window => /index\.html/.test(window.webContents.getURL()))!
    return app.getAppMetrics().find(metric => metric.pid === window.webContents.getOSProcessId())!.cpu.percentCPUUsage
  })
  await sampleCpu()
  const start = Date.now()
  const cpu: number[] = []
  for (let i = 0; i < 6; i++) {
    await launcher.main.waitForTimeout(10_000)
    cpu.push(await sampleCpu())
  }
  const elapsed = (Date.now() - start) / 1000
  const frames = await launcher.main.evaluate(() => (window as any).__auroraFrames as number)
  const averageCpu = cpu.reduce((sum, value) => sum + value, 0) / cpu.length
  await testInfo.attach('windows-idle-metrics', { body: JSON.stringify({ elapsed, frames, fps: frames / elapsed, cpu, averageCpu }, null, 2), contentType: 'application/json' })
  expect(frames / elapsed).toBeLessThanOrEqual(30)
  expect(averageCpu).toBeLessThan(8)
  const otherId = await launcher.app.evaluate(async ({ BrowserWindow }) => {
    const other = new BrowserWindow({ width: 320, height: 200, skipTaskbar: true })
    await other.loadURL('about:blank')
    other.focus()
    return other.id
  })
  await expect(bubbles).toHaveAttribute('data-state', 'paused')
  await launcher.app.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id)?.destroy(), otherId)
  await win.evaluate(window => window.focus())
  await expect(bubbles).toHaveAttribute('data-state', 'running')
  await win.evaluate(window => window.minimize())
  await expect(bubbles).toHaveAttribute('data-state', 'paused')
  await win.evaluate(window => { window.restore(); window.focus() })
  await expect(bubbles).toHaveAttribute('data-state', 'running')
  await launcher.main.emulateMedia({ reducedMotion: 'reduce' })
  await expect(bubbles).toHaveAttribute('data-state', 'paused')
  await launcher.main.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(bubbles).toHaveAttribute('data-state', 'running')
  // Existing E2E launch hook emits the real service lifecycle without Java.
  await launcher.main.evaluate(async () => {
    const channel = (window as any).serviceChannels.open('LaunchService')
    const instances = (window as any).serviceChannels.open('InstanceService')
    const gameDirectory = await instances.call('createInstance', { name: 'Another Aurora QA', runtime: { minecraft: '1.20.4' } })
    await channel.call('launch', { gameDirectory, version: '1.20.4', java: '', user: { id: 'aurora-test', username: 'AuroraQA', authority: 'offline', profiles: {}, selectedProfile: '' } })
  })
  await expect(bubbles).toHaveAttribute('data-state', 'paused')
})
