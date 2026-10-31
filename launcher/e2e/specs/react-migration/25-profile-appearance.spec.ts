import { _electron } from '@playwright/test'
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { waitForAppWindow } from '../../fixtures/launcher'

const localAccount = (users: any) => Object.values(users).find((user: any) => user.authority === 'x://dev') as any

test.use({ launcherOptions: { locale: 'es-ES' } })
const capePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAAHklEQVR4nO3BAQ0AAADCoPdPbQ8HFAAAAAAAAADwbiAgAAFXlYP5AAAAAElFTkSuQmCC', 'base64')

test('local appearance saves owned textures and model without changing identity, selection or worlds, including packaged restart', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.getByTestId('nav-accounts').click()
  for (const name of ['AppearanceQA', 'SelectedQA']) {
    await page.getByTestId('local-profile-name').fill(name)
    await page.getByRole('button', { name: 'Crear perfil local', exact: true }).click()
    await expect(page.locator('.account strong')).toHaveText(name)
  }
  const userFile = join(launcher.appDataPath, 'LauncherMC/user.json')
  await expect.poll(async () => Object.keys(localAccount(JSON.parse(await readFile(userFile, 'utf8').catch(() => '{"users":{}}')).users)?.profiles ?? {}).length).toBe(2)
  const before = localAccount(JSON.parse(await readFile(userFile, 'utf8')).users)
  const id = Object.values(before.profiles).find((profile: any) => profile.name === 'AppearanceQA') as any
  const selected = before.selectedProfile
  const root = join(launcher.gameDataPath, 'appearance-input'), world = join(launcher.gameDataPath, 'saves/kept-world')
  await mkdir(root); await mkdir(world, { recursive: true }); await writeFile(join(world, 'level.dat'), 'world-identity-sentinel')
  const skin = join(root, 'skin.png'), cape = join(root, 'cape.png'), invalid = join(root, 'not-image.png')
  const skinBytes = await readFile(resolve('..', 'xmcl-keystone-ui/src/assets/steve_skin.png'))
  await writeFile(skin, skinBytes); await writeFile(cape, capePng); await writeFile(invalid, '<svg/>')
  const imageRoot = join(launcher.appDataPath, 'LauncherMC/resource-images')
  await mkdir(imageRoot, { recursive: true })
  await link(skin, join(imageRoot, createHash('sha1').update(skinBytes).digest('hex')))
  const edit = page.getByRole('button', { name: 'Apariencia de AppearanceQA', exact: true })
  await edit.click()
  let dialog = page.getByTestId('profile-appearance')
  await stubOpenDialog(launcher, invalid); await dialog.getByRole('button', { name: 'Elegir skin PNG', exact: true }).click()
  await dialog.getByTestId('profile-appearance-save').click()
  await expect(dialog.getByRole('alert')).toContainText('Comprueba que los archivos sean PNG')
  await expect(dialog.getByRole('alert')).toBeInViewport({ ratio: 1 })
  await snap(launcher, 'profile-invalid-png', 'Archivo disfrazado rechazado en main; aviso visible y formulario conservado para reintentar.')
  expect(localAccount(JSON.parse(await readFile(userFile, 'utf8')).users).profiles[id.id].textures).toEqual(id.textures)
  await stubOpenDialog(launcher, skin); await dialog.getByRole('button', { name: 'Elegir skin PNG', exact: true }).click()
  await dialog.getByLabel('Modelo del personaje', { exact: true }).selectOption('slim')
  await stubOpenDialog(launcher, cape); await dialog.getByRole('button', { name: 'Elegir capa PNG', exact: true }).click()
  await page.keyboard.press('Escape'); await expect(edit).toBeFocused()
  expect(localAccount(JSON.parse(await readFile(userFile, 'utf8')).users).profiles[id.id].textures).toEqual(id.textures)
  const reports: unknown[] = [], win = await launcher.app.browserWindow(page)
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await page.getByTestId('nav-accounts').click(); await edit.click(); dialog = page.getByTestId('profile-appearance')
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await dialog.getByRole('button', { name: 'Elegir skin PNG', exact: true }).focus()
      await expect(dialog.getByTestId('profile-appearance-save')).toBeInViewport({ ratio: 1 })
      await dialog.getByRole('region').focus(); await page.keyboard.press('End')
      await expect(dialog.getByRole('button', { name: 'Elegir capa PNG', exact: true })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); reports.push({ appearance, width, ...report })
      await snap(launcher, `profile-appearance-${appearance}-${width}`, 'Edición local con nombre/UUID conservados, campos desplazables por teclado y acciones fuera del scroll.')
    }
    await page.keyboard.press('Escape')
  }
  await writeFile(testInfo.outputPath('profile-appearance-accessibility.json'), JSON.stringify(reports, null, 2))
  await edit.click(); dialog = page.getByTestId('profile-appearance')
  await stubOpenDialog(launcher, skin); await dialog.getByRole('button', { name: 'Elegir skin PNG', exact: true }).click()
  await dialog.getByLabel('Modelo del personaje', { exact: true }).selectOption('slim')
  await stubOpenDialog(launcher, cape); await dialog.getByRole('button', { name: 'Elegir capa PNG', exact: true }).click()
  await dialog.getByTestId('profile-appearance-save').click(); await expect(dialog).toHaveCount(0); await expect(edit).toBeFocused()
  await expect.poll(async () => localAccount(JSON.parse(await readFile(userFile, 'utf8')).users).profiles[id.id].textures.SKIN.metadata?.model).toBe('slim')
  const saved = localAccount(JSON.parse(await readFile(userFile, 'utf8')).users)
  expect(saved.selectedProfile).toBe(selected); expect(saved.profiles[id.id].name).toBe(id.name)
  const imagePath = (url: string) => join(launcher.appDataPath, 'LauncherMC/resource-images', basename(new URL(url).pathname))
  await writeFile(skin, 'source-changed'); await unlink(cape)
  expect(await readFile(imagePath(saved.profiles[id.id].textures.SKIN.url))).toEqual(skinBytes)
  expect(await readFile(imagePath(saved.profiles[id.id].textures.CAPE.url))).toEqual(capePng)
  expect(await readFile(join(world, 'level.dat'), 'utf8')).toBe('world-identity-sentinel')
  await page.evaluate(() => localStorage.setItem('selectedUserId', 'OFFLINE'))
  const executablePath = await launcher.app.evaluate(() => process.execPath); await launcher.app.close()
  const restarted = await _electron.launch({ executablePath, args: [], env: { ...process.env, XMCL_E2E: '1', XMCL_E2E_APP_DATA: launcher.appDataPath, XMCL_E2E_GAME_DATA: launcher.gameDataPath, XMCL_E2E_NO_LAUNCH: '1', XMCL_E2E_LOCALE: 'es-ES', NODE_ENV: 'production' }, timeout: 60000 })
  try {
    const next = await waitForAppWindow(restarted, /\/(index|setup)\.html(\?|#|$)/, 30000)
    await next.getByTestId('nav-accounts').click()
    await expect(next.locator('.account-row')).toHaveCount(2)
    await expect(next.locator('.account strong')).toHaveText('SelectedQA')
    await next.getByRole('button', { name: 'Apariencia de AppearanceQA', exact: true }).click()
    await expect(next.getByLabel('Modelo del personaje', { exact: true })).toHaveValue('slim')
    await next.getByLabel('Modelo del personaje', { exact: true }).selectOption('classic')
    await next.getByTestId('profile-appearance-save').click(); await expect(next.getByTestId('profile-appearance')).toHaveCount(0)
    await next.getByRole('button', { name: 'Apariencia de AppearanceQA', exact: true }).click()
    await next.getByRole('button', { name: 'Restablecer skin', exact: true }).click(); await next.getByRole('button', { name: 'Retirar capa', exact: true }).click()
    await next.getByTestId('profile-appearance-save').click(); await expect(next.getByTestId('profile-appearance')).toHaveCount(0)
    await expect.poll(async () => localAccount(JSON.parse(await readFile(userFile, 'utf8')).users).profiles[id.id].textures).toEqual({ SKIN: { url: '' } })
    expect(localAccount(JSON.parse(await readFile(userFile, 'utf8')).users).selectedProfile).toBe(selected)
    expect(await next.evaluate(() => localStorage.getItem('selectedUserId'))).toBe(before.id)
    await next.getByTestId('local-profile-name').fill('AfterRestartQA')
    await next.getByRole('button', { name: 'Crear perfil local', exact: true }).click()
    await expect(next.locator('.account-row')).toHaveCount(3)
    await expect(next.getByRole('button', { name: 'Apariencia de AppearanceQA', exact: true })).toBeVisible()
    await expect(next.getByRole('button', { name: 'Usar SelectedQA', exact: true })).toBeVisible()
  } finally { await restarted.close() }
  expect(errors).toEqual([])
})

test('missing files keep the editor draft and removal from another window disables saving', async ({ launcher }) => {
  const page = launcher.main
  await page.getByTestId('nav-accounts').click(); await page.getByTestId('local-profile-name').fill('RemovedQA')
  await page.getByRole('button', { name: 'Crear perfil local', exact: true }).click(); await expect(page.locator('.account strong')).toHaveText('RemovedQA')
  const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
  await page.getByRole('button', { name: 'Apariencia de RemovedQA', exact: true }).click()
  const dialog = page.getByTestId('profile-appearance'), missing = join(launcher.gameDataPath, 'missing.png')
  await stubOpenDialog(launcher, missing); await dialog.getByRole('button', { name: 'Elegir skin PNG', exact: true }).click()
  await dialog.getByLabel('Modelo del personaje', { exact: true }).selectOption('slim')
  await dialog.getByTestId('profile-appearance-save').click(); await expect(dialog.getByRole('alert')).toBeInViewport({ ratio: 1 })
  await snap(launcher, 'profile-missing-file-800', 'Archivo ausente: aviso completamente visible a800×400, con selección y modelo conservados.')
  await expect(dialog).toContainText(missing); await expect(dialog.getByLabel('Modelo del personaje')).toHaveValue('slim')
  const userFile = join(launcher.appDataPath, 'LauncherMC/user.json')
  await expect.poll(async () => !!localAccount(JSON.parse(await readFile(userFile, 'utf8').catch(() => '{"users":{}}')).users)).toBe(true)
  const persisted = localAccount(JSON.parse(await readFile(userFile, 'utf8')).users)
  await page.evaluate(async user => {
    await (window as any).serviceChannels.open('UserService').call('removeUserGameProfile', user, user.selectedProfile)
  }, persisted)
  await expect(dialog.getByTestId('profile-appearance-save')).toBeDisabled()
  await expect(dialog).toContainText('Este perfil ya no está disponible')
  await page.keyboard.press('Escape'); await expect(page.getByTestId('local-profile-name')).toBeFocused()
  await expect(page.locator('.account-row')).toHaveCount(0)
})
