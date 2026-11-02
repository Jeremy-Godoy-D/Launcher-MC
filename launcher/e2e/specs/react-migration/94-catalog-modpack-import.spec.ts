import { readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import axe from 'axe-core'
import { test as base, expect } from '../../helpers/scratch'
import type { LauncherFixture } from '../../fixtures/launcher'
import { mockReactCatalog } from '../../helpers/react-catalog'
import { makeReactCurseforgeModpack, makeReactModpack, mockCreationMetadata } from '../../helpers/react-creation'
import { activateLauncherControl } from '../../helpers/focus-launcher'

const test = base.extend<{ catalog: Awaited<ReturnType<typeof mockReactCatalog>> }>({
  catalog: async ({ launcher }, use, info) => {
    const mr = join(launcher.appDataPath, 'source.mrpack'), cf = join(launcher.appDataPath, 'source.zip')
    await makeReactModpack(mr); await makeReactCurseforgeModpack(cf)
    const fixture = await mockReactCatalog(launcher, { modrinth: await readFile(mr), curseforge: await readFile(cf) }), errors: string[] = []
    launcher.main.on('pageerror', error => errors.push(error.message))
    try { await use(fixture) } finally {
      await writeFile(info.outputPath('download-fixture.json'), JSON.stringify({ ...fixture.state, nativeHops: await fixture.hops(), rendererErrors: errors }, null, 2))
      await fixture.close(); expect(errors).toEqual([])
    }
  },
})
test.use({ launcherOptions: { locale: 'es-ES' } })

async function entries(path: string) {
  try { return await readdir(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
}
async function openPack(launcher: LauncherFixture, provider = 'modrinth') {
  const page = launcher.main
  await page.getByTestId('nav-store').click()
  await page.getByTestId(`catalog-source-${provider}`).click()
  await expect(page.locator('.project-card')).toHaveCount(24)
  await expect(page.locator('.project-card').first()).toHaveAttribute('data-project-id', provider === 'modrinth' ? 'AAAA0001' : '1')
  const trigger = page.locator('.project-card').first().getByRole('button', { name: 'Ver contenido', exact: true })
  await trigger.scrollIntoViewIfNeeded(); await activateLauncherControl(launcher, trigger)
  const sheet = page.getByTestId('catalog-project')
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click()
  await expect(page.getByTestId('catalog-import-version')).toBeEnabled()
  return trigger
}

for (const [provider, theme] of [['modrinth', 'dark'], ['curseforge', 'light']]) test(`React downloads a verified ${provider} pack and confirms creation through the existing importer`, async ({ launcher, catalog }, info) => {
  const page = launcher.main, win = await launcher.app.browserWindow(page)
  await mockCreationMetadata(launcher)
  await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(theme)
  await openPack(launcher, provider)
  expect(await entries(join(launcher.gameDataPath, 'instances'))).toEqual([])
  await page.getByTestId('catalog-import-version').click({ clickCount: 2 })
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.import-preview')).toContainText(provider === 'modrinth' ? 'Import QA' : 'CF Import QA')
  await expect(dialog).toHaveCount(1); await expect(page.getByTestId('catalog-project')).toHaveCount(0)
  expect(await entries(join(launcher.gameDataPath, 'instances'))).toEqual([])
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(0)
  const archive = await page.locator('#instance-archive').inputValue()
  const owned = relative(await realpath(join(launcher.gameDataPath, 'modpacks')), await realpath(archive))
  expect(owned.split(sep)).toHaveLength(2); expect(owned).toMatch(/^market-/)
  expect(await readFile(archive)).toEqual(await readFile(join(launcher.appDataPath, provider === 'modrinth' ? 'source.mrpack' : 'source.zip')))
  expect(catalog.state.requests.filter(request => request.url.startsWith('/archive/'))).toHaveLength(1)
  for (const width of [1200, 800]) {
    await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
    await expect(page.getByTestId('instance-create-confirm')).toBeInViewport({ ratio: 1 })
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.evaluate(axe.source)
    const result = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    expect(result.violations).toEqual([]); await writeFile(info.outputPath(`import-${theme}-${width}-axe.json`), JSON.stringify(result, null, 2))
    await page.screenshot({ path: info.outputPath(`import-${theme}-${width}.png`) })
  }
  await page.getByTestId('instance-name').fill(`Catalog ${provider} QA`)
  await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('button', { name: 'Ver instancia', exact: true })).toBeVisible()
  const folders = await entries(join(launcher.gameDataPath, 'instances')); expect(folders).toHaveLength(1)
  const path = join(launcher.gameDataPath, 'instances', folders[0]), saved = JSON.parse(await readFile(join(path, 'instance.json'), 'utf8'))
  expect(saved.runtime.minecraft).toBe('1.21.1')
  expect(saved.runtime[provider === 'modrinth' ? 'fabricLoader' : 'forge']).toBe(provider === 'modrinth' ? '0.16.0' : '52.0.0')
  expect(saved.upstream.type).toBe(`${provider}-modpack`)
  expect(String(saved.upstream[provider === 'modrinth' ? 'versionId' : 'fileId'])).toBe(provider === 'modrinth' ? 'VVVV0001' : '101')
  expect(String(saved.upstream[provider === 'modrinth' ? 'projectId' : 'modId'])).toBe(provider === 'modrinth' ? 'AAAA0001' : '1')
  expect(saved.preExecuteCommand || '').toBe(''); expect(saved.java).not.toBe('untrusted-qa.exe')
  expect(saved.vmOptions || []).not.toContain('-javaagent:untrusted-qa.jar')
  expect(await readFile(join(path, 'config', 'qa.txt'), 'utf8')).toBe(provider === 'modrinth' ? 'preserved-import-fixture' : 'preserved-cf-import-fixture')
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(1)
  expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
  await dialog.getByRole('button', { name: 'Ver instancia', exact: true }).click()
  await expect(page.locator('h1')).toHaveText(`Catalog ${provider} QA`)
})

for (const mode of ['slow', 'metadataSlow'] as const) test(`React cancels a native ${mode} pack request and retries without creating an instance`, async ({ launcher, catalog }, info) => {
  const page = launcher.main, trigger = await openPack(launcher)
  if (mode === 'slow') await (await launcher.app.browserWindow(page)).evaluate(win => win.setContentSize(800, 400))
  catalog.state.fileMode = mode
  await page.getByTestId('catalog-import-version').click()
  await expect.poll(() => mode === 'slow' ? catalog.state.fileStarted : catalog.state.metadataStarted).toBe(true)
  const cancel = page.getByRole('button', { name: 'Cancelar descarga', exact: true })
  await expect(cancel).toBeEnabled(); await expect(cancel).toBeInViewport({ ratio: 1 })
  if (mode === 'slow') {
    await expect.poll(() => page.getByTestId('catalog-download').locator('progress').evaluate((element: HTMLProgressElement) => element.hasAttribute('value') && element.value > 0 && element.max > element.value)).toBe(true)
    await page.screenshot({ path: info.outputPath('download-800.png') })
  }
  await cancel.click()
  await expect(page.getByTestId('catalog-download-error')).toContainText('Descarga cancelada')
  await expect.poll(() => mode === 'slow' ? catalog.state.fileAborted : catalog.state.metadataAborted).toBe(true)
  expect(await entries(join(launcher.gameDataPath, 'instances'))).toEqual([])
  expect(await entries(join(launcher.gameDataPath, 'modpacks'))).toEqual([])
  catalog.state.fileMode = 'normal'
  await page.getByTestId('catalog-import-version').click()
  await expect(page.getByRole('dialog').locator('.import-preview')).toContainText('Import QA')
  expect(await entries(join(launcher.gameDataPath, 'instances'))).toEqual([])
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(trigger).toBeFocused()
})

for (const mode of ['badHash', 'wrongId', 'wrongProject'] as const) test(`React rejects ${mode} before handing an archive to the importer and recovers`, async ({ launcher, catalog }) => {
  const page = launcher.main; await openPack(launcher)
  catalog.state.fileMode = mode
  await page.getByTestId('catalog-import-version').click()
  await expect(page.getByTestId('catalog-download-error')).toContainText('No se pudo descargar o verificar')
  expect(await entries(join(launcher.gameDataPath, 'instances'))).toEqual([])
  expect(await entries(join(launcher.gameDataPath, 'modpacks'))).toEqual([])
  expect(catalog.state.fileStarted).toBe(mode === 'badHash')
  catalog.state.fileMode = 'normal'; await page.getByTestId('catalog-import-version').click()
  await expect(page.getByRole('dialog').locator('.import-preview')).toContainText('Import QA')
})

test('React preserves a pending native creation when a different downloaded pack is handed off', async ({ launcher, catalog }) => {
  const page = launcher.main; await mockCreationMetadata(launcher, false, true)
  await openPack(launcher); await page.getByTestId('catalog-import-version').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('.import-preview')).toContainText('Import QA')
  const original = await page.locator('#instance-archive').inputValue()
  await page.getByTestId('instance-name').fill('Retained catalog QA'); await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('alert')).toContainText('No se pudo terminar')
  const folders = await entries(join(launcher.gameDataPath, 'instances')); expect(folders).toHaveLength(1)
  await dialog.getByRole('button', { name: 'Conservar y cerrar', exact: true }).click()
  await openPack(launcher, 'curseforge'); await page.getByTestId('catalog-import-version').click()
  await expect(dialog.getByRole('alert')).toContainText('creación de instancia pendiente')
  await expect(page.getByTestId('instance-name')).toHaveValue('Retained catalog QA')
  await expect(page.locator('#instance-archive')).toHaveValue(original)
  await page.getByTestId('instance-create-confirm').click()
  await expect(dialog.getByRole('button', { name: 'Ver instancia', exact: true })).toBeVisible()
  expect(await entries(join(launcher.gameDataPath, 'instances'))).toEqual(folders)
  expect(await launcher.app.evaluate(() => (globalThis as any).__creationCalls.length)).toBe(1)
  expect(await readFile(join(launcher.gameDataPath, 'instances', folders[0], 'config', 'qa.txt'), 'utf8')).toBe('preserved-import-fixture')
  expect(catalog.state.requests.filter(request => request.url.startsWith('/archive/'))).toHaveLength(2)
})

test('React offers the source website for a CF file unavailable to applications', async ({ launcher, catalog }) => {
  const page = launcher.main; catalog.state.fileMode = 'blocked'; await openPack(launcher, 'curseforge')
  await page.getByTestId('catalog-import-version').click()
  await expect(page.getByTestId('catalog-download-error')).toContainText('no ofrece un archivo de modpack disponible')
  await expect(page.getByTestId('catalog-project').getByRole('link', { name: 'Ver en la web de origen', exact: true })).toBeVisible()
  expect(catalog.state.metadataStarted).toBe(false); expect(catalog.state.fileStarted).toBe(false)
  expect(await entries(join(launcher.gameDataPath, 'instances'))).toEqual([])
})
