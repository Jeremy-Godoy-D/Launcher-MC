import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import type { LauncherFixture } from '../../fixtures/launcher'

test.use({ launcherOptions: { locale: 'es-ES' } })

async function seedCovers(launcher: LauncherFixture) {
  const paths = await seedReactLibrary(launcher.main)
  const cache = join(launcher.appDataPath, 'LauncherMC', 'presentation-cache-v1')
  await mkdir(cache, { recursive: true })
  const urls: string[] = []
  for (const [index, id, file] of [[0, 'abcdefgh', 'vanilla-ocean.webp'], [1, 'ijklmnop', 'vanilla-caves.webp']] as const) {
    const bytes = await readFile(resolve('../xmcl-react-ui/src/assets/ambient', file))
    const key = createHash('sha256').update(`modrinth:${id}`).digest('hex')
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const sourceUrl = `https://cdn.modrinth.com/data/${id}/images/fixture.webp`
    await writeFile(join(cache, `${key}.img`), bytes)
    await writeFile(join(cache, `${key}.json`), JSON.stringify({ sourceUrl, sha256, fetchedAt: Date.now() }))
    urls.push(sourceUrl)
    await launcher.main.evaluate(async ({ path, id }: { path: string; id: string }) => (window as any).serviceChannels.open('InstanceService').call('editInstance', {
      instancePath: path, upstream: { type: 'modrinth-modpack', projectId: id, versionId: 'qa' },
    }), { path: paths[index], id })
  }
  await launcher.main.reload()
  return { paths, cache, urls }
}

test('native cached provider covers survive reload, preserve identity and remain usable at both sizes and themes', async ({ launcher }, testInfo) => {
  const page = launcher.main, { paths, cache, urls } = await seedCovers(launcher)
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const backdrop = page.getByTestId('app-backdrop')
  await expect(backdrop).toHaveAttribute('data-media-provider', 'modrinth')
  await expect(page.getByTestId('featured-project-cover')).toHaveAttribute('src', /\/media\?path=/)
  await expect(page.locator('.featured').getByText('Ambiente Vanilla genérico; no representa este modpack.', { exact: true })).toBeVisible()
  await expect.poll(() => page.locator('.ambient img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 100)).toBe(true)
  expect(await page.locator('.ambient img').getAttribute('src')).toContain('/media?path=')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[0])
  const win = await launcher.app.browserWindow(page), reports: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await page.getByTestId('nav-home').click()
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect(page.getByTestId('featured-play')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); reports.push(report)
      await snap(launcher, `provider-cover-${appearance}-${width}`, 'Portada de proveedor en caché nativa. Metadatos sintéticos; imagen de fixture empaquetada, sin consulta pública.')
    }
  }
  await writeFile(testInfo.outputPath('provider-cover-accessibility.json'), JSON.stringify(reports))
  await page.getByRole('button', { name: 'Créditos visuales', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Ver proyecto', exact: true })).toHaveAttribute('href', 'https://modrinth.com/modpack/abcdefgh')
  await expect(page.getByRole('link', { name: 'Ver imagen original', exact: true })).toHaveAttribute('href', urls[0])
  await page.keyboard.press('Escape')
  const next = page.getByRole('button', { name: 'Siguiente instancia', exact: true })
  await next.focus(); await next.press('Enter')
  await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  await expect(backdrop).toHaveAttribute('data-media-provider', 'modrinth')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[0])
  const second = await page.locator('.ambient img').getAttribute('src')
  await page.reload(); await expect(page.locator('.featured h2')).toHaveText('Mi mundo')
  await expect(backdrop).toHaveAttribute('data-media-provider', 'modrinth')
  expect(await page.locator('.ambient img').getAttribute('src')).not.toBe(second)
  const marker = join(cache, 'preserve-user-file.txt'); await writeFile(marker, 'KEEP')
  await page.evaluate(async () => (window as any).serviceChannels.open('PresentationService').call('clearCache'))
  expect(await readdir(cache)).toEqual(['preserve-user-file.txt'])
  expect(await readFile(marker, 'utf8')).toBe('KEEP')
  await expect(page.getByTestId('featured-play')).toBeEnabled()
  expect(errors).toEqual([])
})

test('a delayed native cover cannot replace another featured instance or persist carousel selection', async ({ launcher }) => {
  const page = launcher.main, { paths } = await seedCovers(launcher)
  await launcher.app.evaluate(({ ipcMain }, delayedPath) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call')
    ;(globalThis as any).__pendingCovers = []
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event, service, method, ...args) => {
      const result = await original(event, service, method, ...args)
      if (service === 'PresentationService' && method === 'resolveInstanceMedia' && args[0] === delayedPath) {
        return new Promise(resolve => (globalThis as any).__pendingCovers.push(() => resolve(result)))
      }
      return result
    })
  }, paths[0])
  await page.reload()
  await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__pendingCovers.length)).toBeGreaterThan(0)
  const next = page.getByRole('button', { name: 'Siguiente instancia', exact: true }); await next.focus(); await next.press('Enter')
  await expect(page.locator('.featured h2')).toHaveText('Fabric QA')
  await expect(page.getByTestId('app-backdrop')).toHaveAttribute('data-media-provider', 'modrinth')
  const image = await page.locator('.ambient img').getAttribute('src')
  await launcher.app.evaluate(() => { for (const release of (globalThis as any).__pendingCovers.splice(0)) release() })
  // A later IPC reply and paint flush the released response before checking its owner.
  await page.evaluate(async path => {
    await (window as any).serviceChannels.open('PresentationService').call('resolveInstanceMedia', path)
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
  }, paths[1])
  await expect(page.locator('.ambient img')).toHaveAttribute('src', image!)
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[0])
})

test('an undecodable cached cover falls back to a labelled Vanilla poster without blocking launch controls', async ({ launcher }) => {
  const page = launcher.main, { cache, paths } = await seedCovers(launcher)
  const key = createHash('sha256').update('modrinth:abcdefgh').digest('hex')
  // Valid PNG signature/IHDR, deliberately missing image data: sniffing is not a full decoder.
  const bytes = (await readFile(resolve('../xmcl-keystone-ui/src/assets/steve_skin.png'))).subarray(0, 33)
  await writeFile(join(cache, `${key}.img`), bytes)
  const path = join(cache, `${key}.json`), record = JSON.parse(await readFile(path, 'utf8'))
  record.sha256 = createHash('sha256').update(bytes).digest('hex')
  await writeFile(path, JSON.stringify(record))
  expect(await page.evaluate(async path => (window as any).serviceChannels.open('PresentationService').call('resolveInstanceMedia', path), paths[0])).toMatchObject({ provider: 'modrinth' })
  await page.reload()
  await expect(page.locator('.featured').getByText('Ambiente Vanilla genérico; no representa este modpack.', { exact: true })).toBeVisible()
  await expect.poll(() => page.locator('.ambient img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 100)).toBe(true)
  await expect(page.getByTestId('app-backdrop')).not.toHaveAttribute('data-media-provider')
  await expect(page.getByTestId('featured-play')).toBeEnabled()
})
