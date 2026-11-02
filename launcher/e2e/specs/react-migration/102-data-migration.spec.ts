import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap } from '../../helpers/scratch'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'

test.use({ launcherOptions: { locale: 'es-ES' } })
test('data move reviews native paths, preserves occupied folders and cancels without relaunching', async ({ launcher }, info) => {
  const page = launcher.main, root = launcher.gameDataPath, target = join(dirname(root), 'empty-destination'), occupied = join(dirname(root), 'occupied-destination')
  await mkdir(target); await mkdir(occupied); await writeFile(join(occupied, 'keep.txt'), 'existing data')
  await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption('dark'); await page.getByTestId('settings-category-general').click(); await page.getByTestId('global-data-migrate').click()
  await page.getByTestId('data-migration-destination').fill(occupied); await page.getByTestId('data-migration-check').click()
  await expect(page.getByTestId('data-migration-error')).toContainText('contiene archivos')
  expect(await readFile(join(occupied, 'keep.txt'), 'utf8')).toBe('existing data')
  await page.getByTestId('data-migration-destination').fill(join(root, 'nested')); await page.getByTestId('data-migration-check').click()
  await expect(page.getByTestId('data-migration-error')).toContainText('dentro de la carpeta')
  await stubOpenDialog(launcher, target); await page.getByTestId('data-migration-choose').click(); await page.getByTestId('data-migration-check').click()
  await expect(page.getByTestId('data-migration-review')).toContainText(await realpath(target)); await expect(page.getByTestId('data-migration-confirm')).toBeEnabled()
  const win = await launcher.app.browserWindow(page)
  for (const width of [1200, 800]) {
    await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    if (width === 800) await page.evaluate(() => { const key = 'launcher.react.preferences'; localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key) ?? '{}'), appearance: 'light' })); dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key) })) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByTestId('data-migration-confirm')).toBeInViewport({ ratio: 1 })
    await page.evaluate(axe.source)
    const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    await writeFile(info.outputPath(`migration-review-${width}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
    await snap(launcher, `migration-review-${width}`, 'Destino vacío revisado por el servicio nativo; confirmación accesible sin iniciar el traslado.')
  }
  await page.keyboard.press('Escape'); await expect(page.getByTestId('data-migration-dialog')).toHaveCount(0)
  await expect(page.getByTestId('global-data-migrate')).toBeFocused()
  expect(await readFile(join(launcher.appDataPath, 'LauncherMC/root'), 'utf8')).toBe(root)
})

test.describe('committed startup transfer', () => {
  test.use({ launcherOptions: { locale: 'es-ES', migrateData: true, gameDataParentAlias: true, prepareGameData: async root => {
    await mkdir(join(root, 'saves', 'owned-world'), { recursive: true }); await mkdir(join(root, 'jre'))
    await writeFile(join(root, 'saves', 'owned-world', 'keep.txt'), 'WORLD_BYTES_PRESERVED')
    await writeFile(join(root, 'jre', 'keep.txt'), 'JAVA_BYTES_PRESERVED')
    await writeFile(join(dirname(dirname(root)), 'appData/LauncherMC/user-sentinel.json'), '{"preserve":true}')
  } } })
  test('the packaged startup moves only owned data and commits the authoritative location', async ({ launcher }) => {
    const destination = join(await realpath(dirname(launcher.gameDataPath)), 'migrated-data')
    expect(await readFile(join(launcher.appDataPath, 'LauncherMC/root'), 'utf8')).toBe(destination)
    expect(await readFile(join(destination, 'saves', 'owned-world', 'keep.txt'), 'utf8')).toBe('WORLD_BYTES_PRESERVED')
    expect(await readFile(join(destination, 'jre', 'keep.txt'), 'utf8')).toBe('JAVA_BYTES_PRESERVED')
    expect(await readFile(join(launcher.appDataPath, 'LauncherMC/user-sentinel.json'), 'utf8')).toBe('{"preserve":true}')
    expect(await launcher.main.evaluate(() => (window as any).windowController.getMigrationContext())).toEqual({ from: launcher.gameDataPath, to: destination })
    expect(await launcher.main.evaluate(() => (window as any).serviceChannels.open('BaseService').call('getGameDataDirectory'))).toBe(destination)
    await expect(launcher.main.getByTestId('nav-library')).toBeVisible()
  })
})
