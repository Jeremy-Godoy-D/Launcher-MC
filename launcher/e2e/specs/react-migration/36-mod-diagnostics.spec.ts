import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function openMods(page: Page, name = 'Fabric QA') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'Mods', exact: true }).click()
  return page.getByTestId('instance-mods')
}

test('diagnostics use real archive dependencies, update after file changes and never modify files while reviewing', async ({ launcher }) => {
  const page = launcher.main, [, path] = await seedReactLibrary(page)
  await makeReactMod(path, 'root', 'Root', { depends: { minecraft: '>=1.20', library: '>=2', java: '>=21' }, breaks: { bad: '*' } })
  await makeReactMod(path, 'bad', 'Bad')
  const original = await readFile(join(path, 'mods/root.jar')), list = await openMods(page)
  const trigger = list.getByRole('button', { name: 'Revisar mods', exact: true }), panel = page.getByRole('region', { name: 'Diagnóstico de mods', exact: true })
  await trigger.focus(); await page.keyboard.press('Enter')
  await expect(panel.getByRole('button', { name: 'Cerrar diagnóstico de mods' })).toBeFocused()
  await expect(panel).toHaveAttribute('aria-busy', 'false')
  await expect(panel).toContainText('Dependencia no satisfecha'); await expect(panel).toContainText('library · >=2')
  await expect(panel).toContainText('Incompatibilidad declarada'); await expect(panel).toContainText('Java no verificado o incompatible')
  await expect(panel.getByRole('status')).toHaveText('Errores: 2 · Avisos o requisitos sin verificar: 1')
  expect(await readFile(join(path, 'mods/root.jar'))).toEqual(original)
  await panel.getByRole('button', { name: 'Ver información de root.jar', exact: true }).first().click()
  const info = page.getByRole('region', { name: 'Información del mod', exact: true })
  await expect(info).toContainText('library · >=2'); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
  await trigger.click()
  await makeReactMod(path, 'library', 'Library', { version: '2.0.0' })
  await list.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  await list.getByRole('button', { name: 'Desactivar Bad', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Errores: 0 · Avisos o requisitos sin verificar: 1')
  expect(await readFile(join(path, 'mods/root.jar'))).toEqual(original)
  await openMods(page, 'Mi mundo'); await expect(panel).toHaveCount(0)
})

test('native reviewed changes refuse stale directory and configuration snapshots and unmanaged roots', async ({ launcher }) => {
  const page = launcher.main, [, path] = await seedReactLibrary(page)
  await makeReactMod(path, 'root', 'Root')
  const file = join(path, 'mods/root.jar'), bytes = await readFile(file), hash = createHash('sha1').update(bytes).digest('hex')
  const snapshot = () => page.evaluate(async path => (window as any).serviceChannels.open('InstanceModsService').call('getModFilesSnapshot', path), path)
  const refuse = (fingerprint: string, method: string) => page.evaluate(async ({ path, file, hash, fingerprint, method }) => {
    try { await (window as any).serviceChannels.open('InstanceModsService').call(method, { path, files: [file], expectedHashes: { [file]: hash }, expectedSnapshot: fingerprint }); return false } catch { return true }
  }, { path, file, hash, fingerprint, method })
  const before = await snapshot()
  await makeReactMod(path, 'another', 'Another')
  for (const method of ['disable', 'uninstall']) expect(await refuse(before.fingerprint, method)).toBe(true)
  const current = await snapshot()
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.1' } }), path)
  for (const method of ['disable', 'uninstall']) expect(await refuse(current.fingerprint, method)).toBe(true)
  expect(await readFile(file)).toEqual(bytes)
  await expect(readFile(`${file}.disabled`)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await page.evaluate(async path => {
    try { await (window as any).serviceChannels.open('InstanceModsService').call('getModFilesSnapshot', `${path}/unregistered`); return false } catch { return true }
  }, path)).toBe(true)
})

test('diagnostics remain readable in both themes and supported sizes with keyboard and reduced motion', async ({ launcher }, testInfo) => {
  const page = launcher.main, [, path] = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await makeReactMod(path, 'root', 'Root', { depends: { minecraft: '>=1.20', library: '>=2', java: '>=21' }, breaks: { bad: '*' } })
  await makeReactMod(path, 'bad', 'Bad')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const list = await openMods(page), panel = page.getByRole('region', { name: 'Diagnóstico de mods', exact: true })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme)
    await page.reload()
    await list.getByRole('button', { name: 'Revisar mods', exact: true }).click()
    await expect(panel).toHaveAttribute('aria-busy', 'false')
    await expect(panel.getByRole('status')).toHaveText('Errores: 2 · Avisos o requisitos sin verificar: 1')
    for (const size of [[1200, 720], [800, 400]]) {
      const win = await launcher.app.browserWindow(page)
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      const close = panel.getByRole('button', { name: 'Cerrar diagnóstico de mods' })
      await close.focus(); await expect(close).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`diagnostics-axe-${theme}-${size[0]}.json`), JSON.stringify(result, null, 2)); expect(result.violations).toEqual([])
      await snap(launcher, `diagnostics-${theme}-${size[0]}`, 'Saved loader and real archive metadata; automatic Java remains explicitly unverified.')
      await page.keyboard.press('Tab'); await expect(panel.getByRole('button', { name: 'Ver información de root.jar' }).first()).toBeFocused()
      await panel.getByRole('button', { name: 'Ver información de root.jar' }).last().focus()
      await expect(panel.getByRole('button', { name: 'Ver información de root.jar' }).last()).toBeInViewport({ ratio: 1 })
      await snap(launcher, `diagnostics-actions-${theme}-${size[0]}`, 'Diagnostic rows and their information actions remain reachable at minimum window size.')
      await close.focus()
    }
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0)
    await expect(list.getByRole('button', { name: 'Revisar mods', exact: true })).toBeFocused()
  }
  expect(errors).toEqual([])
})
