import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { activateLauncherControl, focusLauncher } from '../../helpers/focus-launcher'
import { copyFile, mkdir, readdir, readFile, writeFile, symlink, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })

const mockRegion = fileURLToPath(new URL('../../../mock/saves/1.19.3/region/r.0.0.mca', import.meta.url))

async function open(page: Page) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds')
  await expect(area).toHaveAttribute('aria-busy', 'false')
  return area
}

test('world progress viewer displays advancements, stats, search filters and view modes', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const root = await makeReactWorld(path, 'Alpha', 'Alpha World')

  // Seed sample advancement and stats
  const advDir = join(root, 'advancements')
  await mkdir(advDir, { recursive: true })
  const sampleAdv = {
    'minecraft:story/root': {
      criteria: { crafting_table: '2026-10-31 20:00:00 +0000' },
      done: true,
    },
    'minecraft:story/mine_stone': {
      criteria: { get_stone: '2026-10-31 20:01:00 +0000' },
      done: true,
    },
    'minecraft:story/upgrade_tools': {
      criteria: { wood_pickaxe: '2026-10-31 20:02:00 +0000' },
      done: false,
    },
  }
  await writeFile(join(advDir, '00000000-0000-0000-0000-000000000001.json'), JSON.stringify(sampleAdv))

  const statsDir = join(root, 'stats')
  await mkdir(statsDir, { recursive: true })
  const sampleStats = {
    stats: {
      'minecraft:custom': {
        'minecraft:play_time': 24000,
        'minecraft:deaths': 3,
        'minecraft:mob_kills': 12,
        'minecraft:jump': 150,
      },
    },
    DataVersion: 3953,
  }
  await writeFile(join(statsDir, '00000000-0000-0000-0000-000000000001.json'), JSON.stringify(sampleStats))

  const area = await open(page)
  // Click direct action "Progreso" on Alpha World
  const worldItem = area.locator('li[data-world-name="Alpha"]')
  await expect(worldItem).toBeVisible()
  await worldItem.getByTestId('world-action-progress').click()

  const info = page.getByTestId('world-info')
  await expect(info).toBeVisible()
  const progressSec = info.getByTestId('world-progress')
  await expect(progressSec).toBeVisible()

  // Advancements visible
  await expect(progressSec.getByTestId('progress-advancements')).toBeVisible()
  await expect(progressSec.getByTestId('progress-advancements-container')).toBeVisible()
  await expect(progressSec.locator('li[data-advancement-id="minecraft:story/upgrade_tools"]')).toContainText('Pendiente')

  // Search filter
  const filterInput = progressSec.getByTestId('progress-filter')
  await expect(filterInput).toBeVisible()
  await filterInput.fill('mine_stone')
  await expect(progressSec.locator('li[data-advancement-id="minecraft:story/mine_stone"]')).toBeVisible()
  await expect(progressSec.locator('li[data-advancement-id="minecraft:story/root"]')).toHaveCount(0)

  // Clear filter
  await filterInput.fill('')
  await expect(progressSec.locator('li[data-advancement-id="minecraft:story/root"]')).toBeVisible()

  // Switch to tree view
  const viewModeBtn = progressSec.getByTestId('progress-view-mode')
  await expect(viewModeBtn).toHaveAttribute('aria-label', 'Vista de árbol')
  await viewModeBtn.click()
  await expect(viewModeBtn).toHaveAttribute('aria-label', 'Vista de lista')
  await expect(progressSec.getByTestId('progress-tree')).toBeVisible()

  // Switch to stats tab
  await progressSec.getByTestId('progress-stats').click()
  const statsContainer = progressSec.getByTestId('progress-stats-container')
  await expect(statsContainer).toBeVisible()
  await expect(statsContainer).toContainText('Muertes')
  await expect(statsContainer).toContainText('3')
  await expect(statsContainer).toContainText('Criaturas eliminadas')
  await expect(statsContainer).toContainText('12')

  // Switch back to info tab
  await info.getByTestId('world-tab-info').click()
  await expect(info.getByText('Datapacks del mundo')).toBeVisible()

  // Close details
  await info.getByRole('button', { name: 'Cerrar información del mundo' }).click()
  await expect(info).toHaveCount(0)
})

test('world map renders canvas, selects chunks, copies to clipboard and deletes with backup', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const root = await makeReactWorld(path, 'Beta', 'Beta World')

  // Copy real region fixture
  const regionDir = join(root, 'region')
  await mkdir(regionDir, { recursive: true })
  await copyFile(mockRegion, join(regionDir, 'r.0.0.mca'))

  const area = await open(page)
  const worldItem = area.locator('li[data-world-name="Beta"]')
  await expect(worldItem).toBeVisible()

  // Click direct action "Mapa"
  await worldItem.getByTestId('world-action-map').click()

  const info = page.getByTestId('world-info')
  await expect(info).toBeVisible()
  const mapSec = info.getByTestId('world-map')
  await expect(mapSec).toBeVisible()

  // Canvas element is visible and interactive
  const canvas = mapSec.getByTestId('save-world-map-canvas')
  await expect(canvas).toBeVisible()

  // Dimension select has Overworld
  const dimSelect = mapSec.getByTestId('save-world-map-dim')
  await expect(dimSelect).toBeVisible()
  await expect(dimSelect).toHaveValue('minecraft:overworld')

  // Grid toggle and height slider
  await expect(mapSec.getByTestId('save-world-map-grid-toggle')).toBeVisible()
  await expect(mapSec.getByTestId('save-world-map-height')).toBeVisible()
  await expect(mapSec.getByTestId('save-world-map-legend')).toBeVisible()

  // Center inside chunk 0; the default camera sits on four chunk boundaries.
  await activateLauncherControl(launcher, mapSec.getByRole('button', { name: 'Ir al chunk', exact: true }))
  await canvas.scrollIntoViewIfNeeded()
  await canvas.click({ modifiers: ['Control'] })

  // Selected count chip appears
  const selectedCount = mapSec.getByTestId('save-world-map-selected-count')
  await expect(selectedCount).toBeVisible()
  await expect(selectedCount).toContainText('1 chunks seleccionados')

  // Copy chunks
  const copyBtn = mapSec.getByTestId('save-world-map-copy')
  await expect(copyBtn).toBeVisible()
  await copyBtn.click()

  // Paste button should now be visible and enabled
  const pasteBtn = mapSec.getByTestId('save-world-map-paste')
  await expect(pasteBtn).toBeVisible()
  await expect(pasteBtn).toBeEnabled()

  // Delete chunks button opens confirmation dialog
  const deleteBtn = mapSec.getByTestId('save-world-map-delete')
  await expect(deleteBtn).toBeVisible()
  await deleteBtn.click()

  const confirmModal = page.getByTestId('confirm-dialog')
  await expect(confirmModal).toBeVisible()
  await expect(confirmModal.getByText('Eliminar chunks seleccionados')).toBeVisible()
  await expect(confirmModal.getByText('Se creará automáticamente una copia de seguridad')).toBeVisible()

  // Confirm deletion
  await activateLauncherControl(launcher, confirmModal.getByTestId('chunk-change-submit'))
  await expect(confirmModal.getByTestId('chunk-change-review')).toBeVisible()
  await activateLauncherControl(launcher, confirmModal.getByTestId('chunk-change-submit'))
  await expect(confirmModal).toHaveCount(0)

  // Verify backup created in .backups/world-chunks-*
  const backupsDir = join(root, '.backups')
  const backupFolders = await readdir(backupsDir)
  expect(backupFolders.length).toBeGreaterThan(0)
  expect(backupFolders.some((f) => f.startsWith('world-chunks-'))).toBe(true)

  // Selection cleared
  await expect(selectedCount).toHaveCount(0)

  // Close details
  await info.getByRole('button', { name: 'Cerrar información del mundo' }).click()
  await expect(info).toHaveCount(0)
})

test('native chunk writes reject foreign worlds, invalid dimensions and linked backups, and preserve exact region backups', async ({ launcher }) => {
  const page = launcher.main, [path, other] = await seedReactLibrary(page)
  const root = await makeReactWorld(path, 'Guarded'), foreign = await makeReactWorld(join(launcher.gameDataPath, 'external'), 'Foreign')
  await mkdir(join(root, 'region'), { recursive: true })
  await copyFile(mockRegion, join(root, 'region/r.0.0.mca'))
  const original = await readFile(join(root, 'region/r.0.0.mca'))
  const attempt = (savePath: string, dimension = 'minecraft:overworld') => page.evaluate(async options => {
    try { await (window as any).serviceChannels.open('InstanceSavesService').call('deleteSaveChunks', { ...options, chunks: [{ chunkX: 0, chunkZ: 0 }] }); return 'unexpected success' }
    catch (error: any) { return `${error.name}: ${error.message}` }
  }, { savePath, dimension })
  expect(await attempt(foreign)).toContain('WorldNotFoundError')
  const readGuards = await page.evaluate(async ({ root, foreign, path, other }) => {
    const service = (window as any).serviceChannels.open('InstanceSavesService'), errors: string[] = []
    for (const [method, args] of [
      ['getWorldGenSettings', [foreign]],
      ['getInstanceSaveProgress', [{ savePath: foreign, instancePath: path }]],
      ['getInstanceSaveProgress', [{ savePath: root, instancePath: other }]],
    ] as Array<[string, unknown[]]>) {
      try { await service.call(method, ...args); errors.push('unexpected success') } catch (error: any) { errors.push(error.name) }
    }
    const own = await service.call('getInstanceSaveProgress', { savePath: root, instancePath: path, locale: 'es-ES' })
    return { errors, ownName: own.saveName, noWorldgen: await service.call('getWorldGenSettings', root) === undefined }
  }, { root, foreign, path, other })
  expect(readGuards).toEqual({ errors: ['WorldNotFoundError', 'WorldNotFoundError', 'WorldNotFoundError'], ownName: 'Guarded', noWorldgen: true })
  expect(await attempt(root, 'evil:../../outside')).toContain('Invalid dimension id')
  const externalBackup = join(launcher.gameDataPath, 'external-backup')
  await mkdir(externalBackup); await writeFile(join(externalBackup, 'sentinel'), 'unchanged')
  await symlink(externalBackup, join(root, '.backups'), 'junction')
  expect(await attempt(root)).toContain('Unsafe install directory')
  expect(await readFile(join(root, 'region/r.0.0.mca'))).toEqual(original)
  expect(await readdir(externalBackup)).toEqual(['sentinel'])
  await unlink(join(root, '.backups'))
  const restored = await page.evaluate(async savePath => {
    const service = (window as any).serviceChannels.open('InstanceSavesService'), options = { savePath, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] }
    const before = await service.call('copySaveChunks', options)
    await service.call('deleteSaveChunks', options)
    const deleted = await service.call('copySaveChunks', options)
    await service.call('pasteSaveChunks', { ...options, chunks: before })
    const after = await service.call('copySaveChunks', options)
    return { copied: before.length, deleted: deleted.length, restored: after.length, same: before.length === 1 && after.length === 1 && before[0].compression === after[0].compression && before[0].data.length === after[0].data.length && before[0].data.every((byte: number, index: number) => byte === after[0].data[index]) }
  }, root)
  expect(restored).toEqual({ copied: 1, deleted: 0, restored: 1, same: true })
  const backups = (await readdir(join(root, '.backups'))).filter(name => name.startsWith('world-chunks-'))
  const saved = await Promise.all(backups.map(name => readFile(join(root, '.backups', name, 'Guarded/minecraft_overworld/r.0.0.mca'))))
  expect(saved.some(bytes => bytes.equals(original))).toBe(true)
})

test('world tools maintain accessibility and responsiveness across theme/size matrix', async ({ launcher }, testInfo) => {
  const page = launcher.main, [path] = await seedReactLibrary(page)
  const root = await makeReactWorld(path, 'Gamma', 'Gamma World')
  const regionDir = join(root, 'region')
  await mkdir(regionDir, { recursive: true })
  await copyFile(mockRegion, join(regionDir, 'r.0.0.mca'))

  const win = await launcher.app.browserWindow(page), info = page.getByTestId('world-info')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme)
    await page.reload()
    const area = await open(page), trigger = area.getByRole('button', { name: 'Gamma World', exact: true })
    await trigger.click(); await info.getByTestId('world-tab-map').click()
    for (const [width, height] of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), [width, height])
      await expect(info.getByTestId('world-map')).toBeVisible()
      await focusLauncher(launcher)
      await info.getByRole('button', { name: 'Ir al chunk', exact: true }).focus(); await page.keyboard.press('Tab')
      await expect(info.getByTestId('save-world-map-canvas')).toBeFocused()
      await expect(info.getByTestId('save-world-map-canvas')).toBeInViewport({ ratio: 1 })
      expect(await info.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
      await page.addScriptTag({ content: axe.source })
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      await writeFile(testInfo.outputPath(`tools-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      expect(report.violations).toEqual([])
      await snap(launcher, `world-tools-${theme}-${width}`, 'World tools map in the native supported window size and persisted appearance.')
    }
    await page.keyboard.press('Escape'); await expect(info).toHaveCount(0)
    await expect(trigger).toBeFocused()
  }
})
