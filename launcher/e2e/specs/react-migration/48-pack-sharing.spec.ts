import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactResourcePack } from '../../helpers/react-content'
import { lstat, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function openPacks(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await expect(area.getByRole('button', { name: 'Compartir packs', exact: true })).toBeEnabled()
  return area
}
test('reviewed sharing and private copies preserve local backups, common packs, selection, groups and worlds', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), root = launcher.gameDataPath
  await makeReactResourcePack(a, 'alpha'); await makeReactResourcePack(root, 'common')
  await mkdir(join(a, 'resourcepacks/folder/assets/example'), { recursive: true }); await mkdir(join(a, 'resourcepacks/folder/empty'))
  await writeFile(join(a, 'resourcepacks/folder/pack.mcmeta'), '{"pack":{"pack_format":34,"description":"Folder pack"}}'); await writeFile(join(a, 'resourcepacks/folder/assets/example/keep.txt'), 'LOCAL ASSET')
  await mkdir(join(a, 'saves/keep'), { recursive: true }); await writeFile(join(a, 'saves/keep/level.dat'), 'WORLD')
  const options = 'resourcePacks:["vanilla","file/alpha.zip"]\r\nlang:es_es\r\n', groups = '{"Visual":{"color":"#abcdef","files":["alpha.zip"]}}'
  await writeFile(join(a, 'options.txt'), options); await writeFile(join(a, 'resourcepacks-groups.json'), groups)
  const bytes = await readFile(join(a, 'resourcepacks/alpha.zip')), area = await openPacks(page), dialog = page.getByRole('dialog')
  await area.getByRole('button', { name: 'Compartir packs', exact: true }).click()
  await expect(dialog).toContainText('Packs locales: 2')
  await dialog.locator('.dialog-actions').getByRole('button', { name: 'Cancelar cambio de carpeta', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(area.getByRole('button', { name: 'Compartir packs', exact: true })).toBeFocused()
  expect((await lstat(join(a, 'resourcepacks'))).isSymbolicLink()).toBe(false)
  await expect(lstat(join(a, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
  await area.getByRole('button', { name: 'Compartir packs', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(area.getByRole('button', { name: 'Crear copia privada', exact: true })).toBeEnabled()
  await expect(area.getByRole('button', { name: 'Información de common.zip', exact: true })).toBeVisible()
  expect((await lstat(join(a, 'resourcepacks'))).isSymbolicLink()).toBe(true)
  const backup = (await readdir(join(a, '.backups'))).find(name => name.startsWith('resourcepacks-share-'))!
  expect(await readFile(join(a, '.backups', backup, 'previous/alpha.zip'))).toEqual(bytes)
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceResourcePacksService').call('linkShared', path), b)
  await makeReactResourcePack(root, 'later')
  await expect(area.getByRole('button', { name: 'Información de later.zip', exact: true })).toBeVisible()
  await area.getByRole('button', { name: 'Crear copia privada', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar copia privada', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(area.getByRole('button', { name: 'Compartir packs', exact: true })).toBeEnabled()
  expect((await lstat(join(a, 'resourcepacks'))).isSymbolicLink()).toBe(false); expect((await lstat(join(b, 'resourcepacks'))).isSymbolicLink()).toBe(true)
  expect(await readFile(join(a, 'resourcepacks/alpha.zip'))).toEqual(bytes)
  expect((await lstat(join(a, 'resourcepacks/alpha.zip'))).ino).not.toBe((await lstat(join(root, 'resourcepacks/alpha.zip'))).ino)
  expect((await lstat(join(a, 'resourcepacks/folder/empty'))).isDirectory()).toBe(true)
  await writeFile(join(a, 'resourcepacks/folder/assets/example/keep.txt'), 'PRIVATE EDIT')
  expect(await readFile(join(root, 'resourcepacks/folder/assets/example/keep.txt'), 'utf8')).toBe('LOCAL ASSET')
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(options); expect(await readFile(join(a, 'resourcepacks-groups.json'), 'utf8')).toBe(groups)
  expect(await readFile(join(a, 'saves/keep/level.dat'), 'utf8')).toBe('WORLD')
})

test('conflicts disable confirmation and a changed reviewed source cannot publish packs or change its link', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = launcher.gameDataPath
  await makeReactResourcePack(path, 'alpha', 'LOCAL'); await makeReactResourcePack(root, 'alpha', 'COMMON')
  const area = await openPacks(page), dialog = page.getByRole('dialog'), common = await readFile(join(root, 'resourcepacks/alpha.zip'))
  await area.getByRole('button', { name: 'Compartir packs', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('alpha.zip'); await expect(dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); expect(await readFile(join(root, 'resourcepacks/alpha.zip'))).toEqual(common)
  await rename(join(root, 'resourcepacks/alpha.zip'), join(root, 'retained-common.zip'))
  await area.getByRole('button', { name: 'Compartir packs', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true })).toBeEnabled()
  await makeReactResourcePack(path, 'alpha', 'EDIT AFTER REVIEW')
  await dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('cambiaron')
  expect((await lstat(join(path, 'resourcepacks'))).isSymbolicLink()).toBe(false)
  await expect(lstat(join(root, 'resourcepacks/alpha.zip'))).rejects.toHaveProperty('code', 'ENOENT')
  await page.keyboard.press('Escape')
})

test('sharing reviews keep title, body and actions accessible in both directions, themes and supported sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await makeReactResourcePack(path, 'alpha'); await makeReactResourcePack(launcher.gameDataPath, 'common'); const area = await openPacks(page), dialog = page.getByRole('dialog'), win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const direction of ['Compartir packs', 'Crear copia privada']) {
      await area.getByRole('button', { name: direction, exact: true }).click()
      for (const size of [[1200, 720], [800, 400]]) {
        await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
        await expect(dialog.getByRole('heading', { name: direction, exact: true })).toBeInViewport({ ratio: 1 })
        const confirm = dialog.getByRole('button', { name: direction === 'Compartir packs' ? 'Confirmar carpeta compartida' : 'Confirmar copia privada', exact: true })
        await confirm.focus(); await expect(confirm).toBeInViewport({ ratio: 1 })
        const body = dialog.getByRole('region', { name: 'Revisión de carpeta de packs', exact: true }); await expect(body).toBeInViewport({ ratio: 1 })
        await body.focus(); await page.keyboard.press('End')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        await writeFile(testInfo.outputPath(`sharing-${theme}-${direction}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
        await snap(launcher, `sharing-${theme}-${direction}-${size[0]}`, 'Reviewed folder changes preserve files, selection and a reachable confirmation footer.')
      }
      await dialog.getByRole('button', { name: direction === 'Compartir packs' ? 'Confirmar carpeta compartida' : 'Confirmar copia privada', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(area.getByRole('button', { name: direction === 'Compartir packs' ? 'Crear copia privada' : 'Compartir packs', exact: true })).toBeFocused()
    }
  }
  expect(errors).toEqual([])
})
