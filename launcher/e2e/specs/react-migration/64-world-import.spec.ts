import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { activateLauncherControl } from '../../helpers/focus-launcher'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds'); await expect(area).toHaveAttribute('aria-busy', 'false'); return area
}

test('folder import reviews and rejects stale bytes, preserves its source and creates an independent world', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = await makeReactWorld(join(launcher.appDataPath, 'world-source'), 'Original')
  await mkdir(join(source, 'region/empty'), { recursive: true }); await writeFile(join(source, '.keep'), 'ORIGINAL')
  const bytes = await readFile(join(source, 'level.dat')), before = await lstat(join(source, 'level.dat')), area = await open(page), dialog = page.getByTestId('world-files-dialog')
  await area.getByRole('button', { name: 'Importar mundo', exact: true }).click(); await stubOpenDialog(launcher, source); await dialog.getByRole('button', { name: 'Elegir carpeta del mundo', exact: true }).click()
  await expect(dialog.getByLabel('Nombre de carpeta del mundo importado')).toHaveValue('Original'); await dialog.getByLabel('Nombre de carpeta del mundo importado').fill('Imported')
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true })); await expect(dialog.getByTestId('world-files-review')).toContainText('2 archivos'); await expect(dialog.getByRole('button', { name: 'Confirmar operación', exact: true })).toBeEnabled()
  await writeFile(join(source, '.keep'), 'EXTERNAL'); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('cambió desde la revisión'); await expect(dialog.getByLabel('Nombre de carpeta del mundo importado')).toHaveValue('Imported')
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true })); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('Mundo importado')
  expect(await readFile(join(path, 'saves/Imported/level.dat'))).toEqual(bytes); expect(await readFile(join(path, 'saves/Imported/.keep'), 'utf8')).toBe('EXTERNAL'); expect((await lstat(join(path, 'saves/Imported/region/empty'))).isDirectory()).toBe(true)
  expect(await readFile(join(source, 'level.dat'))).toEqual(bytes); expect((await lstat(join(source, 'level.dat'))).mtimeMs).toBe(before.mtimeMs)
  await page.keyboard.press('Escape'); await expect(area.locator('[data-world-name="Imported"]')).toContainText('Original')
})

test('ZIP export/import interoperability preserves bytes, detects collisions and leaves the original archive unchanged', async ({ launcher }) => {
  const page = launcher.main, [path, other] = await seedReactLibrary(page), source = await makeReactWorld(other, 'ZipSource'), exports = join(launcher.appDataPath, 'world-exports')
  await mkdir(exports, { recursive: true }); const bytes = await readFile(join(source, 'level.dat'))
  const archive = await page.evaluate(async ({ other, exports }) => {
    const service = (window as any).serviceChannels.open('InstanceSavesService'), review = await service.call('previewWorldFiles', { type: 'export', instancePath: other, saveName: 'ZipSource', destinationDirectory: exports, fileName: 'world.zip' })
    return (await service.call('applyWorldFiles', review)).path as string
  }, { other, exports }), original = await readFile(archive)
  await makeReactWorld(path, 'Existing'); const existing = await readFile(join(path, 'saves/Existing/level.dat')), area = await open(page), dialog = page.getByTestId('world-files-dialog')
  await area.getByRole('button', { name: 'Importar mundo', exact: true }).click(); await stubOpenDialog(launcher, archive); await dialog.getByRole('button', { name: 'Elegir ZIP del mundo', exact: true }).click(); await expect(dialog.getByLabel('Nombre de carpeta del mundo importado')).toHaveValue('world')
  await dialog.getByLabel('Nombre de carpeta del mundo importado').fill('Existing'); await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true })); await expect(dialog.getByRole('alert')).toContainText('El destino ya existe')
  await dialog.getByLabel('Nombre de carpeta del mundo importado').fill('ImportedZip'); await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true })); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('Mundo importado')
  expect(await readFile(join(path, 'saves/ImportedZip/level.dat'))).toEqual(bytes); expect(await readFile(join(path, 'saves/Existing/level.dat'))).toEqual(existing); expect(await readFile(archive)).toEqual(original)
})

test('invalid import folders keep the form recoverable and native picker cancellation does not create files', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = join(launcher.appDataPath, 'NotAWorld'); await mkdir(source, { recursive: true }); await writeFile(join(source, 'keep'), 'SOURCE')
  const area = await open(page), dialog = page.getByTestId('world-files-dialog'); await area.getByRole('button', { name: 'Importar mundo', exact: true }).click()
  await launcher.app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }) }); await dialog.getByRole('button', { name: 'Elegir ZIP del mundo', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true })).toBeDisabled()
  await stubOpenDialog(launcher, source); await dialog.getByRole('button', { name: 'Elegir carpeta del mundo', exact: true }).click(); await expect(dialog.getByLabel('Nombre de carpeta del mundo importado')).toHaveValue('NotAWorld'); await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true })); await expect(dialog.getByRole('alert')).toContainText('carpeta con level.dat')
  await expect(dialog.getByLabel('Nombre de carpeta del mundo importado')).toHaveValue('NotAWorld'); await expect(lstat(join(path, 'saves/NotAWorld'))).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readFile(join(source, 'keep'), 'utf8')).toBe('SOURCE')
})

test('world import form and review remain accessible with long paths in both themes and supported sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await seedReactLibrary(page); const source = await makeReactWorld(join(launcher.appDataPath, 'long-import-source'), 'Source-' + 'world-'.repeat(22)); await open(page)
  const area = page.getByTestId('instance-worlds'), dialog = page.getByTestId('world-files-dialog'), win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      const trigger = area.getByRole('button', { name: 'Importar mundo', exact: true }); await trigger.click(); await stubOpenDialog(launcher, source); await dialog.getByRole('button', { name: 'Elegir carpeta del mundo', exact: true }).click(); await expect(dialog.getByLabel('Nombre de carpeta del mundo importado')).not.toHaveValue('')
      await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true })); const confirm = dialog.getByRole('button', { name: 'Confirmar operación', exact: true }); await confirm.focus(); await expect(confirm).toBeFocused(); await expect(confirm).toBeInViewport({ ratio: 1 })
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`import-${theme}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
      await snap(launcher, `world-import-${theme}-${size[0]}`, 'World import review preserves source paths and keeps keyboard confirmation reachable without replacing existing worlds.')
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
    }
  }
  expect(errors).toEqual([])
})
