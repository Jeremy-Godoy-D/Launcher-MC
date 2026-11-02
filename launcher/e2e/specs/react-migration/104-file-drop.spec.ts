import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod, makeReactResourcePack, makeReactShaderPack } from '../../helpers/react-content'
import { makeReactWorld } from '../../helpers/react-world'
import { makeReactModpack } from '../../helpers/react-creation'
import { dropNativeFiles } from '../../helpers/react-file-drop'

test.use({ launcherOptions: { locale: 'es-ES' } })
test('native file drops review the captured instance, preserve sources and reject stale targets', async ({ launcher }, info) => {
  const page = launcher.main, [first, second] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'drop-source')
  await makeReactMod(source, 'alpha', 'Dropped Alpha'); await makeReactMod(source, 'beta', 'Dropped Beta')
  const alpha = join(source, 'mods/alpha.jar'), beta = join(source, 'mods/beta.jar'), bytes = await readFile(alpha)
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mods', exact: true }).click()
  const area = page.getByTestId('instance-mods'), review = page.getByTestId('file-drop-review')
  await expect(area.getByRole('button', { name: 'Añadir archivos', exact: true })).toBeEnabled()
  const search = area.getByLabel('Buscar mods instalados', { exact: true }); await search.focus()
  await dropNativeFiles(page, [alpha]); await expect(review).toContainText('Mi mundo'); await expect(review).toContainText('alpha.jar')
  await expect(lstat(join(first, 'mods/alpha.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
  await dropNativeFiles(page, [beta]); await expect(review).not.toContainText('beta.jar')
  const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
  await expect(page.getByTestId('file-drop-confirm')).toBeInViewport({ ratio: 1 }); await page.evaluate(axe.source)
  const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
  await writeFile(info.outputPath('file-drop-800-axe.json'), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
  await snap(launcher, 'file-drop-800', 'Arrastre con ruta nativa, instancia y archivos capturados; no se modifica nada hasta confirmar.')
  await page.keyboard.press('Escape'); await expect(search).toBeFocused()
  await dropNativeFiles(page, [alpha]); await page.getByTestId('file-drop-confirm').click()
  await expect(area.getByText('Dropped Alpha', { exact: true })).toBeVisible(); expect(await readFile(alpha)).toEqual(bytes); expect(await readFile(join(first, 'mods/alpha.jar'))).toEqual(bytes)
  await expect(lstat(join(second, 'mods/alpha.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
  await dropNativeFiles(page, [beta]); await expect(review).toBeVisible()
  await page.evaluate(path => { const key = 'selectedInstancePath'; localStorage.setItem(key, path); dispatchEvent(new StorageEvent('storage', { key, newValue: path })) }, second)
  await expect(page.getByTestId('instance-workspace')).toContainText('Fabric QA'); await page.getByTestId('file-drop-confirm').click(); await expect(review).toContainText('destino ya no está disponible')
  await expect(lstat(join(first, 'mods/beta.jar'))).rejects.toMatchObject({ code: 'ENOENT' }); await expect(lstat(join(second, 'mods/beta.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('packs, shaders and world drops reuse native importers without activating content', async ({ launcher }) => {
  const page = launcher.main, [first, other] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'drop-content')
  await makeReactResourcePack(source, 'Texture'); await makeReactShaderPack(source, 'Light')
  await mkdir(join(first, 'config'), { recursive: true }); await writeFile(join(first, 'options.txt'), 'resourcePacks:["vanilla"]\n'); await writeFile(join(first, 'config/iris.properties'), 'shaderPack=\nkeep=true\n')
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  for (const [tab, area, file, target] of [['Packs', 'instance-resourcepacks', 'resourcepacks/Texture.zip', 'resourcepacks/Texture.zip'], ['Shaders', 'instance-shaders', 'shaderpacks/Light.zip', 'shaderpacks/Light.zip']]) {
    await page.getByRole('link', { name: tab, exact: true }).click(); await expect(page.getByTestId(area).getByRole('button', { name: 'Añadir archivos', exact: true })).toBeEnabled()
    await dropNativeFiles(page, [join(source, file)]); await expect(page.getByTestId('file-drop-review')).toBeVisible(); await page.getByTestId('file-drop-confirm').click()
    await expect.poll(async () => { try { return await readFile(join(first, target)) } catch { return null } }).toEqual(await readFile(join(source, file)))
    await expect(lstat(join(other, target))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  expect(await readFile(join(first, 'options.txt'), 'utf8')).toBe('resourcePacks:["vanilla"]\n'); expect(await readFile(join(first, 'config/iris.properties'), 'utf8')).toBe('shaderPack=\nkeep=true\n')
  const world = await makeReactWorld(other, 'SourceWorld'), exports = join(launcher.appDataPath, 'world-drop-export'); await mkdir(exports)
  const archive = await page.evaluate(async ({ other, exports }) => {
    const service = (window as any).serviceChannels.open('InstanceSavesService'), review = await service.call('previewWorldFiles', { type: 'export', instancePath: other, saveName: 'SourceWorld', destinationDirectory: exports, fileName: 'world.zip' })
    return (await service.call('applyWorldFiles', review)).path as string
  }, { other, exports }), original = await readFile(archive)
  await page.getByRole('link', { name: 'Mundos', exact: true }).click(); await expect(page.getByTestId('instance-worlds')).toHaveAttribute('aria-busy', 'false')
  await dropNativeFiles(page, [archive]); const dialog = page.getByTestId('world-files-dialog'); await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Nombre de carpeta del mundo importado')).toHaveValue('world')
  await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click(); await expect(dialog.getByTestId('world-files-review')).toBeVisible()
  await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('status')).toContainText('Mundo importado')
  expect(await readFile(join(first, 'saves/world/level.dat'))).toEqual(await readFile(join(world, 'level.dat'))); expect(await readFile(archive)).toEqual(original)
})

test('library drops open the existing modpack preview and unsupported files remain inert', async ({ launcher }) => {
  const page = launcher.main, archive = join(launcher.gameDataPath, 'dropped.mrpack'), executable = join(launcher.gameDataPath, 'never-run.exe')
  await makeReactModpack(archive); await writeFile(executable, 'OWNED INERT FIXTURE')
  await page.getByTestId('nav-library').click(); await dropNativeFiles(page, [executable]); await expect(page.getByTestId('file-drop-review')).toContainText('no se admiten')
  await page.keyboard.press('Escape'); await dropNativeFiles(page, [archive]); await expect(page.getByRole('dialog')).toContainText('Importar')
  await expect(page.getByTestId('instance-create-confirm')).toBeVisible(); await page.keyboard.press('Escape')
  expect(await page.evaluate(() => (window as any).serviceChannels.open('InstanceService').call('getSharedInstancesState').then((state: any) => state.instances.length))).toBe(0)
})
