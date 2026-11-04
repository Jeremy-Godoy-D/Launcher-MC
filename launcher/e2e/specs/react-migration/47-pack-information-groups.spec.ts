import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactResourcePack } from '../../helpers/react-content'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function openPacks(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await expect(area.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeEnabled()
  return area
}

test('pack information reads archive metadata as text, refreshes and closes without modifying bytes', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), attack = '<img src=x onerror="window.__packAttack=true">'
  await makeReactResourcePack(a, 'alpha', { text: 'Hello ', extra: [{ text: attack, clickEvent: { action: 'open_url', value: 'https://example.invalid' } }] })
  await makeReactResourcePack(b, 'beta', 'Description B')
  await makeReactResourcePack(a, 'invalid-format', 'Invalid format fixture', { malicious: true })
  await makeReactResourcePack(a, 'prototype-format', 'Prototype format fixture', '__proto__')
  const file = join(a, 'resourcepacks/alpha.zip'), bytes = await readFile(file), area = await openPacks(page)
  const trigger = area.getByRole('button', { name: 'Información de alpha.zip', exact: true }), info = page.getByRole('region', { name: 'Información del pack', exact: true })
  await trigger.focus(); await page.keyboard.press('Enter')
  await expect(info.getByRole('button', { name: 'Cerrar información del pack' })).toBeFocused()
  await expect(info).toContainText('Hello ' + attack); await expect(info).toContainText(createHash('sha1').update(bytes).digest('hex'))
  await expect(info.locator('img,script,a')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__packAttack)).toBeUndefined()
  await page.keyboard.press('Escape'); await expect(info).toHaveCount(0); await expect(trigger).toBeFocused()
  expect(await readFile(file)).toEqual(bytes)
  await area.getByRole('button', { name: 'Información de invalid-format.zip', exact: true }).click()
  await expect(info).toContainText('No identificado'); await expect(info).toContainText('Invalid format fixture')
  await page.keyboard.press('Escape')
  await trigger.click(); await makeReactResourcePack(a, 'alpha', 'Updated pack description')
  await area.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  await expect(info).toContainText('Updated pack description')
  await openPacks(page, 'Fabric QA'); await expect(info).toHaveCount(0)
  await area.getByRole('button', { name: 'Información de beta.zip', exact: true }).click()
  await expect(info).toContainText('Description B'); await expect(info).not.toContainText('Updated pack description')
})

test('pack groups persist, filter both priority lists, and stay isolated from mods, shaders, legacy storage and another instance', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  await makeReactResourcePack(a, 'alpha'); await makeReactResourcePack(a, 'beta'); await makeReactResourcePack(b, 'other')
  const original = 'resourcePacks:["vanilla","file/alpha.zip"]\r\nlang:es_es\r\n', untouched = { Mods: { color: '', files: ['alpha.zip'] } }, legacy = { [a]: { 'unmigrated.jar': 'Legacy' } }
  await writeFile(join(a, 'options.txt'), original)
  await writeFile(join(a, 'mod-groups.json'), JSON.stringify(untouched)); await writeFile(join(a, 'shaderpacks-groups.json'), JSON.stringify(untouched))
  await page.evaluate(value => localStorage.setItem('modsGrouping', JSON.stringify(value)), legacy)
  const area = await openPacks(page), editor = page.getByTestId('content-groups-editor')
  await area.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
  await expect(editor.getByLabel('Nombre del grupo', { exact: true })).toBeFocused()
  await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Visual')
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor).toHaveCount(0); await expect(area.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeFocused()
  await area.getByLabel('Seleccionar alpha.zip', { exact: true }).check(); await area.getByLabel('Seleccionar beta.zip', { exact: true }).check()
  await area.getByLabel('Grupo para los packs seleccionados').selectOption('name:Visual'); await area.getByRole('button', { name: 'Asignar grupo', exact: true }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Grupos guardados' })).toBeVisible()
  await page.reload(); await expect(area.getByLabel('Filtrar por grupo de packs')).toContainText('Visual')
  await area.getByLabel('Filtrar por grupo de packs').selectOption('name:Visual')
  await expect(area.getByRole('list', { name: 'Activados · mayor prioridad primero', exact: true }).locator('li')).toHaveCount(1)
  await expect(area.getByRole('list', { name: 'Disponibles para activar', exact: true }).locator('li')).toHaveCount(1)
  await area.getByLabel('Filtrar por grupo de packs').selectOption('none')
  await expect(area.getByRole('button', { name: 'Información de alpha.zip', exact: true })).toHaveCount(0)
  await area.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
  await editor.getByLabel('Grupo que quieres editar').selectOption('name:Visual'); await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Renamed')
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor).toHaveCount(0)
  expect(JSON.parse(await readFile(join(a, 'resourcepacks-groups.json'), 'utf8')).Renamed.files.sort()).toEqual(['alpha.zip', 'beta.zip'])
  await area.getByRole('button', { name: 'Gestionar grupos', exact: true }).click(); await editor.getByLabel('Grupo que quieres editar').selectOption('name:Renamed')
  await editor.getByRole('button', { name: 'Disolver grupo', exact: true }).click(); await editor.getByRole('button', { name: 'Confirmar disolución', exact: true }).click()
  await expect(editor).toHaveCount(0)
  expect(JSON.parse(await readFile(join(a, 'resourcepacks-groups.json'), 'utf8'))).toEqual({})
  expect(await readFile(join(a, 'options.txt'), 'utf8')).toBe(original)
  for (const file of ['mod-groups.json', 'shaderpacks-groups.json']) expect(JSON.parse(await readFile(join(a, file), 'utf8'))).toEqual(untouched)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual(legacy)
  await openPacks(page, 'Fabric QA'); await expect(area.getByLabel('Filtrar por grupo de packs')).not.toContainText('Renamed')
  await expect(readFile(join(b, 'resourcepacks-groups.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect((await readFile(join(a, 'resourcepacks/alpha.zip'))).length).toBeGreaterThan(0)
})

test('unreadable and concurrently edited pack groups preserve disk data and the reviewed form', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), file = join(path, 'resourcepacks-groups.json')
  await makeReactResourcePack(path, 'alpha'); await writeFile(file, 'broken groups')
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks'), editor = page.getByTestId('content-groups-editor')
  await expect(area.getByRole('alert')).toContainText('No se pudieron leer los grupos')
  await expect(area.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeDisabled()
  expect(await readFile(file, 'utf8')).toBe('broken groups')
  const initial = { Visual: { color: '#aabbcc', files: ['alpha.zip'] } }
  await writeFile(file, JSON.stringify(initial)); await area.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  await expect(area.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeEnabled()
  await area.getByRole('button', { name: 'Gestionar grupos', exact: true }).click()
  await editor.getByLabel('Grupo que quieres editar').selectOption('name:Visual'); await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Draft')
  const external = { ...initial, External: { color: '', files: ['missing.zip'] } }; await writeFile(file, JSON.stringify(external))
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor.getByRole('alert')).toBeVisible(); await expect(editor.getByLabel('Nombre del grupo', { exact: true })).toHaveValue('Draft')
  expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(external)
  await editor.getByRole('button', { name: 'Descartar formulario y volver a leer', exact: true }).click()
  await expect(editor).toHaveCount(0); await expect(area.getByLabel('Filtrar por grupo de packs')).toContainText('External')
})

test('pack information and groups remain readable with keyboard, both themes and supported sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await makeReactResourcePack(path, 'alpha', 'A real local pack description. '.repeat(80)); await openPacks(page)
  const area = page.getByTestId('instance-resourcepacks'), info = page.getByRole('region', { name: 'Información del pack', exact: true }), editor = page.getByTestId('content-groups-editor')
  const win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await area.getByRole('button', { name: 'Información de alpha.zip', exact: true }).click()
      const close = info.getByRole('button', { name: 'Cerrar información del pack', exact: true })
      await expect(close).toBeFocused(); await expect(close).toBeInViewport({ ratio: 1 })
      await snap(launcher, `pack-information-top-${theme}-${size[0]}`, 'Pack identity, declared format and local source remain accessible before scrolling the description.')
      await page.keyboard.press('Tab'); await expect(info.locator('.content-description')).toBeFocused()
      await page.keyboard.press('End'); await expect.poll(() => info.locator('.content-description').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
      for (const state of ['information', 'groups']) {
        if (state === 'groups') { await page.keyboard.press('Escape'); await expect(area.getByRole('button', { name: 'Información de alpha.zip', exact: true })).toBeFocused(); await area.getByRole('button', { name: 'Gestionar grupos', exact: true }).click(); await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Visual'); await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).focus() }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        await writeFile(testInfo.outputPath(`${state}-${theme}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
        if (state === 'groups') await expect(editor.getByRole('button', { name: 'Guardar grupo', exact: true })).toBeInViewport({ ratio: 1 })
        await snap(launcher, `pack-${state}-${theme}-${size[0]}`, 'Local pack metadata and groups use the existing readable, scrollable surfaces.')
      }
      await editor.getByRole('button', { name: 'Cancelar', exact: true }).click()
    }
  }
  expect(errors).toEqual([])
})
