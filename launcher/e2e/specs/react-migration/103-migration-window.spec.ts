import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'

test.use({ launcherOptions: { locale: 'es-ES' } })
test('migration preload shows progress, recovery and completion at its real 600 by 400 size', async ({ launcher }, info) => {
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow, app, ipcMain }, root) => {
    const parent = BrowserWindow.getAllWindows().find((win: any) => win.webContents.getURL().includes('/index.html'))!
    const fixture = (globalThis as any).__migrationFixture = { fail: true, progress: { from: root, to: root + '-new', file: '', copiedBytes: 0, totalBytes: 100, copiedFiles: 0, totalFiles: 10, phase: 'scanning' } }
    ipcMain.handle('migration-get-progress', () => { if (fixture.fail) throw new Error('Owned status failure'); return fixture.progress })
    const win = new BrowserWindow({ width: 600, height: 400, frame: false, resizable: false, webPreferences: { session: parent.webContents.session, preload: `${app.getAppPath()}/migration-preload.js`, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    await win.loadURL('http://xmcl.runtime/migration.html')
  }, launcher.gameDataPath)
  const page = await opening, win = await launcher.app.browserWindow(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await expect(page.getByTestId('migration-status')).toContainText('No se pudo leer el progreso')
  await launcher.app.evaluate(() => { (globalThis as any).__migrationFixture.fail = false })
  await page.getByTestId('migration-retry').click(); await expect(page.getByTestId('migration-status')).toHaveText('Preparando el traslado de archivos…')
  for (const phase of ['migrating', 'rollingBack', 'failed', 'done']) {
    await launcher.app.evaluate(({ BrowserWindow }, phase) => {
      const fixture = (globalThis as any).__migrationFixture
      fixture.progress = { ...fixture.progress, phase, copiedBytes: 50, copiedFiles: 5, error: phase === 'failed' ? { file: 'owned-file', rollback: 'incomplete' } : undefined }
      for (const win of BrowserWindow.getAllWindows()) if (win.webContents.getURL().includes('/migration.html')) win.webContents.send('migration-event', { event: 'progress', payload: fixture.progress })
    }, phase)
    await expect(page.getByTestId('migration-status')).toHaveText(({ migrating: 'Moviendo los datos de Minecraft…', rollingBack: 'El traslado falló. Restaurando los archivos movidos…', failed: 'No se completó el traslado de datos.', done: 'Datos trasladados correctamente.' } as Record<string, string>)[phase])
    if (phase === 'failed') {
      await expect(page.getByTestId('migration-recovery')).toContainText('Conserva ambas carpetas')
      await expect(page.getByTestId('migration-dismiss')).toBeInViewport({ ratio: 1 })
    }
    if (phase === 'failed' || phase === 'done') {
      if (phase === 'done') await launcher.main.evaluate(() => { const key = 'launcher.react.preferences'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), appearance: 'light' })); dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) })) })
      await page.emulateMedia({ reducedMotion: 'reduce' }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(info.outputPath(`migration-${phase}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
      await snap({ ...launcher, main: page }, `migration-${phase}`, 'Ventana auxiliar real: progreso y recuperación explícitos con acciones fuera del scroll.')
    }
  }
  await page.reload(); await expect(page.getByTestId('migration-status')).toHaveText('Datos trasladados correctamente.')
  await page.getByTestId('migration-dismiss').click(); await expect.poll(() => win.evaluate(win => win.isVisible())).toBe(false)
  expect(errors).toEqual([])
  expect(await readFile(join(launcher.appDataPath, 'LauncherMC/root'), 'utf8')).toBe(launcher.gameDataPath)
})
