import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function open(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds'); await expect(area).toHaveAttribute('aria-busy', 'false')
  return area
}

test('world metadata preserves Native saves, exposes damaged folders and isolates instances and refresh', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), title = '<img src=x onerror=attack()>'
  const world = await makeReactWorld(a, 'Alpha', title); await makeReactWorld(b, 'Beta')
  await mkdir(join(a, 'saves/Broken')); await writeFile(join(a, 'saves/Broken/level.dat'), 'BROKEN')
  const bytes = await readFile(join(world, 'level.dat')), before = await lstat(join(world, 'level.dat')), area = await open(page)
  await expect(area.locator('[data-world-name]')).toHaveCount(2)
  const trigger = area.getByRole('button', { name: title, exact: true }); await trigger.focus(); await page.keyboard.press('Enter')
  const info = area.getByTestId('world-info'); await expect(info.getByRole('button', { name: 'Cerrar información del mundo' })).toBeFocused()
  await expect(info).toContainText('1.21.1'); await expect(info).toContainText('Activados'); await expect(info.locator('dd').filter({ hasText: /^0$/ })).toHaveCount(1)
  await expect(area.locator('img,script')).toHaveCount(0); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
  await area.getByLabel('Buscar mundos').fill('broken'); await expect(area.locator('[data-world-name]')).toHaveCount(1); await expect(area).toContainText('No se pudo leer level.dat')
  await area.getByLabel('Buscar mundos').fill(''); await makeReactWorld(a, 'New')
  await area.getByTestId('worlds-refresh').click(); await expect(area.locator('[data-world-name]')).toHaveCount(3)
  await open(page, 'Fabric QA'); await expect(area.locator('[data-world-name]')).toHaveCount(1); await expect(area).toContainText('Beta'); await expect(info).toHaveCount(0)
  await page.reload(); await expect(area).toContainText('Beta')
  expect(await readFile(join(world, 'level.dat'))).toEqual(bytes); expect((await lstat(join(world, 'level.dat'))).mtimeMs).toBe(before.mtimeMs)
  expect(await readFile(join(a, 'saves/Broken/level.dat'), 'utf8')).toBe('BROKEN')
  const invalid = await page.evaluate(async path => { const service = (window as any).serviceChannels.open('InstanceSavesService'); try { await service.call('getInstanceSaves', path); return false } catch { return true } }, dirname(a))
  expect(invalid).toBe(true)
})

test('owned shared worlds can be read while foreign links stay unread', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page)
  const shared = await makeReactWorld(launcher.gameDataPath, 'Owned'), foreign = await makeReactWorld(b, 'Foreign')
  await mkdir(join(a, 'saves'), { recursive: true }); await symlink(shared, join(a, 'saves/Shared'), 'junction'); await symlink(foreign, join(a, 'saves/Outside'), 'junction')
  const bytes = await readFile(join(foreign, 'level.dat')), area = await open(page)
  await expect(area.locator('[data-world-name="Shared"]')).toContainText('Compartido')
  await expect(area.locator('[data-world-name="Outside"]')).toContainText('No se accedió a su contenido')
  expect(await readFile(join(foreign, 'level.dat'))).toEqual(bytes)
})

test('world information stays reachable with long text in both themes and supported window sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const [path] = await seedReactLibrary(page), title = 'World-' + 'long-world-name-'.repeat(16)
  await makeReactWorld(path, 'Long', title); await open(page)
  const area = page.getByTestId('instance-worlds'), win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      const trigger = area.getByRole('button', { name: title.slice(0, 256), exact: true }); await trigger.click()
      const info = area.getByTestId('world-info'), close = info.getByRole('button', { name: 'Cerrar información del mundo' })
      await expect(close).toBeFocused(); await expect(close).toBeInViewport({ ratio: 1 })
      expect(await area.evaluate(element => { for (let node: Element | null = element; node; node = node.parentElement) if (node.scrollWidth > node.clientWidth + 1) return false; return true })).toBe(true)
      await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
      await writeFile(testInfo.outputPath(`worlds-${theme}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
      await snap(launcher, `worlds-${theme}-${size[0]}`, 'Native world metadata, long names, keyboard focus and scrolling over the approved glass surfaces.')
      await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
    }
  }
  expect(errors).toEqual([])
})
