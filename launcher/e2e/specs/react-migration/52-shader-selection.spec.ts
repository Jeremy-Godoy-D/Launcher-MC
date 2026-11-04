import { test, expect, snap, type Page } from '../../helpers/scratch'
import type { LauncherFixture } from '../../fixtures/launcher'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod, makeReactShaderPack, makeReactForgeShaderEngine } from '../../helpers/react-content'
import { lstat, mkdir, readFile, readdir, rename, rmdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function fixture(launcher: LauncherFixture, engine = 'iris', shared = false) {
  const page = launcher.main, [path, other] = await seedReactLibrary(page)
  const runtime = { minecraft: '1.21.1', ...(engine === 'iris' ? { fabricLoader: '0.16.0' } : engine === 'iris-neo' ? { neoForged: '21.1.0' } : engine === 'oculus' ? { forge: '52.0.0' } : engine === 'optifine' ? { optifine: 'HD_U' } : {}) }
  await page.evaluate(async ({ path, runtime }) => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime }), { path, runtime })
  if (engine === 'iris') await makeReactMod(path, 'iris', 'Iris')
  if (engine === 'iris-neo') await makeReactForgeShaderEngine(path, 'iris')
  if (engine === 'oculus') await makeReactForgeShaderEngine(path, 'oculus')
  if (shared) {
    await mkdir(join(launcher.gameDataPath, 'shaderpacks'), { recursive: true })
    const directory = join(path, 'shaderpacks'), info = await lstat(directory).catch(() => undefined)
    if (!info?.isSymbolicLink()) {
      if (info) { expect(await readdir(directory)).toEqual([]); await rmdir(directory) }
      await symlink(join(launcher.gameDataPath, 'shaderpacks'), directory, 'junction')
    }
  }
  await makeReactShaderPack(path, 'Luz = Áurea'); await mkdir(join(path, 'config'), { recursive: true }); await mkdir(join(other, 'config'), { recursive: true })
  const config = engine === 'oculus' ? 'config/oculus.properties' : engine === 'optifine' ? 'optionsshaders.txt' : 'config/iris.properties'
  await writeFile(join(path, config), '# Keep comments\r\nshaderPack=\r\ncustom=value=equal\r\n')
  await writeFile(join(path, 'options.txt'), 'lang:es_es\r\n'); await writeFile(join(other, 'config/iris.properties'), 'KEEP OTHER')
  await mkdir(join(path, 'saves/keep'), { recursive: true }); await writeFile(join(path, 'saves/keep/level.dat'), 'KEEP WORLD')
  return { path, other, config, runtime }
}
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Shaders', exact: true }).click()
  return page.getByTestId('instance-shaders')
}
for (const engine of ['iris', 'oculus', 'optifine', 'iris-neo']) test(`Native ${engine} selection preserves properties, Unicode names, other instances and worlds`, async ({ launcher }) => {
  const page = launcher.main, f = await fixture(launcher, engine, engine === 'iris'), area = await open(page)
  await expect(area).toContainText(`Motor detectado: ${engine.startsWith('iris') ? 'Iris' : engine === 'oculus' ? 'Oculus' : 'OptiFine'}`)
  const button = area.getByRole('button', { name: 'Activar Luz = Áurea.zip', exact: true })
  await expect(button).toBeEnabled(); const bytes = await readFile(join(f.path, 'shaderpacks/Luz = Áurea.zip'))
  await button.focus(); await page.keyboard.press('Enter')
  await expect(area.getByRole('status').filter({ hasText: 'Selección de shader guardada' })).toBeVisible()
  await expect(area.getByRole('button', { name: 'Desactivar Luz = Áurea.zip', exact: true })).toBeFocused()
  const config = await readFile(join(f.path, f.config), 'latin1'); expect(config).toContain('# Keep comments\r\n'); expect(config).toContain('custom=value=equal\r\n'); expect(config).toContain('shaderPack=Luz\\ \\=\\ \\u00c1urea.zip')
  const legacy = await page.evaluate(async ({ path, engine }) => (window as any).serviceChannels.open('InstanceOptionsService').call(engine === 'oculus' ? 'getOculusShaderOptions' : engine === 'optifine' ? 'getShaderOptions' : 'getIrisShaderOptions', path), { path: f.path, engine })
  expect(legacy.shaderPack).toBe('Luz = Áurea.zip')
  await page.reload(); await expect(area.getByRole('button', { name: 'Desactivar Luz = Áurea.zip', exact: true })).toBeEnabled()
  await area.getByRole('button', { name: 'Desactivar Luz = Áurea.zip', exact: true }).click()
  await expect(area.getByRole('button', { name: 'Activar Luz = Áurea.zip', exact: true })).toBeEnabled()
  expect(await readFile(join(f.path, 'shaderpacks/Luz = Áurea.zip'))).toEqual(bytes)
  expect(await readFile(join(f.path, 'options.txt'), 'utf8')).toBe('lang:es_es\r\n'); expect(await readFile(join(f.path, 'saves/keep/level.dat'), 'utf8')).toBe('KEEP WORLD'); expect(await readFile(join(f.other, 'config/iris.properties'), 'utf8')).toBe('KEEP OTHER')
})
test('missing and conflicting engines block activation without rewriting configurations', async ({ launcher }) => {
  const page = launcher.main, f = await fixture(launcher, 'none'), before = await readFile(join(f.path, f.config)), area = await open(page)
  await expect(area).toContainText('No se detectó un motor'); await expect(area.getByRole('button', { name: 'Activar Luz = Áurea.zip', exact: true })).toBeDisabled()
  await makeReactMod(f.path, 'iris', 'Iris'); await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0', optifine: 'HD_U' } }), f.path)
  await area.getByRole('button', { name: 'Volver a leer', exact: true }).click(); await expect(area).toContainText('Hay varios motores')
  await expect(area.getByRole('button', { name: 'Activar Luz = Áurea.zip', exact: true })).toBeDisabled(); expect(await readFile(join(f.path, f.config))).toEqual(before)
})
test('Native stale-selection errors preserve external edits and a fresh explicit action can save', async ({ launcher }) => {
  const page = launcher.main, f = await fixture(launcher), area = await open(page), button = area.getByRole('button', { name: 'Activar Luz = Áurea.zip', exact: true })
  await expect(button).toBeEnabled(); await writeFile(join(f.path, f.config), '# USER\nshaderPack=USER.zip\ncustom=USER\n')
  await button.click(); await expect(area.getByRole('alert')).toContainText('cambiaron')
  expect(await readFile(join(f.path, f.config), 'utf8')).toBe('# USER\nshaderPack=USER.zip\ncustom=USER\n')
  await button.click(); await expect(area.getByRole('status').filter({ hasText: 'Selección de shader guardada' })).toBeVisible()
  expect(await readFile(join(f.path, f.config), 'utf8')).toContain('custom=USER\n')
  const error = await page.evaluate(async path => {
    try { await (window as any).serviceChannels.open('InstanceShaderPacksService').call('getSelection', path + '-unknown'); return '' } catch (e: any) { return e.name }
  }, f.path); expect(error).toBe('InstanceNotFoundError')
})
test('shader selection, empty engine and conflicts remain readable with keyboard in both themes and sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, f = await fixture(launcher), errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', value = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...value, appearance: theme })) }, theme); await page.reload(); const area = await open(page)
    for (const mode of ['ready', 'missing', 'ambiguous']) {
      if (mode === 'ready') {
        await makeReactMod(f.path, 'iris', 'Iris'); await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0' } }), f.path)
      } else if (mode === 'missing') await rename(join(f.path, 'mods/iris.jar'), join(f.path, 'mods/iris.jar.disabled'))
      else {
        await rename(join(f.path, 'mods/iris.jar.disabled'), join(f.path, 'mods/iris.jar'))
        await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0', optifine: 'HD_U' } }), f.path)
      }
      await area.getByRole('button', { name: 'Volver a leer', exact: true }).click(); await expect(area).toHaveAttribute('aria-busy', 'false')
      await expect(area).toContainText(mode === 'ready' ? 'Motor detectado: Iris' : mode === 'missing' ? 'No se detectó un motor' : 'Hay varios motores')
      const win = await launcher.app.browserWindow(page)
      for (const size of [[1200, 720], [800, 400]]) {
        await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
        const search = area.getByRole('textbox', { name: 'Buscar shaders instalados' }), filter = area.getByRole('combobox', { name: 'Filtrar por grupo de shaders', exact: true }); await expect(filter).toBeEnabled()
        await search.focus(); await search.press('Tab'); await expect(filter).toBeFocused(); await page.keyboard.press('Tab')
        await expect(area.getByRole('checkbox', { name: 'Seleccionar Luz = Áurea.zip', exact: true })).toBeFocused()
        await page.keyboard.press('Tab'); await expect(area.getByRole('button', { name: 'Información de Luz = Áurea.zip', exact: true })).toBeFocused()
        if (mode === 'ready') { await page.keyboard.press('Tab'); await expect(area.getByRole('button', { name: 'Activar Luz = Áurea.zip', exact: true })).toBeFocused() }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.addScriptTag({ content: axe.source }); const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        expect(result.violations).toEqual([]); await writeFile(testInfo.outputPath(`${theme}-${mode}-${size[0]}-axe.json`), JSON.stringify(result, null, 2))
        await snap(launcher, `shaders-${theme}-${mode}-${size[0]}`, 'Engine availability and Native shader selection remain readable with keyboard and a preserved full-window background.')
      }
    }
  }
  expect(errors).toEqual([])
})
