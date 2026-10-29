import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactResourcePack } from '../../helpers/react-content'
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
test('a configured parent alias retains shared packs through watch, UI refresh and independent private copying', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = launcher.gameDataPath
  await makeReactResourcePack(path, 'local'); await makeReactResourcePack(root, 'common')
  const local = await readFile(join(path, 'resourcepacks/local.zip')), common = await readFile(join(root, 'resourcepacks/common.zip'))
  const options = 'resourcePacks:["vanilla","file/local.zip"]\nlang:es_es\n'; await writeFile(join(path, 'options.txt'), options)
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceResourcePacksService').call('linkShared', path), path)
  expect(await page.evaluate(async path => (window as any).serviceChannels.open('InstanceResourcePacksService').call('isLinked', path), path)).toBe(true)
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await expect(area.getByRole('button', { name: 'Crear copia privada', exact: true })).toBeEnabled()
  await expect(area.getByRole('button', { name: 'Información de common.zip', exact: true })).toBeVisible()
  expect((await lstat(join(path, 'resourcepacks'))).isSymbolicLink()).toBe(true)
  await page.reload(); await expect(area.getByRole('button', { name: 'Crear copia privada', exact: true })).toBeEnabled()
  await area.getByRole('button', { name: 'Crear copia privada', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmar copia privada', exact: true }).click()
  await expect(area.getByRole('button', { name: 'Compartir packs', exact: true })).toBeEnabled()
  expect((await lstat(join(path, 'resourcepacks'))).isSymbolicLink()).toBe(false)
  expect(await readdir(join(path, 'resourcepacks'))).toEqual(['common.zip', 'local.zip'])
  expect(await readFile(join(path, 'resourcepacks/local.zip'))).toEqual(local); expect(await readFile(join(path, 'resourcepacks/common.zip'))).toEqual(common)
  expect(await readFile(join(root, 'resourcepacks/local.zip'))).toEqual(local); expect(await readFile(join(root, 'resourcepacks/common.zip'))).toEqual(common)
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe(options)
})
