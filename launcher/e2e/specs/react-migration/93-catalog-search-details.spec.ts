import { writeFile } from 'node:fs/promises'
import axe from 'axe-core'
import { test as base, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { mockReactCatalog } from '../../helpers/react-catalog'
import { activateLauncherControl } from '../../helpers/focus-launcher'

const test = base.extend<{ catalog: Awaited<ReturnType<typeof mockReactCatalog>> }>({
  catalog: async ({ launcher }, use, info) => {
    const fixture = await mockReactCatalog(launcher), errors: string[] = []
    launcher.main.on('pageerror', error => errors.push(error.message))
    try { await use(fixture) } finally {
      await writeFile(info.outputPath('fixture-requests.json'), JSON.stringify({ ...fixture.state, rendererErrors: errors }, null, 2))
      await fixture.close(); expect(errors).toEqual([])
    }
  },
})

test.use({ launcherOptions: { locale: 'es-ES' } })

test('React searches both public sources with shareable filters, paging and no renderer credentials', async ({ launcher, catalog }, testInfo) => {
  const page = launcher.main; await seedReactLibrary(page)
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
  const requests = catalog.state.requests
  const cf = requests.map(request => new URL(request.url, 'http://fixture')).find(url => url.pathname === '/curseforge/v1/mods/search')!
  expect(cf.searchParams.get('gameVersion')).toBe('1.21.1'); expect(cf.searchParams.get('modLoaderType')).toBe('4')
  expect(requests.every(request => !request.key && !request.authorization && !request.cancellationId)).toBe(true)
  await area.getByTestId('catalog-source-modrinth').click(); await area.getByTestId('catalog-kind').selectOption('world')
  await expect(area.getByRole('status').filter({ hasText: 'Los mundos' })).toContainText('Los mundos están disponibles en CurseForge')
  await writeFile(testInfo.outputPath('catalog-requests.json'), JSON.stringify(requests, null, 2))
})

test('React cancels obsolete searches, keeps the healthy source and respects quota without request loops', async ({ launcher, catalog }) => {
  const page = launcher.main
  const state = catalog.state; state.mode = 'races'
  await page.getByTestId('nav-store').click(); const input = page.getByTestId('store-search')
  await input.fill('slow'); await input.press('Enter'); await expect.poll(() => state.slowStarted).toBe(true)
  await input.fill('current'); await input.press('Enter'); await expect.poll(() => state.slowAborted).toBe(true); state.release()
  await expect(page.locator('.project-card')).toContainText('current 1'); await expect(page.locator('.project-card')).not.toContainText('stale')
  await input.fill('quota'); await input.press('Enter'); await expect(page.getByRole('alert')).toContainText('límite de consultas')
  await page.getByRole('alert').getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('límite de consultas'); expect(state.requests.filter(request => request.url.includes('/modrinth/v2/search?query=quota')).length).toBe(1)
  await page.getByTestId('catalog-source-curseforge').click(); await expect(page.locator('.project-card')).toHaveCount(24)
  await page.getByTestId('catalog-source-modrinth').click(); await expect(page.getByRole('alert')).toContainText('límite de consultas'); expect(state.requests.filter(request => request.url.includes('/modrinth/v2/search?query=quota')).length).toBe(1)
})

test('React sanitizes provider HTML and Markdown and preserves result scroll, focus and history', async ({ launcher, catalog }, testInfo) => {
  const page = launcher.main; await seedReactLibrary(page)
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

test('React catalog and detail sheet stay accessible in both themes and supported window sizes', async ({ launcher, catalog }, testInfo) => {
  const page = launcher.main; await seedReactLibrary(page); const win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(theme)
    await page.getByTestId('nav-store').click()
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect(page.locator('.project-card')).toHaveCount(24)
      expect(await page.locator('.catalog-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(width === 800 ? 2 : 4)
      await page.getByTestId('catalog-results').evaluate(element => element.scrollIntoView({ block: 'start' }))
      await page.screenshot({ path: testInfo.outputPath(`catalog-results-${theme}-${width}.png`) })
      const trigger = page.locator('.project-card').first().getByRole('button', { name: 'Ver contenido', exact: true }); await trigger.scrollIntoViewIfNeeded(); await activateLauncherControl(launcher, trigger)
      const sheet = page.getByTestId('catalog-project'); await expect(page.getByTestId('catalog-description')).toContainText('Contenido seguro')
      await sheet.getByRole('button', { name: 'Versiones', exact: true }).click(); await expect(sheet.getByTestId('catalog-versions')).toContainText('Versión compatible 1.0')
      await expect(sheet.locator('footer').getByRole('button', { name: 'Cerrar ficha', exact: true })).toBeInViewport({ ratio: 1 })
      expect(await sheet.evaluate(element => element.getBoundingClientRect().bottom - element.querySelector('footer')!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(28)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source); const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); await writeFile(testInfo.outputPath(`catalog-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2)); await page.screenshot({ path: testInfo.outputPath(`catalog-${theme}-${width}.png`) })
      await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
    }
  }
})

test('React reports authorization, malformed data and invalid links without leaking remote errors', async ({ launcher, catalog }) => {
  const page = launcher.main; const state = catalog.state; state.mode = 'errors'
  const calls = () => state.requests.filter(request => request.url.startsWith('/modrinth/v2/search')).length
  await page.getByTestId('nav-store').click(); await expect(page.getByRole('alert')).toContainText('autorización o permisos'); expect(calls()).toBe(1)
  state.phase = 1; await page.getByRole('alert').getByRole('button').click(); await expect(page.getByRole('alert')).toContainText('Comprueba la conexión'); expect(calls()).toBe(2)
  state.phase = 2; await page.getByRole('alert').getByRole('button').click(); await expect(page.getByTestId('catalog')).toContainText('No encontramos ese contenido'); expect(calls()).toBe(3)
  await expect(page.locator('body')).not.toContainText('REMOTE_PRIVATE_ERROR')
  await page.evaluate(() => { location.hash = '/store/modrinth/invalid-path' }); await expect(page.getByTestId('catalog-project').getByRole('alert')).toContainText('No pudimos cargar')
  await page.keyboard.press('Escape'); await expect(page).toHaveURL(/#\/store$/)
})

test('React pauses uncached catalog searches offline and resumes once without installing content', async ({ launcher, catalog }) => {
  const page = launcher.main; await page.getByTestId('nav-store').click(); await expect(page.locator('.project-card')).toHaveCount(24)
  const before = catalog.state.requests.filter(request => request.url.includes('/v2/search')).length
  try {
    await page.context().setOffline(true)
    await page.getByTestId('store-search').fill('offline'); await page.getByTestId('store-search').press('Enter')
    await expect(page.getByTestId('catalog').getByRole('status')).toContainText('Sin conexión')
    expect(catalog.state.requests.filter(request => request.url.includes('/v2/search')).length).toBe(before)
  } finally { await page.context().setOffline(false) }
  await expect(page.locator('.project-card').first()).toContainText('offline 1')
  expect(catalog.state.requests.filter(request => request.url.includes('/v2/search')).length).toBe(before + 1)
})
