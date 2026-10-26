import { access, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { mockLaunchRuntime, addLaunchProfile } from '../../helpers/react-launch'
import { makeReactModpack, mockCreationMetadata } from '../../helpers/react-creation'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'

test.use({
  launcherOptions: { seed: { name: 'Launch base QA', minecraft: '1.21.1' }, locale: 'es-ES' },
})

for (const javaMode of ['download', 'fail'] as const)
  test(`missing Java: ${javaMode}, official manual fallback and no launch before confirmation`, async ({
    launcher,
  }, testInfo) => {
    const page = launcher.main
    await mockLaunchRuntime(launcher, javaMode)
    await addLaunchProfile(launcher)
    await page.getByTestId('featured-play').click()
    const dialog = page.getByRole('dialog')
    await expect(page.getByTestId('launch-confirm')).toHaveText('Instalar y jugar')
    await expect(dialog).toContainText('descargará automáticamente')
    expect(
      await launcher.app.evaluate(() =>
        (globalThis as any).__launchTrace.includes('VersionInstallService.install'),
      ),
    ).toBe(false)
    await page.getByTestId('launch-confirm').click()
    if (javaMode === 'fail') {
      await expect(dialog.getByRole('alert')).toContainText('Java válido y compatible')
      await expect(dialog).toContainText('Java previsto: 21')
      await expect(
        dialog.getByRole('link', { name: 'Descargar Java desde Eclipse Adoptium' }),
      ).toHaveAttribute(
        'href',
        'https://adoptium.net/temurin/releases/?version=21&os=windows&arch=x64',
      )
      const win = await launcher.app.browserWindow(page)
      await win.evaluate((win) => win.setContentSize(800, 400))
      await dialog.getByRole('button', { name: 'Volver a detectar Java' }).scrollIntoViewIfNeeded()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.evaluate(axe.source)
      const result = await page.evaluate(async () =>
        (window as any).axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        }),
      )
      expect(result.violations).toEqual([])
      await writeFile(
        testInfo.outputPath('java-fallback-accessibility.json'),
        JSON.stringify(result, null, 2),
      )
      await snap(
        launcher,
        'java-manual-fallback-800',
        'Fallo de descarga Java: requisito, enlace oficial y detección manual; sin ejecutar Java real.',
      )
      expect(await launcher.app.evaluate(() => (globalThis as any).__launchCalls.length)).toBe(0)
      await dialog.getByRole('button', { name: 'Volver a detectar Java' }).click()
      await expect(page.getByTestId('launch-confirm')).toHaveText('Jugar')
      expect(await launcher.app.evaluate(() => (globalThis as any).__launchCalls.length)).toBe(0)
      await page.getByTestId('launch-confirm').click()
    }
    await expect(dialog.getByRole('status').filter({ hasText: 'En ejecución' })).toBeVisible()
    expect(await launcher.app.evaluate(() => (globalThis as any).__launchCalls.length)).toBe(1)
  })

test('launch checks profile and physical directory, confirms once, restores processes and stops without spawning Java', async ({
  launcher,
}, testInfo) => {
  const page = launcher.main
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await mockLaunchRuntime(launcher)
  await page.getByTestId('featured-play').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('alert')).toContainText('perfil local')
  await expect(page.getByTestId('launch-confirm')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await addLaunchProfile(launcher)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const win = await launcher.app.browserWindow(page)
  const reports: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click()
    await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await page.getByTestId('nav-home').click()
    await page.getByTestId('featured-play').click()
    await expect(page.getByTestId('launch-confirm')).toBeEnabled()
    for (const width of [1200, 800]) {
      await win.evaluate(
        (win, width) => win.setContentSize(width, width === 800 ? 400 : 720),
        width,
      )
      await expect(page.getByTestId('launch-confirm')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      )
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () =>
        (window as any).axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        }),
      )
      expect(report.violations).toEqual([])
      reports.push({ appearance, width, ...report })
      await snap(
        launcher,
        `launch-${appearance}-${width}`,
        'Confirmación nativa del lanzamiento con Java sintético y sin proceso real; footer accesible en ventana mínima.',
      )
    }
    await page.keyboard.press('Escape')
  }
  await writeFile(
    testInfo.outputPath('launch-accessibility.json'),
    JSON.stringify(reports, null, 2),
  )
  const path = (await page.evaluate(() => localStorage.getItem('selectedInstancePath')))!
  expect(
    await page.evaluate(async () =>
      (window as any).serviceChannels
        .open('InstanceService')
        .call('validateInstancePath', 'relative-missing'),
    ),
  ).toBe('bad')
  await rename(path, `${path}-retained`)
  await page.getByTestId('featured-play').click()
  await expect(dialog.getByRole('alert')).toContainText('carpeta')
  await expect(access(path)).rejects.toThrow()
  await page.keyboard.press('Escape')
  await rename(`${path}-retained`, path)
  await page.getByTestId('featured-play').click()
  await expect(page.getByTestId('launch-confirm')).toBeEnabled()
  expect(await launcher.app.evaluate(() => (globalThis as any).__launchCalls.length)).toBe(0)
  await page.getByTestId('launch-confirm').click({ clickCount: 2 })
  await expect(dialog.getByRole('status').filter({ hasText: 'En ejecución' })).toBeVisible()
  expect(await launcher.app.evaluate(() => (globalThis as any).__launchCalls.length)).toBe(1)
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('react-prototype')).toHaveAttribute(
    'data-motion-state',
    /"gameRunning":true/,
  )
  await page.reload()
  await expect(page.getByTestId('react-prototype')).toHaveAttribute(
    'data-motion-state',
    /"gameRunning":true/,
  )
  await win.evaluate((win) => {
    win.setContentSize(1200, 720)
    win.center()
    win.show()
    win.focus()
  })
  await page.evaluate(async () => {
    await (window as any).serviceChannels
      .open('InstanceService')
      .call('createInstance', { name: 'Caves video QA', runtime: { minecraft: '1.20.4' } })
  })
  await page.getByRole('button', { name: 'Siguiente instancia', exact: true }).click()
  await expect(page.locator('.featured h2')).toHaveText('Caves video QA')
  await page.getByRole('button', { name: 'Reanudar presentación', exact: true }).click()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByTestId('nav-home').focus()
  await page.mouse.move(70, 20)
  await win.evaluate((win) => win.focus())
  await expect(page.locator('video')).toHaveAttribute('data-state', 'paused')
  await expect.poll(() => page.locator('video').evaluate((video) => video.paused)).toBe(true)
  await writeFile(testInfo.outputPath('launch-focus-before-interaction.json'), JSON.stringify({
    native: await win.evaluate(win => ({ focused: win.isFocused(), minimized: win.isMinimized(), contentsFocused: win.webContents.isFocused() })),
    document: await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState })),
  }, null, 2))
  // Restore native and renderer focus before mouse actionability checks on Windows.
  await win.evaluate(win => {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
    win.webContents.focus()
  })
  await expect.poll(() => win.evaluate(win => win.isFocused() && win.webContents.isFocused())).toBe(true)
  await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true)
  await page.locator('.sidebar-instance button').click()
  await page.getByRole('button', { name: 'Ver partida', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Detener partida', exact: true })).toBeEnabled()
  await win.evaluate((win) => {
    win.show()
    win.focus()
  })
  await expect.poll(() => win.evaluate((win) => win.isVisible() && win.isFocused())).toBe(true)
  await expect(dialog.getByRole('button', { name: 'Detener partida', exact: true })).toBeInViewport(
    { ratio: 1 },
  )
  await dialog.getByRole('button', { name: 'Detener partida', exact: true }).press('Enter')
  await expect(dialog.getByRole('status')).toContainText('ha terminado')
  await expect(page.getByTestId('react-prototype')).toHaveAttribute(
    'data-motion-state',
    /"gameRunning":false/,
  )
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await page.getByTestId('nav-home').click()
  await expect(page.locator('.featured h2')).toHaveText('Caves video QA')
  await page.getByTestId('nav-home').focus()
  await page.mouse.move(70, 20)
  await win.evaluate((win) => win.focus())
  await expect
    .poll(async () => {
      await win.evaluate((win) => {
        win.show()
        win.focus()
        win.webContents.focus()
      })
      await page.getByTestId('nav-home').focus()
      await page.mouse.move(70, 20)
      return page.locator('video').evaluate((video) =>
        JSON.stringify({
          advanced: video.currentTime > 0.1,
          time: video.currentTime,
          paused: video.paused,
          ready: video.readyState,
          network: video.networkState,
          error: video.error?.code,
          visibility: document.visibilityState,
          focused: document.hasFocus(),
          motion: document.querySelector('[data-motion-state]')?.getAttribute('data-motion-state'),
        }),
      )
    })
    .toContain('"advanced":true')
  await expect(page.locator('video')).toHaveAttribute('data-state', 'playing')
  expect(errors).toEqual([])
})

test('launch recovers an imported manifest after renderer destruction without duplicating the instance', async ({
  launcher,
}) => {
  const page = launcher.main
  await mockCreationMetadata(launcher, false, true)
  await mockLaunchRuntime(launcher)
  await addLaunchProfile(launcher)
  const archive = join(launcher.gameDataPath, 'launch-recovery.mrpack')
  await makeReactModpack(archive)
  await page.getByTestId('nav-library').click()
  await page.getByTestId('library-create-instance').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Importar modpack', exact: true }).click()
  await stubOpenDialog(launcher, archive)
  await dialog.getByRole('button', { name: 'Elegir archivo de modpack', exact: true }).click()
  await expect(page.getByTestId('instance-create-confirm')).toBeEnabled()
  await page.getByTestId('instance-name').fill('Launch recovered QA')
  await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('alert')).toContainText('No se pudo terminar')
  await dialog.getByRole('button', { name: 'Conservar y cerrar', exact: true }).click()
  await page.reload()
  const card = page
    .locator('.instance-card')
    .filter({ has: page.getByRole('heading', { name: 'Launch recovered QA', exact: true }) })
  await card.getByRole('button', { name: 'Jugar Launch recovered QA', exact: true }).click()
  await expect(page.getByTestId('launch-confirm')).toHaveText('Instalar y jugar')
  const path = await page.evaluate(() => localStorage.getItem('selectedInstancePath'))
  await access(join(path!, '.install-manifest'))
  expect(await launcher.app.evaluate(() => (globalThis as any).__launchCalls.length)).toBe(0)
  await page.getByTestId('launch-confirm').click()
  await expect
    .poll(() => launcher.app.evaluate(() => (globalThis as any).__launchTrace.join(' > ')))
    .toContain('LaunchService.launch')
  await expect(dialog.getByRole('status').filter({ hasText: 'En ejecución' })).toBeVisible()
  expect(await readFile(join(path!, 'config', 'qa.txt'), 'utf8')).toBe('preserved-import-fixture')
  await expect(access(join(path!, '.install-manifest'))).rejects.toThrow()
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(1)
  expect(
    await launcher.app.evaluate(() => {
      const options = (globalThis as any).__launchCalls[0]
      return {
        count: (globalThis as any).__launchCalls.length,
        name: options.user.profiles[options.user.selectedProfile].name,
        noImportedCommand: !options.preExecuteCommand,
        noImportedJava: options.java !== 'untrusted-qa.exe',
      }
    }),
  ).toEqual({ count: 1, name: 'Launch_QA', noImportedCommand: true, noImportedJava: true })
  await snap(
    launcher,
    'launch-import-recovered',
    'Manifest local aplicado tras recarga; mismo directorio, perfil confirmado, proceso sintético sin Java real.',
  )
})
