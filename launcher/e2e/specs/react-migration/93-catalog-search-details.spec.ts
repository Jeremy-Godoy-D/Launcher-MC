import { writeFile } from 'node:fs/promises'
import axe from 'axe-core'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { mockReactCatalog, modrinthHit } from '../../helpers/react-catalog'
import { activateLauncherControl } from '../../helpers/focus-launcher'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('React searches both public sources with shareable filters, paging and no renderer credentials', async ({ launcher }, testInfo) => {
  const page = launcher.main; await seedReactLibrary(page); await mockReactCatalog(page)
  const requests: { url: string; key: boolean; authorization: boolean }[] = []
  page.on('request', request => { if (/api\.(modrinth|curseforge)\.com/.test(request.url())) requests.push({ url: request.url(), key: !!request.headers()['x-api-key'], authorization: !!request.headers().authorization }) })
  await page.getByTestId('nav-store').click(); const area = page.getByTestId('catalog')
  await expect(area.locator('.project-card')).toHaveCount(24)
  await area.getByRole('button', { name: 'Filtros', exact: true }).click()
  await area.getByTestId('catalog-kind').selectOption('mod'); await area.getByTestId('catalog-loader').selectOption('fabric'); await area.getByTestId('catalog-minecraft').fill('1.21.1')
  await area.getByTestId('store-search').fill('rendimiento'); await area.getByTestId('store-search').press('Enter')
  await expect(area.locator('.project-card').first()).toContainText('rendimiento 1'); await expect(page).toHaveURL(/q=rendimiento/)
  await area.getByRole('navigation', { name: 'Páginas de resultados' }).getByRole('button', { name: 'Siguiente', exact: true }).click()
  await expect(area.locator('.project-card').first()).toHaveAttribute('data-project-id', 'AAAA0025')
  await expect(page).toHaveURL(/page=1/)
  await area.getByTestId('catalog-source-curseforge').click(); await expect(area.locator('.project-card').first()).toContainText('Proyecto CurseForge 1')
  await expect(page).not.toHaveURL(/page=1/)
  const cf = requests.map(request => new URL(request.url)).find(url => url.host === 'api.curseforge.com' && url.pathname === '/v1/mods/search')!
  expect(cf.searchParams.get('gameVersion')).toBe('1.21.1'); expect(cf.searchParams.get('modLoaderType')).toBe('4')
  expect(requests.every(request => !request.key && !request.authorization)).toBe(true)
  await area.getByTestId('catalog-source-modrinth').click(); await area.getByTestId('catalog-kind').selectOption('world')
  await expect(area.getByRole('status')).toContainText('Los mundos están disponibles en CurseForge')
  await writeFile(testInfo.outputPath('catalog-requests.json'), JSON.stringify(requests, null, 2))
})

test('React cancels obsolete searches, keeps the healthy source and respects quota without request loops', async ({ launcher }) => {
  const page = launcher.main; await mockReactCatalog(page)
  let release: (() => void) | undefined, started = false, limited = 0
  await page.route(/api\.modrinth\.com\/v2\/search/, async route => {
    const query = new URL(route.request().url()).searchParams.get('query')
    if (query === 'slow') { started = true; await new Promise<void>(resolve => { release = resolve }); await route.fulfill({ json: { hits: [modrinthHit(1, 'mod', 'stale')], total_hits: 1 } }).catch(() => {}); return }
    if (query === 'quota') { limited++; await route.fulfill({ status: 429, headers: { 'retry-after': '120' }, json: {} }); return }
    await route.fulfill({ json: { hits: [modrinthHit(1, 'mod', query || 'initial')], total_hits: 1 } })
  })
  await page.getByTestId('nav-store').click(); const input = page.getByTestId('store-search')
  await input.fill('slow'); await input.press('Enter'); await expect.poll(() => started).toBe(true)
  await input.fill('current'); await input.press('Enter'); release?.()
  await expect(page.locator('.project-card')).toContainText('current 1'); await expect(page.locator('.project-card')).not.toContainText('stale')
  await input.fill('quota'); await input.press('Enter'); await expect(page.getByRole('alert')).toContainText('límite de consultas')
  await page.getByRole('alert').getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('límite de consultas'); expect(limited).toBe(1)
  await page.getByTestId('catalog-source-curseforge').click(); await expect(page.locator('.project-card')).toHaveCount(24)
  await page.getByTestId('catalog-source-modrinth').click(); await expect(page.getByRole('alert')).toContainText('límite de consultas'); expect(limited).toBe(1)
})

test('React sanitizes provider HTML and Markdown and preserves result scroll, focus and history', async ({ launcher }, testInfo) => {
  const page = launcher.main; await seedReactLibrary(page); await mockReactCatalog(page)
  await page.getByTestId('nav-store').click(); const trigger = page.locator('.project-card').last().getByRole('button', { name: 'Ver contenido', exact: true })
  await trigger.scrollIntoViewIfNeeded(); const previous = await page.locator('.page-scroll').evaluate(element => element.scrollTop)
  await activateLauncherControl(launcher, trigger)
  const sheet = page.getByTestId('catalog-project'), html = page.getByTestId('catalog-description')
  await expect(html).toContainText('Markdown seguro'); await expect(page).toHaveURL(/\/store\/modrinth\/AAAA0024/)
  const inspect = async () => {
    const report = await html.evaluate(element => ({ unsafe: element.querySelectorAll('script,iframe,svg,form,input,style,[onerror],[onload],[style],img[src^="data:"],a[href^="javascript:"],a[href^="file:"]').length, executed: (window as any).__catalogPwned, links: Array.from(element.querySelectorAll('a[href]')).map(link => ({ href: link.getAttribute('href'), target: link.getAttribute('target'), rel: link.getAttribute('rel') })) }))
    expect(report.unsafe).toBe(0); expect(report.executed).toBeUndefined(); expect(report.links.every(link => link.target === '_blank' && link.rel?.includes('noopener'))).toBe(true)
    return report
  }
  const markdown = await inspect()
  await sheet.getByRole('button', { name: 'Galería', exact: true }).click(); await expect(sheet.locator('.catalog-gallery img')).toHaveCount(1)
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click(); await sheet.getByLabel('Instancia para comprobar compatibilidad').selectOption({ label: 'Fabric QA · 1.21.1' })
  await expect(sheet.getByTestId('catalog-versions')).toContainText('Versión compatible 1.0')
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0); await expect(trigger).toBeFocused()
  expect(await page.locator('.page-scroll').evaluate(element => element.scrollTop)).toBeCloseTo(previous, 0)
  await page.evaluate(() => history.forward()); await expect(sheet).toBeVisible(); await page.evaluate(() => history.back()); await expect(sheet).toHaveCount(0)
  await page.getByTestId('catalog-source-curseforge').click(); await page.locator('.project-card').first().getByRole('button', { name: 'Ver contenido', exact: true }).click()
  await expect(html).toContainText('Contenido seguro'); const htmlReport = await inspect()
  await page.reload(); await expect(page.getByTestId('catalog-project')).toBeVisible(); await expect(html).toContainText('Contenido seguro')
  await page.keyboard.press('Escape'); await expect(page.getByTestId('catalog')).toBeVisible()
  await writeFile(testInfo.outputPath('rich-content-security.json'), JSON.stringify({ markdown, html: htmlReport, scrollRestored: true, deepLinkReload: true }, null, 2))
})

test('React catalog and detail sheet stay accessible in both themes and supported window sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main; await seedReactLibrary(page); await mockReactCatalog(page); const win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(theme)
    await page.getByTestId('nav-store').click()
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect(page.locator('.project-card')).toHaveCount(24)
      expect(await page.locator('.catalog-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(width === 800 ? 2 : 4)
      const trigger = page.locator('.project-card').first().getByRole('button', { name: 'Ver contenido', exact: true }); await activateLauncherControl(launcher, trigger)
      const sheet = page.getByTestId('catalog-project'); await expect(page.getByTestId('catalog-description')).toContainText('Contenido seguro')
      await sheet.getByRole('button', { name: 'Versiones', exact: true }).click(); await expect(sheet.getByTestId('catalog-versions')).toContainText('Versión compatible 1.0')
      await expect(sheet.locator('footer').getByRole('button', { name: 'Cerrar ficha', exact: true })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source); const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); await writeFile(testInfo.outputPath(`catalog-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2)); await page.screenshot({ path: testInfo.outputPath(`catalog-${theme}-${width}.png`) })
      await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
    }
  }
})

test('React reports authorization, malformed data and invalid links without leaking remote errors', async ({ launcher }) => {
  const page = launcher.main; await mockReactCatalog(page); let phase = 0, calls = 0
  await page.route(/api\.modrinth\.com\/v2\/search/, route => { calls++; return phase === 0 ? route.fulfill({ status: 403, json: { secret: 'REMOTE_PRIVATE_ERROR' } }) : phase === 1 ? route.fulfill({ json: { hits: {}, total_hits: 1 } }) : route.fulfill({ json: { hits: [], total_hits: 0 } }) })
  await page.getByTestId('nav-store').click(); await expect(page.getByRole('alert')).toContainText('autorización o permisos'); expect(calls).toBe(1)
  phase = 1; await page.getByRole('alert').getByRole('button').click(); await expect(page.getByRole('alert')).toContainText('Comprueba la conexión'); expect(calls).toBe(2)
  phase = 2; await page.getByRole('alert').getByRole('button').click(); await expect(page.getByTestId('catalog')).toContainText('No encontramos ese contenido'); expect(calls).toBe(3)
  await expect(page.locator('body')).not.toContainText('REMOTE_PRIVATE_ERROR')
  await page.evaluate(() => { location.hash = '/store/modrinth/invalid-path' }); await expect(page.getByTestId('catalog-project').getByRole('alert')).toContainText('No pudimos cargar')
  await page.keyboard.press('Escape'); await expect(page).toHaveURL(/#\/store$/)
})
