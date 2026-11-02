import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test as base, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { mockWorldCatalog } from '../../helpers/react-catalog-world'
import { makeReactWorld } from '../../helpers/react-world'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { activateLauncherControl } from '../../helpers/focus-launcher'
import type { LauncherFixture } from '../../fixtures/launcher'

const test = base.extend<{ catalog: Awaited<ReturnType<typeof mockWorldCatalog>> }>({
  catalog: async ({ launcher }, use, info) => {
    const fixture = await mockWorldCatalog(launcher), errors: string[] = []
    launcher.main.on('pageerror', error => errors.push(error.message))
    try { await use(fixture) } finally {
      await writeFile(info.outputPath('world-http.json'), JSON.stringify({ ...fixture.world, requests: fixture.state.requests, hops: await fixture.hops(), rendererErrors: errors }, null, 2))
      await fixture.close(); expect(errors).toEqual([])
    }
  },
})
test.use({ launcherOptions: { locale: 'es-ES' } })
async function entries(path: string) { try { return await readdir(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error } }
async function open(launcher: LauncherFixture, target: string) {
  const page = launcher.main
  await page.getByTestId('nav-store').click()
  await page.getByRole('button', { name: 'Filtros', exact: true }).click()
  await page.getByTestId('catalog-source-curseforge').click(); await page.getByTestId('catalog-kind').selectOption('world')
  await expect(page.locator('.project-card')).toHaveCount(1)
  const trigger = page.locator('.project-card').getByRole('button', { name: 'Ver contenido', exact: true })
  await activateLauncherControl(launcher, trigger)
  const sheet = page.getByTestId('catalog-project')
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click()
  await sheet.locator('#catalog-target').selectOption(target)
  const download = sheet.getByTestId('catalog-import-version')
  await expect(download).toBeEnabled()
  return { trigger, download, sheet }
}

test('CF world archive hands off to one confirmed importer and preserves existing worlds and provider identity', async ({ launcher, catalog }, info) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  const existing = await makeReactWorld(paths[1], 'Existing'), before = await readFile(join(existing, 'level.dat'))
  const { trigger, download } = await open(launcher, paths[1])
  expect(catalog.world.downloads).toBe(0)
  await download.click({ clickCount: 2 })
  const dialog = page.getByTestId('world-files-dialog')
  await expect(dialog).toBeVisible(); await expect(page.getByTestId('catalog-project')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(dialog).toContainText('Fabric QA · 1.21.1')
  await expect(dialog.getByLabel('Nombre de carpeta del mundo importado')).toHaveValue('World- QA - Archive')
  expect(await entries(join(paths[1], 'saves'))).toEqual(['Existing']); expect(catalog.world.downloads).toBe(1)
  await dialog.getByLabel('Nombre de carpeta del mundo importado').fill('Existing')
  await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('El destino ya existe')
  await dialog.getByLabel('Nombre de carpeta del mundo importado').fill('Imported')
  await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click()
  await expect(dialog.getByTestId('world-files-review')).toContainText(join('saves', 'Imported'))
  expect(await entries(join(paths[1], 'saves'))).toEqual(['Existing'])
  const win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light'] as const) for (const width of [1200, 800]) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    await expect(dialog.getByRole('button', { name: 'Confirmar operación', exact: true })).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(axe.source)
    const result = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    expect(result.violations).toEqual([]); await writeFile(info.outputPath(`world-${theme}-${width}-axe.json`), JSON.stringify(result, null, 2))
    await page.screenshot({ path: info.outputPath(`world-${theme}-${width}.png`) })
  }
  await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click({ clickCount: 2 })
  await expect(dialog.getByRole('status')).toContainText('Mundo importado')
  expect(await readFile(join(paths[1], 'saves/Imported/level.dat'))).toEqual(catalog.level)
  expect(await readFile(join(paths[1], 'saves/Imported/marker.txt'), 'utf8')).toBe('WORLD MARKER')
  expect(JSON.parse(await readFile(join(paths[1], 'saves/Imported/.curseforge'), 'utf8'))).toEqual({ projectId: 1, fileId: 101 })
  expect(await readFile(join(existing, 'level.dat'))).toEqual(before); expect(await entries(join(paths[0], 'saves'))).toEqual([])
  expect(catalog.state.requests.every(request => !request.key && !request.authorization && !request.cancellationId)).toBe(true)
  const hops = await catalog.hops(); expect(hops.length).toBeGreaterThan(0); expect(hops.every(hop => hop.usedProxy)).toBe(true)
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
  await activateLauncherControl(launcher, trigger)
  const sheet = page.getByTestId('catalog-project')
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click()
  await sheet.locator('#catalog-target').selectOption(paths[1])
  await expect(sheet.getByTestId('catalog-installed-version')).toHaveText('Este lanzamiento ya fue importado')
})

test('CF world transfer cancellation can retry and closing the importer leaves saves untouched', async ({ launcher, catalog }) => {
  const page = launcher.main, paths = await seedReactLibrary(page), { download } = await open(launcher, paths[1])
  catalog.world.slow = true
  await download.click()
  await expect.poll(() => catalog.world.requested).toBe(true)
  await page.getByRole('button', { name: 'Cancelar descarga', exact: true }).click()
  await expect(page.getByTestId('catalog-download-error')).toContainText('Descarga cancelada')
  await expect.poll(() => catalog.world.aborted).toBe(true)
  await expect(page.getByTestId('world-files-dialog')).toHaveCount(0)
  expect(await entries(join(paths[1], 'saves'))).toEqual([])
  catalog.world.slow = false
  await download.click(); await expect(page.getByTestId('world-files-dialog')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(page.getByTestId('world-files-dialog')).toHaveCount(0)
  expect(await entries(join(paths[1], 'saves'))).toEqual([])
})

test('CF world checksum failure keeps the sheet recoverable and a different local source clears provider identity', async ({ launcher, catalog }) => {
  const page = launcher.main, paths = await seedReactLibrary(page), { download } = await open(launcher, paths[1])
  catalog.world.corrupt = true
  await download.click(); await expect(page.getByTestId('catalog-download-error')).toContainText('No se pudo descargar o verificar')
  await expect(page.getByTestId('world-files-dialog')).toHaveCount(0); expect(await entries(join(paths[1], 'saves'))).toEqual([])
  catalog.world.corrupt = false
  await download.click()
  const dialog = page.getByTestId('world-files-dialog')
  await expect(dialog).toBeVisible()
  await stubOpenDialog(launcher, catalog.source)
  await dialog.getByRole('button', { name: 'Elegir carpeta del mundo', exact: true }).click()
  await dialog.getByLabel('Nombre de carpeta del mundo importado').fill('Local')
  await dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Mundo importado')
  expect(await readFile(join(paths[1], 'saves/Local/level.dat'))).toEqual(catalog.level)
  await expect(lstat(join(paths[1], 'saves/Local/.curseforge'))).rejects.toHaveProperty('code', 'ENOENT')
})
