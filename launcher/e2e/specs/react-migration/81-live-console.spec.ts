import { writeFile } from 'node:fs/promises'
import axe from 'axe-core'
import { test, expect, snap, type Page } from '../../helpers/scratch'
import type { LauncherFixture } from '../../fixtures/launcher'
import { seedReactLibrary } from '../../helpers/react-library'
import { focusLauncher } from '../../helpers/focus-launcher'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function openConsole(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByTestId('instance-workspace').getByLabel('Secciones de la instancia').getByRole('link', { name: 'Consola', exact: true }).click()
  return page.getByTestId('instance-console')
}
// Deterministic transport events exercise the packaged renderer; no process is spawned by this fixture.
async function send(launcher: LauncherFixture, events: { name: string; payload: object }[]) {
  await launcher.app.evaluate(({ BrowserWindow }, events) => {
    for (const event of events) for (const win of BrowserWindow.getAllWindows()) win.webContents.send('service-event', { service: 'LaunchService', event: event.name, args: [event.payload] })
  }, events)
}

test('live console retains split output across navigation and isolates reused PIDs and late exits', async ({ launcher }) => {
  const page = launcher.main, [first, second] = await seedReactLibrary(page)
  await expect(page.getByTestId('nav-library')).toBeVisible()
  const old = { pid: 55, launchId: 'old', gameDirectory: first, side: 'client' }
  const next = { pid: 55, launchId: 'next', gameDirectory: second, side: 'server' }
  await send(launcher, [
    { name: 'minecraft-start', payload: old },
    { name: 'minecraft-stdout', payload: { ...old, sequence: 1, stdout: '[12:34:56] [main/IN' } },
    { name: 'minecraft-stderr', payload: { ...old, sequence: 2, stderr: 'ERROR own-' } },
    { name: 'minecraft-stdout', payload: { ...old, sequence: 3, stdout: 'FO]: café 😀\r' } },
    { name: 'minecraft-stdout', payload: { ...old, sequence: 4, stdout: '\n\n  \nfinal-' } },
    { name: 'minecraft-start', payload: next },
    { name: 'minecraft-stdout', payload: { ...next, sequence: 1, stdout: 'OTHER_INSTANCE\n' } },
    { name: 'minecraft-stderr', payload: { ...old, sequence: 5, stderr: 'tail\n' } },
    { name: 'minecraft-stdout', payload: { ...old, sequence: 6, stdout: 'tail' } },
    { name: 'minecraft-exit', payload: { ...old, signal: 'SIGTERM' } },
    { name: 'minecraft-stdout', payload: { ...old, sequence: 7, stdout: 'CLOSED_LATE' } },
  ])
  const console = await openConsole(page), rows = console.getByTestId('console-entry')
  await expect(rows).toHaveCount(7)
  await expect(rows.filter({ hasText: 'café 😀' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'ERROR own-tail' })).toHaveAttribute('data-level', 'error')
  await expect(rows.filter({ hasText: 'final-tail' })).toHaveCount(1)
  await expect(rows.filter({ hasText: 'señal SIGTERM' })).toHaveCount(1)
  expect(await rows.locator('.console-text').allTextContents()).toContain('  ')
  await expect(console).not.toContainText('OTHER_INSTANCE'); await expect(console).not.toContainText('CLOSED_LATE')
  await expect(console.locator('.console-statusbar')).toContainText('No hay procesos activos')
  const other = await openConsole(page, 'Fabric QA')
  await expect(other).toContainText('OTHER_INSTANCE')
  await expect(other.locator('.console-statusbar')).toContainText('Proceso activo')
  await other.getByTestId('console-clear').click(); await expect(other.getByTestId('console-empty')).toBeVisible()
  await openConsole(page); await expect(rows.filter({ hasText: 'café 😀' })).toHaveCount(1)
})

test('live console shows process discovery failure and retries without losing its retained output', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), console = await openConsole(page)
  await launcher.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    let failed = false
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event: any, service: string, method: string, ...args: any[]) => {
      if (service === 'LaunchService' && method === 'getGameProcesses' && !failed) { failed = true; throw new Error('Fixture process discovery failure') }
      return original(event, service, method, ...args)
    })
  })
  await send(launcher, [{ name: 'minecraft-stdout', payload: { pid: 81, launchId: 'before-refresh', gameDirectory: path, side: 'client', sequence: 5, stdout: 'RETAINED\n' } }])
  await console.getByTestId('console-refresh').click()
  await expect(console.getByRole('alert')).toContainText('No se pudo comprobar')
  await expect(console.locator('.console-statusbar')).toContainText('sin confirmar')
  await console.getByTestId('console-refresh').click()
  await expect(console.getByRole('alert')).toHaveCount(0)
  await expect(console.locator('.console-statusbar')).toContainText('No hay procesos activos')
  await expect(console.getByTestId('console-entry')).toContainText('RETAINED')
})

test('live console bounds high-volume output, preserves manual reading and returns to the latest wrapped row', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), console = await openConsole(page)
  const identity = { pid: 82, launchId: 'volume', gameDirectory: path, side: 'client' }
  const content = Array.from({ length: 12000 }, (_, index) => `row-${String(index).padStart(5, '0')}\n`).join('')
  await send(launcher, [{ name: 'minecraft-start', payload: identity }, { name: 'minecraft-stdout', payload: { ...identity, sequence: 1, stdout: content } }])
  const viewport = console.getByTestId('console-entries'), rows = console.getByTestId('console-entry')
  await expect(console.locator('.console-statusbar')).toContainText('10000 líneas')
  await expect(console.getByRole('status')).toContainText('Historial en vivo limitado')
  expect(await rows.count()).toBeLessThan(100)
  await focusLauncher(launcher); await viewport.focus(); await page.keyboard.press('Home')
  await expect(rows.filter({ hasText: 'row-02000' })).toBeVisible()
  await expect(console.getByTestId('console-autoscroll')).not.toBeChecked()
  await send(launcher, [{ name: 'minecraft-stdout', payload: { ...identity, sequence: 2, stdout: 'WRAPPED_LATEST ' + 'word '.repeat(600) } }])
  await expect(rows.filter({ hasText: 'row-02001' })).toBeVisible()
  expect(await viewport.evaluate(element => element.scrollTop)).toBeLessThan(50)
  const win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), appearance: theme })); dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) })) }, theme)
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await console.getByTestId('console-follow').click()
      await expect(console.getByTestId('console-autoscroll')).toBeChecked()
      await expect.poll(() => viewport.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThan(4)
      expect(await viewport.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(testInfo.outputPath(`console-live-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])
      await snap(launcher, `console-live-${theme}-${width}`, 'Historial acotado y fila final envuelta al tamaño nativo de la ventana.')
      await viewport.focus(); await page.keyboard.press('Home')
    }
  }
})
