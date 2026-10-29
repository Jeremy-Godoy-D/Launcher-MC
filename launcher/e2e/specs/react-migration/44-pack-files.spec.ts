import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactResourcePack as pack } from '../../helpers/react-content'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('local pack archives and folders copy independently and reviewed removal preserves sources, backups, worlds and another manifest', async ({ launcher }, testInfo) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'pack-source'), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await pack(source, 'added')
  const archive = join(source, 'resourcepacks/added.zip'), bytes = await readFile(archive), folder = join(source, 'folder')
  await mkdir(join(folder, 'assets/example'), { recursive: true }); await writeFile(join(folder, 'pack.mcmeta'), '{"pack":{"pack_format":34,"description":"Synthetic unpacked fixture"}}'); await writeFile(join(folder, 'assets/example/test.txt'), 'PACK ASSET')
  const originalOptions = 'lang:es_es\r\nresourcePacks:["vanilla","fabric","file/added.zip","file/folder"]\r\nunknown:KEEP\r\n'
  await writeFile(join(a, 'options.txt'), originalOptions); await mkdir(join(a, 'saves/keep'), { recursive: true }); await writeFile(join(a, 'saves/keep/level.dat'), 'KEEP PACK WORLD')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceInstallService').call('stageInstanceFiles', { path, oldFiles: [], files: [{ path: 'config/other.txt', hashes: { sha1: 'a'.repeat(40) }, downloads: ['https://example.invalid/other'] }] }), a)
  const manifest = await readFile(join(a, '.install-manifest'))
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await stubOpenDialog(launcher, archive); await area.getByRole('button', { name: 'Añadir archivos', exact: true }).click()
  await expect(area.getByRole('checkbox', { name: 'Seleccionar added.zip', exact: true })).toBeVisible()
  await stubOpenDialog(launcher, folder); await area.getByRole('button', { name: 'Añadir carpeta', exact: true }).click()
  await expect(area.getByRole('checkbox', { name: 'Seleccionar folder', exact: true })).toBeVisible()
  expect(await readFile(join(a, 'resourcepacks/added.zip'))).toEqual(bytes); expect(await readFile(join(a, 'resourcepacks/folder/assets/example/test.txt'), 'utf8')).toBe('PACK ASSET')
  expect((await lstat(join(a, 'resourcepacks/added.zip'))).ino).not.toBe((await lstat(archive)).ino)
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(originalOptions)
  await writeFile(join(folder, 'assets/example/test.txt'), 'EDITED SOURCE')
  expect(await readFile(join(a, 'resourcepacks/folder/assets/example/test.txt'), 'utf8')).toBe('PACK ASSET')
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', preferences = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...preferences, appearance: theme })) }, theme)
    await page.reload(); await area.getByRole('checkbox', { name: 'Seleccionar added.zip', exact: true }).check(); await area.getByRole('checkbox', { name: 'Seleccionar folder', exact: true }).check()
    const win = await launcher.app.browserWindow(page)
    await win.evaluate(win => win.setContentSize(800, 400))
    for (const name of ['Añadir archivos', 'Añadir carpeta', 'Abrir carpeta de packs', 'Volver a leer']) {
      const action = area.getByRole('button', { name, exact: true }); await action.focus(); await expect(action).toBeInViewport({ ratio: 1 })
    }
    await snap(launcher, `pack-actions-${theme}-800`, 'Every local pack action can be reached by focus and scroll in the minimum window.')
    await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Revisar retirada de packs', exact: true })
    await expect(dialog).toContainText('folder'); await expect(dialog).toContainText('2 archivos')
    for (const [width, height] of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), [width, height])
      const region = dialog.getByRole('region', { name: 'Packs y archivos que se retirarán', exact: true })
      await region.focus(); await page.keyboard.press('End')
      await expect(dialog.getByRole('button', { name: 'Mover a copias', exact: true })).toBeInViewport({ ratio: 1 })
      await expect(dialog.getByRole('heading')).toBeInViewport({ ratio: 1 })
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const accessibility = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`pack-removal-axe-${theme}-${width}.json`), JSON.stringify(accessibility, null, 2)); expect(accessibility.violations).toEqual([])
      await snap(launcher, `pack-removal-${theme}-${width}`, 'A Native review names archive and folder contents before moving them to private backups; controls stay outside the scroll.')
    }
    expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(originalOptions)
    await dialog.locator('.dialog-actions').getByRole('button', { name: 'Cancelar retirada', exact: true }).click()
    await expect(area.getByRole('button', { name: 'Retirar seleccionados', exact: true })).toBeFocused()
  }
  await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  await page.getByRole('dialog', { name: 'Revisar retirada de packs', exact: true }).getByRole('button', { name: 'Mover a copias', exact: true }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Packs retirados' })).toBeVisible()
  await expect(area.getByRole('checkbox')).toHaveCount(0)
  const backups = await readdir(join(a, '.backups')), backup = join(a, '.backups', backups.find(name => name.startsWith('resourcepacks-'))!)
  expect(await readFile(join(backup, 'added.zip'))).toEqual(bytes); expect(await readFile(join(backup, 'folder/assets/example/test.txt'), 'utf8')).toBe('PACK ASSET')
  expect(await readFile(archive)).toEqual(bytes); expect(await readFile(join(a, '.install-manifest'))).toEqual(manifest); expect(await readFile(join(a, 'saves/keep/level.dat'), 'utf8')).toBe('KEEP PACK WORLD')
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(originalOptions.replace(',"file/added.zip","file/folder"', ''))
  await expect(lstat(join(b, 'resourcepacks/added.zip'))).rejects.toHaveProperty('code', 'ENOENT'); expect(errors).toEqual([])
  await snap(launcher, 'pack-removal-complete', 'Removed packs remain in backups; original imports, world bytes and the unrelated pending manifest are preserved.')
})

test('a collision preserves the installed archive and an edited pack makes its removal review stale', async ({ launcher }) => {
  const page = launcher.main, [a] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'collision-source')
  await pack(a, 'same'); await pack(source, 'same'); await writeFile(join(source, 'resourcepacks/same.zip'), 'different source bytes')
  const original = await readFile(join(a, 'resourcepacks/same.zip'))
  await writeFile(join(a, 'options.txt'), 'resourcePacks:["file/same.zip"]\nlang:es_es\n')
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await stubOpenDialog(launcher, join(source, 'resourcepacks/same.zip')); await area.getByRole('button', { name: 'Añadir archivos', exact: true }).click()
  await expect(area.getByRole('alert')).toContainText('Ya existe un pack')
  expect(await readFile(join(a, 'resourcepacks/same.zip'))).toEqual(original)
  await area.getByRole('checkbox', { name: 'Seleccionar same.zip', exact: true }).check(); await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  await writeFile(join(a, 'resourcepacks/same.zip'), Buffer.concat([original, Buffer.from('USER EDIT')]))
  const dialog = page.getByRole('dialog', { name: 'Revisar retirada de packs', exact: true })
  await dialog.getByRole('button', { name: 'Mover a copias', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Los archivos, los vínculos o la selección')
  expect(await readFile(join(a, 'resourcepacks/same.zip'))).toEqual(Buffer.concat([original, Buffer.from('USER EDIT')]))
  await expect(lstat(join(a, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe('resourcePacks:["file/same.zip"]\nlang:es_es\n')
  await dialog.locator('.dialog-actions').getByRole('button', { name: 'Cancelar retirada', exact: true }).click()
})

test('an unreadable local archive can be reviewed and recovered into backups without parsing it successfully', async ({ launcher }) => {
  const page = launcher.main, [a] = await seedReactLibrary(page)
  await mkdir(join(a, 'resourcepacks'), { recursive: true }); await writeFile(join(a, 'resourcepacks/broken.zip'), 'INVALID ZIP USER BYTES')
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await area.getByRole('checkbox', { name: 'Seleccionar archivo no leído broken.zip', exact: true }).check()
  await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Revisar retirada de packs', exact: true })
  await expect(dialog).toContainText('broken.zip'); await dialog.getByRole('button', { name: 'Mover a copias', exact: true }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Packs retirados' })).toBeVisible()
  const backups = await readdir(join(a, '.backups')), backup = backups.find(name => name.startsWith('resourcepacks-'))!
  expect(await readFile(join(a, '.backups', backup, 'broken.zip'), 'utf8')).toBe('INVALID ZIP USER BYTES')
  await expect(lstat(join(a, 'resourcepacks/broken.zip'))).rejects.toHaveProperty('code', 'ENOENT')
})
