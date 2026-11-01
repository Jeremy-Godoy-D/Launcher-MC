import { mkdir, truncate, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import axe from 'axe-core'
import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { focusLauncher } from '../../helpers/focus-launcher'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function openConsole(page: Page) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByTestId('instance-workspace').getByLabel('Secciones de la instancia').getByRole('link', { name: 'Consola', exact: true }).click()
  return page.getByTestId('instance-console')
}

test('stored log read failures stay visible and Refresh retries the same file after recovery', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  await mkdir(join(path, 'logs')); await writeFile(join(path, 'logs/broken.gz'), 'not gzip')
  const console = await openConsole(page)
  await console.getByTestId('console-file-select').selectOption('log:broken.gz')
  await expect(console.getByRole('alert')).toContainText('No se pudo acceder')
  await expect(console.getByTestId('console-entry')).toHaveCount(0)
  await expect(console.getByTestId('console-copy')).toBeDisabled()
  await snap(launcher, 'console-corrupt-log', 'El archivo corrupto muestra un error recuperable.')
  await writeFile(join(path, 'logs/broken.gz'), gzipSync('[12:00:00] [main/INFO]: Recuperado'))
  await console.getByTestId('console-refresh').click()
  await expect(console.getByRole('alert')).toHaveCount(0)
  await expect(console.getByTestId('console-entry')).toContainText('Recuperado')
  await snap(launcher, 'console-recovered-log', 'Actualizar vuelve a leer el mismo archivo y muestra su contenido.')
  await writeFile(join(path, 'logs/large.log'), ''); await truncate(join(path, 'logs/large.log'), 16 * 1024 * 1024 + 1)
  await console.getByTestId('console-refresh').click()
  await console.getByTestId('console-file-select').selectOption('log:large.log')
  await expect(console.getByRole('alert')).toContainText('16 MiB')
  await expect(console.getByTestId('console-show-file')).toBeEnabled()
})

test('console file errors remain accessible in both themes and supported window sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  await mkdir(join(path, 'logs')); await writeFile(join(path, 'logs/broken.gz'), 'not gzip')
  const console = await openConsole(page), win = await launcher.app.browserWindow(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), appearance: theme })) }, theme)
    await page.reload()
    await console.getByTestId('console-file-select').selectOption('log:broken.gz')
    await expect(console.getByRole('alert')).toBeVisible()
    for (const width of [1200, 800]) {
      const height = width === 800 ? 400 : 720
      await win.evaluate((win, { width, height }) => win.setContentSize(width, height), { width, height })
      await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height])
      expect(await console.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await focusLauncher(launcher); await console.getByTestId('console-open-window').focus(); await page.keyboard.press('Tab')
      await expect(console.getByTestId('console-refresh')).toBeFocused()
      await expect(console.getByTestId('console-refresh')).toBeInViewport({ ratio: 1 })
      await console.getByRole('alert').scrollIntoViewIfNeeded()
      await expect(console.getByRole('alert')).toBeInViewport({ ratio: 1 })
      await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(testInfo.outputPath(`console-errors-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])
      await snap(launcher, `console-error-${theme}-${width}`, 'Error de lectura visible y accesible con el tamaño real de ventana.')
    }
  }
})
