import { lstat, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, type Page } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { javaWorldLock } from '../../helpers/java-world-lock'
import { seedReactLibrary } from '../../helpers/react-library'
import { activateLauncherControl } from '../../helpers/focus-launcher'

let external: Awaited<ReturnType<typeof javaWorldLock>> | undefined
test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true, prepareGameData: async root => {
  const source = join(root, 'legacy-source'); await makeReactWorld(source, 'Legacy', 'Earlier world')
  await rename(join(source, 'saves'), join(root, 'shared-saves')); await writeFile(join(root, 'shared-saves/note.txt'), 'ORIGINAL NOTE')
  const world = join(root, 'shared-saves/Legacy'); await writeFile(join(world, 'session.lock'), '☃'); external = await javaWorldLock(world)
} } })
test.afterEach(async () => { await external?.release(); external = undefined })
function call(page: Page, method: string) { return page.evaluate(method => (window as any).serviceChannels.open('InstanceSavesService').call(method), method) }

test('Native exposes blocked recovery safely and recovers without restart after the external session closes', async ({ launcher }, testInfo) => {
  const root = launcher.gameDataPath, bytes = await readFile(join(root, 'shared-saves/Legacy/level.dat'))
  expect(external?.status).toBe('LOCKED')
  expect(await call(launcher.main, 'getLegacyWorldMigrationStatus')).toEqual({ status: 'blocked', reason: 'running' })
  expect(await call(launcher.main, 'retryLegacyWorldMigration')).toEqual({ status: 'blocked', reason: 'running' })
  expect(await readFile(join(root, 'shared-saves/Legacy/level.dat'))).toEqual(bytes)
  expect(await readdir(join(root, 'saves'))).toEqual([])
  await external?.release(); external = undefined
  expect(await call(launcher.main, 'retryLegacyWorldMigration')).toEqual({ status: 'ready' })
  expect(await call(launcher.main, 'getSharedSaves')).toHaveLength(1)
  expect(await readFile(join(root, 'saves/Legacy/level.dat'))).toEqual(bytes)
  await expect(lstat(join(root, 'shared-saves'))).rejects.toHaveProperty('code', 'ENOENT')
  const [folder] = await readdir(join(root, '.backups')), original = join(root, '.backups', folder, 'shared-saves/Legacy/level.dat')
  expect(await readFile(original)).toEqual(bytes)
  expect((await lstat(original, { bigint: true })).ino).not.toBe((await lstat(join(root, 'saves/Legacy/level.dat'), { bigint: true })).ino)
  await writeFile(testInfo.outputPath('recovered-world.json'), JSON.stringify({ independent: true, originalsPreserved: true, gameStarted: false }, null, 2))
})

test('React explains blocked recovery and permits keyboard retry in both themes and window sizes', async ({ launcher }, testInfo) => {
  test.skip(process.env.LAUNCHER_RENDERER === 'vue', 'React recovery banner; Native recovery is tested in both renderers')
  const page = launcher.main, [path] = await seedReactLibrary(page), root = launcher.gameDataPath, bytes = await readFile(join(root, 'shared-saves/Legacy/level.dat'))
  const win = await launcher.app.browserWindow(page), errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  for (const theme of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(theme)
    await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
    await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
    const area = page.getByTestId('instance-worlds'), warning = area.getByTestId('worlds-migration-warning'), retry = warning.getByRole('button', { name: 'Reintentar recuperación de mundos', exact: true })
    await expect(area).toHaveAttribute('aria-busy', 'false')
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect(warning).toContainText('Sus originales se conservan'); await expect(warning).toContainText('Cierra todas las partidas')
      await activateLauncherControl(launcher, retry); await expect(retry).toBeEnabled(); await expect(retry).toBeFocused(); await expect(retry).toBeInViewport({ ratio: 1 })
      expect(await call(page, 'getLegacyWorldMigrationStatus')).toEqual({ status: 'blocked', reason: 'running' })
      expect(await readFile(join(root, 'shared-saves/Legacy/level.dat'))).toEqual(bytes)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source); const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); await writeFile(testInfo.outputPath(`recovery-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      await page.screenshot({ path: testInfo.outputPath(`recovery-${theme}-${width}.png`) })
    }
  }
  await external?.release(); external = undefined
  const area = page.getByTestId('instance-worlds')
  await activateLauncherControl(launcher, area.getByRole('button', { name: 'Reintentar recuperación de mundos', exact: true }))
  await expect(area.getByTestId('worlds-migration-warning')).toHaveCount(0); await expect(area.getByLabel('Buscar mundos')).toBeFocused()
  expect(await call(page, 'getLegacyWorldMigrationStatus')).toEqual({ status: 'ready' })
  expect(await readFile(join(root, 'saves/Legacy/level.dat'))).toEqual(bytes)
  await page.reload(); await expect(area).toHaveAttribute('aria-busy', 'false'); await expect(area.getByTestId('worlds-migration-warning')).toHaveCount(0)
  expect(path).toContain('instances'); expect(errors).toEqual([])
})
