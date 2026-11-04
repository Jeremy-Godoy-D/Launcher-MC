import { writeFile } from 'node:fs/promises'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { focusLauncher } from '../../helpers/focus-launcher'

test.use({ launcherOptions: { locale: 'es-ES' } })
test('shell supports skip navigation, history keys, Native controls and RTL geometry', async ({ launcher }, info) => {
  const page = launcher.main, win = await launcher.app.browserWindow(page), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message)); await focusLauncher(launcher)
  await page.keyboard.press('Tab'); await expect(page.getByRole('link', { name: 'Saltar al contenido', exact: true })).toBeFocused()
  await page.keyboard.press('Enter'); await expect(page.locator('#launcher-content')).toBeFocused()
  await page.getByTestId('nav-library').click(); await page.getByTestId('nav-settings').click()
  await page.keyboard.press('Alt+ArrowLeft'); await expect(page).toHaveURL(/#\/me$/)
  await page.keyboard.press('Alt+ArrowRight'); await expect(page).toHaveURL(/#\/setting$/)
  await page.getByRole('button', { name: 'Atrás', exact: true }).click(); await expect(page).toHaveURL(/#\/me$/)
  await page.getByRole('button', { name: 'Adelante', exact: true }).click(); await expect(page).toHaveURL(/#\/setting$/)
  await page.getByRole('button', { name: 'Maximizar', exact: true }).click(); await expect.poll(() => win.evaluate(win => win.isMaximized())).toBe(true)
  await page.getByRole('button', { name: 'Maximizar', exact: true }).click(); await expect.poll(() => win.evaluate(win => win.isMaximized())).toBe(false)
  await page.getByRole('button', { name: 'Minimizar', exact: true }).click(); await expect.poll(() => win.evaluate(win => win.isMinimized())).toBe(true)
  await win.evaluate(win => { win.restore(); win.show(); win.focus() })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [1200, 800]) {
    await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    await page.getByLabel('Apariencia', { exact: true }).selectOption(width === 1200 ? 'dark' : 'light')
    await page.evaluate(() => { document.documentElement.dir = 'rtl' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByTestId('nav-library')).toBeInViewport({ ratio: 1 })
    await page.evaluate(axe.source)
    const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    await writeFile(info.outputPath(`shell-rtl-${width}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
    await snap(launcher, `shell-rtl-${width}`, 'Geometría RTL y contraste con movimiento reducido; se usan traducciones existentes, sin inventar un idioma nuevo.')
    await page.evaluate(() => { document.documentElement.dir = 'ltr' })
  }
  expect(errors).toEqual([])
})
