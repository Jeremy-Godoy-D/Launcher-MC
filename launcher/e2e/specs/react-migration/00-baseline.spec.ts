import { cpus, release } from 'node:os'
import { writeFile } from 'node:fs/promises'
import { test, expect, snap } from '../../helpers/scratch'

test.use({ launcherOptions: { seed: { name: 'Referencia React beta.2', minecraft: '1.20.4' }, locale: 'es-ES' } })

test('beta.2 public package: visual reference and 60-second idle metrics', async ({ launcher, shell }, testInfo) => {
  expect(await launcher.app.evaluate(({ app }) => app.getVersion())).toBe('0.2.0-beta.2')
  const errors: string[] = []
  launcher.main.on('pageerror', error => errors.push(error.message))
  await shell.dismissTutorial()
  const win = await launcher.app.browserWindow(launcher.main)
  const screenshots: string[] = []
  for (const appearance of ['dark', 'light']) {
    if (appearance === 'light') {
      await shell.goto('/setting')
      await launcher.main.getByRole('combobox', { name: 'Tema', exact: true }).focus()
      await launcher.main.keyboard.press('Enter')
      await launcher.main.getByRole('option', { name: 'Tema Claro', exact: true }).click()
      await expect(launcher.main.locator('.aurora-shell')).not.toHaveClass(/\bdark\b/)
    }
    for (const width of [1200, 800]) {
      await win.evaluate((window, width) => window.setContentSize(width, width === 800 ? 400 : 720), width)
      for (const [route, anchor] of [['/', 'launch-center'], ['/me', 'library-create-instance'], ['/store', 'store-search'], ['/setting', 'settings-page'], ['/accounts', 'accounts-open-dialog'], ['/instance/mods', 'instance-tab-mods']] as const) {
        await shell.goto(route)
        await expect(launcher.main.getByTestId(anchor)).toBeVisible()
        await expect(launcher.main.locator('.aurora-scene-enter-active, .aurora-scene-leave-active')).toHaveCount(0)
        expect(await launcher.main.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const name = `baseline-${appearance}-${width}-${anchor}`
        await snap(launcher, name, `Referencia beta.2, ${appearance}, ${width}px, ${route}.`)
        // snap() is best-effort; this direct capture makes missing baseline images fail the test.
        const path = testInfo.outputPath(`${name}.png`)
        await launcher.main.screenshot({ path })
        screenshots.push(path)
      }
    }
  }
  await win.evaluate(window => { window.setContentSize(1200, 720); window.focus() })
  await shell.goto('/setting')
  await launcher.main.getByRole('combobox', { name: 'Tema', exact: true }).focus()
  await launcher.main.keyboard.press('Enter')
  await launcher.main.getByRole('option', { name: 'Tema Oscuro', exact: true }).click()
  await shell.goto('/')
  await expect(launcher.main.locator('.aurora-bubbles')).toHaveAttribute('data-state', 'running')
  const metrics = () => launcher.app.evaluate(({ app, BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find(win => /index\.html/.test(win.webContents.getURL()))!
    const all = app.getAppMetrics()
    return {
      renderer: all.find(metric => metric.pid === win.webContents.getOSProcessId())!,
      processes: all.map(({ pid, type, cpu, memory }) => ({ pid, type, cpu, memory })),
    }
  })
  await metrics()
  const start = Date.now()
  const samples: Awaited<ReturnType<typeof metrics>>[] = []
  for (let index = 0; index < 6; index++) {
    await launcher.main.waitForTimeout(10_000)
    samples.push(await metrics())
  }
  const elapsedSeconds = (Date.now() - start) / 1000
  const averageRendererCpu = samples.reduce((sum, sample) => sum + sample.renderer.cpu.percentCPUUsage, 0) / samples.length
  const result = { packageVersion: '0.2.0-beta.2', os: release(), cpu: cpus()[0]?.model, elapsedSeconds, averageRendererCpu, samples, screenshots, errors, limitation: 'Seeded Java version, no actual game launched; RSS/CPU include package behavior and live startup services. Not an installer test.' }
  await writeFile(testInfo.outputPath('baseline.json'), JSON.stringify(result, null, 2), 'utf8')
  await testInfo.attach('baseline', { body: JSON.stringify(result, null, 2), contentType: 'application/json' })
  expect(averageRendererCpu).toBeLessThan(8)
  expect(errors).toEqual([])
})

for (let sample = 1; sample <= 5; sample++) {
  test(`beta.2 packaged startup sample ${sample}`, async ({ launcher, shell }, testInfo) => {
    await shell.dismissTutorial()
    await shell.goto('/')
    await expect(launcher.main.getByTestId('launch-center')).toBeVisible()
    const result = await launcher.app.evaluate(({ app }) => ({ version: app.getVersion(), readyUptimeSeconds: process.uptime() }))
    await writeFile(testInfo.outputPath('startup.json'), JSON.stringify(result, null, 2), 'utf8')
    expect(result.version).toBe('0.2.0-beta.2')
  })
}
