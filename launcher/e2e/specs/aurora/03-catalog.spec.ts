import { test, snap, expect } from '../../helpers/scratch'

test('catalog sheets preserve route query, sanitize HTML and support back navigation', async ({ launcher, shell }) => {
  await shell.waitReady()
  await shell.dismissTutorial()
  const errors: string[] = []
  launcher.main.on('console', message => { if (message.type() === 'error' && /TypeError|ReferenceError/.test(message.text())) errors.push(message.text()) })
  await launcher.main.evaluate(project => {
    // Electron's custom HTTPS protocol bypasses Playwright page.route().
    const original = window.fetch
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'api.modrinth.com' && url.pathname.startsWith('/v2/project/aurora-qa')) {
        return Response.json(url.pathname === '/v2/project/aurora-qa' ? project : [])
      }
      return original(input, init)
    }
  }, {
      id: 'aurora-qa', slug: 'aurora-qa', title: 'Aurora Catalog QA', project_type: 'modpack', description: 'Catalog regression fixture',
      body: '<h2>Safe description</h2><img src="data:image/png;base64,x" onerror="window.__catalogInjected=true"><a href="javascript:alert(1)">Unsafe link</a><style>body{display:none}</style>',
      license: { id: 'MIT', name: 'MIT' }, categories: [], additional_categories: [], gallery: [], versions: [], game_versions: ['1.20.4'], loaders: ['fabric'],
      downloads: 100, followers: 10, published: '2024-01-01T00:00:00Z', updated: '2024-01-01T00:00:00Z',
    })
  await shell.goto('/store?query=aurora')
  await launcher.main.evaluate(() => { location.hash = '/store/modrinth/aurora-qa?query=aurora' })
  const sheet = launcher.main.locator('.aurora-project-sheet')
  await expect(sheet.getByText('Safe description', { exact: true })).toBeVisible()
  expect(await sheet.locator('[onerror], a[href^="javascript:"], style').count()).toBe(0)
  expect(await launcher.main.evaluate(() => (window as any).__catalogInjected)).toBeUndefined()
  const win = await launcher.app.browserWindow(launcher.main)
  for (const width of [1200, 800]) {
    await win.evaluate((window, width) => window.setContentSize(width, width === 800 ? 400 : 720), width)
    await snap(launcher, 'catalog-sheet-' + width, 'Catalog project sheet and sanitized description.')
  }
  await sheet.getByRole('button', { name: 'Volver al catálogo', exact: true }).click()
  await expect(sheet).toBeHidden()
  expect(launcher.main.url()).toContain('/store?query=aurora')
  await launcher.main.goBack()
  await expect(sheet).toBeVisible()
  expect(errors).toEqual([])
})
