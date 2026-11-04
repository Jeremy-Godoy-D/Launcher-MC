import { writeFile } from 'node:fs/promises'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { focusLauncher } from '../../helpers/focus-launcher'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })

test('records sixty seconds of bounded live console traffic on the Windows reference', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByTestId('instance-workspace').getByLabel('Secciones de la instancia').getByRole('link', { name: 'Consola', exact: true }).click()
  await focusLauncher(launcher); await page.mouse.move(1, 1)
  const win = await launcher.app.browserWindow(page), pid = await win.evaluate(win => win.webContents.getOSProcessId())
  const renderer = await page.evaluate(() => ({ userAgent: navigator.userAgent, width: innerWidth, height: innerHeight, dpr: devicePixelRatio }))
  await launcher.app.evaluate(({ BrowserWindow }, path) => {
    if (process.env.XMCL_E2E !== '1') throw new Error('Isolated Electron profile required')
    const identity = { pid: 82000, launchId: 'console-benchmark', gameDirectory: path, side: 'client' }
    const send = (name: string, payload: object) => { for (const win of BrowserWindow.getAllWindows()) win.webContents.send('service-event', { service: 'LaunchService', event: name, args: [payload] }) }
    let sequence = 0, rows = 0
    send('minecraft-start', identity)
    const timer = setInterval(() => {
      const stdout = Array.from({ length: 200 }, () => `bench-${String(++rows).padStart(9, '0')} ${'word '.repeat(6)}\n`).join('')
      send('minecraft-stdout', { ...identity, sequence: ++sequence, stdout })
    }, 50)
    ;(globalThis as any).__grimoConsoleBenchmark = { timer, finish: () => { clearInterval(timer); send('minecraft-exit', { ...identity, code: 0 }); return { rows, publications: sequence } } }
  }, path)
  const samples: object[] = [], start = Date.now()
  let workload
  try {
    await launcher.app.evaluate(({ app }) => app.getAppMetrics())
    for (let index = 0; index < 60; index++) {
      await page.waitForTimeout(1000)
      const process = await launcher.app.evaluate(({ app }, pid) => app.getAppMetrics().find((value: { pid: number }) => value.pid === pid), pid)
      const view = await page.evaluate(() => ({
        heap: (performance as any).memory?.usedJSHeapSize,
        rows: document.querySelectorAll('[data-testid="console-entry"]').length,
        focused: document.hasFocus(), visible: document.visibilityState,
        status: document.querySelector('.console-statusbar')?.textContent,
      }))
      expect(process).toBeDefined(); expect(view.rows).toBeLessThan(100)
      expect(view.focused).toBe(true); expect(view.visible).toBe('visible')
      samples.push({ elapsedMs: Date.now() - start, cpu: process!.cpu, memory: process!.memory, ...view })
    }
    await expect(page.getByTestId('instance-console').locator('.console-statusbar')).toContainText('10000 líneas')
    await expect(page.getByTestId('console-autoscroll')).toBeChecked()
  } finally {
    workload = await launcher.app.evaluate(() => { const state = (globalThis as any).__grimoConsoleBenchmark; const result = state?.finish(); delete (globalThis as any).__grimoConsoleBenchmark; return result })
    await writeFile(testInfo.outputPath('console-sixty-seconds.json'), JSON.stringify({ source: 'Synthetic service-event traffic, no Minecraft process', rendererPid: pid, renderer, requestedRowsPerSecond: 4000, intervalMs: 50, workload, elapsedMs: Date.now() - start, samples }, null, 2), 'utf8')
  }
  expect(samples).toHaveLength(60)
})
