import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { writeFile } from 'node:fs/promises'
import axe from 'axe-core'
import { test, expect, snap, type LauncherFixture } from '../../helpers/scratch'

const url = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../../../xmcl-react-ui/dist/index.html')).href

async function openPrototype(launcher: LauncherFixture) {
  await expect(launcher.main.getByTestId('app-sidebar')).toBeVisible()
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(({ BrowserWindow, app }, url) => {
    const preload = `${app.getAppPath()}/index-preload.js`
    const win = new BrowserWindow({ width: 1200, height: 720, minWidth: 800, minHeight: 400, frame: false, webPreferences: { preload, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    void win.loadURL(url)
  }, url)
  const page = await opening
  await expect(page.getByTestId('react-prototype')).toBeVisible()
  expect(await page.evaluate(() => typeof window.windowController?.on)).toBe('function')
  const window = await launcher.app.browserWindow(page)
  await window.evaluate(win => win.focus())
  return { page, window }
}

test('React prototype: both appearances and supported sizes, navigation and automated accessibility', async ({ launcher }, testInfo) => {
  const { page, window } = await openPrototype(launcher)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.evaluate(axe.source)
  const reports: unknown[] = []
  const failures: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    if (appearance === 'light') await page.getByRole('button', { name: 'Usar apariencia clara' }).click()
    for (const width of [1200, 800]) {
      await window.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      for (const [id, section] of [['nav-home', 'home'], ['nav-library', 'library'], ['nav-store', 'catalog']] as const) {
        await page.getByTestId(id).click()
        await expect(page.locator('h1')).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.waitForFunction(() => [...document.images].filter(image => image.getBoundingClientRect().top < innerHeight && image.getBoundingClientRect().bottom > 0).every(image => image.complete && image.naturalWidth > 0))
        const name = `prototype-${appearance}-${width}-${section}`
        await snap({ ...launcher, main: page }, name, `Prototipo React, ${appearance}, ${width}px, ${section}; datos de ejemplo.`)
        await page.screenshot({ path: testInfo.outputPath(`${name}.png`) })
        const result = await page.evaluate(async () => {
          const { violations, incomplete } = await (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
          return { violations, incomplete }
        })
        reports.push({ appearance, width, section, ...result })
        failures.push(...result.violations.map((violation: any) => ({ appearance, width, section, id: violation.id, nodes: violation.nodes.map((node: any) => ({ target: node.target, summary: node.failureSummary })) })))
      }
    }
  }
  await writeFile(testInfo.outputPath('accessibility.json'), JSON.stringify(reports, null, 2), 'utf8')
  expect(failures).toEqual([])
  expect(errors).toEqual([])
})

test('React prototype: independent selection, filters, dialogue focus and actual video pause', async ({ launcher }) => {
  const { page, window } = await openPrototype(launcher)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const background = page.getByTestId('app-backdrop')
  const initialBackground = await background.evaluate(element => getComputedStyle(element).backgroundImage)
  expect(initialBackground).toContain('vanilla-shaders')
  await page.getByRole('button', { name: 'Siguiente instancia' }).click()
  await page.getByRole('button', { name: 'Siguiente instancia' }).click()
  await expect(page.locator('.featured h2')).toHaveText('Bajo la superficie')
  await expect(page.locator('.sidebar-instance strong')).toHaveText('Mi mundo')
  expect(await background.evaluate(element => getComputedStyle(element).backgroundImage)).not.toBe(initialBackground)
  await page.getByRole('button', { name: 'Reanudar presentación' }).click()
  await page.getByTestId('nav-home').focus()
  await page.mouse.move(70, 20)
  await window.evaluate(win => win.focus())
  await expect.poll(() => window.evaluate(win => win.isFocused())).toBe(true)
  const video = page.locator('video')
  await expect(video).toHaveAttribute('data-state', 'playing')
  await expect.poll(() => video.evaluate(video => video.currentTime)).toBeGreaterThan(0.1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(video).toHaveAttribute('data-state', 'paused')
  await expect.poll(() => video.evaluate(video => video.paused)).toBe(true)
  await page.evaluate(() => {
    const original = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      HTMLMediaElement.prototype.play = original
      ;(window as any).__interruptedPlayback = true
      return Promise.reject(new DOMException('Fixture playback interruption', 'AbortError'))
    }
  })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => page.evaluate(() => (window as any).__interruptedPlayback)).toBe(true)
  await expect(video).toHaveAttribute('data-state', 'playing')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(video).toHaveAttribute('data-state', 'paused')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(() => video.evaluate(video => video.paused)).toBe(false)
  await window.evaluate(win => win.minimize())
  await expect.poll(() => window.evaluate(win => win.isMinimized())).toBe(true)
  await expect(video).toHaveAttribute('data-state', 'paused')
  await expect.poll(() => video.evaluate(video => video.paused)).toBe(true)
  await window.evaluate(win => win.restore())
  await expect.poll(() => window.evaluate(win => win.isMinimized())).toBe(false)
  await window.evaluate(win => { win.show(); win.focus() })
  await expect.poll(() => window.evaluate(win => win.isFocused())).toBe(true)
  // Windows can restore the window underneath the physical pointer; re-establish no interaction.
  await page.mouse.move(70, 20)
  await expect.poll(async () => JSON.parse((await page.getByTestId('react-prototype').getAttribute('data-motion-state'))!).hovered).toBe(false)
  await expect(video).toHaveAttribute('data-state', 'playing')
  await expect.poll(() => video.evaluate(video => video.paused)).toBe(false)
  await page.getByTestId('featured-play').click()
  await expect(page.getByRole('dialog')).toContainText('Jugar: Bajo la superficie')
  await expect(page.locator('.sidebar-instance strong')).toHaveText('Bajo la superficie')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('featured-play')).toBeFocused()
  await page.getByTestId('nav-library').click()
  await page.getByLabel('Filtrar por loader').selectOption('Fabric')
  await expect(page.locator('.instance-card')).toHaveCount(1)
  await page.getByLabel('Buscar instancias').fill('inexistente')
  await expect(page.getByRole('heading', { name: 'No encontramos esa instancia' })).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click()
  await expect(page.locator('.instance-card')).toHaveCount(3)
  await page.getByRole('button', { name: 'Vista lista' }).click()
  await expect(page.locator('.instance-row')).toHaveCount(3)
  await window.evaluate(win => win.setContentSize(800, 400))
  await page.getByRole('button', { name: 'Créditos visuales' }).click()
  await expect(page.getByRole('dialog')).toContainText('downloadsource.fr')
  await expect(page.getByRole('button', { name: 'Entendido' })).toBeInViewport({ ratio: 1 })
  expect(await page.getByRole('button', { name: 'Entendido' }).evaluate(element => element.getBoundingClientRect().bottom <= innerHeight - 16)).toBe(true)
  await snap({ ...launcher, main: page }, 'prototype-800-credits', 'Créditos con fuentes, licencias y modificaciones; diálogo en el tamaño mínimo.')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Créditos visuales' })).toBeFocused()
  await page.getByTestId('nav-home').click()
  await expect(page.locator('.instance-row')).toHaveCount(0)
  await page.getByTestId('nav-store').click()
  await page.getByLabel('Buscar en el catálogo').fill('inexistente')
  await expect(page.getByRole('heading', { name: 'No encontramos ese contenido' })).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar búsqueda' }).click()
  await expect(page.locator('.project-card')).toHaveCount(3)
  await page.getByTestId('nav-settings').click()
  await page.getByRole('checkbox', { name: 'Modo rendimiento' }).check()
  await expect.poll(() => page.locator('.sidebar').evaluate(element => getComputedStyle(element).backdropFilter)).toBe('none')
  await page.getByRole('button', { name: 'Ver créditos', exact: true }).click()
  await expect.poll(() => page.getByRole('dialog').evaluate(element => getComputedStyle(element).backdropFilter)).toBe('none')
  await page.keyboard.press('Escape')
  await page.getByRole('checkbox', { name: 'Modo rendimiento' }).uncheck()
  await expect.poll(() => page.locator('.sidebar').evaluate(element => getComputedStyle(element).backdropFilter)).toBe('blur(18px)')
})
