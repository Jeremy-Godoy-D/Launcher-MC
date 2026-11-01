import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { focusLauncher } from '../../helpers/focus-launcher'
import { readTextContrast } from '../../helpers/contrast'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function openConsole(page: Page) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByTestId('instance-workspace').getByLabel('Secciones de la instancia').getByRole('link', { name: 'Consola', exact: true }).click()
  return page.getByTestId('instance-console')
}

test('bounded file view virtualizes rows, preserves the original and pauses following during manual reading', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const content = Array.from({ length: 20000 }, (_, index) => `[12:00:00] [main/INFO]: row-${String(index).padStart(6, '0')}`).join('\n')
  await mkdir(join(path, 'logs')); await writeFile(join(path, 'logs/many.log'), content)
  const console = await openConsole(page)
  await console.getByTestId('console-file-select').selectOption({ label: 'many.log' })
  await expect(console.locator('.console-statusbar')).toContainText('10000 líneas')
  await expect(console.getByRole('status')).toContainText('Vista limitada')
  const entries = console.getByTestId('console-entry'), viewport = console.getByTestId('console-entries')
  await expect.poll(() => entries.count()).toBeGreaterThan(0)
  expect(await entries.count()).toBeLessThan(100)
  await viewport.focus(); await page.keyboard.press('Home')
  await expect(entries.filter({ hasText: 'row-000000' })).toBeVisible()
  await expect(console.getByTestId('console-autoscroll')).not.toBeChecked()
  await page.keyboard.press('End')
  await expect(entries.filter({ hasText: 'row-009999' })).toBeVisible()
  await console.getByTestId('console-search').fill('row-009999')
  await expect(entries).toHaveCount(1)
  await console.getByTestId('console-search').fill('row-015000')
  await expect(console.getByTestId('console-empty')).toContainText('No se encontraron')
  await expect(console.getByRole('status')).toContainText('Vista limitada')
  expect(await readFile(join(path, 'logs/many.log'), 'utf8')).toBe(content)
  await console.getByTestId('console-search').fill('')
  await snap(launcher, 'console-bounded-file', 'La vista limita y virtualiza el registro; el archivo completo se conserva.')
})

test('log and crash selections with identical names remain distinct and oversized lines have a visible limit', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  await mkdir(join(path, 'logs')); await mkdir(join(path, 'crash-reports'))
  await writeFile(join(path, 'logs/same.txt'), 'CLIENT_VIEW'); await writeFile(join(path, 'crash-reports/same.txt'), 'CRASH_VIEW')
  const long = 'x'.repeat(16383) + '🧙' + 'y'.repeat(50000)
  const longName = `long-${'x'.repeat(160)}.log`
  await writeFile(join(path, 'logs', longName), 'LONG_NAME_VIEW')
  await writeFile(join(path, 'logs/long.log'), long)
  const console = await openConsole(page), source = console.getByTestId('console-file-select')
  await source.selectOption('log:same.txt'); await expect(console.getByTestId('console-entry')).toContainText('CLIENT_VIEW')
  await source.selectOption('crash:same.txt'); await expect(console.getByTestId('console-entry')).toContainText('CRASH_VIEW')
  await source.selectOption('log:long.log')
  await expect(console.getByRole('status')).toContainText('Vista limitada')
  expect(await console.locator('.console-text').textContent()).toBe('x'.repeat(16383))
  expect(await readFile(join(path, 'logs/long.log'), 'utf8')).toBe(long)
  await source.selectOption(`log:${longName}`)
  await expect(console.getByTestId('console-entry')).toContainText('LONG_NAME_VIEW')
  const win = await launcher.app.browserWindow(page)
  for (const width of [1200, 800]) {
    await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    await expect.poll(() => console.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  }
})

test('virtual console measures wrapped rows at both themes and supported native window sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const content = Array.from({ length: 240 }, (_, index) => `[12:00:00] [main/${['INFO', 'WARN', 'ERROR', 'DEBUG'][index % 4]}]: wrapped-${index} ${'text '.repeat(index % 2 ? 1 : 45)}`).join('\n')
  await mkdir(join(path, 'logs')); await writeFile(join(path, 'logs/wrapped.log'), content)
  const console = await openConsole(page), win = await launcher.app.browserWindow(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), appearance: theme })) }, theme)
    await page.reload(); await console.getByTestId('console-file-select').selectOption('log:wrapped.log')
    await expect(console.locator('.console-statusbar')).toContainText('240 líneas')
    for (const width of [1200, 800]) {
      const height = width === 800 ? 400 : 720
      await win.evaluate((win, size) => win.setContentSize(size.width, size.height), { width, height })
      await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
      expect(await page.locator('.app').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ')[0])).toBe(width === 800 ? '72px' : '224px')
      const viewport = console.getByTestId('console-entries'), entries = console.getByTestId('console-entry')
      await focusLauncher(launcher)
      await viewport.focus(); await page.keyboard.press('Home')
      await viewport.scrollIntoViewIfNeeded()
      await writeFile(testInfo.outputPath(`console-layout-${theme}-${width}.json`), JSON.stringify(await viewport.evaluate(element => {
        const layout = []
        for (let node: HTMLElement | null = element; node; node = node.parentElement) {
          const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
          layout.push({ tag: node.tagName, class: node.className, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop, overflow: style.overflow, scrollPadding: style.scrollPadding, flex: style.flex })
        }
        return layout
      }), null, 2))
      await expect(viewport).toBeInViewport({ ratio: 1 })
      await expect(entries.filter({ hasText: 'wrapped-0 ' })).toBeInViewport()
      await page.keyboard.press('End'); await expect(entries.filter({ hasText: 'wrapped-239 ' })).toBeInViewport()
      await page.mouse.move(1, 1)
      const normal = await page.evaluate(readTextContrast, '[data-testid="console-entries"] .console-level')
      const errorRow = entries.filter({ hasText: 'wrapped-238 ' })
      await errorRow.hover(); expect(await errorRow.evaluate(element => element.matches(':hover'))).toBe(true)
      const hover = await page.evaluate(readTextContrast, '[data-testid="console-entries"] .console-level')
      await writeFile(testInfo.outputPath(`console-contrast-${theme}-${width}.json`), JSON.stringify({ normal, hover }, null, 2))
      expect(Math.min(...normal.map(value => value.ratio))).toBeGreaterThanOrEqual(4.5)
      expect(Math.min(...hover.map(value => value.ratio))).toBeGreaterThanOrEqual(4.5)
      expect(await entries.count()).toBeLessThan(100)
      expect(await viewport.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(testInfo.outputPath(`console-virtual-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])
      await snap(launcher, `console-virtual-${theme}-${width}`, 'Filas medidas y desplazamiento al final con el tamaño nativo de la ventana.')
    }
  }
})
