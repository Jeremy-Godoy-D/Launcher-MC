import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { activateLauncherControl } from '../../helpers/focus-launcher'
import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds'); await expect(area).toHaveAttribute('aria-busy', 'false'); return area
}

test('world metadata editing reviews changes, rejects stale level.dat bytes, stores a backup and updates the world', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = await makeReactWorld(path, 'Alpha', 'Original Alpha')
  const area = await open(page), dialog = page.getByTestId('world-files-dialog')
  await area.getByRole('button', { name: 'Editar metadatos de Alpha', exact: true }).click()
  await expect(dialog.getByLabel('Nombre del mundo')).toHaveValue('Original Alpha')
  await dialog.getByLabel('Nombre del mundo').fill('Alpha Renombrado')
  await dialog.getByLabel('Dificultad').selectOption('3')
  await dialog.getByLabel('Trucos').selectOption('disabled')
  await dialog.getByLabel('Semilla').fill('-987654321012345678')
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
  const review = dialog.getByTestId('world-files-review')
  await expect(review).toContainText('Alpha Renombrado'); await expect(review).toContainText('Difícil'); await expect(review).toContainText('Desactivados'); await expect(review).toContainText('-987654321012345678')
  await makeReactWorld(path, 'Alpha', 'Concurrent Alpha'); const concurrent = await readFile(join(root, 'level.dat'))
  await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('cambió desde la revisión'); await expect(dialog.getByLabel('Nombre del mundo')).toHaveValue('Alpha Renombrado')
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
  await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Metadatos actualizados')
  const backups = (await readdir(join(path, '.backups'))).filter(name => name.startsWith('world-metadata-'))
  expect(backups).toHaveLength(1); expect(await readFile(join(path, '.backups', backups[0], 'Alpha/level.dat'))).toEqual(concurrent)
  await page.keyboard.press('Escape'); await expect(area.locator('[data-world-name="Alpha"]')).toContainText('Alpha Renombrado')
  await area.getByRole('button', { name: 'Alpha Renombrado', exact: true }).click()
  const info = page.getByTestId('world-info')
  await expect(info).toContainText('Difícil'); await expect(info).toContainText('Desactivados'); await expect(info).toContainText('-987654321012345678')
})

test('invalid seeds, shared world warnings and unreadable worlds are handled safely without modifying files', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), shared = await makeReactWorld(launcher.gameDataPath, 'Shared', 'Shared World')
  await mkdir(join(path, 'saves/Broken'), { recursive: true }); await writeFile(join(path, 'saves/Broken/level.dat'), 'not-nbt')
  await symlink(shared, join(path, 'saves/Shared'), 'junction'); const original = await readFile(join(shared, 'level.dat'))
  const area = await open(page), dialog = page.getByTestId('world-files-dialog')
  await expect(area.getByRole('button', { name: 'Editar metadatos de Broken', exact: true })).toBeDisabled()
  await area.getByRole('button', { name: 'Editar metadatos de Shared', exact: true }).click()
  await dialog.getByLabel('Semilla').fill('9223372036854775808')
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
  await expect(dialog.getByRole('alert')).toContainText('entero válido de 64 bits')
  expect(await readFile(join(shared, 'level.dat'))).toEqual(original)
  await dialog.getByLabel('Semilla').fill('42')
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
  await expect(dialog.getByTestId('world-files-review')).toContainText('carpeta común o enlazado desde ella')
  expect(await readFile(join(shared, 'level.dat'))).toEqual(original)
})

test('world metadata review remains accessible in both themes and supported sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  const [path] = await seedReactLibrary(page); await makeReactWorld(path, 'Alpha', 'Mundo-' + 'largo-'.repeat(20)); await open(page)
  const area = page.getByTestId('instance-worlds'), dialog = page.getByTestId('world-files-dialog'), win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      const trigger = area.getByRole('button', { name: 'Editar metadatos de Alpha', exact: true }); await trigger.click()
      await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
      const confirm = dialog.getByRole('button', { name: 'Confirmar operación', exact: true }); await confirm.focus(); await expect(confirm).toBeFocused(); await expect(confirm).toBeInViewport({ ratio: 1 })
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`metadata-${theme}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
      await snap(launcher, `world-metadata-${theme}-${size[0]}`, 'World metadata review shows target fields, preserves backups and keeps confirmation accessible.')
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
    }
  }
  expect(errors).toEqual([])
})
