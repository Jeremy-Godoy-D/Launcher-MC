import { writeFile } from 'node:fs/promises'
import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

test('selected React package boots all entries and decodes its shipped video', async ({
  launcher,
}, testInfo) => {
  const page = launcher.main
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await expect(page.getByTestId('react-prototype')).toBeVisible()
  await seedReactLibrary(page)
  await expect(page.locator('.featured h2')).toHaveText('Mi mundo')
  expect(page.url()).toMatch(/xmcl\.runtime\/index\.html/)
  await expect(page.getByTestId('app-backdrop')).toBeVisible()
  const main = await launcher.app.browserWindow(page)
  await main.evaluate(win => { win.show(); win.focus() })
  await expect.poll(() => main.evaluate(win => win.isFocused())).toBe(true)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const preferences = await main.evaluate((win) => {
    const prefs = win.webContents.getLastWebPreferences()
    return {
      contextIsolation: prefs.contextIsolation,
      sandbox: prefs.sandbox,
      nodeIntegration: prefs.nodeIntegration,
      webviewTag: prefs.webviewTag,
    }
  })
  expect(preferences).toEqual({ contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false })
  await snap(
    launcher,
    'react-package-home',
    'Renderer React desde el paquete Windows, instancias sintéticas del servicio real.',
  )
  await page.getByRole('button', { name: 'Siguiente instancia' }).click()
  await page.getByRole('button', { name: 'Siguiente instancia' }).click()
  await page.getByRole('button', { name: 'Reanudar presentación' }).click()
  await page.getByTestId('nav-home').focus()
  await page.mouse.move(70, 20)
  await main.evaluate(win => win.focus())
  await expect.poll(() => main.evaluate(win => win.isFocused())).toBe(true)
  await expect(page.locator('video')).toHaveAttribute('data-state', 'playing')
  await expect
    .poll(() => page.locator('video').evaluate((video) => video.currentTime))
    .toBeGreaterThan(0.1)
  for (const [entry, preload, id] of [
    ['logger', 'monitor', 'react-logger-window'],
    ['migration', 'migration', 'react-migration-window'],
  ] as const) {
    const opening = launcher.app.waitForEvent('window')
    await launcher.app.evaluate(
      async ({ BrowserWindow, app }, { entry, preload }) => {
        const win = new BrowserWindow({
          width: 600,
          height: 400,
          webPreferences: {
            preload: `${app.getAppPath()}/${preload}-preload.js`,
            contextIsolation: true,
            sandbox: true,
            nodeIntegration: false,
          },
        })
        await win.loadURL(
          new URL(`renderer/${entry}.html`, `file:///${app.getAppPath().replaceAll('\\', '/')}/`)
            .href,
        )
      },
      { entry, preload },
    )
    const auxiliary = await opening
    auxiliary.on('pageerror', (error) => errors.push(error.message))
    await expect(auxiliary.getByTestId(id)).toBeVisible()
    await snap(
      { ...launcher, main: auxiliary },
      `react-package-${entry}`,
      'Entrada React auxiliar de infraestructura, sin operaciones de datos.',
    )
    await auxiliary.close()
  }
  expect(errors).toEqual([])
  await writeFile(
    testInfo.outputPath('package-smoke.json'),
    JSON.stringify(
      {
        url: page.url(),
        preferences,
        entries: ['index', 'logger', 'migration'],
        videoDecoded: true,
        errors,
      },
      null,
      2,
    ),
    'utf8',
  )
})
