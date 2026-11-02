import { execFileSync } from 'node:child_process'
import { mkdir, readFile, rename, rmdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import axe from 'axe-core'
import { test, expect, type Page, type LauncherFixture } from '../../helpers/scratch'
import { activateLauncherControl } from '../../helpers/focus-launcher'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'

test.use({ launcherOptions: { locale: 'es-ES', prepareGameData: async path => {
  await writeFile(join(dirname(path), 'appData/LauncherMC/setting.json'), JSON.stringify({ locale: 'es-ES', globalVmOptions: ['-Dkeep=two words', ''], globalPreExecuteCommand: 'USER COMMAND', globalEnv: { OWNED: 'preserve' }, globalDisableAuthlibInjector: true }))
} } })
const settingsPath = (launcher: LauncherFixture) => join(launcher.appDataPath, 'LauncherMC/setting.json')
async function native(page: Page, mutation?: { method: string; value: unknown }) {
  return page.evaluate(async mutation => {
    const state = await (window as any).serviceChannels.open('BaseService').call('getSettings')
    try {
      if (mutation) await state.commit(mutation.method, mutation.value)
      return Object.fromEntries(['locale', 'globalJava', 'globalAssignMemory', 'globalMinMemory', 'globalMaxMemory', 'globalVmOptions', 'globalMcOptions', 'globalResolution', 'globalPreExecuteCommand', 'globalEnv', 'globalDisableAuthlibInjector', 'httpProxy', 'httpProxyEnabled', 'maxSockets', 'maxAPISockets', 'apiSetsPreference'].map(key => [key, state[key]]))
    } finally { await state.unref() }
  }, mutation)
}
async function category(page: Page, id: string) {
  const select = page.getByTestId('settings-category-select')
  if (await select.isVisible()) await select.selectOption(id)
  else await page.getByTestId(`settings-category-${id}`).click()
}
async function open(page: Page, id: string) { await page.getByTestId('nav-settings').click(); await expect(page.getByTestId('global-settings')).toBeVisible(); await category(page, id) }
async function save(launcher: LauncherFixture) {
  await activateLauncherControl(launcher, launcher.main.getByTestId('global-settings-save'))
  await expect(launcher.main.getByTestId('global-settings-status')).toHaveText(/Ajustes guardados|Settings saved/)
}

test('global defaults persist literal arguments, manual Java and memory without resetting user commands', async ({ launcher }, info) => {
  test.skip(process.platform !== 'win32', 'Windows executable selection')
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await open(page, 'game')
  const home = process.env.JAVA_HOME_17_X64 || process.env.JAVA_HOME
  const java = home ? join(home, 'bin/java.exe') : execFileSync('where.exe', ['java'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0].trim()
  await stubOpenDialog(launcher, java); await page.getByTestId('global-java-browse').click(); await expect(page.getByTestId('global-java')).toHaveValue(java)
  await page.getByTestId('global-memory-custom').check(); await page.getByTestId('global-memory-min').fill('1024'); await page.getByTestId('global-memory-max').fill('4096')
  await page.locator('#global-vm-options textarea').nth(0).fill('-Dliteral=spaces "quotes"\nsecond line')
  await page.getByTestId('global-width').fill('1280'); await page.getByTestId('global-height').fill('720')
  await save(launcher)
  const persisted = JSON.parse(await readFile(settingsPath(launcher), 'utf8'))
  expect(persisted).toMatchObject({ globalJava: java, globalAssignMemory: true, globalMinMemory: 1024, globalMaxMemory: 4096, globalVmOptions: ['-Dliteral=spaces "quotes"\nsecond line', ''], globalResolution: { width: 1280, height: 720 }, globalPreExecuteCommand: 'USER COMMAND', globalEnv: { OWNED: 'preserve' }, globalDisableAuthlibInjector: true })
  await stubOpenDialog(launcher, join(launcher.appDataPath, 'missing-java.exe')); await page.getByTestId('global-java-browse').click(); await expect(page.getByTestId('global-settings-error')).toContainText('No se encontró'); await expect(page.getByTestId('global-java')).toHaveValue(java)
  await page.getByTestId('global-java').selectOption(''); await save(launcher)
  expect((await native(page)).globalJava).toBe('')
  await page.reload(); await category(page, 'game'); await expect(page.getByTestId('global-memory-max')).toHaveValue('4096')
  await writeFile(info.outputPath('global-game-errors.json'), JSON.stringify(errors)); expect(errors).toEqual([])
})

test('global network drafts retain invalid input, block navigation and detect competing changes', async ({ launcher }) => {
  const page = launcher.main; await open(page, 'network')
  const before = await native(page)
  await page.getByTestId('global-proxy').fill('file:///secret'); await activateLauncherControl(launcher, page.getByTestId('global-settings-save'))
  await expect(page.getByTestId('global-settings-error')).toContainText('Revisa el campo'); await expect(page.getByTestId('global-proxy')).toHaveValue('file:///secret'); expect((await native(page)).httpProxy).toBe(before.httpProxy)
  await page.getByTestId('nav-library').click(); await expect(page.getByTestId('global-settings-leave')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.getByTestId('global-settings-leave')).toHaveCount(0)
  await page.getByTestId('global-proxy').fill('http://127.0.0.1:8080'); await page.getByTestId('global-max-sockets').fill('32'); await page.getByTestId('global-max-api-sockets').fill('8'); await page.getByTestId('global-source').selectOption('mojang')
  await save(launcher); expect(JSON.parse(await readFile(settingsPath(launcher), 'utf8'))).toMatchObject({ httpProxy: 'http://127.0.0.1:8080', httpProxyEnabled: false, maxSockets: 32, maxAPISockets: 8, apiSetsPreference: 'mojang' })
  await page.getByTestId('global-max-sockets').fill('48'); await native(page, { method: 'maxSocketsSet', value: 64 })
  await activateLauncherControl(launcher, page.getByTestId('global-settings-save')); await expect(page.getByTestId('global-settings-error')).toContainText('cambiaron en otra ventana'); await expect(page.getByTestId('global-max-sockets')).toHaveValue('48'); expect((await native(page)).maxSockets).toBe(64)
  await page.getByTestId('global-settings-discard').click(); await expect(page.getByTestId('global-max-sockets')).toHaveValue('64')
  await category(page, 'general'); await page.getByTestId('global-locale').selectOption('en'); await save(launcher); await expect(page.getByTestId('nav-home')).toHaveText('Home')
  await page.reload(); await category(page, 'general'); await expect(page.getByTestId('global-locale')).toHaveValue('en')
})

test('a failed atomic settings write preserves the original file and draft for retry', async ({ launcher }) => {
  const page = launcher.main; await open(page, 'game')
  const path = settingsPath(launcher), backup = join(launcher.appDataPath, 'LauncherMC/stage7-settings-original.json')
  const original = await readFile(path)
  await rename(path, backup); await mkdir(path)
  try {
    await page.getByTestId('global-memory-custom').check(); await page.getByTestId('global-memory-max').fill('4096')
    await activateLauncherControl(launcher, page.getByTestId('global-settings-save'))
    await expect(page.getByTestId('global-settings-error')).toContainText('No se pudieron guardar')
    await expect(page.getByTestId('global-memory-max')).toHaveValue('4096'); await expect(page.getByTestId('global-settings-save')).toBeEnabled()
    expect((await native(page)).globalMaxMemory).toBe(0); expect(await readFile(backup)).toEqual(original)
  } finally { await rmdir(path); await rename(backup, path) }
  await save(launcher); expect(JSON.parse(await readFile(path, 'utf8')).globalMaxMemory).toBe(4096)
})

test('global settings and safe release notes fit both sizes, preserve focus and pass automated AA checks', async ({ launcher }, info) => {
  const page = launcher.main, win = await launcher.app.browserWindow(page), errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await open(page, 'appearance'); await page.getByLabel('Apariencia', { exact: true }).selectOption('dark')
  await native(page, { method: 'updateInfoSet', value: { name: '0.4.0-beta.1', body: '## Notas\n\nContenido <script>window.BAD=1</script><img src="file:///secret" onerror="window.BAD=1"><a href="javascript:alert(1)">malicioso</a>', date: '2026-11-01', newUpdate: true, operation: 'asar', files: [{ name: 'GrimoLauncher-0.4.0-beta.1-win-x64.exe', url: 'https://github.com/Jeremy-Godoy-D/Launcher-MC/releases/download/v0.4.0-beta.1/GrimoLauncher-0.4.0-beta.1-win-x64.exe', apiUrl: 'https://api.github.com/repos/Jeremy-Godoy-D/Launcher-MC/releases/assets/1' }] } })
  await native(page, { method: 'updateStatusSet', value: 'ready' })
  for (const width of [1200, 800]) {
    await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    if (width === 800) { await category(page, 'appearance'); await page.getByLabel('Apariencia', { exact: true }).selectOption('light') }
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const id of ['general', 'game', 'network', 'updates']) {
      await category(page, id); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const result = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(info.outputPath(`global-${id}-${width}-axe.json`), JSON.stringify(result, null, 2)); expect(result.violations).toEqual([])
      await page.screenshot({ path: info.outputPath(`global-${id}-${width}.png`) })
    }
    const updates = page.getByTestId('global-updates')
    await expect(updates.locator('a[href*="/releases/download/"]')).toHaveCount(1); await expect(updates.locator('a[href*="api.github.com"]')).toHaveCount(0)
    await expect(updates.locator('script, img[src^="file:"], [onerror], a[href^="javascript:"]')).toHaveCount(0)
    await activateLauncherControl(launcher, page.getByTestId('update-install')); await expect(page.getByTestId('update-confirm')).toBeVisible()
    await expect(page.getByTestId('update-confirm-install')).toBeInViewport({ ratio: 1 }); await page.keyboard.press('Escape'); await expect(page.getByTestId('update-install')).toBeFocused()
  }
  await page.getByTestId('settings-search').fill('zz-no-match'); await expect(page.getByRole('status').filter({ hasText: 'No hay ajustes' })).toBeVisible()
  expect(errors).toEqual([])
})
