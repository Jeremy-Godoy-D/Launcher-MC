import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod, makeReactShaderPack } from '../../helpers/react-content'
import { lstat, mkdir, readFile, readdir, rmdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Shaders', exact: true }).click()
  return page.getByTestId('instance-shaders')
}
const removalDialog = (page: Page) => page.getByRole('dialog', { name: 'Revisar retirada de shaders', exact: true })

test('reviewed shader removal preserves full configuration backups, other engines, a world and an unrelated install manifest', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path, other] = await seedReactLibrary(page), errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await makeReactShaderPack(path, 'Alpha'); await makeReactShaderPack(path, 'Other'); const bytes = await readFile(join(path, 'shaderpacks/Alpha.zip'))
  await makeReactMod(path, 'iris', 'Iris'); await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0' } }), path)
  await mkdir(join(path, 'shaderpacks/Folder/shaders'), { recursive: true }); await writeFile(join(path, 'shaderpacks/Folder/shaders/shaders.properties'), '# UNPACKED SHADER')
  await mkdir(join(path, 'config'), { recursive: true }); await mkdir(join(other, 'config'), { recursive: true })
  const iris = Buffer.from('# USER café\r\nshaderPack=Alpha.zip\r\nunknown=value=equal\r\n', 'latin1'), optifine = '# OPTI\nshaderPack=Folder\nquality=1\n', oculus = 'shaderPack=Other.zip\nenableShaders=true\n'
  await writeFile(join(path, 'config/iris.properties'), iris); await writeFile(join(path, 'optionsshaders.txt'), optifine); await writeFile(join(path, 'config/oculus.properties'), oculus)
  await writeFile(join(other, 'config/iris.properties'), 'KEEP OTHER'); await writeFile(join(path, 'options.txt'), 'lang:es_es\n')
  await mkdir(join(path, 'saves/keep'), { recursive: true }); await writeFile(join(path, 'saves/keep/level.dat'), 'KEEP WORLD')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceInstallService').call('stageInstanceFiles', { path, oldFiles: [], files: [{ path: 'config/pending.txt', hashes: { sha1: 'a'.repeat(40) }, downloads: ['https://example.invalid/pending'] }] }), path)
  const manifest = await readFile(join(path, '.install-manifest')), area = await open(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', value = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...value, appearance: theme })) }, theme); await page.reload()
    await area.getByRole('checkbox', { name: 'Seleccionar Alpha.zip', exact: true }).check(); await area.getByRole('checkbox', { name: 'Seleccionar Folder', exact: true }).check()
    const trigger = area.getByRole('button', { name: 'Retirar seleccionados', exact: true }); await trigger.click(); const dialog = removalDialog(page)
    await expect(dialog).toContainText('Iris: Alpha.zip'); await expect(dialog).toContainText('OptiFine: Folder'); await expect(dialog).not.toContainText('Oculus: Other.zip')
    const win = await launcher.app.browserWindow(page)
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await expect(dialog.getByRole('heading')).toBeInViewport({ ratio: 1 }); const region = dialog.getByRole('region', { name: 'Shaders y archivos que se retirarán', exact: true }); await region.focus(); await region.press('End')
      const confirm = dialog.getByRole('button', { name: 'Mover a copias', exact: true }); await confirm.focus(); await expect(confirm).toBeInViewport({ ratio: 1 })
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source }); const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      expect(result.violations).toEqual([]); await writeFile(testInfo.outputPath(`shader-removal-${theme}-${size[0]}-axe.json`), JSON.stringify(result, null, 2))
      await snap(launcher, `shader-removal-${theme}-${size[0]}`, 'Reviewed shader files and affected engine selections remain readable with a reachable confirmation footer.')
    }
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
    expect(await readFile(join(path, 'config/iris.properties'))).toEqual(iris); await expect(lstat(join(path, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
  }
  await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click(); await removalDialog(page).getByRole('button', { name: 'Mover a copias', exact: true }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Shaders retirados' })).toBeVisible(); await expect(area.getByRole('textbox', { name: 'Buscar shaders instalados' })).toBeFocused()
  const backups = (await readdir(join(path, '.backups'))).filter(name => name.startsWith('shaderpacks-')); expect(backups).toHaveLength(1); const backup = join(path, '.backups', backups[0])
  expect(await readFile(join(backup, 'shaderpacks/Alpha.zip'))).toEqual(bytes); expect(await readFile(join(backup, 'shaderpacks/Folder/shaders/shaders.properties'), 'utf8')).toBe('# UNPACKED SHADER')
  expect(await readFile(join(backup, 'config/iris.properties'))).toEqual(iris); expect(await readFile(join(backup, 'optionsshaders.txt'), 'utf8')).toBe(optifine)
  expect(await readFile(join(path, 'config/oculus.properties'), 'utf8')).toBe(oculus); expect(await readFile(join(other, 'config/iris.properties'), 'utf8')).toBe('KEEP OTHER')
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe('lang:es_es\n'); expect(await readFile(join(path, 'saves/keep/level.dat'), 'utf8')).toBe('KEEP WORLD'); expect(await readFile(join(path, '.install-manifest'))).toEqual(manifest)
  await page.reload(); await expect(area.getByRole('checkbox')).toHaveCount(1); await expect(area.getByRole('checkbox', { name: 'Seleccionar Other.zip', exact: true })).toBeVisible(); expect(errors).toEqual([])
})

test('a stale shader review preserves an external configuration edit and requires a fresh explicit confirmation', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page); await makeReactShaderPack(path, 'Alpha'); await mkdir(join(path, 'config'), { recursive: true }); await writeFile(join(path, 'config/iris.properties'), 'shaderPack=Alpha.zip\n')
  const bytes = await readFile(join(path, 'shaderpacks/Alpha.zip')), area = await open(page)
  await area.getByRole('checkbox', { name: 'Seleccionar Alpha.zip', exact: true }).check(); await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  await expect(removalDialog(page).getByRole('button', { name: 'Mover a copias', exact: true })).toBeEnabled()
  await writeFile(join(path, 'config/iris.properties'), '# USER\nshaderPack=User.zip\n'); await removalDialog(page).getByRole('button', { name: 'Mover a copias', exact: true }).click()
  await expect(removalDialog(page).getByRole('alert')).toContainText('cambiaron'); expect(await readFile(join(path, 'shaderpacks/Alpha.zip'))).toEqual(bytes); expect(await readFile(join(path, 'config/iris.properties'), 'utf8')).toBe('# USER\nshaderPack=User.zip\n')
  await expect(lstat(join(path, '.backups'))).rejects.toHaveProperty('code', 'ENOENT'); await removalDialog(page).locator('.dialog-actions').getByRole('button', { name: 'Cancelar retirada', exact: true }).click()
  await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click(); await removalDialog(page).getByRole('button', { name: 'Mover a copias', exact: true }).click(); await expect(area.getByRole('status').filter({ hasText: 'Shaders retirados' })).toBeVisible()
  expect(await readFile(join(path, 'config/iris.properties'), 'utf8')).toBe('# USER\nshaderPack=User.zip\n')
})

test('an unreadable shader archive can be selected and preserved in a backup without requiring an installed engine', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page); await mkdir(join(path, 'shaderpacks'), { recursive: true }); await writeFile(join(path, 'shaderpacks/Broken.zip'), 'BROKEN SHADER BYTES')
  const area = await open(page); await area.getByRole('checkbox', { name: 'Seleccionar Broken.zip', exact: true }).check(); await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  await expect(removalDialog(page)).toContainText('Broken.zip'); await removalDialog(page).getByRole('button', { name: 'Mover a copias', exact: true }).click(); await expect(area.getByRole('status').filter({ hasText: 'Shaders retirados' })).toBeVisible()
  const backup = (await readdir(join(path, '.backups'))).find(name => name.startsWith('shaderpacks-'))!; expect(await readFile(join(path, '.backups', backup, 'shaderpacks/Broken.zip'), 'utf8')).toBe('BROKEN SHADER BYTES')
  await expect(area.getByRole('alert')).toHaveCount(0); await expect(lstat(join(path, 'config/iris.properties'))).rejects.toHaveProperty('code', 'ENOENT')
})

test('a Native configuration-write failure exposes retained backups and a fresh review can finish without losing the first copies', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page); await makeReactShaderPack(path, 'Alpha'); await mkdir(join(path, 'config'), { recursive: true }); const config = 'shaderPack=Alpha.zip\nunknown=KEEP\n'
  await writeFile(join(path, 'config/iris.properties'), config); await writeFile(join(path, 'optionsshaders.txt'), config); const bytes = await readFile(join(path, 'shaderpacks/Alpha.zip')), area = await open(page)
  await launcher.app.evaluate((_, target) => {
    const fs = process.getBuiltinModule('fs/promises'), modules = process.getBuiltinModule('module'), original = fs.rename, globals = globalThis as any
    globals.__shaderRenameFailures = 0; globals.__restoreShaderRename = () => { fs.rename = original; modules.syncBuiltinESMExports() }
    fs.rename = async (from: any, to: any) => { if (String(to) === target) { globals.__shaderRenameFailures++; throw Object.assign(new Error('Shader write fixture failure'), { code: 'EIO' }) } return original(from, to) }; modules.syncBuiltinESMExports()
  }, join(path, 'config/iris.properties'))
  try {
    await area.getByRole('checkbox', { name: 'Seleccionar Alpha.zip', exact: true }).check(); await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click(); await removalDialog(page).getByRole('button', { name: 'Mover a copias', exact: true }).click()
    await expect(removalDialog(page).getByRole('alert')).toContainText('no terminó'); await expect(removalDialog(page).getByRole('button', { name: 'Abrir copias', exact: true })).toBeVisible()
    const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
    const open = removalDialog(page).getByRole('button', { name: 'Abrir copias', exact: true }); await open.focus(); await expect(open).toBeInViewport({ ratio: 1 })
    await expect(removalDialog(page).getByRole('heading')).toBeInViewport({ ratio: 1 }); await expect(removalDialog(page).getByRole('button', { name: 'Mover a copias', exact: true })).toBeInViewport({ ratio: 1 })
    await page.addScriptTag({ content: axe.source }); const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
    expect(result.violations).toEqual([]); await writeFile(testInfo.outputPath('shader-removal-error-800-axe.json'), JSON.stringify(result, null, 2)); await snap(launcher, 'shader-removal-error-800', 'The error and backup path scroll inside the review while its title and actions remain reachable.')
    expect(await launcher.app.evaluate(() => (globalThis as any).__shaderRenameFailures)).toBe(1); expect(await readFile(join(path, 'shaderpacks/Alpha.zip'))).toEqual(bytes); expect(await readFile(join(path, 'config/iris.properties'), 'utf8')).toBe(config)
  } finally { await launcher.app.evaluate(() => (globalThis as any).__restoreShaderRename()) }
  const first = (await readdir(join(path, '.backups'))).find(name => name.startsWith('shaderpacks-'))!; expect(await readFile(join(path, '.backups', first, 'config/iris.properties'), 'utf8')).toBe(config); expect(await readFile(join(path, '.backups', first, 'optionsshaders.txt'), 'utf8')).toBe(config)
  await removalDialog(page).locator('.dialog-actions').getByRole('button', { name: 'Cancelar retirada', exact: true }).click(); await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click(); await removalDialog(page).getByRole('button', { name: 'Mover a copias', exact: true }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Shaders retirados' })).toBeVisible(); expect(await readFile(join(path, '.backups', first, 'config/iris.properties'), 'utf8')).toBe(config)
})

test('shared shader removal discloses its reach and preserves another instance configuration and remaining common files', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path, other] = await seedReactLibrary(page), root = launcher.gameDataPath
  await makeReactShaderPack(root, 'Common'); await makeReactShaderPack(root, 'Keep'); const bytes = await readFile(join(root, 'shaderpacks/Common.zip')), keep = await readFile(join(root, 'shaderpacks/Keep.zip'))
  for (const instance of [path, other]) {
    const directory = join(instance, 'shaderpacks'), info = await lstat(directory).catch(() => undefined)
    if (!info?.isSymbolicLink()) { if (info) { expect(await readdir(directory)).toEqual([]); await rmdir(directory) }; await symlink(join(root, 'shaderpacks'), directory, 'junction') }
    await mkdir(join(instance, 'config'), { recursive: true }); await writeFile(join(instance, 'config/iris.properties'), 'shaderPack=Common.zip\n')
  }
  const area = await open(page); await area.getByRole('checkbox', { name: 'Seleccionar Common.zip', exact: true }).check(); await area.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  const dialog = removalDialog(page); await expect(dialog).toContainText('todas las instancias vinculadas'); const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
  const confirm = dialog.getByRole('button', { name: 'Mover a copias', exact: true }); await confirm.focus(); await expect(confirm).toBeInViewport({ ratio: 1 })
  await page.addScriptTag({ content: axe.source }); const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
  expect(result.violations).toEqual([]); await writeFile(testInfo.outputPath('shader-shared-removal-800-axe.json'), JSON.stringify(result, null, 2)); await snap(launcher, 'shader-shared-removal-800', 'The common-folder warning remains inside the scrollable review while confirmation stays reachable.')
  await confirm.click(); await expect(area.getByRole('status').filter({ hasText: 'Shaders retirados' })).toBeVisible()
  expect(await readFile(join(other, 'config/iris.properties'), 'utf8')).toBe('shaderPack=Common.zip\n'); expect(await readFile(join(root, 'shaderpacks/Keep.zip'))).toEqual(keep)
  await expect(lstat(join(root, 'shaderpacks/Common.zip'))).rejects.toHaveProperty('code', 'ENOENT'); const backup = (await readdir(join(path, '.backups'))).find(name => name.startsWith('shaderpacks-'))!
  expect(await readFile(join(path, '.backups', backup, 'shaderpacks/Common.zip'))).toEqual(bytes); expect((await lstat(join(path, 'shaderpacks'))).isSymbolicLink()).toBe(true)
})
