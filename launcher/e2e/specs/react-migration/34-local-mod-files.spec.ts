import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function openMods(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'Mods', exact: true }).click()
  const list = page.getByTestId('instance-mods')
  await expect(list.getByRole('button', { name: 'Añadir archivos', exact: true })).toBeEnabled()
  return list
}

test('imports local files without moving originals and removes only confirmed reviewed mods', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'source-mods')
  await makeReactMod(source, 'alpha', 'Alpha'); await makeReactMod(source, 'beta', 'Beta')
  const originals = [join(source, 'mods/alpha.jar'), join(source, 'mods/beta.jar')]
  await mkdir(join(path, 'saves/keep'), { recursive: true }); await writeFile(join(path, 'saves/keep/level.dat'), 'KEEP WORLD')
  await launcher.app.evaluate(({ dialog }, filePaths) => { (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths }) }, originals)
  const list = await openMods(page)
  await list.getByRole('button', { name: 'Añadir archivos', exact: true }).click()
  await expect(list.getByText('Alpha', { exact: true })).toBeVisible(); await expect(list.getByText('Beta', { exact: true })).toBeVisible()
  expect(await readFile(join(path, 'mods/alpha.jar'))).toEqual(await readFile(originals[0]))
  await list.getByLabel('Seleccionar Alpha', { exact: true }).check()
  await list.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Retirar 1 mods', exact: true })
  await expect(modal).toContainText('alpha.jar'); await expect(modal).not.toContainText('beta.jar')
  await modal.getByRole('button', { name: 'Cancelar retirada', exact: true }).last().click()
  await expect(list.getByRole('button', { name: 'Retirar seleccionados', exact: true })).toBeFocused()
  expect(await readFile(join(path, 'mods/alpha.jar'))).toEqual(await readFile(originals[0]))
  await list.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0)
  await list.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  await modal.getByRole('button', { name: 'Eliminar estos archivos', exact: true }).click()
  await expect(modal).toHaveCount(0)
  await expect(list.getByText('Alpha', { exact: true })).toHaveCount(0)
  await expect(list.getByText('Beta', { exact: true })).toBeVisible()
  await expect(list.getByLabel('Buscar mods instalados')).toBeFocused()
  await expect(readFile(join(path, 'mods/alpha.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(join(path, 'saves/keep/level.dat'), 'utf8')).toBe('KEEP WORLD')
  expect((await readFile(originals[0])).length).toBeGreaterThan(0)
  await page.reload(); await expect(list.getByText('Beta', { exact: true })).toBeVisible()
  await expect(list.getByText('Alpha', { exact: true })).toHaveCount(0)
})

test('cancelled picker is silent and import collisions preserve every file with a visible error', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'sources')
  await makeReactMod(path, 'alpha', 'Original'); await makeReactMod(source, 'alpha', 'Replacement'); await makeReactMod(source, 'beta', 'Beta')
  const original = await readFile(join(path, 'mods/alpha.jar')), list = await openMods(page)
  await launcher.app.evaluate(({ dialog }) => { (dialog as any).showOpenDialog = async () => ({ canceled: true, filePaths: [] }) })
  await list.getByRole('button', { name: 'Añadir archivos', exact: true }).click()
  await expect(list.getByRole('button', { name: 'Añadir archivos', exact: true })).toBeEnabled()
  await expect(list.getByText('Cambios aplicados en esta instancia.', { exact: true })).toHaveCount(0)
  await launcher.app.evaluate(({ dialog }, filePaths) => { (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths }) }, [join(source, 'mods/beta.jar'), join(source, 'mods/alpha.jar')])
  await list.getByRole('button', { name: 'Añadir archivos', exact: true }).click()
  await expect(list.getByRole('alert').filter({ hasText: 'No se pudo completar' })).toBeVisible()
  expect(await readFile(join(path, 'mods/alpha.jar'))).toEqual(original)
  await expect(readFile(join(path, 'mods/beta.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(list.getByText('Cambios aplicados en esta instancia.', { exact: true })).toHaveCount(0)
})

test('changed files cannot be removed using an old confirmation and failed removal keeps the review open', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  await makeReactMod(path, 'alpha', 'Alpha')
  const list = await openMods(page)
  await list.getByLabel('Seleccionar Alpha', { exact: true }).check()
  await list.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Retirar 1 mods', exact: true })
  await makeReactMod(path, 'alpha', 'Changed')
  const changed = await readFile(join(path, 'mods/alpha.jar'))
  await modal.getByRole('button', { name: 'Eliminar estos archivos', exact: true }).click()
  await expect(modal.getByRole('alert')).toBeVisible()
  expect(await readFile(join(path, 'mods/alpha.jar'))).toEqual(changed)
  await expect(modal.getByRole('button', { name: 'Eliminar estos archivos', exact: true })).toBeEnabled()
  await modal.getByRole('button', { name: 'Cancelar retirada', exact: true }).last().click()
  await list.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  await expect(list.getByText('Changed', { exact: true })).toBeVisible()
})

test('a pending import keeps its captured instance when the user navigates elsewhere', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'sources')
  await makeReactMod(source, 'alpha', 'Imported A')
  await launcher.app.evaluate(({ dialog, ipcMain }, filePaths) => {
    (dialog as any).showOpenDialog = async () => ({ canceled: false, filePaths })
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event: unknown, service: string, method: string, ...args: unknown[]) => {
      if (service === 'InstanceModsService' && method === 'install') {
        (globalThis as any).__importPath = (args[0] as any).path
        await new Promise<void>(resolve => { (globalThis as any).__releaseImport = resolve })
      }
      return original(event, service, method, ...args)
    })
  }, [join(source, 'mods/alpha.jar')])
  const list = await openMods(page)
  await list.getByRole('button', { name: 'Añadir archivos', exact: true }).click()
  await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__importPath)).toBe(a)
  await openMods(page, 'Fabric QA')
  await launcher.app.evaluate(() => (globalThis as any).__releaseImport())
  await expect.poll(async () => (await readFile(join(a, 'mods/alpha.jar')).catch(error => { if (error.code !== 'ENOENT') throw error; return Buffer.alloc(0) })).length).toBeGreaterThan(0)
  await expect(readFile(join(b, 'mods/alpha.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(list.getByText('Imported A', { exact: true })).toHaveCount(0)
  await expect(list.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(b)
})

test('native install and removal refuse unregistered paths and linked mods folders', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), outside = join(launcher.gameDataPath, 'unregistered')
  await makeReactMod(outside, 'alpha', 'Outside')
  const source = join(outside, 'mods/alpha.jar'), original = await readFile(source)
  for (const [method, target] of [['install', outside], ['uninstall', outside]]) {
    expect(await page.evaluate(async ({ method, target, source }) => {
      try { await (window as any).serviceChannels.open('InstanceModsService').call(method, { path: target, files: [source] }); return false } catch { return true }
    }, { method, target, source })).toBe(true)
  }
  const { symlink } = await import('node:fs/promises')
  await symlink(join(outside, 'mods'), join(path, 'mods'), 'junction')
  for (const method of ['install', 'uninstall']) expect(await page.evaluate(async ({ method, path, source }) => {
    try { await (window as any).serviceChannels.open('InstanceModsService').call(method, { path, files: [source] }); return false } catch { return true }
  }, { method, path, source })).toBe(true)
  expect(await readFile(source)).toEqual(original)
})

test('removal confirmation fits both themes and window sizes and keeps keyboard actions reachable', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  await makeReactMod(path, 'alpha', 'Alpha')
  const list = await openMods(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', value = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...value, appearance: theme })) }, theme)
    await page.reload(); await expect(list.getByLabel('Seleccionar Alpha', { exact: true })).toBeVisible()
    await list.getByLabel('Seleccionar Alpha', { exact: true }).check()
    for (const size of [[1200, 720], [800, 400]]) {
      const win = await launcher.app.browserWindow(page)
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await list.getByRole('button', { name: 'Retirar seleccionados', exact: true }).click()
      const modal = page.getByRole('dialog', { name: 'Retirar 1 mods', exact: true })
      await expect(modal.getByRole('heading')).toBeInViewport({ ratio: 1 })
      await modal.getByRole('button', { name: 'Eliminar estos archivos', exact: true }).focus()
      await expect(modal.getByRole('button', { name: 'Eliminar estos archivos', exact: true })).toBeInViewport({ ratio: 1 })
      expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`remove-axe-${theme}-${size[0]}.json`), JSON.stringify(result, null, 2))
      expect(result.violations).toEqual([])
      await snap(launcher, `remove-${theme}-${size[0]}`, 'Explicit file deletion review; captured hashes protect files changed after selection.')
      await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0)
      await expect(list.getByRole('button', { name: 'Retirar seleccionados', exact: true })).toBeFocused()
    }
  }
  expect(errors).toEqual([])
})
