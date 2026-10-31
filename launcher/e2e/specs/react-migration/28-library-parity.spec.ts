import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function copy(page: Page, name = 'Mi mundo', pending = false) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Opciones de ${name}`, exact: true }).click()
  await page.getByRole('button', { name: pending ? 'Reanudar copia' : 'Duplicar', exact: true }).click()
  await page.getByTestId('instance-operation-confirm').click()
}
const groups = { 'explorar.jar': 'Exploración', 'fast.jar.disabled': 'Rendimiento' }

test('library search preserves trimmed Minecraft and loader-version queries without changing selection', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await page.getByTestId('nav-library').click()
  const search = page.getByLabel('Buscar instancias', { exact: true })
  for (const [query, names] of [
    [' 1.21.1 ', ['Mi mundo', 'Fabric QA']], ['fAbRiC 0.16.0', ['Fabric QA']],
    [' Vanilla ', ['Mi mundo', 'Bajo la superficie']], [' 1.20.4 ', ['Bajo la superficie']], [' mundo ', ['Mi mundo']],
  ] as const) {
    await search.fill(query)
    await expect(page.locator('.instance-card h3')).toHaveText([...names])
  }
  await search.fill('1.21.1'); await page.getByLabel('Filtrar por loader', { exact: true }).selectOption('Fabric')
  await expect(page.locator('.instance-card h3')).toHaveText(['Fabric QA'])
  await search.fill('missing-instance')
  await expect(page.getByRole('heading', { name: 'No encontramos esa instancia', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar búsqueda', exact: true }).click()
  await expect(page.locator('.instance-card')).toHaveCount(3)
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[0])
})

test('duplicating preserves the legacy group map without modifying the source or unrelated saved data', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await mkdir(join(paths[0], 'saves/world'), { recursive: true }); await writeFile(join(paths[0], 'saves/world/level.dat'), 'KEEP')
  const nativeGroups = JSON.stringify({ Explorar: { color: '#aa8833', files: ['explorar.jar'] } })
  await writeFile(join(paths[0], 'mod-groups.json'), nativeGroups)
  const original = { [paths[0]]: groups, unknown: { 'other.jar': 'Conservar' } }
  await page.evaluate(value => localStorage.setItem('modsGrouping', JSON.stringify(value)), original)
  await copy(page)
  await expect(page.getByTestId('instance-operations')).toHaveCount(0)
  const destination = await page.evaluate(() => localStorage.getItem('selectedInstancePath'))
  expect(destination).toBeTruthy(); expect(destination).not.toBe(paths[0])
  const value = await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))
  expect(value).toEqual({ ...original, [destination!]: groups })
  expect(await readFile(join(destination!, 'saves/world/level.dat'), 'utf8')).toBe('KEEP')
  expect(await readFile(join(paths[0], 'saves/world/level.dat'), 'utf8')).toBe('KEEP')
  expect(await readFile(join(destination!, 'mod-groups.json'), 'utf8')).toBe(nativeGroups)
  expect(await readFile(join(paths[0], 'mod-groups.json'), 'utf8')).toBe(nativeGroups)
})

test('a preference write failure retains the completed native copy and retries without copying again or replacing destination edits', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  const original = { [paths[0]]: groups, unknown: { 'other.jar': 'Keep' } }
  await page.evaluate(value => {
    localStorage.setItem('modsGrouping', JSON.stringify(value))
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function(key, value) {
      if (key === 'modsGrouping') throw new DOMException('Fixture quota', 'QuotaExceededError')
      original.call(this, key, value)
    }
    ;(window as any).__restoreGroupsStorage = () => { Storage.prototype.setItem = original }
  }, original)
  await copy(page)
  const panel = page.getByTestId('instance-copy')
  await expect(panel.getByRole('alert')).toContainText('La instancia ya se copió')
  const destination = (await page.getByTestId('copy-path').textContent())!
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual(original)
  expect(await readFile(join(destination, 'instance.json'), 'utf8')).toBeTruthy()
  await expect(readFile(join(destination, '.copy-job.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  const count = () => page.evaluate(async () => (await (window as any).serviceChannels.open('InstanceService').call('getSharedInstancesState')).instances.length)
  expect(await count()).toBe(4)
  const reports: unknown[] = [], win = await launcher.app.browserWindow(page)
  for (const appearance of ['dark', 'light']) {
    await page.evaluate(appearance => localStorage.setItem('launcher.react.preferences', JSON.stringify({ ...JSON.parse(localStorage.getItem('launcher.react.preferences')!), appearance })), appearance)
    // Do not reload away the completed-copy retry state when checking the other theme.
    await page.evaluate(() => window.dispatchEvent(new StorageEvent('storage', { key: 'launcher.react.preferences', newValue: localStorage.getItem('launcher.react.preferences') })))
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance)
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await panel.getByRole('region').focus(); await page.keyboard.press('End')
      await expect(panel.getByRole('alert')).toBeInViewport({ ratio: 1 })
      await expect(page.getByTestId('copy-finish')).toBeInViewport({ ratio: 1 })
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); reports.push(report)
      await snap(launcher, `legacy-groups-retry-${appearance}-${width}`, 'La copia nativa terminó; fallo de almacenamiento simulado. Reintentar grupos conserva el mismo destino.')
    }
  }
  await writeFile(testInfo.outputPath('legacy-groups-accessibility.json'), JSON.stringify(reports))
  await page.evaluate(({ destination }) => {
    ;(window as any).__restoreGroupsStorage()
    const groups = JSON.parse(localStorage.getItem('modsGrouping')!)
    groups[destination] = { 'edited.jar': 'My edit' }
    localStorage.setItem('modsGrouping', JSON.stringify(groups))
  }, { destination })
  await page.getByTestId('copy-finish').click()
  await expect(page.getByTestId('instance-operations')).toHaveCount(0)
  expect(await count()).toBe(4)
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(destination)
  expect(await page.evaluate(destination => JSON.parse(localStorage.getItem('modsGrouping')!)[destination], destination)).toEqual({ 'edited.jar': 'My edit' })
})

test('resuming a persisted copy keeps its original source group map after the pending state disappears', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await mkdir(join(paths[0], 'config'), { recursive: true }); await writeFile(join(paths[0], 'config/source.txt'), 'KEEP')
  const destination = await page.evaluate(async () => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Pending groups', runtime: { minecraft: '1.21.1' } }))
  await writeFile(join(destination, '.copy-job.json'), JSON.stringify({ version: 1, id: randomUUID(), source: paths[0], files: [{ path: 'config/source.txt', size: 4, sha256: createHash('sha256').update('KEEP').digest('hex') }] }))
  await page.evaluate(async ({ source, destination, groups }) => {
    localStorage.setItem('modsGrouping', JSON.stringify({ [source]: groups }))
    await (window as any).serviceChannels.open('InstanceService').call('getInstanceCopyState', destination)
  }, { source: paths[0], destination, groups })
  await page.reload()
  await copy(page, 'Pending groups', true)
  await expect(page.getByTestId('instance-operations')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('modsGrouping')!))).toEqual({ [paths[0]]: groups, [destination]: groups })
  expect(await readFile(join(destination, 'config/source.txt'), 'utf8')).toBe('KEEP')
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(destination)
})
