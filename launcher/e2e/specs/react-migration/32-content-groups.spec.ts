import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import { readFile, writeFile, mkdir, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })

async function openMods(page: Page, name: string) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'Mods', exact: true }).click()
  const list = page.getByTestId('instance-mods')
  await expect(list.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeEnabled()
  return list
}

test('native groups win over legacy data, including empty files, while another instance migrates only after persistence', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await makeReactMod(a, 'example', 'Alpha'); await makeReactMod(b, 'example', 'Beta')
  const legacy = { [a]: { 'example.jar': 'Old A' }, [b]: { 'mods/example.jar.disabled': 'Imported B' } }
  await page.evaluate(value => localStorage.setItem('modsGrouping', JSON.stringify(value)), legacy)
  const native = { Native: { color: 'goldenrod', files: ['example.jar'], future: 'KEEP' } }
  await writeFile(join(a, 'mod-groups.json'), JSON.stringify(native))
  const list = await openMods(page, 'Mi mundo')
  await expect(list.getByLabel('Filtrar por grupo de mods')).toContainText('Native')
  expect(JSON.parse(await readFile(join(a, 'mod-groups.json'), 'utf8'))).toEqual(native)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual(legacy)
  for (const contents of ['', '{}']) {
    await page.getByTestId('nav-library').click()
    await writeFile(join(a, 'mod-groups.json'), contents)
    await openMods(page, 'Mi mundo')
    await expect(list.getByLabel('Filtrar por grupo de mods')).not.toContainText('Old A')
    expect(await readFile(join(a, 'mod-groups.json'), 'utf8')).toBe(contents)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual(legacy)
  }
  await openMods(page, 'Fabric QA')
  await expect(list.getByLabel('Filtrar por grupo de mods')).toContainText('Imported B')
  expect(JSON.parse(await readFile(join(b, 'mod-groups.json'), 'utf8'))).toEqual({ 'Imported B': { color: '', files: ['example.jar'] } })
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual({ [a]: legacy[a] })
  await page.reload()
  await expect(list.getByLabel('Filtrar por grupo de mods')).toContainText('Imported B')
})

test('groups can be created, assigned, renamed and dissolved without losing mods, color or unknown metadata', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await makeReactMod(path, 'example', 'Alpha'); await makeReactMod(path, 'second', 'Second')
  const original = { Native: { color: 'goldenrod', files: ['example.jar'], future: 'KEEP' } }
  await writeFile(join(path, 'mod-groups.json'), JSON.stringify(original))
  const list = await openMods(page, 'Mi mundo'), editor = page.getByTestId('content-groups-editor')
  await expect(list.locator('.content-list li')).toHaveCount(2)
  await list.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
  await expect(editor.getByLabel('Nombre del grupo', { exact: true })).toBeFocused()
  await editor.getByLabel('Grupo que quieres editar').selectOption('name:Native')
  await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Renamed')
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await expect(list.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeFocused()
  expect(JSON.parse(await readFile(join(path, 'mod-groups.json'), 'utf8'))).toEqual({ Renamed: original.Native })
  await list.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
  await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Utility')
  for (const theme of ['dark', 'light']) {
    await page.getByRole('button', { name: 'Cerrar grupos', exact: true }).click()
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme)
    await page.reload()
    await expect(list.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeEnabled()
    await expect(list.locator('.content-list li')).toHaveCount(2)
    await list.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
    await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Utility')
    for (const size of [[1200, 720], [800, 400]]) {
      const win = await launcher.app.browserWindow(page)
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).focus()
      await expect(editor.getByRole('button', { name: 'Guardar grupo', exact: true })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const accessibility = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`groups-axe-${theme}-${size[0]}.json`), JSON.stringify(accessibility, null, 2))
      expect(accessibility.violations).toEqual([])
      await editor.evaluate(element => element.scrollIntoView({ block: 'start' }))
      await snap(launcher, `groups-top-${theme}-${size[0]}`, 'Group editor title and reviewed fields; scroll remains available for its actions.')
      await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).scrollIntoViewIfNeeded()
      await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).focus()
      await expect(editor.getByRole('button', { name: 'Guardar grupo', exact: true })).toBeInViewport({ ratio: 1 })
      await snap(launcher, `groups-${theme}-${size[0]}`, 'Groups editor with native persistence and explicit dissolution, before saving.')
    }
  }
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await list.getByLabel('Seleccionar Second', { exact: true }).check()
  await list.getByLabel('Grupo para los mods seleccionados').selectOption('name:Utility')
  await list.getByRole('button', { name: 'Asignar grupo', exact: true }).click()
  await list.getByLabel('Filtrar por grupo de mods').selectOption('name:Utility')
  await expect(list.locator('.content-list li')).toHaveCount(1)
  await list.getByRole('button', { name: 'Desactivar Second', exact: true }).click()
  await expect(list.locator('[data-file-name="second.jar.disabled"]')).toHaveCount(1)
  await list.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
  await editor.getByLabel('Grupo que quieres editar').selectOption('name:Utility')
  await editor.getByRole('button', { name: 'Disolver grupo', exact: true }).click()
  await expect(editor.getByText('Se quitará este grupo.', { exact: false })).toBeVisible()
  await editor.getByRole('button', { name: 'Confirmar disolución', exact: true }).click()
  await expect(list.getByLabel('Filtrar por grupo de mods')).toHaveValue('all')
  await expect(list.locator('.content-list li')).toHaveCount(2)
  expect((await readFile(join(path, 'mods', 'second.jar.disabled'))).length).toBeGreaterThan(50)
  expect(JSON.parse(await readFile(join(path, 'mod-groups.json'), 'utf8'))).toEqual({ Renamed: original.Native })
  expect(errors).toEqual([])
})

test('failed legacy migration retains both paths and retry only removes the acknowledged path', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  const legacy = { [a]: { 'example.jar': 'Legacy A' }, [b]: { 'b.jar': 'Legacy B' } }
  await page.evaluate(value => localStorage.setItem('modsGrouping', JSON.stringify(value)), legacy)
  await launcher.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    ipcMain.removeHandler('service-call')
    ;(globalThis as any).__rejectGroupsMigration = true
    ipcMain.handle('service-call', (event: unknown, service: string, method: string, ...args: unknown[]) => {
      if (service === 'InstanceModsGroupService' && method === 'migrateLegacyModsGroups' && (globalThis as any).__rejectGroupsMigration) throw new Error('Fixture migration failure')
      return original(event, service, method, ...args)
    })
  })
  const list = await openMods(page, 'Mi mundo')
  await expect(list.getByRole('alert')).toContainText('Tus datos antiguos se conservaron')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual(legacy)
  await expect(readFile(join(a, 'mod-groups.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await launcher.app.evaluate(() => { (globalThis as any).__rejectGroupsMigration = false })
  await list.getByRole('button', { name: 'Reintentar migración', exact: true }).click()
  await expect(list.getByLabel('Filtrar por grupo de mods')).toContainText('Legacy A')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual({ [b]: legacy[b] })
})

test('concurrent and failed group saves preserve reviewed fields and existing disk data', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const file = join(path, 'mod-groups.json'), initial = { A: { color: '', files: [] } }
  await writeFile(file, JSON.stringify(initial))
  const list = await openMods(page, 'Mi mundo'), editor = page.getByTestId('content-groups-editor')
  await list.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
  await editor.getByLabel('Grupo que quieres editar').selectOption('name:A')
  await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Draft')
  const external = { ...initial, External: { color: '', files: ['external.jar'] } }
  await writeFile(file, JSON.stringify(external))
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor.getByRole('alert')).toBeVisible()
  await expect(editor.getByLabel('Nombre del grupo', { exact: true })).toHaveValue('Draft')
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(external)
  await editor.getByRole('button', { name: 'Descartar formulario y volver a leer', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await list.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
  await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Disk draft')
  // Replace only this fixture's reviewed metadata path with an empty directory to provoke a real write failure.
  const { unlink } = await import('node:fs/promises')
  await unlink(file); await mkdir(file)
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor.getByRole('alert')).toBeVisible()
  await expect(editor.getByLabel('Nombre del grupo', { exact: true })).toHaveValue('Disk draft')
  await rmdir(file); await writeFile(file, JSON.stringify(external))
  await editor.getByRole('button', { name: 'Descartar formulario y volver a leer', exact: true }).click()
  await expect(list.getByLabel('Filtrar por grupo de mods')).toContainText('External')
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(external)
})

test('a delayed assignment keeps its captured instance and never changes the next instance', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  await makeReactMod(a, 'example', 'Alpha'); await makeReactMod(b, 'example', 'Beta')
  await writeFile(join(a, 'mod-groups.json'), JSON.stringify({ A: { color: '', files: [] } }))
  const beta = { B: { color: '', files: [] } }
  await writeFile(join(b, 'mod-groups.json'), JSON.stringify(beta))
  await launcher.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event: unknown, service: string, method: string, ...args: unknown[]) => {
      if (service === 'InstanceModsGroupService' && method === 'updateModsGroups') {
        ;(globalThis as any).__groupsTarget = args[0]
        await new Promise<void>(resolve => { (globalThis as any).__releaseGroups = resolve })
      }
      return original(event, service, method, ...args)
    })
  })
  const list = await openMods(page, 'Mi mundo')
  await list.getByLabel('Seleccionar Alpha', { exact: true }).check()
  await list.getByLabel('Grupo para los mods seleccionados').selectOption('name:A')
  await list.getByRole('button', { name: 'Asignar grupo', exact: true }).click()
  await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__groupsTarget)).toBe(a)
  await openMods(page, 'Fabric QA')
  await expect(list).toHaveAttribute('data-instance-path', b)
  await launcher.app.evaluate(() => (globalThis as any).__releaseGroups())
  await expect.poll(async () => JSON.parse(await readFile(join(a, 'mod-groups.json'), 'utf8')).A.files).toEqual(['example.jar'])
  expect(JSON.parse(await readFile(join(b, 'mod-groups.json'), 'utf8'))).toEqual(beta)
  await expect(list.getByRole('alert')).toHaveCount(0)
  await expect(list.getByText('Grupos guardados en esta instancia.', { exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(b)
})

test('invalid native data stays intact and group operations refuse unregistered paths', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), file = join(path, 'mod-groups.json')
  await makeReactMod(path, 'example', 'Alpha')
  const broken = '{broken native groups'
  await writeFile(file, broken)
  const legacy = { [path]: { 'example.jar': 'Preserve legacy' } }
  await page.evaluate(value => localStorage.setItem('modsGrouping', JSON.stringify(value)), legacy)
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Mods', exact: true }).click()
  const list = page.getByTestId('instance-mods')
  await expect(list.getByRole('alert').filter({ hasText: 'No se pudieron leer los grupos' })).toBeVisible()
  await expect(list.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeDisabled()
  await expect(list.getByText('Alpha', { exact: true })).toBeVisible()
  expect(await readFile(file, 'utf8')).toBe(broken)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual(legacy)
  await writeFile(file, '{}')
  await list.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  await list.getByRole('button', { name: 'Reintentar migración', exact: true }).click()
  await expect(list.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeEnabled()
  expect(await readFile(file, 'utf8')).toBe('{}')
  const outside = join(launcher.gameDataPath, 'unregistered-groups')
  await mkdir(outside); await writeFile(join(outside, 'mod-groups.json'), '{}')
  const rejections = await page.evaluate(async path => {
    const service = (window as any).serviceChannels.open('InstanceModsGroupService'), result: boolean[] = []
    for (const [method, args] of [['getGroupState', [path]], ['updateModsGroups', [path, { Unwanted: { color: '', files: [] } }]], ['migrateLegacyModsGroups', [path, { 'x.jar': 'Unwanted' }]]] as const) {
      try { await service.call(method, ...args); result.push(false) } catch { result.push(true) }
    }
    return result
  }, outside)
  expect(rejections).toEqual([true, true, true])
  expect(await readFile(join(outside, 'mod-groups.json'), 'utf8')).toBe('{}')
})
