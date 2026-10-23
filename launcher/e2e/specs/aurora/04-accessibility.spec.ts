import axe from 'axe-core'
import { readTextContrast } from '../../helpers/contrast'
import { test, expect, snap } from '../../helpers/scratch'

const launchText = '.aurora-dock-link span, .aurora-status, .aurora-launch-identity p, .aurora-launch-message, .aurora-hero-actions a, .aurora-hero-actions button, .aurora-recent small, .aurora-discover span'

test.use({ launcherOptions: { seed: { name: 'Aurora QA', minecraft: '1.20.4' }, locale: 'es-ES' } })

test('primary routes meet automated WCAG AA checks at supported window sizes', async ({ launcher, shell }, testInfo) => {
  await shell.waitReady()
  await shell.dismissTutorial()
  await launcher.main.evaluate(axe.source)
  const win = await launcher.app.browserWindow(launcher.main)
  const reports: unknown[] = []
  const failures: unknown[] = []
  for (const dark of [true, false]) {
    if (!dark) {
      await shell.goto('/setting')
      const theme = launcher.main.getByRole('combobox', { name: 'Tema', exact: true })
      await theme.focus()
      const viewport = await launcher.main.locator('.scroll-container').boundingBox()
      await expect.poll(async () => {
        const control = await theme.boundingBox()
        return !!control && control.y >= viewport!.y && control.y + control.height <= viewport!.y + viewport!.height
      }).toBe(true)
      await snap(launcher, 'settings-theme-at-minimum', 'The focused theme control remains below the category header at 800×400.')
      await launcher.main.keyboard.press('Enter')
      await launcher.main.getByRole('option', { name: 'Tema Claro', exact: true }).click()
      await expect(launcher.main.locator('.aurora-shell')).not.toHaveClass(/\bdark\b/)
    }
    for (const width of [1200, 800]) {
      await win.evaluate((window, width) => window.setContentSize(width, width === 800 ? 400 : 720), width)
      for (const [route, anchor] of [['/', 'launch-center'], ['/me', 'library-create-instance'], ['/setting', 'settings-page'], ['/accounts', 'accounts-open-dialog'], ['/instance/mods', 'instance-tab-mods'], ['/store', 'store-search']] as const) {
        await shell.goto(route)
        await expect(launcher.main.getByTestId(anchor)).toBeVisible()
        await expect(launcher.main.locator('.aurora-scene-enter-active, .aurora-scene-leave-active')).toHaveCount(0)
        const result = await launcher.main.evaluate(async () => {
          const { violations, incomplete } = await (window as any).axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
          })
          return { violations, incomplete }
        })
        reports.push({ dark, width, route, ...result })
        failures.push(...result.violations.map((v: any) => ({ dark, width, route, id: v.id, nodes: v.nodes.map((n: any) => ({ target: n.target, summary: n.failureSummary })) })))
      }
    }
  }
  await testInfo.attach('wcag-aa', { body: JSON.stringify(reports, null, 2), contentType: 'application/json' })
  expect(failures).toEqual([])
})

test('keyboard navigation, dialogs and persisted light theme remain usable', async ({ launcher, shell }, testInfo) => {
  await shell.dismissTutorial()
  await shell.goto('/')
  await expect(launcher.main.getByTestId('launch-center')).toBeVisible()
  const darkContrast = await launcher.main.evaluate(readTextContrast, launchText)
  expect(darkContrast.filter(row => row.ratio < 4.5)).toEqual([])
  const store = launcher.main.getByTestId('nav-store')
  await store.focus()
  await launcher.main.keyboard.press('Enter')
  const filters = launcher.main.getByTestId('store-filters-toggle')
  await filters.focus()
  await launcher.main.keyboard.press('Enter')
  await expect(launcher.main.locator('#store-filters')).toBeVisible()
  await expect(launcher.main.locator('.aurora-filter-dialog')).not.toHaveClass(/transition-enter-active/)
  await launcher.main.keyboard.press('Tab')
  expect(await launcher.main.evaluate(() => !!document.activeElement?.closest('.v-dialog'))).toBe(true)
  await launcher.main.keyboard.press('Escape')
  await expect(launcher.main.locator('#store-filters')).toBeHidden()
  await expect(filters).toBeFocused()
  await launcher.main.getByTestId('nav-settings').focus()
  await launcher.main.keyboard.press('Enter')
  const theme = launcher.main.getByRole('combobox', { name: 'Tema', exact: true })
  await theme.focus()
  await launcher.main.keyboard.press('Enter')
  await launcher.main.getByRole('option', { name: 'Tema Claro', exact: true }).click()
  await expect(launcher.main.locator('.aurora-shell')).not.toHaveClass(/\bdark\b/)
  await shell.goto('/')
  await expect(launcher.main.getByTestId('launch-center')).toBeVisible()
  await expect(launcher.main.locator('.aurora-scene-enter-active, .aurora-scene-leave-active')).toHaveCount(0)
  await expect.poll(async () => (await launcher.main.evaluate(readTextContrast, launchText)).filter(row => row.ratio < 4.5)).toEqual([])
  const lightContrast = await launcher.main.evaluate(readTextContrast, launchText)
  await testInfo.attach('launch-control-contrast', { body: JSON.stringify({ dark: darkContrast, light: lightContrast }, null, 2), contentType: 'application/json' })
  expect(lightContrast.filter(row => row.ratio < 4.5)).toEqual([])
  await snap(launcher, 'launch-center-light', 'Light theme retains readable Aurora controls.')
  await expect.poll(() => launcher.main.evaluate(async () => (await (window as any).serviceChannels.open('ThemeService').call('getCurrentTheme'))?.settings?.dark)).toBe(false)
  await launcher.main.reload()
  await expect(launcher.main.locator('.aurora-shell')).not.toHaveClass(/\bdark\b/)
  await expect(launcher.main.getByTestId('launch-center')).toBeVisible()
})

test.describe('first launch accessibility', () => {
  test.use({ launcherOptions: { bootstrap: true, locale: 'es-ES' } })
  test('onboarding stages have names, roles and readable controls', async ({ launcher, shell }, testInfo) => {
    if (process.platform === 'win32') {
      const preset = await launcher.main.evaluate(() => (window as any).bootstrap.preset())
      expect(preset.drives.some((drive: any) => /^[A-Z]:$/i.test(drive.mounted) && drive.available > 0)).toBe(true)
    }
    await launcher.main.evaluate(axe.source)
    const win = await launcher.app.browserWindow(launcher.main)
    const failures: unknown[] = []
    for (const stage of ['welcome', 'account', 'ready']) {
      for (const width of [1200, 800]) {
        await win.evaluate((window, width) => window.setContentSize(width, width === 800 ? 400 : 720), width)
        const violations = await launcher.main.evaluate(async () => (await (window as any).axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        })).violations)
        failures.push(...violations.map((v: any) => ({ stage, width, id: v.id, nodes: v.nodes.map((n: any) => ({ target: n.target, summary: n.failureSummary })) })))
      }
      if (stage === 'welcome') await shell.setupNext.click()
      if (stage === 'account') await shell.setupAccountSkip.click()
    }
    await testInfo.attach('onboarding-wcag-aa', { body: JSON.stringify(failures, null, 2), contentType: 'application/json' })
    expect(failures).toEqual([])
  })
})
