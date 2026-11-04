import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, type LauncherFixture } from '../../helpers/scratch'

test.use({ launcherOptions: { locale: 'es-ES' } })
test('visual cache cleanup removes only disposable files in its owned directory', async ({ launcher }) => {
  const directory = join(launcher.appDataPath, 'LauncherMC/presentation-cache-v1'), sentinel = join(launcher.gameDataPath, 'keep-world.txt')
  await mkdir(directory, { recursive: true }); await writeFile(join(directory, `${'a'.repeat(64)}.img`), 'owned disposable'); await writeFile(join(directory, 'keep.txt'), 'keep'); await writeFile(sentinel, 'world sentinel')
  await launcher.main.getByTestId('nav-settings').click(); await launcher.main.getByTestId('global-cache-clear').click(); await expect(launcher.main.getByTestId('global-cache-result')).toHaveText('Caché visual limpiada.')
  expect(await readdir(directory)).toEqual(['keep.txt']); expect(await readFile(sentinel, 'utf8')).toBe('world sentinel')
})

async function otherWindow(launcher: LauncherFixture) {
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow, app }) => {
    const win = new BrowserWindow({ width: 800, height: 400, minWidth: 800, minHeight: 400, frame: false, webPreferences: { preload: `${app.getAppPath()}/index-preload.js`, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    await win.loadURL('http://xmcl.runtime/index.html#/setting')
  })
  const page = await opening
  page.on('dialog', dialog => { expect(dialog.type()).toBe('beforeunload'); void dialog.dismiss().catch(error => { if (!String(error).includes('No dialog is showing')) throw error }) })
  await expect(page.getByTestId('global-settings')).toBeVisible()
  return page
}
test('Native settings close supports stay, save and discard without losing the draft', async ({ launcher }) => {
  const other = await otherWindow(launcher), win = await launcher.app.browserWindow(other)
  await other.getByTestId('settings-category-select').selectOption('game'); await other.getByTestId('global-memory-custom').check(); await other.getByTestId('global-memory-max').fill('4096')
  await win.evaluate(win => win.close()); await expect(other.getByTestId('global-settings-leave')).toBeVisible(); await other.getByRole('button', { name: 'Seguir aquí', exact: true }).click(); await expect(other.getByTestId('global-memory-max')).toHaveValue('4096')
  await win.evaluate(win => win.close()); await expect(other.getByTestId('global-settings-leave')).toBeVisible()
  const closed = other.waitForEvent('close'); await other.getByTestId('global-settings-leave-save').click(); await closed
  const path = join(launcher.appDataPath, 'LauncherMC/setting.json')
  expect(JSON.parse(await readFile(path, 'utf8')).globalMaxMemory).toBe(4096)
  const next = await otherWindow(launcher), nextWin = await launcher.app.browserWindow(next)
  await next.getByTestId('settings-category-select').selectOption('network'); await next.getByTestId('global-max-sockets').fill('24')
  await nextWin.evaluate(win => win.close()); await expect(next.getByTestId('global-settings-leave')).toBeVisible()
  const discarded = next.waitForEvent('close'); await next.getByTestId('global-settings-leave-discard').click(); await discarded
  expect(JSON.parse(await readFile(path, 'utf8')).maxSockets).not.toBe(24)
})
