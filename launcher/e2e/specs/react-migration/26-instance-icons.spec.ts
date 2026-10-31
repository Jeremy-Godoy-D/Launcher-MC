import { createHash } from 'node:crypto'
import { link, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'

test.use({ launcherOptions: { locale: 'es-ES' } })
const gif = Buffer.from('R0lGODlhEAAQAIEAACR0zAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQAMgAAACwAAAAAEAAQAAAIHQABCBxIsKDBgwgTKlzIsKHDhxAjSpxIsaLFgQEBACH5BAEyAAEALAAAAAAQABAAgeaiPAAAAAAAAAAAAAgdAAEIHEiwoMGDCBMqXMiwocOHECNKnEixosWBAQEAOw==', 'base64')
async function openIcon(page: Page, name = 'Fabric QA') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Opciones de ${name}`, exact: true }).click()
  const panel = page.getByTestId('instance-operations')
  await panel.getByRole('button', { name: 'Cambiar icono', exact: true }).click()
  await expect(page.getByTestId('instance-icon-choose')).toBeFocused()
  return panel
}

test('icon editing previews both themes and sizes, owns animated bytes and preserves originals, identity and worlds', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const png = await readFile(resolve('../xmcl-keystone-ui/src/assets/steve_skin.png'))
  const source = join(launcher.gameDataPath, 'nuevo #&% imagen.gif'), poster = join(launcher.gameDataPath, 'preview.png')
  await writeFile(source, gif); await writeFile(poster, png)
  const original = Buffer.from(gif); original[13] ^= 0xff
  const legacySource = join(launcher.gameDataPath, 'legacy-original.gif')
  await writeFile(legacySource, original); await link(legacySource, join(paths[1], 'icon.gif'))
  await mkdir(join(paths[1], 'saves/world'), { recursive: true }); await writeFile(join(paths[1], 'saves/world/level.dat'), 'keep-world')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, icon: 'icon.gif' }), paths[1])
  const reports: unknown[] = [], win = await launcher.app.browserWindow(page)
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    const panel = await openIcon(page)
    await stubOpenDialog(launcher, poster); await page.getByTestId('instance-icon-choose').click()
    await expect.poll(() => panel.locator('.instance-icon-preview img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 64)).toBe(true)
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await page.getByTestId('instance-operation-confirm').focus()
      await expect(page.getByTestId('instance-operation-confirm')).toBeInViewport({ ratio: 1 })
      await panel.getByRole('region').focus(); await page.keyboard.press('End')
      await expect(panel.locator('.instance-icon-preview')).toBeInViewport({ ratio: 1 })
      await expect(page.getByTestId('instance-icon-choose')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); reports.push({ appearance, width, ...report })
      await snap(launcher, `instance-icon-${appearance}-${width}`, 'Vista previa local y acciones fijas; elegir imagen no guarda hasta confirmar.')
    }
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Opciones de Fabric QA', exact: true })).toBeFocused()
  }
  await writeFile(testInfo.outputPath('instance-icon-accessibility.json'), JSON.stringify(reports, null, 2))
  let panel = await openIcon(page)
  await stubOpenDialog(launcher, source); await page.getByTestId('instance-icon-choose').click()
  await expect.poll(() => panel.locator('.instance-icon-preview img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 16)).toBe(true)
  await page.getByTestId('instance-operation-confirm').click(); await expect(panel.getByRole('status')).toHaveText('Cambios guardados.')
  const metadata = JSON.parse(await readFile(join(paths[1], 'instance.json'), 'utf8'))
  const filename = `icon-${createHash('sha256').update(gif).digest('hex')}.gif`
  expect(metadata.icon).toBe(filename); expect(metadata.name).toBe('Fabric QA')
  await writeFile(source, 'changed-original')
  expect(await readFile(join(paths[1], filename))).toEqual(gif)
  expect(await readFile(legacySource)).toEqual(original)
  expect(await readFile(join(paths[1], 'icon.gif'))).toEqual(original)
  expect(await readFile(join(paths[1], 'saves/world/level.dat'), 'utf8')).toBe('keep-world')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[0])
  await page.keyboard.press('Escape'); await page.reload(); await page.getByTestId('nav-library').click()
  const card = page.locator('.instance-card').filter({ has: page.getByRole('heading', { name: 'Fabric QA', exact: true }) })
  await expect.poll(() => card.locator('.instance-identity img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 16)).toBe(true)
  panel = await openIcon(page); await panel.getByRole('button', { name: 'Restablecer icono', exact: true }).click()
  await page.getByTestId('instance-operation-confirm').click(); await expect(panel.getByRole('status')).toHaveText('Cambios guardados.')
  expect(JSON.parse(await readFile(join(paths[1], 'instance.json'), 'utf8')).icon).toBe('')
  expect(await readFile(join(paths[1], filename))).toEqual(gif)
  expect(errors).toEqual([])
})

test('invalid files and stale icon reviews retain drafts and never replace another window’s saved icon', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'valid.gif')
  await writeFile(source, gif)
  const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
  let panel = await openIcon(page)
  await stubOpenDialog(launcher, source); await page.getByTestId('instance-icon-choose').click()
  const other = join(launcher.gameDataPath, 'other.png'); await writeFile(other, await readFile(resolve('../xmcl-keystone-ui/src/assets/steve_skin.png')))
  await page.evaluate(async ({ path, source }) => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, icon: `http://launcher/media?path=${encodeURIComponent(source)}` }), { path: paths[1], source: other })
  const before = await readdir(paths[1]), metadata = await readFile(join(paths[1], 'instance.json'), 'utf8')
  await page.getByTestId('instance-operation-confirm').click(); await expect(panel.getByRole('alert')).toContainText('Los datos cambiaron')
  await expect(panel.getByRole('alert')).toBeInViewport({ ratio: 1 })
  expect(await readdir(paths[1])).toEqual(before); expect(await readFile(join(paths[1], 'instance.json'), 'utf8')).toBe(metadata)
  await page.keyboard.press('Escape'); panel = await openIcon(page)
  const invalid = join(launcher.gameDataPath, 'not-an-image.png'); await writeFile(invalid, '<html>not a PNG</html>')
  await stubOpenDialog(launcher, invalid); await page.getByTestId('instance-icon-choose').click()
  await page.getByTestId('instance-operation-confirm').click(); await expect(panel.getByRole('alert')).toContainText('No se pudo guardar el icono')
  await expect(panel.getByRole('alert')).toBeInViewport({ ratio: 1 }); await expect(panel).toContainText('not-an-image.png')
  await snap(launcher, 'instance-icon-error-800', 'PNG disfrazado rechazado en main; borrador y otro icono guardado se conservan, sin archivos parciales.')
  expect(await readFile(join(paths[1], 'instance.json'), 'utf8')).toBe(metadata)
  expect(await readdir(paths[1])).toEqual(before)
})
