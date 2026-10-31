import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactShaderPack } from '../../helpers/react-content'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function open(page: Page, name = 'Mi mundo', ready = true) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'Shaders', exact: true }).click()
  const area = page.getByTestId('instance-shaders')
  if (ready) await expect(area.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeEnabled()
  return area
}

test('shader information reads Native archive identity, folders and refreshes without writing configuration', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  await makeReactShaderPack(a, 'alpha'); await makeReactShaderPack(b, 'beta')
  await mkdir(join(a, 'shaderpacks/Unpacked/shaders'), { recursive: true }); await writeFile(join(a, 'shaderpacks/Unpacked/shaders/final.fsh'), 'keep shader')
  const config = '# KEEP\nshaderPack=alpha.zip\n', file = join(a, 'shaderpacks/alpha.zip'), bytes = await readFile(file)
  await mkdir(join(a, 'config'), { recursive: true }); await writeFile(join(a, 'config/iris.properties'), config)
  const area = await open(page), trigger = area.getByRole('button', { name: 'Información de alpha.zip', exact: true }), info = page.getByRole('region', { name: 'Información del shader', exact: true })
  await trigger.focus(); await page.keyboard.press('Enter')
  await expect(info.getByRole('button', { name: 'Cerrar información del shader' })).toBeFocused()
  await expect(info).toContainText(createHash('sha1').update(bytes).digest('hex')); await expect(info).toContainText('Archivo local')
  await page.keyboard.press('Escape'); await expect(info).toHaveCount(0); await expect(trigger).toBeFocused()
  await area.getByRole('button', { name: 'Información de Unpacked', exact: true }).click()
  await expect(info).toContainText('No calculado'); await expect(info).toContainText('Carpeta')
  await page.keyboard.press('Escape'); await trigger.click()
  // A ZIP comment changes identity without making the archive unreadable.
  const changed = Buffer.from(bytes); changed.writeUInt16LE(7, changed.length - 2)
  await writeFile(file, Buffer.concat([changed, Buffer.from('changed')]))
  await area.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  await expect(info).toContainText(createHash('sha1').update(await readFile(file)).digest('hex'))
  expect(await readFile(join(a, 'config/iris.properties'), 'utf8')).toBe(config)
  await open(page, 'Fabric QA'); await expect(info).toHaveCount(0)
  await area.getByRole('button', { name: 'Información de beta.zip', exact: true }).click(); await expect(info).toContainText('beta.zip')
})

test('shader groups persist, filter, rename and dissolve without changing packs, mods, worlds or legacy data', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  await makeReactShaderPack(a, 'alpha'); await makeReactShaderPack(a, 'beta'); await makeReactShaderPack(b, 'other')
  const untouched = { Keep: { color: '', files: ['alpha.zip'] } }, legacy = { [a]: { 'unmigrated.jar': 'Legacy' } }, zip = await readFile(join(a, 'shaderpacks/alpha.zip'))
  for (const name of ['mod-groups.json', 'resourcepacks-groups.json']) await writeFile(join(a, name), JSON.stringify(untouched))
  await mkdir(join(a, 'saves/keep'), { recursive: true }); await writeFile(join(a, 'saves/keep/level.dat'), 'WORLD')
  await writeFile(join(a, 'optionsshaders.txt'), 'shaderPack=alpha.zip\n'); await page.evaluate(value => localStorage.setItem('modsGrouping', JSON.stringify(value)), legacy)
  const area = await open(page), editor = page.getByTestId('content-groups-editor'), manage = area.getByRole('button', { name: 'Gestionar grupos', exact: true })
  await manage.click(); await expect(editor.getByLabel('Nombre del grupo', { exact: true })).toBeFocused()
  await expect(area).toHaveAttribute('aria-busy', 'false')
  await expect(area.getByRole('button', { name: 'Añadir archivos', exact: true })).toBeDisabled()
  await expect(area.getByRole('button', { name: 'Información de alpha.zip', exact: true })).toBeDisabled()
  await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Visual'); await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor).toHaveCount(0); await expect(manage).toBeFocused()
  await area.getByLabel('Seleccionar alpha.zip', { exact: true }).check(); await area.getByLabel('Seleccionar beta.zip', { exact: true }).check()
  await area.getByLabel('Grupo para los shaders seleccionados').selectOption('name:Visual'); await area.getByRole('button', { name: 'Asignar grupo', exact: true }).click()
  await expect(area.getByRole('status').filter({ hasText: 'Grupos guardados' })).toBeVisible()
  await page.reload(); const filter = area.getByLabel('Filtrar por grupo de shaders'); await expect(filter).toContainText('Visual')
  await filter.selectOption('name:Visual'); await expect(area.getByRole('button', { name: /^Información de / })).toHaveCount(2)
  await filter.selectOption('none'); await expect(area.getByRole('button', { name: /^Información de / })).toHaveCount(0)
  await manage.click(); await editor.getByLabel('Grupo que quieres editar').selectOption('name:Visual'); await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Renamed')
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click(); await expect(editor).toHaveCount(0)
  expect(JSON.parse(await readFile(join(a, 'shaderpacks-groups.json'), 'utf8')).Renamed.files.sort()).toEqual(['alpha.zip', 'beta.zip'])
  await manage.click(); await editor.getByLabel('Grupo que quieres editar').selectOption('name:Renamed'); await editor.getByRole('button', { name: 'Disolver grupo', exact: true }).click(); await editor.getByRole('button', { name: 'Confirmar disolución', exact: true }).click()
  await expect(editor).toHaveCount(0); expect(JSON.parse(await readFile(join(a, 'shaderpacks-groups.json'), 'utf8'))).toEqual({})
  await expect(filter).toHaveValue('none'); await filter.selectOption('all'); await expect(area.getByRole('button', { name: /^Información de / })).toHaveCount(2)
  for (const name of ['mod-groups.json', 'resourcepacks-groups.json']) expect(JSON.parse(await readFile(join(a, name), 'utf8'))).toEqual(untouched)
  expect(await readFile(join(a, 'optionsshaders.txt'), 'utf8')).toBe('shaderPack=alpha.zip\n'); expect(await readFile(join(a, 'saves/keep/level.dat'), 'utf8')).toBe('WORLD')
  expect(await readFile(join(a, 'shaderpacks/alpha.zip'))).toEqual(zip); expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual(legacy)
  await open(page, 'Fabric QA'); await expect(filter).not.toContainText('Renamed'); await expect(readFile(join(b, 'shaderpacks-groups.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('unreadable and concurrently edited shader groups preserve disk data and the reviewed form', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), file = join(path, 'shaderpacks-groups.json')
  await makeReactShaderPack(path, 'alpha'); await writeFile(file, 'broken groups')
  const area = await open(page, 'Mi mundo', false), editor = page.getByTestId('content-groups-editor'), manage = area.getByRole('button', { name: 'Gestionar grupos', exact: true })
  await expect(area.getByRole('alert')).toContainText('No se pudieron leer los grupos'); await expect(manage).toBeDisabled(); expect(await readFile(file, 'utf8')).toBe('broken groups')
  const initial = { Visual: { color: '#aabbcc', files: ['alpha.zip'] } }
  await writeFile(file, JSON.stringify(initial)); await area.getByRole('button', { name: 'Volver a leer', exact: true }).click(); await expect(manage).toBeEnabled(); await manage.click()
  await expect(editor.getByLabel('Nombre del grupo', { exact: true })).toBeFocused()
  await editor.getByLabel('Grupo que quieres editar').selectOption('name:Visual'); await editor.getByLabel('Nombre del grupo', { exact: true }).fill('Draft')
  const external = { ...initial, External: { color: '', files: ['missing.zip'] } }; await writeFile(file, JSON.stringify(external))
  await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).click()
  await expect(editor.getByRole('alert')).toBeVisible(); await expect(editor.getByLabel('Nombre del grupo', { exact: true })).toHaveValue('Draft'); expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(external)
  await editor.getByRole('button', { name: 'Descartar formulario y volver a leer', exact: true }).click(); await expect(editor).toHaveCount(0); await expect(area.getByLabel('Filtrar por grupo de shaders')).toContainText('External')
})

test('shader information and groups remain readable with keyboard, both themes and supported sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), errors: string[] = [], name = 'Paisaje Áureo '.repeat(10).trim(), group = '<img src=x onerror=attack()> ' + 'Visual '.repeat(20)
  page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await makeReactShaderPack(path, name); await writeFile(join(path, 'shaderpacks-groups.json'), JSON.stringify({ [group]: { color: '#bbaa99', files: [name + '.zip'] } })); await open(page)
  const area = page.getByTestId('instance-shaders'), info = page.getByRole('region', { name: 'Información del shader', exact: true }), editor = page.getByTestId('content-groups-editor'), win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await area.getByLabel(`Seleccionar ${name}.zip`, { exact: true }).check()
      const trigger = area.getByRole('button', { name: `Información de ${name}.zip`, exact: true }); await trigger.click()
      await expect(info.getByRole('button', { name: 'Cerrar información del shader' })).toBeFocused(); await expect(info.getByRole('button', { name: 'Cerrar información del shader' })).toBeInViewport({ ratio: 1 })
      for (const state of ['information', 'groups']) {
        if (state === 'groups') { await page.keyboard.press('Escape'); await expect(trigger).toBeFocused(); await area.getByRole('button', { name: 'Gestionar grupos', exact: true }).click(); await editor.getByLabel('Nombre del grupo', { exact: true }).fill('New group'); await editor.getByRole('button', { name: 'Guardar grupo', exact: true }).focus(); await expect(editor.getByRole('button', { name: 'Guardar grupo', exact: true })).toBeInViewport({ ratio: 1 }) }
        expect(await area.evaluate(element => {
          for (let node: Element | null = element; node; node = node.parentElement) if (node.scrollWidth > node.clientWidth + 1) return false
          return true
        })).toBe(true)
        await expect(area.locator('img,script')).toHaveCount(0)
        await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        await writeFile(testInfo.outputPath(`${state}-${theme}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
        await snap(launcher, `shader-${state}-${theme}-${size[0]}`, 'Local shader identity and isolated groups keep keyboard actions reachable over the approved landscape and glass surfaces.')
      }
      await page.keyboard.press('Escape'); await expect(editor).toHaveCount(0); await expect(area.getByRole('button', { name: 'Gestionar grupos', exact: true })).toBeFocused()
    }
  }
  expect(errors).toEqual([])
})
