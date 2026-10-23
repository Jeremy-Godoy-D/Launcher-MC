import { test, expect, snap } from '../../helpers/scratch'
import { readTextContrast } from '../../helpers/contrast'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('catalog reports provider failures, retries and avoids disabled sources', async ({ launcher, shell }) => {
  const errors: string[] = []
  launcher.main.on('pageerror', error => errors.push(error.message))
  await shell.dismissTutorial()
  await launcher.main.evaluate(() => {
    const original = window.fetch
    const state = { failCurseforge: true, failModrinth: false, requests: [] as string[] }
    ;(window as any).__catalogNetwork = state
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      if (url.hostname === 'api.modrinth.com' && url.pathname === '/v2/search') {
        state.requests.push('modrinth:' + url.searchParams.get('query'))
        if (state.failModrinth) return Response.json({ error: 'unavailable' }, { status: 503 })
        return Response.json({ hits: [{ project_id: 'aurora-network', project_type: 'modpack', title: 'QA Disponible', description: 'Provider fixture', author: 'QA', categories: [], versions: ['1.20.4'], downloads: 10, follows: 1, gallery: [], icon_url: '', date_created: '2024-01-01', date_modified: '2024-01-01' }], offset: 0, limit: 20, total_hits: 1 })
      }
      if (url.hostname === 'api.curseforge.com' && url.pathname === '/v1/mods/search') {
        state.requests.push('curseforge:' + url.searchParams.get('searchFilter'))
        return state.failCurseforge ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ data: [], pagination: { index: 0, pageSize: 20, resultCount: 0, totalCount: 0 } })
      }
      return original(input, init)
    }
  })
  await shell.goto('/store?query=aurora-network')
  await expect(launcher.main.getByText('QA Disponible', { exact: true })).toBeVisible()
  await expect(launcher.main.getByTestId('store-source-error-curseforge')).toBeVisible()
  const win = await launcher.app.browserWindow(launcher.main)
  for (const width of [1200, 800]) {
    await win.evaluate((window, width) => window.setContentSize(width, width === 800 ? 400 : 720), width)
    await snap(launcher, 'partial-provider-failure-' + width, 'Available results remain visible when one provider fails.')
  }
  await launcher.main.evaluate(() => { (window as any).__catalogNetwork.failCurseforge = false })
  await launcher.main.getByTestId('store-retry-curseforge').click()
  await expect(launcher.main.getByTestId('store-source-error-curseforge')).toBeHidden()
  await launcher.main.getByRole('button', { name: 'CurseForge', exact: true }).click()
  await expect(launcher.main.getByRole('button', { name: 'CurseForge', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await launcher.main.getByTestId('store-search').locator('input').fill('aurora-only-modrinth')
  await expect.poll(() => launcher.main.evaluate(() => (window as any).__catalogNetwork.requests.includes('modrinth:aurora-only-modrinth'))).toBe(true)
  expect(await launcher.main.evaluate(() => (window as any).__catalogNetwork.requests.includes('curseforge:aurora-only-modrinth'))).toBe(false)
  await launcher.main.evaluate(() => { (window as any).__catalogNetwork.failModrinth = true })
  await launcher.main.getByTestId('store-search').locator('input').fill('aurora-offline')
  await expect(launcher.main.getByTestId('store-source-error-modrinth')).toBeVisible()
  await snap(launcher, 'selected-source-offline', 'A failed search has a retry action instead of an empty-result message.')
  const storePath = new URL(launcher.main.url()).hash.slice(1)
  await shell.goto('/setting')
  await launcher.main.getByRole('combobox', { name: 'Tema', exact: true }).focus()
  await launcher.main.keyboard.press('Enter')
  await launcher.main.getByRole('option', { name: 'Tema Claro', exact: true }).click()
  await shell.goto(storePath)
  await expect(launcher.main.getByTestId('store-source-error-modrinth')).toBeVisible()
  await expect(launcher.main.locator('.aurora-scene-enter-active, .aurora-scene-leave-active')).toHaveCount(0)
  await expect.poll(async () => (await launcher.main.evaluate(readTextContrast, '.store-source-error .v-alert__content, .store-source-error .v-btn__content')).filter(row => row.ratio < 4.5)).toEqual([])
  await snap(launcher, 'selected-source-offline-light', 'Failure and retry remain readable in light mode at the minimum window size.')
  expect(errors).toEqual([])
})
