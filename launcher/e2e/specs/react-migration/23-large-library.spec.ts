import { test, expect, snap } from '../../helpers/scratch'
import axe from 'axe-core'
import { writeFile } from 'node:fs/promises'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('a thousand native instances stay windowed, searchable and keyboard accessible in both layouts and window sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByTestId('nav-library').click()
  const paths = await page.evaluate(async () => {
    const service = (window as any).serviceChannels.open('InstanceService'), paths: string[] = []
    for (let index = 0; index < 1000; index++) paths.push(await service.call('createInstance', { name: `Window ${String(index).padStart(4, '0')}`, runtime: { minecraft: '1.21.1', fabricLoader: index % 2 ? '0.16.0' : '' } }))
    return paths
  })
  const list = page.getByTestId('library-window'), cards = list.locator('.instance-card'), win = await launcher.app.browserWindow(page)
  await expect(list).toHaveAttribute('data-virtualized', 'true')
  await expect(page.locator('.library-count')).toHaveText('1000 instancias')
  await expect.poll(() => cards.count()).toBeLessThan(40)
  const first = page.getByRole('button', { name: 'Administrar Window 0000', exact: true })
  await first.focus(); await first.press('Home'); await first.press('Shift+Tab')
  await expect(page.getByLabel('Filtrar por grupo', { exact: true })).toBeFocused()
  await win.evaluate(win => win.setContentSize(800, 400))
  await expect(page.getByLabel('Filtrar por grupo', { exact: true })).toBeFocused()
  await win.evaluate(win => win.setContentSize(1200, 720))
  await first.focus(); await first.press('End')
  const last = page.getByRole('button', { name: 'Administrar Window 0999', exact: true })
  await expect(last).toBeFocused(); await expect(last).toBeInViewport({ ratio: 1 })
  await expect(list.getByRole('listitem').filter({ has: last })).toHaveAttribute('aria-posinset', '1000')
  await last.press('Home'); await expect(first).toBeFocused()
  await page.locator('.page-scroll').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(last).toBeInViewport({ ratio: 1 }); await expect(first).toBeFocused()
  await page.keyboard.press('Home'); await expect(first).toBeInViewport({ ratio: 1 })
  await first.press('ArrowDown'); await expect(page.getByRole('button', { name: 'Administrar Window 0003', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Administrar Window 0003', exact: true }).press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Administrar Window 0002', exact: true })).toBeFocused()
  const options = page.getByRole('button', { name: 'Opciones de Window 0002', exact: true })
  await options.focus(); await options.press('Tab')
  await expect(page.getByRole('button', { name: 'Administrar Window 0003', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab'); await expect(options).toBeFocused()
  await options.press('Shift+F10'); await expect(page.getByTestId('instance-operations')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(options).toBeFocused()
  await page.locator('.page-scroll').evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(last).toBeInViewport({ ratio: 1 }); await expect(options).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Administrar Window 0003', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Administrar Window 0003', exact: true })).toBeInViewport({ ratio: 1 })
  await page.getByLabel('Buscar instancias', { exact: true }).fill('Window 0999')
  await expect(cards).toHaveCount(1); await expect(list).toHaveAttribute('data-virtualized', 'false')
  await page.getByRole('button', { name: 'Administrar Window 0999', exact: true }).click()
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[999])
  await page.getByTestId('nav-library').click()
  await page.getByLabel('Filtrar por loader', { exact: true }).selectOption('Fabric')
  await expect(page.locator('.library-count')).toHaveText('500 instancias')
  await page.getByLabel('Filtrar por loader', { exact: true }).selectOption('')
  const reports: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await page.getByTestId('nav-library').click()
    for (const view of ['Vista cuadrícula', 'Vista lista']) {
    await page.getByRole('button', { name: view, exact: true }).click()
    await first.focus(); await first.press('End')
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect(last).toBeFocused(); await expect(last).toBeInViewport({ ratio: 1 })
      await expect(page.getByRole('button', { name: 'Opciones de Window 0999', exact: true })).toBeInViewport({ ratio: 1 })
      await expect.poll(() => cards.count()).toBeLessThan(40)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); reports.push({ appearance, view, width, ...report })
      await snap(launcher, `large-library-${appearance}-${view === 'Vista lista' ? 'list' : 'grid'}-${width}`, 'Biblioteca real de1000 instancias: última tarjeta alcanzable por teclado, acciones completas y DOM acotado.')
    }
    await last.press('Home'); await expect(first).toBeFocused()
    }
  }
  await writeFile(testInfo.outputPath('large-library-accessibility.json'), JSON.stringify(reports, null, 2))
  await page.getByLabel('Buscar instancias', { exact: true }).fill('missing-instance')
  await expect(cards).toHaveCount(0); await expect(page.getByRole('heading', { name: 'No encontramos esa instancia' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Vista lista', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[999])
  await expect(list).toHaveAttribute('data-virtualized', 'true')
  expect(errors).toEqual([])
})
