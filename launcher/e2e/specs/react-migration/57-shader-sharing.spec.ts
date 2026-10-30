import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactShaderPack } from '../../helpers/react-content'
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function changeZip(file: string, comment: string) {
  const bytes = await readFile(file); bytes.writeUInt16LE(Buffer.byteLength(comment), bytes.length - 2)
  await writeFile(file, Buffer.concat([bytes, Buffer.from(comment)]))
}
async function openShaders(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Shaders', exact: true }).click()
  const area = page.getByTestId('instance-shaders')
  await expect(area.getByRole('button', { name: 'Compartir shaders', exact: true })).toBeEnabled()
  return area
}
test('reviewed shader sharing and private copies preserve backups, all engine configurations, groups and worlds', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), root = launcher.gameDataPath
  await makeReactShaderPack(a, 'alpha'); await makeReactShaderPack(root, 'common')
  await mkdir(join(a, 'shaderpacks/folder/shaders'), { recursive: true }); await mkdir(join(a, 'shaderpacks/folder/empty'))
  await writeFile(join(a, 'shaderpacks/folder/shaders/keep.txt'), 'LOCAL ASSET')
  await mkdir(join(a, 'saves/keep'), { recursive: true }); await writeFile(join(a, 'saves/keep/level.dat'), 'WORLD')
  const options = 'resourcePacks:["vanilla","file/alpha.zip"]\r\nlang:es_es\r\n', groups = '{"Visual":{"color":"#abcdef","files":["alpha.zip"]}}'
  await writeFile(join(a, 'options.txt'), options); await writeFile(join(a, 'shaderpacks-groups.json'), groups)
  await mkdir(join(a, 'config'), { recursive: true }); await mkdir(join(b, 'config'), { recursive: true })
  const configs = ['config/iris.properties', 'config/oculus.properties', 'optionsshaders.txt']
  for (const file of configs) await writeFile(join(a, file), '# KEEP\nshaderPack=alpha.zip\n')
  await writeFile(join(b, 'config/iris.properties'), 'OTHER CONFIGURATION')
  const bytes = await readFile(join(a, 'shaderpacks/alpha.zip')), area = await openShaders(page), dialog = page.getByRole('dialog')
  await area.getByRole('button', { name: 'Compartir shaders', exact: true }).click()
  await expect(dialog).toContainText('Shaders locales: 2')
  await dialog.locator('.dialog-actions').getByRole('button', { name: 'Cancelar cambio de carpeta', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(area.getByRole('button', { name: 'Compartir shaders', exact: true })).toBeFocused()
  expect((await lstat(join(a, 'shaderpacks'))).isSymbolicLink()).toBe(false)
  await expect(lstat(join(a, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
  await area.getByRole('button', { name: 'Compartir shaders', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(area.getByRole('button', { name: 'Crear copia privada', exact: true })).toBeEnabled()
  await expect(area.getByRole('button', { name: 'Información de common.zip', exact: true })).toBeVisible()
  expect((await lstat(join(a, 'shaderpacks'))).isSymbolicLink()).toBe(true)
  const backup = (await readdir(join(a, '.backups'))).find(name => name.startsWith('shaderpacks-share-'))!
  expect(await readFile(join(a, '.backups', backup, 'previous/alpha.zip'))).toEqual(bytes)
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceShaderPacksService').call('linkShared', path), b)
  await makeReactShaderPack(root, 'later')
  await expect(area.getByRole('button', { name: 'Información de later.zip', exact: true })).toBeVisible()
  await area.getByRole('button', { name: 'Crear copia privada', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar copia privada', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(area.getByRole('button', { name: 'Compartir shaders', exact: true })).toBeEnabled()
  expect((await lstat(join(a, 'shaderpacks'))).isSymbolicLink()).toBe(false); expect((await lstat(join(b, 'shaderpacks'))).isSymbolicLink()).toBe(true)
  expect(await readFile(join(a, 'shaderpacks/alpha.zip'))).toEqual(bytes)
  expect((await lstat(join(a, 'shaderpacks/alpha.zip'))).ino).not.toBe((await lstat(join(root, 'shaderpacks/alpha.zip'))).ino)
  expect((await lstat(join(a, 'shaderpacks/folder/empty'))).isDirectory()).toBe(true)
  await writeFile(join(a, 'shaderpacks/folder/shaders/keep.txt'), 'PRIVATE EDIT')
  expect(await readFile(join(root, 'shaderpacks/folder/shaders/keep.txt'), 'utf8')).toBe('LOCAL ASSET')
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(options); expect(await readFile(join(a, 'shaderpacks-groups.json'), 'utf8')).toBe(groups)
  expect(await readFile(join(a, 'saves/keep/level.dat'), 'utf8')).toBe('WORLD')
  for (const file of configs) expect(await readFile(join(a, file), 'utf8')).toBe('# KEEP\nshaderPack=alpha.zip\n')
  expect(await readFile(join(b, 'config/iris.properties'), 'utf8')).toBe('OTHER CONFIGURATION')
  await page.reload(); await expect(area.getByRole('button', { name: 'Compartir shaders', exact: true })).toBeEnabled()
})

test('shader conflicts disable confirmation and a changed reviewed source cannot publish files or change its link', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = launcher.gameDataPath
  await makeReactShaderPack(path, 'alpha'); await makeReactShaderPack(root, 'alpha'); await changeZip(join(root, 'shaderpacks/alpha.zip'), 'COMMON')
  const area = await openShaders(page), dialog = page.getByRole('dialog'), common = await readFile(join(root, 'shaderpacks/alpha.zip'))
  await area.getByRole('button', { name: 'Compartir shaders', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('alpha.zip'); await expect(dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); expect(await readFile(join(root, 'shaderpacks/alpha.zip'))).toEqual(common)
  await rename(join(root, 'shaderpacks/alpha.zip'), join(root, 'retained-common.zip'))
  await area.getByRole('button', { name: 'Compartir shaders', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true })).toBeEnabled()
  await changeZip(join(path, 'shaderpacks/alpha.zip'), 'EDIT AFTER REVIEW')
  await dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('cambiaron')
  expect((await lstat(join(path, 'shaderpacks'))).isSymbolicLink()).toBe(false)
  await expect(lstat(join(root, 'shaderpacks/alpha.zip'))).rejects.toHaveProperty('code', 'ENOENT')
  await page.keyboard.press('Escape')
})

test('sharing reviews keep title, body and actions accessible in both directions, themes and supported sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await makeReactShaderPack(path, 'alpha'); await makeReactShaderPack(launcher.gameDataPath, 'common'); const area = await openShaders(page), dialog = page.getByRole('dialog'), win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const direction of ['Compartir shaders', 'Crear copia privada']) {
      await area.getByRole('button', { name: direction, exact: true }).click()
      for (const size of [[1200, 720], [800, 400]]) {
        await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
        await expect(dialog.getByRole('heading', { name: direction, exact: true })).toBeInViewport({ ratio: 1 })
        const confirm = dialog.getByRole('button', { name: direction === 'Compartir shaders' ? 'Confirmar carpeta compartida' : 'Confirmar copia privada', exact: true })
        await confirm.focus(); await expect(confirm).toBeInViewport({ ratio: 1 })
        const body = dialog.getByRole('region', { name: 'Revisión de carpeta de shaders', exact: true }); await expect(body).toBeInViewport({ ratio: 1 })
        await body.focus(); await page.keyboard.press('End')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        await writeFile(testInfo.outputPath(`sharing-${theme}-${direction}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
        await snap(launcher, `sharing-${theme}-${direction}-${size[0]}`, 'Reviewed folder changes preserve files, selection and a reachable confirmation footer.')
      }
      await dialog.getByRole('button', { name: direction === 'Compartir shaders' ? 'Confirmar carpeta compartida' : 'Confirmar copia privada', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(area.getByRole('button', { name: direction === 'Compartir shaders' ? 'Crear copia privada' : 'Compartir shaders', exact: true })).toBeFocused()
    }
  }
  expect(errors).toEqual([])
})

test('a Native copy failure preserves original shaders, resumes observation and allows a newly reviewed retry', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = launcher.gameDataPath
  await makeReactShaderPack(path, 'alpha'); await makeReactShaderPack(root, 'common')
  const bytes = await readFile(join(path, 'shaderpacks/alpha.zip')), area = await openShaders(page), dialog = page.getByRole('dialog')
  await launcher.app.evaluate((_, target) => {
    const fs = process.getBuiltinModule('fs/promises'), modules = process.getBuiltinModule('module'), original = fs.copyFile, globals = globalThis as any
    globals.__shaderCopyFailures = 0; globals.__restoreShaderCopy = () => { fs.copyFile = original; modules.syncBuiltinESMExports() }
    fs.copyFile = async (from: any, to: any, mode: any) => { if (String(to) === target) { globals.__shaderCopyFailures++; throw Object.assign(new Error('Shader copy fixture failure'), { code: 'EIO' }) } return original(from, to, mode) }; modules.syncBuiltinESMExports()
  }, join(await realpath(join(root, 'shaderpacks')), 'alpha.zip'))
  try {
    await area.getByRole('button', { name: 'Compartir shaders', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('no terminó')
    const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
    const confirm = dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true }); await confirm.focus(); await expect(confirm).toBeInViewport({ ratio: 1 }); await expect(dialog.getByRole('heading')).toBeInViewport({ ratio: 1 })
    await expect(dialog.getByRole('alert')).toBeInViewport({ ratio: 1 })
    await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
    expect(report.violations).toEqual([]); await writeFile(testInfo.outputPath('sharing-error-800-axe.json'), JSON.stringify(report, null, 2)); await snap(launcher, 'sharing-error-800', 'A copy failure keeps the review title and confirmation accessible while the error scrolls in its body.')
    expect(await launcher.app.evaluate(() => (globalThis as any).__shaderCopyFailures)).toBe(1)
    expect((await lstat(join(path, 'shaderpacks'))).isSymbolicLink()).toBe(false); expect(await readFile(join(path, 'shaderpacks/alpha.zip'))).toEqual(bytes)
  } finally { await launcher.app.evaluate(() => (globalThis as any).__restoreShaderCopy()) }
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(area.getByRole('button', { name: 'Abrir copias', exact: true })).toBeVisible()
  await makeReactShaderPack(path, 'after-failure'); await expect(area.getByRole('button', { name: 'Información de after-failure.zip', exact: true })).toBeVisible()
  await area.getByRole('button', { name: 'Compartir shaders', exact: true }).click(); await dialog.getByRole('button', { name: 'Confirmar carpeta compartida', exact: true }).click()
  await expect(dialog).toHaveCount(0); await expect(area.getByRole('button', { name: 'Crear copia privada', exact: true })).toBeEnabled()
  expect(await readFile(join(root, 'shaderpacks/alpha.zip'))).toEqual(bytes)
})
