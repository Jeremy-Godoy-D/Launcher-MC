import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test as base, expect } from '../../helpers/scratch'
import { mockPackUpdates } from '../../helpers/react-catalog-pack-update'
import { makeReactWorld } from '../../helpers/react-world'
import { activateLauncherControl } from '../../helpers/focus-launcher'
import type { LauncherFixture } from '../../fixtures/launcher'

const test = base.extend<{ worldChanges: boolean; catalog: Awaited<ReturnType<typeof mockPackUpdates>> }>({
  worldChanges: [false, { option: true }],
  catalog: async ({ launcher, worldChanges }, use, info) => {
    const fixture = await mockPackUpdates(launcher, worldChanges), errors: string[] = []
    launcher.main.on('pageerror', error => errors.push(error.message))
    try { await use(fixture) } finally {
      await writeFile(info.outputPath('pack-update-http.json'), JSON.stringify({ ...fixture.state, network: fixture.network.requests, hops: await fixture.hops(), rendererErrors: errors }, null, 2))
      await fixture.close(); expect(errors).toEqual([])
    }
  },
})
test.use({ launcherOptions: { locale: 'es-ES' } })
async function entries(path: string) { try { return await readdir(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error } }
async function open(launcher: LauncherFixture, path: string, provider: 'modrinth' | 'curseforge') {
  const page = launcher.main
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, name: 'Owned pack', java: 'C:/owned/java.exe', vmOptions: ['-Dlocal=keep'], preExecuteCommand: 'USER VALUE' }), path)
  await page.reload(); await page.getByTestId('nav-library').click()
  await activateLauncherControl(launcher, page.getByRole('button', { name: 'Opciones de Owned pack', exact: true }))
  await page.getByTestId('instance-operations').getByRole('button', { name: 'Actualizar modpack', exact: true }).click()
  const sheet = page.getByTestId('catalog-project')
  await expect(sheet).toBeVisible(); await expect(page.getByTestId('instance-operations')).toHaveCount(0)
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click()
  await expect(sheet.locator('#catalog-target')).toHaveValue(path)
  const id = provider === 'modrinth' ? 'VVVV0002' : '102'
  await sheet.locator(`[data-version-id="${id}"]`).getByTestId('catalog-import-version').click()
  const dialog = page.getByTestId('modpack-update')
  await expect(dialog).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(1)
  return dialog
}

for (const provider of ['modrinth', 'curseforge'] as const) test(`React reviews ${provider} updates from Library and preserves identity, worlds and user settings`, async ({ launcher, catalog }, info) => {
  const page = launcher.main, path = await catalog.seed(provider)
  const world = await makeReactWorld(path, 'Existing'), worldBytes = await readFile(join(world, 'level.dat'))
  await writeFile(join(path, 'config/pack.txt'), 'USER EDIT')
  await page.emulateMedia({ colorScheme: provider === 'modrinth' ? 'dark' : 'light', reducedMotion: 'reduce' })
  const dialog = await open(launcher, path, provider), confirm = dialog.getByRole('button', { name: 'Aplicar actualización', exact: true })
  await expect(confirm).toBeEnabled()
  expect(await readFile(join(path, 'config/pack.txt'), 'utf8')).toBe('USER EDIT')
  await expect(dialog.getByTestId('modpack-update-files')).toContainText('config/pack.txt')
  await expect(dialog.getByTestId('modpack-update-files')).toContainText('config/old.txt')
  const win = await launcher.app.browserWindow(page)
  for (const width of [1200, 800]) {
    await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    await expect(confirm).toBeInViewport({ ratio: 1 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(axe.source)
    const result = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    expect(result.violations).toEqual([]); await writeFile(info.outputPath(`pack-update-${width}-axe.json`), JSON.stringify(result, null, 2))
    await page.screenshot({ path: info.outputPath(`pack-update-${width}.png`) })
  }
  await confirm.click({ clickCount: 2 }); await expect(dialog.getByTestId('modpack-update-complete')).toBeVisible()
  expect(await readFile(join(path, 'config/pack.txt'), 'utf8')).toBe('NEW PACK')
  expect(await readFile(join(path, 'config/new.txt'), 'utf8')).toBe('NEW ONLY')
  expect(await entries(join(path, 'config'))).not.toContain('old.txt')
  expect(await readFile(join(world, 'level.dat'))).toEqual(worldBytes)
  const saved = await page.evaluate(async path => {
    const state = await (window as any).serviceChannels.open('InstanceService').call('getState')
    return state.instances.find((instance: { path: string }) => instance.path === path)
  }, path)
  expect(saved.name).toBe('Owned pack'); expect(saved.java).toBe('C:/owned/java.exe'); expect(saved.vmOptions).toEqual(['-Dlocal=keep']); expect(saved.preExecuteCommand).toBe('USER VALUE')
  expect(provider === 'modrinth' ? saved.runtime.fabricLoader : saved.runtime.forge).toBe(provider === 'modrinth' ? '0.16.1' : '52.0.1')
  expect(provider === 'modrinth' ? saved.upstream.versionId : saved.upstream.fileId).toBe(provider === 'modrinth' ? 'VVVV0002' : 102)
  const backups = await entries(join(path, '.backups')), contents: string[] = []
  for (const name of backups) { try { contents.push(await readFile(join(path, '.backups', name, 'config/pack.txt'), 'utf8')) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error } }
  expect(contents).toContain('USER EDIT')
  expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
})

test.describe('pack updates containing worlds', () => {
  test.use({ worldChanges: true })
  test('React rejects archive changes to an existing world before installing any files', async ({ launcher, catalog }) => {
    const path = await catalog.seed('modrinth'), world = await makeReactWorld(path, 'Existing'), before = await readFile(join(world, 'level.dat'))
    const dialog = await open(launcher, path, 'modrinth')
    await expect(dialog.getByRole('alert')).toContainText('mundos u otros datos personales')
    await expect(dialog.getByRole('button', { name: 'Aplicar actualización', exact: true })).toHaveCount(0)
    expect(await readFile(join(world, 'level.dat'))).toEqual(before)
    expect(await readFile(join(path, 'config/pack.txt'), 'utf8')).toBe('OLD PACK')
  })
})

test('React stops and reviews recovery of a progressive modpack update before completing its runtime', async ({ launcher, catalog }) => {
  const path = await catalog.seed('modrinth'), dialog = await open(launcher, path, 'modrinth')
  catalog.state.slow = true
  await dialog.getByRole('button', { name: 'Aplicar actualización', exact: true }).click()
  await expect.poll(() => catalog.state.fileStarted).toBe(true)
  await expect.poll(() => readFile(join(path, 'config/pack.txt'), 'utf8')).toBe('NEW PACK')
  await dialog.getByRole('button', { name: 'Detener operación', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Actualización detenida')
  await expect.poll(() => catalog.state.fileAborted).toBe(true)
  await expect(dialog.getByTestId('modpack-update-complete')).toHaveCount(0)
  catalog.state.slow = false
  await dialog.getByRole('button', { name: 'Revisar y reanudar', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Aplicar actualización', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: 'Aplicar actualización', exact: true }).click()
  await expect(dialog.getByTestId('modpack-update-complete')).toBeVisible()
  expect(await readFile(join(path, 'config/extra.bin'))).toEqual(catalog.extra)
})
