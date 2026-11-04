import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import axe from 'axe-core'
import { test, expect, snap, type Page } from '../../helpers/scratch'
import type { LauncherFixture } from '../../fixtures/launcher'
import { seedReactLibrary } from '../../helpers/react-library'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function openConsole(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByTestId('instance-workspace').getByLabel('Secciones de la instancia').getByRole('link', { name: 'Consola', exact: true }).click()
  return page.getByTestId('instance-console')
}
async function openLogger(launcher: LauncherFixture, path: string, source = '__live__') {
  const opening = launcher.app.waitForEvent('window')
  await launcher.main.evaluate(async ({ path, source }) => (window as any).windowController.openLogger(path, source), { path, source })
  const page = await opening
  await expect(page.getByTestId('logger-instance-name')).toBeVisible()
  return page
}
// Synthetic service events cover window routing without launching Minecraft or changing its files.
async function send(launcher: LauncherFixture, events: { name: string; payload: object }[]) {
  await launcher.app.evaluate(({ BrowserWindow }, events) => {
    for (const event of events) for (const win of BrowserWindow.getAllWindows()) win.webContents.send('service-event', { service: 'LaunchService', event: event.name, args: [event.payload] })
  }, events)
}

test('logger captures the selected instance and file, reuses its window and follows appearance without retargeting', async ({ launcher }, testInfo) => {
  const [first, second] = await seedReactLibrary(launcher.main)
  for (const [path, marker] of [[first, 'FIRST_RECORD'], [second, 'SECOND_RECORD']]) {
    await mkdir(join(path, 'logs')); await writeFile(join(path, 'logs/latest.log'), marker + '\n')
  }
  const console = await openConsole(launcher.main)
  await console.getByTestId('console-file-select').selectOption('log:latest.log')
  const opening = launcher.app.waitForEvent('window')
  await console.getByTestId('console-open-window').click()
  const firstWindow = await opening
  await expect(firstWindow.getByTestId('logger-instance-name')).toHaveText('Mi mundo')
  await expect(firstWindow.getByTestId('console-file-select')).toHaveValue('log:latest.log')
  await expect(firstWindow.getByTestId('console-entry')).toContainText('FIRST_RECORD')
  await expect(firstWindow.getByTestId('console-open-window')).toHaveCount(0)
  const other = await openConsole(launcher.main, 'Fabric QA')
  await other.getByTestId('console-file-select').selectOption('log:latest.log')
  const secondWindow = await openLogger(launcher, second, 'log:latest.log')
  await expect(secondWindow.getByTestId('console-entry')).toContainText('SECOND_RECORD')
  await expect(firstWindow.getByTestId('console-entry')).toContainText('FIRST_RECORD')
  await launcher.main.evaluate(async path => (window as any).windowController.openLogger(path, 'log:latest.log'), first)
  expect(launcher.app.windows().filter(page => page.url().includes('/logger.html'))).toHaveLength(2)
  const native = await launcher.app.browserWindow(firstWindow)
  expect(await native.evaluate(win => {
    const preferences = win.webContents.getLastWebPreferences()
    return { contextIsolation: preferences.contextIsolation, sandbox: preferences.sandbox, nodeIntegration: preferences.nodeIntegration, webviewTag: preferences.webviewTag }
  })).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false })
  const destination = join(launcher.gameDataPath, 'logger-export.log')
  await launcher.app.evaluate(({ dialog }, filePath) => { (dialog as any).showSaveDialog = async () => ({ canceled: false, filePath }) }, destination)
  await firstWindow.getByTestId('console-export').click()
  await expect(firstWindow.getByTestId('console-export')).toHaveText('Archivo guardado')
  const { readFile } = await import('node:fs/promises')
  expect(await readFile(destination, 'utf8')).toBe('FIRST_RECORD')
  for (const theme of ['dark', 'light']) {
    await launcher.main.evaluate(theme => { const key = 'launcher.react.preferences'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), appearance: theme, performanceMode: true })); dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) })) }, theme)
    await expect(firstWindow.locator('html')).toHaveAttribute('data-theme', theme)
    await firstWindow.emulateMedia({ reducedMotion: 'reduce' })
    for (const width of [900, 600]) {
      await native.evaluate((win, width) => win.setContentSize(width, width === 600 ? 400 : 600), width)
      expect(await firstWindow.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await firstWindow.getByTestId('console-export').scrollIntoViewIfNeeded()
      await firstWindow.addScriptTag({ content: axe.source })
      const report = await firstWindow.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(testInfo.outputPath(`logger-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])
      await snap({ ...launcher, main: firstWindow }, `logger-${theme}-${width}`, 'Consola independiente de Mi mundo: archivo real, instancia fija y controles accesibles con scroll.')
      await firstWindow.getByTestId('console-entries').scrollIntoViewIfNeeded()
      await expect(firstWindow.getByTestId('console-entries')).toBeInViewport({ ratio: 1 })
      await expect(firstWindow.getByTestId('console-entry')).toBeInViewport()
      await snap({ ...launcher, main: firstWindow }, `logger-${theme}-${width}-records`, 'Registros y estado accesibles mediante el scroll de la consola independiente.')
    }
  }
  await firstWindow.reload()
  await expect(firstWindow.getByTestId('console-entry')).toContainText('FIRST_RECORD')
  expect(await firstWindow.evaluate(() => (window as any).windowController.getLoggerContext())).toEqual({ instancePath: first, source: 'log:latest.log' })
})

test('independent live consoles isolate instances, retain final output and reopen with a fresh bounded view', async ({ launcher }) => {
  const [first, second] = await seedReactLibrary(launcher.main)
  const firstWindow = await openLogger(launcher, first), secondWindow = await openLogger(launcher, second)
  const one = { pid: 84, launchId: 'logger-one', gameDirectory: first, side: 'client' }
  const two = { pid: 85, launchId: 'logger-two', gameDirectory: second, side: 'client' }
  await send(launcher, [
    { name: 'minecraft-start', payload: one }, { name: 'minecraft-start', payload: two },
    { name: 'minecraft-stdout', payload: { ...one, sequence: 1, stdout: 'FIRST_LIVE\nfinal-' } },
    { name: 'minecraft-stdout', payload: { ...two, sequence: 1, stdout: 'SECOND_LIVE\n' } },
    { name: 'minecraft-stdout', payload: { ...one, sequence: 2, stdout: 'tail' } },
    { name: 'minecraft-exit', payload: { ...one, code: 0 } },
  ])
  await expect(firstWindow.getByTestId('instance-console')).toContainText('FIRST_LIVE')
  await expect(firstWindow.getByTestId('instance-console')).toContainText('final-tail')
  await expect(firstWindow.getByTestId('instance-console')).not.toContainText('SECOND_LIVE')
  await expect(secondWindow.getByTestId('instance-console')).toContainText('SECOND_LIVE')
  await expect(secondWindow.getByTestId('instance-console')).not.toContainText('FIRST_LIVE')
  await expect(firstWindow.locator('.console-statusbar')).toContainText('No hay procesos activos')
  await firstWindow.getByRole('button', { name: 'Cerrar consola', exact: true }).click()
  await expect.poll(() => firstWindow.isClosed()).toBe(true)
  const reopened = await openLogger(launcher, first)
  await expect(reopened.getByTestId('console-empty')).toBeVisible()
  const count = launcher.app.windows().length
  for (const args of [[join(first, 'missing')], [first, 'log:../foreign.log']]) {
    expect(await launcher.main.evaluate(async args => { try { await (window as any).windowController.openLogger(...args); return 'unexpected' } catch { return 'denied' } }, args)).toBe('denied')
  }
  expect(launcher.app.windows()).toHaveLength(count)
})

test('renderer navigation cannot grant privileges through a frame name, host prefix or foreign document', async ({ launcher }) => {
  const [path] = await seedReactLibrary(launcher.main)
  const logger = await openLogger(launcher, path), initial = launcher.app.windows().length
  const foreign = join(launcher.gameDataPath, 'foreign.html'), foreignUrl = pathToFileURL(foreign).href
  await writeFile(foreign, '<!doctype html><meta charset="utf-8"><title>Foreign</title><p>Owned fixture</p>')
  await launcher.app.evaluate(({ shell }) => { (globalThis as any).__externalUrls = []; (shell as any).openExternal = async (url: string) => { (globalThis as any).__externalUrls.push(url) } })
  for (const page of [launcher.main, logger]) {
    const before = page.url()
    for (const url of ['https://example.org/help', 'http://localhost.evil:3001/', foreignUrl, 'data:text/html,foreign']) await page.evaluate(url => { window.open(url, 'app') }, url)
    await page.evaluate(() => { const link = document.createElement('a'); link.href = 'https://example.org/navigation'; document.body.append(link); link.click(); link.remove() })
    await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__externalUrls.filter((url: string) => url.endsWith('/navigation')).length)).toBe(page === launcher.main ? 1 : 2)
    expect(page.url()).toBe(before)
  }
  expect(launcher.app.windows()).toHaveLength(initial)
  expect(await launcher.app.evaluate(() => (globalThis as any).__externalUrls)).toEqual(['https://example.org/help', 'http://localhost.evil:3001/', 'https://example.org/navigation', 'https://example.org/help', 'http://localhost.evil:3001/', 'https://example.org/navigation'])
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow, app }, url) => {
    const win = new BrowserWindow({ show: false, webPreferences: { preload: `${app.getAppPath()}/monitor-preload.js`, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    await win.loadURL(url)
  }, foreignUrl)
  const foreignWindow = await opening
  for (const method of ['getLoggerContext', 'openLogger']) expect(await foreignWindow.evaluate(async ({ method, path }) => { try { await (window as any).windowController[method](path); return 'unexpected' } catch { return 'denied' } }, { method, path })).toBe('denied')
  await foreignWindow.close()
})

test('logger opening recovers from a native failure and showLog opens one fixed window for concurrent requests', async ({ launcher }) => {
  const [first, second] = await seedReactLibrary(launcher.main), console = await openConsole(launcher.main)
  await launcher.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('open-logger')
    let fail = true
    ipcMain.removeHandler('open-logger')
    ipcMain.handle('open-logger', (event: any, ...args: any[]) => { if (fail) { fail = false; throw new Error('Fixture window unavailable') }; return original(event, ...args) })
  })
  await console.getByTestId('console-open-window').click()
  await expect(console.getByRole('alert')).toContainText('No se pudo abrir')
  const opening = launcher.app.waitForEvent('window')
  await console.getByTestId('console-open-window').click()
  const firstWindow = await opening
  await expect(firstWindow.getByTestId('logger-instance-name')).toHaveText('Mi mundo')
  expect(await firstWindow.evaluate(() => (window as any).windowController.getLoggerContext())).toEqual({ instancePath: first, source: '__live__' })
  await expect(console.getByRole('alert')).toHaveCount(0)
  // The existing no-spawn hook emits real service lifecycle events; it does not start Java.
  const automatic = launcher.app.waitForEvent('window')
  await launcher.main.evaluate(async path => {
    const service = (window as any).serviceChannels.open('LaunchService')
    await Promise.all([service.call('launch', { gameDirectory: path, version: 'fixture', showLog: true }), service.call('launch', { gameDirectory: path, version: 'fixture', showLog: true })])
  }, second)
  const secondWindow = await automatic
  await expect(secondWindow.getByTestId('logger-instance-name')).toHaveText('Fabric QA')
  expect(launcher.app.windows().filter(page => page.url().includes('/logger.html'))).toHaveLength(2)
})
