import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { lstat, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds'); await expect(area).toHaveAttribute('aria-busy', 'false'); return area
}

test('world copy reviews Native bytes and destination, preserves all files and rejects stale reviews and collisions', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), source = await makeReactWorld(a, 'Alpha')
  await mkdir(join(source, 'region/empty'), { recursive: true }); await writeFile(join(source, '.hidden'), 'KEEP'); const bytes = await readFile(join(source, 'level.dat'))
  const area = await open(page), dialog = page.getByTestId('world-files-dialog'), trigger = area.getByRole('button', { name: 'Copiar Alpha', exact: true })
  await trigger.click(); await dialog.getByLabel('Instancia de destino').selectOption(b); await dialog.getByLabel('Carpeta de la copia').fill('Beta'); await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click()
  await expect(dialog.getByTestId('world-files-review')).toContainText('2 archivos'); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await expect(lstat(join(b, 'saves/Beta'))).rejects.toMatchObject({ code: 'ENOENT' })
  await trigger.click(); await dialog.getByLabel('Instancia de destino').selectOption(b); await dialog.getByLabel('Carpeta de la copia').fill('Beta'); await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click()
  await writeFile(join(source, '.hidden'), 'EXTERNAL'); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('cambió desde la revisión')
  await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('Copia independiente creada')
  expect(await readFile(join(b, 'saves/Beta/level.dat'))).toEqual(bytes); expect(await readFile(join(b, 'saves/Beta/.hidden'), 'utf8')).toBe('EXTERNAL'); expect((await lstat(join(b, 'saves/Beta/region/empty'))).isDirectory()).toBe(true)
  await page.keyboard.press('Escape'); await trigger.click(); await dialog.getByLabel('Instancia de destino').selectOption(b); await dialog.getByLabel('Carpeta de la copia').fill('Beta'); await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('El destino ya existe')
  expect(await readFile(join(source, 'level.dat'))).toEqual(bytes)
})

test('world export and removal retain exact bytes, a private backup and a shared link target', async ({ launcher }) => {
  const page = launcher.main, [a] = await seedReactLibrary(page), source = await makeReactWorld(a, 'Alpha'), bytes = await readFile(join(source, 'level.dat')), exports = join(launcher.appDataPath, 'world-exports')
  await mkdir(exports, { recursive: true }); const area = await open(page), dialog = page.getByTestId('world-files-dialog')
  await area.getByRole('button', { name: 'Exportar Alpha', exact: true }).click(); await stubOpenDialog(launcher, exports); await dialog.getByRole('button', { name: 'Elegir carpeta de exportación' }).click(); await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('ZIP exportado')
  const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url)), { open: openZip, readAllEntries, readEntry } = require('@xmcl/unzip'), zip = await openZip(join(exports, 'Alpha.zip'))
  try { const entries = await readAllEntries(zip); expect(await readEntry(zip, entries.find((entry: any) => entry.fileName === 'level.dat'))).toEqual(bytes) } finally { zip.close() }
  await page.keyboard.press('Escape'); const remove = area.getByRole('button', { name: 'Retirar Alpha', exact: true }); await remove.click(); await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('Mundo retirado')
  const backup = (await readdir(join(a, '.backups'))).find(name => name.startsWith('world-'))!; expect(await readFile(join(a, '.backups', backup, 'Alpha/level.dat'))).toEqual(bytes)
  await page.keyboard.press('Escape'); await expect(area.getByLabel('Buscar mundos')).toBeFocused(); await expect(area.locator('[data-world-name="Alpha"]')).toHaveCount(0)
  const shared = await makeReactWorld(launcher.gameDataPath, 'Shared'); await symlink(shared, join(a, 'saves/Linked'), 'junction'); await area.getByTestId('worlds-refresh').click(); await area.getByRole('button', { name: 'Retirar Linked', exact: true }).click(); await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click(); await expect(dialog).toContainText('Solo se retirará el enlace'); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('Mundo retirado'); expect(await readFile(join(shared, 'level.dat'))).not.toHaveLength(0)
})

test('world operation forms and reviews keep confirmation and keyboard focus reachable in both themes and sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  const [path] = await seedReactLibrary(page), name = 'Long-' + 'world-'.repeat(22); await makeReactWorld(path, name)
  const exports = join(launcher.appDataPath, 'world-exports'); await mkdir(exports, { recursive: true }); await open(page)
  const area = page.getByTestId('instance-worlds'), dialog = page.getByTestId('world-files-dialog'), win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      for (const type of ['Copiar', 'Exportar', 'Retirar']) {
        const trigger = area.getByRole('button', { name: `${type} ${name}`, exact: true }); await trigger.click()
        if (type === 'Exportar') { await stubOpenDialog(launcher, exports); await dialog.getByRole('button', { name: 'Elegir carpeta de exportación' }).click() }
        const review = dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }); await review.focus(); await expect(review).toBeInViewport({ ratio: 1 }); await page.keyboard.press('Enter')
        const confirm = dialog.getByRole('button', { name: 'Confirmar operación', exact: true }); await confirm.focus(); await expect(confirm).toBeInViewport({ ratio: 1 })
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        await writeFile(testInfo.outputPath(`${type}-${theme}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
        await snap(launcher, `world-${type}-${theme}-${size[0]}`, 'Reviewed world operation preserves keyboard access and explicit confirmation in the supported desktop sizes.')
        await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
      }
    }
  }
  expect(errors).toEqual([])
})
