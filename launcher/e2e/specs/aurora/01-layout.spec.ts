import { test, snap, expect } from '../../helpers/scratch'

test.describe('Aurora workspace', () => {
  test.use({ launcherOptions: { seed: { name: 'Aurora QA', minecraft: '1.20.4' }, locale: 'es-ES' } })
  test('navigation, two-step creation, responsive layouts and persistent performance preference', async ({ launcher, shell }) => {
    const errors: string[] = []
    launcher.main.on('pageerror', error => errors.push(error.message))
    await shell.dismissTutorial()
    const window = await launcher.app.browserWindow(launcher.main)
    for (const size of [{ width: 1200, height: 720 }, { width: 800, height: 400 }]) {
      await window.evaluate((win, value) => win.setContentSize(value.width, value.height), size)
      for (const [route, anchor] of [['/', 'launch-center'], ['/me', 'library-create-instance'], ['/setting', 'settings-page'], ['/accounts', 'accounts-open-dialog'], ['/mods', 'instance-tab-mods']] as const) {
        await shell.goto(route)
        await expect(launcher.main.getByTestId(anchor)).toBeVisible()
        await snap(launcher, size.width + '-' + anchor, 'Review Aurora at ' + size.width + ' pixels.')
        expect(await launcher.main.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
    await window.evaluate(win => win.setContentSize(1200, 720))
    await shell.goto('/me')
    await launcher.main.getByTestId('library-create-instance').click()
    await expect(launcher.main.getByTestId('add-instance-details-next')).toBeVisible()
    await snap(launcher, 'create-version', 'Select a version and loader.')
    await launcher.main.getByTestId('add-instance-details-next').click()
    await expect(launcher.main.getByTestId('add-instance-name')).toBeVisible()
    await snap(launcher, 'create-details', 'Name the new instance.')
    await launcher.main.getByTestId('add-instance-cancel').click()
    await shell.goto('/store')
    await launcher.main.getByTestId('store-filters-toggle').click()
    await expect(launcher.main.locator('#store-filters')).toBeVisible()
    await snap(launcher, 'catalog-filters', 'Open catalog filters on demand.')
    await launcher.main.keyboard.press('Escape')
    await shell.goto('/')
    await launcher.main.getByTestId('topbar-tasks').click()
    await expect(launcher.main.locator('.aurora-task-island .v-overlay__content')).toBeVisible()
    await snap(launcher, 'task-island', 'Tasks expand from the title bar.')
    await launcher.main.keyboard.press('Escape')
    await launcher.main.getByTestId('nav-instance-console').click()
    await expect(launcher.main.locator('.aurora-console .v-overlay__content')).toBeVisible()
    await snap(launcher, 'console-drawer', 'Console opens in a bottom panel.')
    await launcher.main.keyboard.press('Escape')
    await launcher.main.getByTestId('nav-library').focus()
    await launcher.main.keyboard.press('Enter')
    await expect(launcher.main.getByTestId('library-create-instance')).toBeVisible()
    await shell.goto('/setting')
    await launcher.main.getByLabel('Buscar ajustes', { exact: true }).fill('rendimiento')
    await launcher.main.getByRole('checkbox', { name: 'Modo rendimiento', exact: true }).click()
    await expect(launcher.main.locator('.aurora-shell')).toHaveClass(/ag-perf/)
    await launcher.main.reload()
    await expect(launcher.main.locator('.aurora-shell')).toHaveClass(/ag-perf/)
    await expect(launcher.main.locator('.aurora-bubbles')).toHaveAttribute('data-state', 'paused')
    expect(errors).toEqual([])
  })
})

test.describe('Aurora onboarding', () => {
  test.use({ launcherOptions: { bootstrap: true, locale: 'es-ES' } })
  test('welcome, account and first action complete in three stages', async ({ launcher, shell }) => {
    const win = await launcher.app.browserWindow(launcher.main)
    const captureStage = async (stage: string) => {
      for (const width of [1200, 800]) {
        await win.evaluate((window, width) => window.setContentSize(width, width === 800 ? 400 : 720), width)
        const footer = await shell.setupNext.boundingBox()
        expect(footer).not.toBeNull()
        expect(footer!.y + footer!.height).toBeLessThanOrEqual(width === 800 ? 400 : 720)
        await snap(launcher, stage + '-' + width, 'Onboarding at ' + width + ' pixels.')
        expect(await launcher.main.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
    }
    await expect(shell.setupRoot).toBeVisible()
    await captureStage('onboarding-welcome')
    await shell.setupNext.click()
    await expect(shell.setupAccount).toBeVisible()
    await captureStage('onboarding-account')
    await shell.setupAccountSkip.click()
    await expect(launcher.main.getByText('Todo listo para empezar', { exact: true })).toBeVisible()
    await launcher.main.getByLabel('Explorar el catálogo', { exact: true }).check()
    await captureStage('onboarding-ready')
    await shell.setupNext.click()
    await expect(launcher.main.getByTestId('app-sidebar')).toBeVisible()
  })
})
