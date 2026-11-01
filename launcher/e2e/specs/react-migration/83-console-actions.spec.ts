import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test, expect, snap } from '../../helpers/scratch'
import axe from 'axe-core'
import type { LauncherFixture } from '../../fixtures/launcher'
import { seedReactLibrary } from '../../helpers/react-library'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const content = '[12:00:00] [main/INFO]: alpha\n\n  \n[12:00:01] [main/ERROR]: café 😀\n'
const errorLine = '[12:00:01] [main/ERROR]: café 😀'
async function openConsole(launcher: LauncherFixture) {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  await mkdir(join(path, 'logs')); await writeFile(join(path, 'logs/view.log'), content)
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByTestId('instance-workspace').getByLabel('Secciones de la instancia').getByRole('link', { name: 'Consola', exact: true }).click()
  const console = page.getByTestId('instance-console')
  await console.getByTestId('console-file-select').selectOption('log:view.log')
  return { page, path, console }
}

test('copy waits for native acknowledgement, reports failure and ignores success after the filter changes', async ({ launcher }) => {
  const { console, path } = await openConsole(launcher)
  await launcher.app.evaluate(({ ipcMain }) => {
    const state = globalThis as any
    state.__clipboardViews = []
    ipcMain.removeHandler('write-clipboard')
    ipcMain.handle('write-clipboard', (_event: any, text: string) => {
      state.__clipboardViews.push(text)
      return new Promise<void>((resolve, reject) => { state.__clipboardResolve = resolve; state.__clipboardReject = reject })
    })
  })
  const copy = console.getByTestId('console-copy'), filter = console.getByTestId('console-level-filter')
  await filter.selectOption('error'); await copy.click()
  await expect(copy).toHaveAttribute('aria-busy', 'true'); await expect(copy).toBeDisabled()
  await expect(console.getByTestId('console-export')).toBeDisabled()
  expect(await launcher.app.evaluate(() => (globalThis as any).__clipboardViews)).toEqual([errorLine])
  await launcher.app.evaluate(() => (globalThis as any).__clipboardReject(new Error('Fixture clipboard unavailable')))
  await expect(console.getByRole('alert')).toContainText('No se pudo copiar')
  await expect(copy).toBeEnabled(); await copy.click()
  await filter.selectOption('all')
  await launcher.app.evaluate(() => (globalThis as any).__clipboardResolve())
  await expect(copy).toBeEnabled(); await expect(copy).toHaveText('Copiar registros')
  await expect(console.getByRole('alert')).toHaveCount(0)
  await copy.click(); await launcher.app.evaluate(() => (globalThis as any).__clipboardResolve())
  await expect(copy).toContainText('Copiado')
  expect(await launcher.app.evaluate(() => (globalThis as any).__clipboardViews)).toEqual([errorLine, errorLine, content.slice(0, -1)])
  expect(await readFile(join(path, 'logs/view.log'), 'utf8')).toBe(content)
})

test('export captures the selected view, waits for real native writing and ignores late success in another view', async ({ launcher }) => {
  const { console, path } = await openConsole(launcher), destination = join(launcher.gameDataPath, 'captured.log')
  await launcher.app.evaluate(({ dialog }) => {
    const state = globalThis as any
    state.__saveChoices = []
    ;(dialog as any).showSaveDialog = async (_owner: unknown, options: any) => {
      state.__saveChoices.push(options)
      return new Promise(resolve => { state.__saveResolve = resolve })
    }
  })
  const save = console.getByTestId('console-export')
  await save.click(); await expect(save).toHaveAttribute('aria-busy', 'true')
  const choices = await launcher.app.evaluate(() => (globalThis as any).__saveChoices)
  expect(choices).toHaveLength(1); expect(choices[0].defaultPath).toMatch(/^Mi_mundo-view\.log-\d+\.log$/)
  await console.getByTestId('console-level-filter').selectOption('error')
  await launcher.app.evaluate(filePath => (globalThis as any).__saveResolve({ canceled: false, filePath }), destination)
  await expect(save).toBeEnabled(); await expect(save).toHaveText('Exportar a archivo')
  expect(await readFile(destination, 'utf8')).toBe(content.slice(0, -1))
  expect(await readFile(join(path, 'logs/view.log'), 'utf8')).toBe(content)
})

test('export cancellation is quiet, write failure is recoverable and success requires an existing saved file', async ({ launcher }, testInfo) => {
  const { page, console } = await openConsole(launcher), blocked = join(launcher.gameDataPath, 'blocked.log'), destination = join(launcher.gameDataPath, 'saved.txt')
  await mkdir(blocked)
  await launcher.app.evaluate(({ dialog }, destinations) => {
    const choices = [{ canceled: true }, { canceled: false, filePath: destinations.blocked }, { canceled: false, filePath: destinations.destination }]
    ;(dialog as any).showSaveDialog = async () => choices.shift()
  }, { blocked, destination })
  const save = console.getByTestId('console-export')
  await save.click(); await expect(save).toBeEnabled(); await expect(save).toHaveText('Exportar a archivo')
  await expect(console.getByRole('alert')).toHaveCount(0)
  await save.click(); await expect(console.getByRole('alert')).toContainText('No se pudo guardar')
  const win = await launcher.app.browserWindow(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), appearance: theme })); dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) })) }, theme)
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect.poll(() => console.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await console.getByRole('alert').scrollIntoViewIfNeeded()
      await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(testInfo.outputPath(`console-export-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])
      await snap(launcher, `console-export-${theme}-${width}`, 'El fallo de guardado conserva el registro y permite elegir otro destino.')
    }
  }
  await expect(save).toBeEnabled(); await save.click(); await expect(save).toHaveText('Archivo guardado')
  expect(await readFile(destination, 'utf8')).toBe(content.slice(0, -1))
  await expect(console.getByRole('alert')).toHaveCount(0)
})

test('a foreign document with the preload cannot open the export picker', async ({ launcher }) => {
  const foreign = join(launcher.gameDataPath, 'foreign.html')
  await writeFile(foreign, '<!doctype html><meta charset="utf-8"><title>Foreign document</title><p>Fixture</p>')
  await launcher.app.evaluate(({ dialog }) => {
    ;(globalThis as any).__foreignSaveCalls = 0
    ;(dialog as any).showSaveDialog = async () => { (globalThis as any).__foreignSaveCalls++; return { canceled: true } }
  })
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow, app }, url) => {
    const win = new BrowserWindow({ show: false, webPreferences: { preload: `${app.getAppPath()}/index-preload.js`, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    await win.loadURL(url)
  }, pathToFileURL(foreign).href)
  const page = await opening
  try {
    expect(await page.evaluate(async () => { try { await (window as any).windowController.exportLogView('text', 'view.log'); return 'unexpected' } catch { return 'denied' } })).toBe('denied')
    expect(await launcher.app.evaluate(() => (globalThis as any).__foreignSaveCalls)).toBe(0)
  } finally { await page.close() }
})
