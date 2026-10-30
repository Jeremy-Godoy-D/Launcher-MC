import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod, makeReactShaderPack } from '../../helpers/react-content'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })

test('shader ZIP and folder imports preserve sources, configurations, worlds and another instance without auto-activation', async ({ launcher }) => {
  const page = launcher.main, [path, other] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'shader-source'), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await makeReactShaderPack(source, 'Local'); const archive = join(source, 'shaderpacks/Local.zip'), bytes = await readFile(archive), folder = join(source, 'Unpacked')
  await mkdir(join(folder, 'shaders'), { recursive: true }); await writeFile(join(folder, 'shaders/final.fsh'), '// Synthetic fixture, never executed')
  await mkdir(join(path, 'config'), { recursive: true }); const config = '# PRESERVE\r\nshaderPack=\r\nunknown=KEEP\r\n'; await writeFile(join(path, 'config/iris.properties'), config)
  await mkdir(join(path, 'saves/keep'), { recursive: true }); await writeFile(join(path, 'saves/keep/level.dat'), 'WORLD')
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Shaders', exact: true }).click()
  const area = page.getByTestId('instance-shaders'), add = area.getByRole('button', { name: 'Añadir archivos', exact: true })
  await expect(area).toContainText('No se detectó un motor'); await stubOpenDialog(launcher, archive); await add.click()
  await expect(area.getByRole('button', { name: 'Activar Local.zip', exact: true })).toBeDisabled()
  await expect(area.getByRole('status').filter({ hasText: 'Shaders copiados' })).toBeVisible(); await expect(add).toBeFocused()
  await stubOpenDialog(launcher, folder); await area.getByRole('button', { name: 'Añadir carpeta', exact: true }).click()
  await expect(area.getByRole('button', { name: 'Activar Unpacked', exact: true })).toBeDisabled()
  expect(await readFile(join(path, 'config/iris.properties'), 'utf8')).toBe(config)
  expect(await readFile(join(path, 'shaderpacks/Local.zip'))).toEqual(bytes)
  expect((await lstat(join(path, 'shaderpacks/Local.zip'))).ino).not.toBe((await lstat(archive)).ino)
  await writeFile(join(folder, 'shaders/final.fsh'), 'SOURCE EDIT')
  expect(await readFile(join(path, 'shaderpacks/Unpacked/shaders/final.fsh'), 'utf8')).toBe('// Synthetic fixture, never executed')
  await makeReactMod(path, 'iris', 'Iris'); await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0' } }), path)
  await area.getByRole('button', { name: 'Volver a leer', exact: true }).click(); await area.getByRole('button', { name: 'Activar Unpacked', exact: true }).click()
  await expect(area.getByRole('button', { name: 'Desactivar Unpacked', exact: true })).toBeEnabled()
  await page.reload(); await expect(area.getByRole('button', { name: 'Desactivar Unpacked', exact: true })).toBeEnabled()
  expect(await readFile(archive)).toEqual(bytes); expect(await readFile(join(path, 'saves/keep/level.dat'), 'utf8')).toBe('WORLD')
  await expect(lstat(join(other, 'shaderpacks/Local.zip'))).rejects.toHaveProperty('code', 'ENOENT'); expect(errors).toEqual([])
  const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
  for (const name of ['Añadir archivos', 'Añadir carpeta', 'Carpeta de shaders', 'Volver a leer']) { const action = area.getByRole('button', { name, exact: true }); await action.focus(); await expect(action).toBeInViewport({ ratio: 1 }) }
  await snap(launcher, 'shader-import-actions-800', 'Imported shader sources remain independent and import actions are reachable in the minimum window.')
})

test('a shader filename collision and canceled native picker preserve installed files and recover focus', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'collision-shader-source')
  await makeReactShaderPack(path, 'Same'); await makeReactShaderPack(source, 'Same'); const installed = join(path, 'shaderpacks/Same.zip'), bytes = await readFile(installed)
  await writeFile(join(source, 'shaderpacks/Same.zip'), 'NEW SOURCE')
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Shaders', exact: true }).click()
  const area = page.getByTestId('instance-shaders'), add = area.getByRole('button', { name: 'Añadir archivos', exact: true })
  await stubOpenDialog(launcher, join(source, 'shaderpacks/Same.zip')); await add.click(); await expect(area.getByRole('alert')).toContainText('Ya existe un shader')
  expect(await readFile(installed)).toEqual(bytes); expect(await readFile(join(source, 'shaderpacks/Same.zip'), 'utf8')).toBe('NEW SOURCE'); await expect(add).toBeFocused()
  await launcher.app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] }) })
  await add.click(); await expect(add).toBeEnabled(); await expect(add).toBeFocused(); await expect(area.getByRole('alert')).toHaveCount(0)
  expect(await readFile(installed)).toEqual(bytes)
  const error = await page.evaluate(async path => { try { await (window as any).serviceChannels.open('InstanceShaderPacksService').call('install', { path: path + '-unknown', files: [] }); return '' } catch (e: any) { return e.name } }, path)
  expect(error).toBe('InstanceNotFoundError')
})
