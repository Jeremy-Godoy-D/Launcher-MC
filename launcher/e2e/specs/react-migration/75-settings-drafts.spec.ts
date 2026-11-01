import { execFileSync, spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap, type Page, type LauncherFixture } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { activateLauncherControl, focusLauncher } from '../../helpers/focus-launcher'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { readTextContrast } from '../../helpers/contrast'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const call = (page: Page, method: string, ...args: any[]) => page.evaluate(({ method, args }) => (window as any).serviceChannels.open('InstanceService').call(method, ...args), { method, args })
const disk = async (path: string) => JSON.parse(await readFile(join(path, 'instance.json'), 'utf8'))
const settings = (page: Page) => page.getByTestId('instance-base-setting')
async function open(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Ajustes', exact: true }).click()
  await expect(settings(page)).toBeVisible()
}
async function otherWindow(launcher: LauncherFixture, route = '/instance/base-setting') {
  const opening = launcher.app.waitForEvent('window')
  await launcher.app.evaluate(async ({ BrowserWindow, app }, route) => {
    const win = new BrowserWindow({ width: 800, height: 400, webPreferences: { preload: `${app.getAppPath()}/index-preload.js`, sandbox: true, contextIsolation: true, nodeIntegration: false } })
    await win.loadURL(`http://xmcl.runtime/index.html#${route}`)
  }, route)
  return opening
}
async function current(page: Page, path: string) {
  const value = (await call(page, 'getSharedInstancesState')).all[path]
  return { ...Object.fromEntries(['java', 'assignMemory', 'minMemory', 'maxMemory', 'vmOptions', 'mcOptions', 'fastLaunch', 'hideLauncher', 'showLog'].map(key => [key, value[key] ?? null])),
    resolution: value.resolution ? { width: null, height: null, fullscreen: null, monitor: null, ...value.resolution } : null,
    server: value.server ? { port: null, name: null, ...value.server } : null }
}

test('settings preserve inherited flags, auto/no-allocation modes, partial bounds and nested metadata', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  await call(page, 'editInstance', { instancePath: path, assignMemory: 'auto', minMemory: 0, maxMemory: null, hideLauncher: false, resolution: { width: 1280, monitor: 'saved-monitor' }, server: { host: 'old.test', name: 'Servidor guardado' } })
  await open(page); const area = settings(page), save = area.getByTestId('setting-save-btn')
  await expect(area.getByTestId('setting-memory-mode-auto')).toBeChecked(); await expect(area.getByTestId('setting-hide-launcher')).toHaveValue('disabled'); await expect(area.getByTestId('setting-fast-launch')).toHaveValue('inherit')
  await area.getByTestId('setting-show-log').selectOption('enabled'); await activateLauncherControl(launcher, save)
  await expect(area.getByRole('status')).toContainText('guardados correctamente')
  expect(await disk(path)).toMatchObject({ assignMemory: 'auto', minMemory: 0, hideLauncher: false, resolution: { width: 1280, monitor: 'saved-monitor' }, server: { host: 'old.test', name: 'Servidor guardado' } })
  expect((await disk(path)).maxMemory).toBeUndefined(); expect((await disk(path)).fastLaunch).toBeUndefined()
  await area.getByTestId('setting-resolution-width').fill('1920'); await area.getByTestId('setting-server-port').fill('25566'); await area.getByTestId('setting-memory-mode-none').check(); await activateLauncherControl(launcher, save)
  await expect(area.getByRole('status')).toContainText('guardados correctamente')
  expect(await disk(path)).toMatchObject({ assignMemory: false, minMemory: 0, resolution: { width: 1920, monitor: 'saved-monitor' }, server: { host: 'old.test', port: 25566, name: 'Servidor guardado' } })
  await page.reload(); await expect(area.getByTestId('setting-memory-mode-none')).toBeChecked()
  await area.getByTestId('setting-memory-mode-custom').check(); await area.getByTestId('setting-memory-max').fill('0'); await activateLauncherControl(launcher, save)
  await expect(area.getByRole('status')).toContainText('guardados correctamente'); expect((await disk(path)).maxMemory).toBe(0)
  await area.getByTestId('setting-memory-max').fill(''); await activateLauncherControl(launcher, save)
  await expect(area.getByRole('status')).toContainText('guardados correctamente'); expect((await disk(path)).minMemory).toBe(0); expect((await disk(path)).maxMemory).toBeUndefined()
  await area.getByTestId('setting-reset-btn').click(); await page.getByTestId('settings-stay').click(); expect((await disk(path)).assignMemory).toBe(true)
  await area.getByTestId('setting-reset-btn').click(); await page.getByTestId('settings-reset-confirm').click(); await expect(area.getByRole('status')).toContainText('restablecidos')
  const reset = await disk(path); for (const key of ['java', 'assignMemory', 'minMemory', 'maxMemory', 'vmOptions', 'mcOptions', 'resolution', 'server', 'fastLaunch', 'hideLauncher', 'showLog']) expect(reset[key]).toBeUndefined()
  await page.reload(); await expect(area.getByTestId('setting-memory-mode-inherit')).toBeChecked(); await expect(area.getByTestId('setting-show-log')).toHaveValue('inherit')
})

test('drafts survive unrelated events, retain invalid numbers and reject stale/unknown Native changes', async ({ launcher }) => {
  const page = launcher.main, [path, other] = await seedReactLibrary(page); await open(page); const area = settings(page)
  await area.getByTestId('setting-server-host').fill('draft.test')
  await call(page, 'editInstance', { instancePath: path, playtime: 60000, description: 'Concurrent metadata', showLog: true })
  await expect(area.getByTestId('setting-server-host')).toHaveValue('draft.test'); await expect(area.getByTestId('setting-show-log')).toHaveValue('enabled')
  await area.getByTestId('setting-memory-mode-custom').check(); await area.getByTestId('setting-memory-min').fill('-')
  const before = await readFile(join(path, 'instance.json')); await activateLauncherControl(launcher, area.getByTestId('setting-save-btn'))
  await expect(area.getByRole('alert')).toContainText('Revisa el valor'); await expect(area.getByTestId('setting-memory-min')).toHaveValue('-'); expect(await readFile(join(path, 'instance.json'))).toEqual(before)
  await area.getByTestId('setting-discard-btn').click()
  const expected = await current(page, path)
  const results = await Promise.allSettled(['one.test', 'two.test'].map(host => call(page, 'editInstanceSettings', { instancePath: path, expected, changes: { server: { host, port: null, name: null } } })))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  const latest = await current(page, path), preserved = await readFile(join(path, 'instance.json'))
  const attempts = [
    { instancePath: path, expected: latest, changes: { unknown: true } },
    { instancePath: path, expected: latest, changes: { server: { host: 'bad.test', port: 65536, name: null } } },
    { instancePath: path, expected: latest, changes: { assignMemory: true, minMemory: 4096, maxMemory: 1024 } },
    { instancePath: join(path, 'unregistered'), expected: latest, changes: { hideLauncher: true } },
  ]
  for (const attempt of attempts) await expect(call(page, 'editInstanceSettings', attempt)).rejects.toBeTruthy()
  expect(await readFile(join(path, 'instance.json'))).toEqual(preserved); expect((await disk(other)).server).toBeUndefined()
})

test('two windows merge disjoint fields and preserve a conflicting draft until explicit reload', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page); await open(page); const second = await otherWindow(launcher)
  try {
    await expect(settings(second)).toBeVisible(); await settings(page).getByTestId('setting-server-host').fill('mine.test')
    await settings(second).getByTestId('setting-show-log').selectOption('enabled'); await settings(second).getByTestId('setting-save-btn').click(); await expect(settings(page).getByTestId('setting-show-log')).toHaveValue('enabled')
    await settings(second).getByTestId('setting-server-host').fill('theirs.test'); await settings(second).getByTestId('setting-save-btn').click()
    await expect(settings(page).getByTestId('setting-conflict')).toBeVisible(); await expect(settings(page).getByTestId('setting-server-host')).toHaveValue('mine.test'); await expect(settings(page).getByTestId('setting-save-btn')).toBeDisabled()
    await settings(page).getByRole('button', { name: 'Descartar borrador y leer valores actuales', exact: true }).click(); await page.getByTestId('settings-stay').click(); await expect(settings(page).getByTestId('setting-server-host')).toHaveValue('mine.test')
    await settings(page).getByRole('button', { name: 'Descartar borrador y leer valores actuales', exact: true }).click(); await page.getByTestId('settings-reload-confirm').click(); await expect(settings(page).getByTestId('setting-server-host')).toHaveValue('theirs.test')
    await settings(page).getByTestId('setting-fast-launch').selectOption('disabled'); await settings(page).getByTestId('setting-save-btn').click(); await expect(settings(page).getByRole('status')).toContainText('guardados correctamente')
    expect(await disk(path)).toMatchObject({ server: { host: 'theirs.test' }, fastLaunch: false, showLog: true })
    await second.reload(); await expect(settings(second).getByTestId('setting-fast-launch')).toHaveValue('disabled')
  } finally { await second.close() }
})

test('route, back and external selection changes offer save/discard/stay without losing a draft', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page); await open(page); const area = settings(page)
  await area.getByTestId('setting-server-host').fill('saved-before-leave.test'); await page.getByTestId('nav-library').click()
  const modal = page.getByTestId('settings-draft-dialog'); await expect(modal).toBeVisible(); await page.getByTestId('settings-stay').click(); await expect(area.getByTestId('setting-server-host')).toHaveValue('saved-before-leave.test')
  await page.getByTestId('nav-library').click(); await page.getByTestId('settings-leave-save').click(); await expect(page.locator('.library-page')).toBeVisible(); expect((await disk(path)).server.host).toBe('saved-before-leave.test')
  await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Ajustes', exact: true }).click()
  await area.getByTestId('setting-server-host').fill('discard-on-back.test'); await page.goBack(); await expect(modal).toBeVisible(); await page.getByTestId('settings-stay').click(); await expect(area.getByTestId('setting-server-host')).toHaveValue('discard-on-back.test')
  await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mods', exact: true }).click(); await page.getByTestId('settings-leave-discard').click(); await expect(page.getByTestId('instance-mods')).toBeVisible(); expect((await disk(path)).server.host).toBe('saved-before-leave.test')
  await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Ajustes', exact: true }).click(); await area.getByTestId('setting-server-host').fill('before-selection.test')
  const second = await otherWindow(launcher, '/me')
  try {
    await second.getByRole('button', { name: 'Administrar Fabric QA', exact: true }).click(); await expect(modal).toBeVisible(); await expect(page.locator('h1')).toHaveText('Mi mundo'); await page.getByTestId('settings-stay').click(); await expect(area.getByTestId('setting-server-host')).toHaveValue('before-selection.test')
    await second.getByTestId('nav-library').click(); await second.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await second.getByTestId('nav-library').click(); await second.getByRole('button', { name: 'Administrar Fabric QA', exact: true }).click()
    await expect(modal).toBeVisible(); await page.getByTestId('settings-leave-save').click(); await expect(page.locator('h1')).toHaveText('Fabric QA'); await expect(area.getByTestId('setting-server-host')).toHaveValue(''); expect((await disk(path)).server.host).toBe('before-selection.test')
  } finally { await second.close() }
})

test('Native window close preserves a draft on stay and saves before closing the window', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page); await open(page); const second = await otherWindow(launcher), win = await launcher.app.browserWindow(second)
  // Electron has already cancelled beforeunload when Playwright tries to dismiss its notification.
  second.on('dialog', dialog => { expect(dialog.type()).toBe('beforeunload'); void dialog.dismiss().catch(error => { if (!String(error).includes('No dialog is showing')) throw error }) })
  await settings(second).getByTestId('setting-server-host').fill('close-save.test')
  await win.evaluate(win => win.close()); await expect(second.getByTestId('settings-draft-dialog')).toBeVisible(); await second.getByTestId('settings-stay').click(); await expect(settings(second).getByTestId('setting-server-host')).toHaveValue('close-save.test')
  await win.evaluate(win => win.close()); await expect(second.getByTestId('settings-draft-dialog')).toBeVisible()
  const closed = second.waitForEvent('close'); await second.getByTestId('settings-leave-save').click(); await closed
  expect((await disk(path)).server.host).toBe('close-save.test')
})

test('a real Windows file lock preserves disk/state and the draft after a failed atomic save', async ({ launcher }) => {
  test.skip(process.platform !== 'win32', 'Windows sharing semantics')
  const page = launcher.main, [path] = await seedReactLibrary(page); await open(page); const area = settings(page), file = join(path, 'instance.json'), original = await readFile(file)
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$stream = [System.IO.File]::Open($env:GRIMO_SETTINGS_LOCK, 'Open', 'Read', 'Read'); [Console]::WriteLine('LOCKED'); [Console]::ReadLine() | Out-Null; $stream.Dispose()"], { windowsHide: true, env: { ...process.env, GRIMO_SETTINGS_LOCK: file }, stdio: 'pipe' })
  const closed = new Promise(resolve => child.once('close', resolve)), deadline = setTimeout(() => child.kill(), 90000)
  try {
    await new Promise<void>((resolve, reject) => { child.once('error', reject); child.stdout.on('data', data => { if (String(data).includes('LOCKED')) resolve() }); void closed.then(() => reject(new Error('settings file lock helper exited'))) })
    await area.getByTestId('setting-server-host').fill('retry-save.test'); await activateLauncherControl(launcher, area.getByTestId('setting-save-btn'))
    await expect(area.getByRole('alert')).toContainText('No se pudieron guardar', { timeout: 45000 }); await expect(area.getByTestId('setting-server-host')).toHaveValue('retry-save.test'); await expect(area.getByRole('status')).toContainText('sin guardar')
    expect(await readFile(file)).toEqual(original); expect((await current(page, path)).server).toBeNull()
    await page.getByTestId('nav-library').click(); await expect(page.getByTestId('settings-draft-dialog')).toBeVisible(); await page.getByTestId('settings-stay').click()
  } finally { child.stdin.end(); await closed; clearTimeout(deadline) }
  await activateLauncherControl(launcher, area.getByTestId('setting-save-btn')); await expect(area.getByRole('status')).toContainText('guardados correctamente'); expect((await disk(path)).server.host).toBe('retry-save.test')
})

test('manual Java validates a real executable, keeps invalid selections and reconciles updates after a pending picker', async ({ launcher }) => {
  test.skip(process.platform !== 'win32', 'Windows executable selection')
  const page = launcher.main, [path] = await seedReactLibrary(page); await open(page); const area = settings(page)
  const home = process.env.JAVA_HOME_17_X64 || process.env.JAVA_HOME, java = home ? join(home, 'bin/java.exe') : execFileSync('where.exe', ['java'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0].trim()
  await stubOpenDialog(launcher, java); await area.getByTestId('setting-java-browse').click()
  await expect(area.getByTestId('setting-java-select')).toHaveValue(java, { timeout: 20000 }); await activateLauncherControl(launcher, area.getByTestId('setting-save-btn')); await expect(area.getByRole('status')).toContainText('guardados correctamente'); expect((await disk(path)).java).toBe(java)
  await stubOpenDialog(launcher, join(launcher.appDataPath, 'missing-java.exe')); await area.getByTestId('setting-java-browse').click(); await expect(area.getByRole('alert')).toContainText('No se pudo validar'); await expect(area.getByTestId('setting-java-select')).toHaveValue(java); expect((await disk(path)).java).toBe(java)
  await launcher.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call'), globals = globalThis as any
    globals.__settingsJavaWaiting = false
    globals.__restoreSettingsJava = () => { ipcMain.removeHandler('service-call'); ipcMain.handle('service-call', original); globals.__resumeSettingsJava?.() }
    ipcMain.removeHandler('service-call'); ipcMain.handle('service-call', async (event: any, service: string, method: string, ...args: any[]) => {
      if (service === 'JavaService' && method === 'resolveJava') { globals.__settingsJavaWaiting = true; await new Promise<void>(resolve => { globals.__resumeSettingsJava = resolve }) }
      return original(event, service, method, ...args)
    })
  })
  try {
    await area.getByTestId('setting-server-host').fill('picker-draft.test'); await stubOpenDialog(launcher, java); await area.getByTestId('setting-java-browse').click()
    await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__settingsJavaWaiting)).toBe(true)
    await call(page, 'editInstance', { instancePath: path, showLog: true })
    await page.getByTestId('nav-library').click(); await expect(page.getByTestId('settings-draft-dialog')).toBeVisible(); await expect(page.getByTestId('settings-leave-discard')).toBeDisabled()
    await launcher.app.evaluate(() => (globalThis as any).__resumeSettingsJava())
    await expect(page.getByTestId('settings-stay')).toBeEnabled(); await page.getByTestId('settings-stay').click(); await expect(area.getByTestId('setting-show-log')).toHaveValue('enabled'); await expect(area.getByTestId('setting-server-host')).toHaveValue('picker-draft.test'); await expect(area.getByTestId('setting-java-select')).toHaveValue(java)
    await activateLauncherControl(launcher, area.getByTestId('setting-save-btn')); await expect(area.getByRole('status')).toContainText('guardados correctamente'); expect(await disk(path)).toMatchObject({ java, showLog: true, server: { host: 'picker-draft.test' } })
  } finally { await launcher.app.evaluate(() => (globalThis as any).__restoreSettingsJava()) }
})

test('invalid drafts and protected exit keep focus, actions and contrast in both themes and sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); const [path] = await seedReactLibrary(page)
  await call(page, 'editInstance', { instancePath: path, server: { host: 'example.test', name: 'Nombre largo '.repeat(25) }, resolution: { width: 1280, monitor: 'monitor-'.repeat(25) } }); await open(page)
  const win = await launcher.app.browserWindow(page); await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size); await focusLauncher(launcher); const area = settings(page)
      await area.getByTestId('setting-server-port').fill('65536'); await activateLauncherControl(launcher, area.getByTestId('setting-save-btn')); await expect(area.getByRole('alert')).toContainText('Revisa el valor'); await expect(area.getByRole('alert')).toBeFocused(); await expect(area.getByRole('alert')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })); await writeFile(testInfo.outputPath(`draft-${theme}-${size[0]}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
      await snap(launcher, `draft-invalid-${theme}-${size[0]}`, 'Invalid draft retained with Native validation, partial inheritance and preserved nested metadata.')
      await page.getByTestId('nav-library').click(); const modal = page.getByTestId('settings-draft-dialog'); await expect(modal).toBeVisible(); await expect(page.getByTestId('settings-stay')).toBeFocused()
      for (let index = 0; index < 5; index++) { await page.keyboard.press('Tab'); expect(await modal.evaluate(element => element.contains(document.activeElement))).toBe(true); await expect(page.locator(':focus')).toBeInViewport({ ratio: 1 }) }
      for (let index = 0; index < 5; index++) { await page.keyboard.press('Shift+Tab'); expect(await modal.evaluate(element => element.contains(document.activeElement))).toBe(true) }
      await page.getByTestId('nav-library').focus(); expect(await modal.evaluate(element => element.contains(document.activeElement))).toBe(true)
      const dialogReport = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })); await writeFile(testInfo.outputPath(`draft-dialog-${theme}-${size[0]}-axe.json`), JSON.stringify(dialogReport, null, 2)); expect(dialogReport.violations).toEqual([])
      await snap(launcher, `draft-exit-${theme}-${size[0]}`, 'Save/discard/stay dialog traps focus and keeps every action reachable in the minimum window.')
      await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0); await expect(page.locator('#root')).not.toHaveAttribute('aria-hidden', 'true'); await expect(page.getByTestId('nav-library')).toBeFocused(); await area.getByTestId('setting-discard-btn').click()
    }
  }
  expect(errors).toEqual([])
})

test('settings text keeps AA contrast over the worst uniform ambient luminance', async ({ launcher }, testInfo) => {
  const page = launcher.main; await seedReactLibrary(page); await open(page); await page.emulateMedia({ reducedMotion: 'reduce' })
  const reports: unknown[] = []
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    await expect(settings(page)).toBeVisible()
    await page.evaluate(theme => {
      const backdrop = document.querySelector<HTMLElement>('.app-backdrop')!, canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')!; context.fillStyle = theme === 'dark' ? '#fff' : '#000'; context.fillRect(0, 0, 1, 1)
      context.fillStyle = getComputedStyle(backdrop, '::after').backgroundColor; context.fillRect(0, 0, 1, 1)
      const color = context.getImageData(0, 0, 1, 1).data
      // Replace poster + veil by their equivalent opaque color, so the ancestor-color helper is exact.
      backdrop.parentElement!.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`; backdrop.style.visibility = 'hidden'
    }, theme)
    const result = await page.evaluate(readTextContrast, '.instance-settings .settings-status, .instance-settings label, .instance-settings legend, .instance-settings h2, .instance-settings p, .instance-settings select:not(:disabled), .instance-settings input:not([type=radio]):not([type=checkbox]):not(:disabled), .instance-settings textarea:not(:disabled), .instance-settings button:not(:disabled)')
    reports.push({ theme, result }); await writeFile(testInfo.outputPath('settings-uniform-contrast.json'), JSON.stringify(reports, null, 2))
    expect(result.length).toBeGreaterThan(15); expect(result.filter(value => value.ratio < 4.5)).toEqual([])
  }
})
