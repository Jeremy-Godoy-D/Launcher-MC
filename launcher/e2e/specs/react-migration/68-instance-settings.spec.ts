import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { focusLauncher } from '../../helpers/focus-launcher'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })

async function openWorkspace(page: Page, name = 'Mi mundo') {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Administrar ${name}`, exact: true }).click()
  const workspace = page.getByTestId('instance-workspace')
  await expect(workspace).toBeVisible()
  return workspace
}

test('instance summary displays metadata, quick actions and navigates to sub-routes', async ({ launcher }) => {
  const page = launcher.main
  const [instPath] = await seedReactLibrary(page)

  const workspace = await openWorkspace(page)

  // Verify summary header & details
  await expect(workspace.getByRole('heading', { name: 'Resumen' })).toBeVisible()
  await expect(workspace.locator('.instance-details')).toContainText('1.21.1')
  await expect(workspace.locator('.instance-details')).toContainText('Vanilla')
  await expect(workspace.locator('.instance-details')).toContainText('Tiempo jugado')
  await expect(workspace.locator('.instance-path')).toContainText(instPath)

  // Verify shortcut navigation buttons
  const shortcuts = workspace.locator('.content-selection')
  await expect(shortcuts.getByRole('link', { name: 'Ajustes' })).toBeVisible()
  await expect(shortcuts.getByRole('link', { name: 'Mods' })).toBeVisible()
  await expect(shortcuts.getByRole('link', { name: 'Mundos' })).toBeVisible()
  await expect(shortcuts.getByRole('link', { name: 'Consola' })).toBeVisible()

  // Click on "Ajustes" shortcut
  await shortcuts.getByRole('link', { name: 'Ajustes' }).click()

  // Base settings page renders
  const settingsSec = page.getByTestId('instance-base-setting')
  await expect(settingsSec).toBeVisible()
  await expect(settingsSec.getByRole('heading', { name: 'Ajustes de la instancia' })).toBeVisible()
})

test('instance base settings configures memory, JVM, resolution and server with reset and persistence', async ({ launcher }) => {
  const page = launcher.main
  const [instPath] = await seedReactLibrary(page)

  const workspace = await openWorkspace(page)
  await workspace.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Ajustes' }).click()

  const settingsSec = page.getByTestId('instance-base-setting')
  await expect(settingsSec).toBeVisible()

  // Initial state: Inherit mode
  const memInherit = settingsSec.getByTestId('setting-memory-mode-inherit')
  await expect(memInherit).toBeChecked()

  const resInherit = settingsSec.getByTestId('setting-resolution-mode-inherit')
  await expect(resInherit).toBeChecked()

  // Switch to custom memory
  const memCustom = settingsSec.getByTestId('setting-memory-mode-custom')
  await memCustom.click()
  await expect(memCustom).toBeChecked()

  const minMemInput = settingsSec.getByTestId('setting-memory-min')
  await expect(minMemInput).toBeVisible()
  await minMemInput.fill('2048')

  const maxMemInput = settingsSec.getByTestId('setting-memory-max')
  await expect(maxMemInput).toBeVisible()
  await maxMemInput.fill('6144')

  // Set JVM arguments
  const vmInput = settingsSec.getByTestId('setting-vm-options')
  await vmInput.getByRole('combobox').selectOption('custom')
  for (const argument of ['-XX:+UseG1GC', '-Dtest.option=true']) {
    await vmInput.getByRole('button', { name: 'Añadir argumento', exact: false }).click()
    await vmInput.getByRole('textbox').last().fill(argument)
  }

  // Switch to custom resolution
  const resCustom = settingsSec.getByTestId('setting-resolution-mode-custom')
  await resCustom.click()
  await expect(resCustom).toBeChecked()

  const resWidth = settingsSec.getByTestId('setting-resolution-width')
  await expect(resWidth).toBeVisible()
  await resWidth.fill('1280')

  const resHeight = settingsSec.getByTestId('setting-resolution-height')
  await expect(resHeight).toBeVisible()
  await resHeight.fill('720')

  const resFullscreen = settingsSec.getByTestId('setting-resolution-fullscreen')
  await resFullscreen.selectOption('enabled')
  await expect(resFullscreen).toHaveValue('enabled')

  // Set quick play server
  const srvHost = settingsSec.getByTestId('setting-server-host')
  await srvHost.fill('mc.hypixel.net')

  const srvPort = settingsSec.getByTestId('setting-server-port')
  await srvPort.fill('25565')

  // Set launch flags
  const fastLaunch = settingsSec.getByTestId('setting-fast-launch')
  await fastLaunch.selectOption('enabled')

  const hideLauncher = settingsSec.getByTestId('setting-hide-launcher')
  await hideLauncher.selectOption('enabled')

  // Save changes
  const saveBtn = settingsSec.getByTestId('setting-save-btn')
  await saveBtn.click()

  // Success badge appears
  await expect(settingsSec.getByRole('status')).toContainText('Ajustes de la instancia guardados correctamente')

  // Verify persistence in instance.json on disk
  const configFile = join(instPath, 'instance.json')
  const diskData = JSON.parse(await readFile(configFile, 'utf8'))
  expect(diskData.minMemory).toBe(2048)
  expect(diskData.maxMemory).toBe(6144)
  expect(diskData.assignMemory).toBe(true)
  expect(diskData.vmOptions).toEqual(['-XX:+UseG1GC', '-Dtest.option=true'])
  expect(diskData.resolution).toEqual({ width: 1280, height: 720, fullscreen: true })
  expect(diskData.server).toEqual({ host: 'mc.hypixel.net', port: 25565 })
  expect(diskData.fastLaunch).toBe(true)
  expect(diskData.hideLauncher).toBe(true)

  // Test "Restablecer a valores globales"
  const resetBtn = settingsSec.getByTestId('setting-reset-btn')
  await resetBtn.click()
  await page.getByTestId('settings-reset-confirm').click()

  await expect(settingsSec.getByRole('status')).toContainText('Ajustes restablecidos a los valores globales')

  // Verify reset on disk
  const resetData = JSON.parse(await readFile(configFile, 'utf8'))
  expect(resetData.minMemory).toBeUndefined()
  expect(resetData.maxMemory).toBeUndefined()
  expect(resetData.assignMemory).toBeUndefined()
  expect(resetData.vmOptions).toBeUndefined()
  expect(resetData.resolution).toBeUndefined()
  expect(resetData.server).toBeUndefined()
  expect(resetData.fastLaunch).toBeUndefined()
  expect(resetData.hideLauncher).toBeUndefined()
})

test('instance settings maintain accessibility and responsiveness across theme/size matrix', async ({ launcher }, testInfo) => {
  const page = launcher.main
  await seedReactLibrary(page)

  const workspace = await openWorkspace(page)
  await workspace.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Ajustes' }).click()

  const settingsSec = page.getByTestId('instance-base-setting')
  await expect(settingsSec).toBeVisible()

  const win = await launcher.app.browserWindow(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light'] as const) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme)
    await page.reload()

    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, width === 800 ? 400 : 720])
      await expect(settingsSec).toBeVisible()
      const save = settingsSec.getByTestId('setting-save-btn')
      await focusLauncher(launcher)
      await settingsSec.getByTestId('setting-discard-btn').focus(); await page.keyboard.press('Tab')
      await expect(save).toBeFocused(); await expect(save).toBeInViewport({ ratio: 1 })
      expect(await settingsSec.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(async () =>
        (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }),
      )
      await writeFile(testInfo.outputPath(`settings-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])

      await snap(launcher, `instance-settings-${theme}-${width}`, 'Instance settings view.')
    }
  }
})
