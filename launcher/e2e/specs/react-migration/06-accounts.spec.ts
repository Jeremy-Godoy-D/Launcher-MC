import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'

test.use({ launcherOptions: { seed: { name: 'Accounts preserved QA', minecraft: '1.20.4' }, locale: 'es-ES' } })

test('local profiles create, select, persist and remove with confirmation without touching worlds', async ({ launcher }, testInfo) => {
  const page = launcher.main
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const world = join(launcher.gameDataPath, 'instances', 'Accounts preserved QA', 'saves', 'kept')
  await mkdir(world, { recursive: true })
  await writeFile(join(world, 'level.dat'), 'preserve-account-test-world', 'utf8')
  await page.getByTestId('nav-accounts').click()
  await expect(page.getByTestId('accounts-page')).toBeVisible()
  const input = page.getByTestId('local-profile-name')
  const create = page.getByRole('button', { name: 'Crear perfil local', exact: true })
  await expect(create).toBeEnabled()
  await input.fill('ab')
  await create.click()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toBeFocused()
  await expect(page.locator('.account-row')).toHaveCount(0)
  for (const name of ['PlayerA_QA', 'PlayerB_QA']) {
    await input.fill(name)
    await create.click()
    await expect(page.locator('.account strong')).toHaveText(name)
  }
  await expect(page.locator('.account-row')).toHaveCount(2)
  await page.evaluate(axe.source)
  const win = await launcher.app.browserWindow(page)
  const accessibility: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click()
    await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await page.getByTestId('nav-accounts').click()
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await page.getByRole('heading', { name: 'Cuentas', exact: true }).scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(result.violations).toEqual([])
      accessibility.push({ appearance, width, ...result })
      await snap(launcher, `accounts-${appearance}-${width}`, 'Perfiles locales reales: tamaños admitidos, selección explícita, sin lanzamiento de juego.')
    }
  }
  await writeFile(testInfo.outputPath('accounts-accessibility.json'), JSON.stringify(accessibility, null, 2), 'utf8')
  await win.evaluate(win => win.setContentSize(1200, 720))
  await input.fill('PlayerA_QA')
  await create.click()
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('.account-row')).toHaveCount(2)
  await input.fill('')
  await page.getByRole('button', { name: 'Usar PlayerA_QA', exact: true }).click()
  await expect(page.locator('.account strong')).toHaveText('PlayerA_QA')
  await page.reload()
  await expect(page.locator('.account strong')).toHaveText('PlayerA_QA')
  await expect(page.locator('.account-row')).toHaveCount(2)
  await win.evaluate(win => win.setContentSize(800, 400))
  const removeB = page.getByRole('button', { name: 'Eliminar PlayerB_QA', exact: true })
  await removeB.click()
  await expect(page.getByRole('dialog')).toContainText('Tus instancias, archivos y mundos se conservan')
  await page.keyboard.press('Escape')
  await expect(removeB).toBeFocused()
  await expect(page.locator('.account-row')).toHaveCount(2)
  await removeB.click()
  await page.getByRole('button', { name: 'Eliminar perfil', exact: true }).click()
  await expect(page.locator('.account-row')).toHaveCount(1)
  await expect(input).toBeFocused()
  const userFile = join(launcher.appDataPath, 'LauncherMC', 'user.json')
  await expect.poll(async () => {
    const data = await readFile(userFile, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error })
    if (!data) return null
    const users = JSON.parse(data).users
    return Object.values(users.OFFLINE?.profiles ?? {}).map((profile: any) => profile.name)
  }).toEqual(['PlayerA_QA'])
  await snap(launcher, 'accounts-minimum', 'Cuentas reales en 800×400: selección persistente, validación y eliminación confirmada; perfil temporal.')
  await page.getByRole('button', { name: 'Eliminar PlayerA_QA', exact: true }).click()
  await page.getByRole('button', { name: 'Eliminar perfil', exact: true }).click()
  await expect(page.locator('.account-row')).toHaveCount(0)
  await expect.poll(async () => Object.keys(JSON.parse(await readFile(userFile, 'utf8')).users)).toEqual([])
  expect(await readFile(join(world, 'level.dat'), 'utf8')).toBe('preserve-account-test-world')
  await page.reload()
  await expect(page.locator('.account-row')).toHaveCount(0)
  expect(errors).toEqual([])
  await writeFile(testInfo.outputPath('accounts.json'), JSON.stringify({ created: 2, duplicateRejected: true, selectionSurvivesReload: true, cancelRestoresFocus: true, removalConfirmed: true, finalEmptyPersisted: true, worldPreserved: true, errors }, null, 2), 'utf8')
})

test('an existing external account stays selected and intact when a local profile is removed', async ({ launcher }) => {
  const page = launcher.main
  await page.getByTestId('nav-accounts').click()
  await expect(page.getByRole('button', { name: 'Crear perfil local', exact: true })).toBeEnabled()
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow, app }) => {
    const win = new BrowserWindow({ show: false, webPreferences: { preload: `${app.getAppPath()}/index-preload.js`, contextIsolation: true, sandbox: true, nodeIntegration: false } })
    await win.loadURL('about:blank')
  })
  const control = await opening
  await control.evaluate(async () => {
    const state = await (window as any).serviceChannels.open('UserService').call('getUserState')
    await state.commit('userProfile', { id: 'existing-external', username: 'PriorAccount_QA', authority: 'x://microsoft', selectedProfile: 'prior', profiles: { prior: { id: 'prior', name: 'PriorAccount_QA', textures: { SKIN: { url: '' } } } }, expiredAt: Number.MAX_SAFE_INTEGER, invalidated: false })
    await state.unref()
  })
  await expect(page.getByRole('button', { name: 'Usar PriorAccount_QA', exact: true })).toBeDisabled()
  await page.getByTestId('local-profile-name').fill('Temporary_QA')
  await page.getByRole('button', { name: 'Crear perfil local', exact: true }).click()
  await expect(page.locator('.account strong')).toHaveText('Temporary_QA')
  await page.evaluate(() => localStorage.setItem('selectedUserId', 'existing-external'))
  await page.reload()
  await expect(page.locator('.account strong')).toHaveText('PriorAccount_QA')
  await page.getByRole('button', { name: 'Eliminar Temporary_QA', exact: true }).click()
  await page.getByRole('button', { name: 'Eliminar perfil', exact: true }).click()
  await expect(page.locator('.account-row')).toHaveCount(1)
  await expect(page.locator('.account strong')).toHaveText('PriorAccount_QA')
  expect(await page.evaluate(() => localStorage.getItem('selectedUserId'))).toBe('existing-external')
  await expect(page.getByRole('button', { name: 'Eliminar PriorAccount_QA', exact: true })).toHaveCount(0)
  await control.close()
})
