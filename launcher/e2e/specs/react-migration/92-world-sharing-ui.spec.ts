import { lstat, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { javaWorldLock } from '../../helpers/java-world-lock'
import { activateLauncherControl } from '../../helpers/focus-launcher'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds'); await expect(area).toHaveAttribute('aria-busy', 'false'); return area
}
async function finish(page: Page) {
  const dialog = page.getByTestId('world-sharing-dialog'); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('Operación completada.'); await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId('instance-worlds')).toHaveAttribute('aria-busy', 'false')
}

test('React shares, activates, deactivates, connects, disconnects and removes common worlds with preserved bytes', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = launcher.gameDataPath
  const local = await makeReactWorld(path, 'Alpha', 'LOCAL'), bytes = await readFile(join(local, 'level.dat'))
  const beta = await makeReactWorld(path, 'Beta', 'LOCAL BETA'), betaBytes = await readFile(join(beta, 'level.dat'))
  const occupied = await makeReactWorld(root, 'Alpha', 'OCCUPIED'), occupiedBytes = await readFile(join(occupied, 'level.dat'))
  const area = await open(page), common = area.getByTestId('worlds-common')
  await area.locator('[data-world-name="Alpha"]').getByRole('button', { name: 'Mover a carpeta común', exact: true }).click()
  expect(await readFile(join(local, 'level.dat'))).toEqual(bytes); await finish(page)
  await expect(area.locator('[data-world-name="Alpha"]')).toHaveCount(0)
  expect(await readFile(join(root, 'saves/Alpha (1)/level.dat'))).toEqual(bytes); expect(await readFile(join(occupied, 'level.dat'))).toEqual(occupiedBytes)
  await common.locator('[data-common-world="Alpha (1)"]').getByRole('button', { name: 'Añadir acceso', exact: true }).click(); await finish(page)
  expect((await lstat(join(path, 'saves/Alpha (1)'))).isSymbolicLink()).toBe(true)
  await expect(common.locator('[data-common-world="Alpha (1)"]').getByRole('button', { name: 'Acceso ya añadido', exact: true })).toBeDisabled()
  await area.locator('[data-world-name="Alpha (1)"]').getByRole('button', { name: 'Retirar acceso', exact: true }).click(); await finish(page)
  expect(await readFile(join(root, 'saves/Alpha (1)/level.dat'))).toEqual(bytes)
  await common.getByRole('button', { name: 'Usar carpeta común', exact: true }).click(); await finish(page)
  expect((await lstat(join(path, 'saves'))).isSymbolicLink()).toBe(true); await expect(common).toContainText('Esta instancia usa la carpeta común')
  expect(await readFile(join(root, 'saves/Beta/level.dat'))).toEqual(betaBytes)
  await common.getByRole('button', { name: 'Usar carpeta independiente', exact: true }).click(); await finish(page)
  expect((await lstat(join(path, 'saves'))).isSymbolicLink()).toBe(false); expect(await readdir(join(path, 'saves'))).toEqual([])
  expect(await readFile(join(root, 'saves/Beta/level.dat'))).toEqual(betaBytes)
  await common.locator('[data-common-world="Alpha (1)"]').getByRole('button', { name: 'Retirar mundo común', exact: true }).click()
  const dialog = page.getByTestId('world-sharing-dialog'); await expect(dialog.getByRole('button', { name: 'Confirmar operación', exact: true })).toBeDisabled()
  await dialog.getByRole('textbox').fill('Alpha (1)'); await finish(page)
  await expect(lstat(join(root, 'saves/Alpha (1)'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(occupied, 'level.dat'))).toEqual(occupiedBytes)
  expect((await readdir(join(root, '.backups')))).not.toHaveLength(0)
  await writeFile(testInfo.outputPath('shared-world-flow.json'), JSON.stringify({ collisionPreserved: true, originalBytesPreserved: true, sixActionsConfirmed: true, gameStarted: false }, null, 2))
})

test('common-world confirmation preserves a world owned by an external Java session and allows retry', async ({ launcher }) => {
  const page = launcher.main; await seedReactLibrary(page)
  const world = await makeReactWorld(launcher.gameDataPath, 'Protected'), bytes = await readFile(join(world, 'level.dat'))
  await writeFile(join(world, 'session.lock'), '☃'); const external = await javaWorldLock(world)
  try {
    const area = await open(page); await area.getByTestId('worlds-common').locator('[data-common-world="Protected"]').getByRole('button', { name: 'Retirar mundo común', exact: true }).click()
    const dialog = page.getByTestId('world-sharing-dialog'); await dialog.getByRole('textbox').fill('Protected')
    await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Cierra todas las partidas')
    expect(await readFile(join(world, 'level.dat'))).toEqual(bytes)
  } finally { await external.release() }
  await finish(page); await expect(lstat(world)).rejects.toHaveProperty('code', 'ENOENT')
})

test('common-world confirmation stays reachable and cancellable in both themes and window sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main; await seedReactLibrary(page)
  const world = await makeReactWorld(launcher.gameDataPath, 'Long', 'Nombre '.repeat(30)), bytes = await readFile(join(world, 'level.dat')), win = await launcher.app.browserWindow(page)
  for (const theme of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(theme)
    const area = await open(page)
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      const trigger = area.getByTestId('worlds-common').locator('[data-common-world="Long"]').getByRole('button', { name: 'Retirar mundo común', exact: true })
      await trigger.scrollIntoViewIfNeeded(); await activateLauncherControl(launcher, trigger)
      const dialog = page.getByTestId('world-sharing-dialog'); await dialog.getByRole('textbox').fill('Long')
      await expect(dialog.getByRole('button', { name: 'Confirmar operación', exact: true })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source); const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); await writeFile(testInfo.outputPath(`sharing-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      await page.screenshot({ path: testInfo.outputPath(`sharing-${theme}-${width}.png`) }); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused()
      expect(await readFile(join(world, 'level.dat'))).toEqual(bytes)
    }
  }
})
