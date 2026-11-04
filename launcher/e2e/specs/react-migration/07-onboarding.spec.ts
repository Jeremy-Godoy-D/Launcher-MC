import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'

test.use({ launcherOptions: { bootstrap: true, locale: 'es-ES' } })

test('new React setup validates the native root, preserves fields, creates a local profile and never launches at completion', async ({ launcher }, testInfo) => {
  const page = launcher.main
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await expect(page.getByTestId('setup-root')).toBeVisible()
  const input = page.getByTestId('setup-path')
  const next = page.getByTestId('setup-next')
  await expect(input).toHaveValue(launcher.gameDataPath)
  await expect(next).toBeEnabled()
  await page.evaluate(axe.source)
  const main = await launcher.app.browserWindow(page)
  const accessibility: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    await page.emulateMedia({ colorScheme: appearance as 'dark' | 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance)
    for (const width of [1200, 800]) {
    await main.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    expect(report.violations).toEqual([])
    accessibility.push({ appearance, width, ...report })
    await snap(launcher, `onboarding-location-${appearance}-${width}`, 'Inicio real sobre perfil desechable: una etapa, ruta recomendada y acciones fuera del scroll.')
    }
  }
  await writeFile(testInfo.outputPath('onboarding-accessibility.json'), JSON.stringify(accessibility, null, 2), 'utf8')
  await expect(page.evaluate(() => (window as any).bootstrap.bootstrap('relative/path'))).rejects.toThrow('Invalid bootstrap path')
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow, app }) => {
    const win = new BrowserWindow({ show: false, webPreferences: { preload: `${app.getAppPath()}/index-preload.js`, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    await win.loadURL('about:blank')
  })
  const auxiliary = await opening
  await expect(auxiliary.evaluate(path => (window as any).bootstrap.bootstrap(path), launcher.gameDataPath)).rejects.toThrow('main launcher frame')
  await auxiliary.close()
  await input.fill('relative/path')
  await next.click()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveValue('relative/path')
  await input.fill(launcher.gameDataPath)
  const marker = join(launcher.gameDataPath, 'preserve.txt')
  await writeFile(marker, 'keep-onboarding-files', 'utf8')
  await next.click()
  await expect(page.getByRole('checkbox', { name: /Confirmo que quiero usar/ })).toBeVisible()
  await page.getByRole('checkbox', { name: /Confirmo que quiero usar/ }).check()
  await next.click()
  await expect(page.getByRole('heading', { name: 'Tu perfil', exact: true })).toBeFocused()
  await page.getByTestId('local-profile-name').fill('SetupPlayer_QA')
  await expect(page.getByRole('button', { name: 'Crear perfil local', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Crear perfil local', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Perfil seleccionado: SetupPlayer_QA' })).toBeVisible()
  await snap(launcher, 'onboarding-profile-minimum', 'Perfil local creado desde el inicio guiado, sin autenticación Microsoft.')
  await next.click()
  await expect(page.getByRole('heading', { name: 'Todo preparado', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Atrás', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'SetupPlayer_QA' })).toBeVisible()
  await next.click()
  await next.click()
  await expect(page.getByTestId('setup-root')).toHaveCount(0)
  await expect(page.getByTestId('app-sidebar')).toBeVisible()
  expect(page.url()).not.toContain('bootstrap')
  expect(resolve(await readFile(join(launcher.appDataPath, 'LauncherMC', 'root'), 'utf8'))).toBe(resolve(launcher.gameDataPath))
  expect(await readFile(marker, 'utf8')).toBe('keep-onboarding-files')
  expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
  await page.reload()
  await expect(page.getByTestId('setup-root')).toHaveCount(0)
  await expect(page.locator('.account strong')).toHaveText('SetupPlayer_QA')
  expect(errors).toEqual([])
  await writeFile(testInfo.outputPath('onboarding.json'), JSON.stringify({ rootConfirmed: true, untrustedWindowRejected: true, invalidPathRetry: true, existingFilesPreserved: true, localProfileCreated: true, noGameProcesses: true, reloadSkipsSetup: true, errors }, null, 2), 'utf8')
})

test('setup can finish without a profile, while invalid folder errors keep the chosen path', async ({ launcher }) => {
  const page = launcher.main
  const input = page.getByTestId('setup-path')
  const next = page.getByTestId('setup-next')
  await expect(input).toHaveValue(launcher.gameDataPath)
  const file = join(launcher.gameDataPath, 'not-a-directory.txt')
  await writeFile(file, 'preserve-invalid-folder-file', 'utf8')
  await input.fill(file)
  await next.click()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveValue(file)
  expect(await readFile(file, 'utf8')).toBe('preserve-invalid-folder-file')
  await input.fill(join(launcher.gameDataPath, 'clean-root'))
  await next.click()
  await expect(next).toHaveText('Continuar sin perfil')
  await next.click()
  await next.click()
  await expect(page.getByTestId('setup-root')).toHaveCount(0)
  await page.getByTestId('nav-accounts').click()
  await expect(page.locator('.account-row')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Crear perfil local', exact: true })).toBeEnabled()
})

test('a failed native preset can be retried without leaving setup stuck', async ({ launcher }) => {
  const page = launcher.main
  await expect(page.getByTestId('setup-path')).toHaveValue(launcher.gameDataPath)
  await expect(page.getByTestId('setup-next')).toHaveText('Continuar')
  await launcher.app.evaluate(({ ipcMain }, path) => {
    let failed = false
    ipcMain.removeHandler('preset')
    ipcMain.handle('preset', () => {
      if (!failed) { failed = true; throw new Error('Fixture preset unavailable') }
      return { defaultPath: path, minecraftPath: path, locale: 'es-ES', drives: [] }
    })
  }, launcher.gameDataPath)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('No se pudo obtener la configuración inicial')
  await expect(page.getByTestId('setup-next')).toBeDisabled()
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByTestId('setup-path')).toHaveValue(launcher.gameDataPath)
  await expect(page.getByTestId('setup-next')).toBeEnabled()
  await page.getByTestId('setup-next').click()
  await page.getByTestId('setup-next').click()
  await page.getByTestId('setup-next').click()
  await expect(page.getByTestId('setup-root')).toHaveCount(0)
})
