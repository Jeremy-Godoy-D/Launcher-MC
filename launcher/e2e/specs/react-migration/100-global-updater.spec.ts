import { access, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect } from '../../helpers/scratch'
import { mockReactUpdater } from '../../helpers/react-updater'
import { selectSettingsCategory } from '../../helpers/react-settings'
import { activateLauncherControl } from '../../helpers/focus-launcher'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function exists(path: string) { try { await access(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error } }

test('real updater requests recover from network, cancellation and SHA failures through global activity', async ({ launcher }, info) => {
  const feed = await mockReactUpdater(launcher), page = launcher.main, errors: string[] = []
  await (await launcher.app.browserWindow(page)).evaluate(win => win.setContentSize(800, 400))
  page.on('pageerror', error => errors.push(error.message))
  try {
    await page.getByTestId('nav-settings').click(); await selectSettingsCategory(page, 'updates')
    const updates = page.getByTestId('global-updates')
    feed.state.feedStatus = 503; await page.getByTestId('update-check').click(); await expect(updates.getByRole('alert')).toBeVisible()
    feed.state.feedStatus = 200; await page.getByTestId('update-check').click(); await expect(updates).toContainText(`v${feed.version}`); await expect(updates.getByRole('alert')).toHaveCount(0)
    await expect(updates.locator('a[href*="api.github.com"]')).toHaveCount(0); await expect(updates.locator('a[href$=".exe"]')).toHaveCount(1)
    feed.state.slow = true; await page.getByTestId('update-download').click(); await expect.poll(() => feed.state.started).toBe(true)
    await page.getByTestId('global-tasks-open').click()
    const activity = page.getByTestId('global-activity'), row = activity.locator('[data-task-type="downloaUpdate"]').first()
    await expect(row.getByTestId('global-task-state')).toHaveText('En curso'); await expect(row.getByRole('progressbar')).toBeVisible()
    const win = await launcher.app.browserWindow(page)
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect(row.getByTestId('global-task-cancel')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const result = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(info.outputPath(`activity-${width}-axe.json`), JSON.stringify(result, null, 2)); expect(result.violations).toEqual([])
      await page.screenshot({ path: info.outputPath(`activity-${width}.png`) })
    }
    await activateLauncherControl(launcher, row.getByTestId('global-task-cancel')); await expect(row.getByTestId('global-task-state')).toHaveText('Cancelada'); await expect.poll(() => feed.state.aborted).toBe(true)
    await page.keyboard.press('Escape'); await expect(page.getByTestId('global-tasks-open')).toBeFocused(); await expect(page.getByTestId('update-cancelled')).toBeVisible(); await expect(updates.getByRole('alert')).toHaveCount(0)
    const pending = join(launcher.appDataPath, 'LauncherMC/pending_update')
    await expect.poll(() => exists(pending)).toBe(false)
    feed.state.slow = false; feed.state.corrupt = true; await page.getByTestId('update-download').click(); await expect(updates.getByRole('alert')).toBeVisible()
    expect(await exists(pending)).toBe(false); expect(await exists(`${pending}.tmp`)).toBe(false); expect(await exists(`${pending}.verified`)).toBe(false)
    await page.getByTestId('global-notices-open').click(); await expect(activity.locator('[data-task-type="downloaUpdate"]').first().getByTestId('global-task-state')).toHaveText('Error')
    await activity.getByTestId('global-tasks-clear').click(); await expect(activity.getByTestId('global-activity-item')).toHaveCount(0); await page.keyboard.press('Escape')
    feed.state.corrupt = false; await page.getByTestId('update-download').click(); await expect(page.getByTestId('update-install')).toBeEnabled()
    expect(createHash('sha256').update(await readFile(pending)).digest('hex')).toBe(feed.hash); expect((await readFile(`${pending}.sha256`, 'utf8')).trim()).toBe(feed.hash)
    expect(feed.requests.some(request => request.path.endsWith('/releases/assets/1'))).toBe(true); expect(feed.requests.some(request => request.path.endsWith('/releases/assets/2'))).toBe(true)
    await page.getByTestId('update-install').click(); await expect(page.getByTestId('update-confirm')).toBeVisible(); await page.keyboard.press('Escape')
    expect(errors).toEqual([])
  } finally { await writeFile(info.outputPath('owned-updater-requests.json'), JSON.stringify(feed.requests, null, 2)); await feed.close() }
})
