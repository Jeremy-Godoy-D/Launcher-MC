import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import axe from 'axe-core'
import { test as base, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { mockCatalogContent } from '../../helpers/react-catalog-content'
import { activateLauncherControl } from '../../helpers/focus-launcher'
import { makeReactMod } from '../../helpers/react-content'
import type { LauncherFixture } from '../../fixtures/launcher'

const test = base.extend<{ kind: 'mod' | 'resourcepack' | 'shader'; catalog: Awaited<ReturnType<typeof mockCatalogContent>> }>({
  kind: ['mod', { option: true }],
  catalog: async ({ launcher, kind }, use, info) => {
    const fixture = await mockCatalogContent(launcher, kind), errors: string[] = []
    await launcher.app.evaluate(({ ipcMain }) => {
      const original = (ipcMain as any)._invokeHandlers.get('service-call')
      ;(globalThis as any).__contentReviewCalls = []
      ipcMain.removeHandler('service-call')
      ipcMain.handle('service-call', async (event: unknown, service: string, method: string, ...args: unknown[]) => {
        const result = await original(event, service, method, ...args)
        if (['getPackSources', 'getShaderSources', 'getModSources', 'resolveFromMarket', 'previewInstanceFiles'].includes(method)) (globalThis as any).__contentReviewCalls.push({ service, method, result })
        return result
      })
    })
    launcher.main.on('pageerror', error => errors.push(error.message))
    try { await use(fixture) } finally {
      await writeFile(info.outputPath('content-http.json'), JSON.stringify({ ...fixture.state, ...fixture.content, nativeHops: await fixture.hops(), rendererErrors: errors }, null, 2))
      await writeFile(info.outputPath('content-rpc.json'), JSON.stringify(await launcher.app.evaluate(() => (globalThis as any).__contentReviewCalls), null, 2))
      await fixture.close(); expect(errors).toEqual([])
    }
  },
})
test.use({ launcherOptions: { locale: 'es-ES' } })

async function entries(path: string) { try { return await readdir(path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error } }
async function review(launcher: LauncherFixture, kind: 'mod' | 'resourcepack' | 'shader', provider: string, target: string, version = 1, ready = true) {
  const page = launcher.main
  await page.getByTestId('nav-store').click()
  const filters = page.getByRole('button', { name: 'Filtros', exact: true })
  if (await filters.getAttribute('aria-expanded') !== 'true') await filters.click()
  await page.getByTestId('catalog-kind').selectOption(kind)
  await page.getByTestId(`catalog-source-${provider}`).click()
  await expect(page.locator('.project-card')).toHaveCount(1)
  await expect(page.locator('.project-card')).toHaveAttribute('data-project-id', provider === 'modrinth' ? 'AAAA0001' : '1')
  const trigger = page.locator('.project-card').getByRole('button', { name: 'Ver contenido', exact: true })
  await trigger.scrollIntoViewIfNeeded(); await activateLauncherControl(launcher, trigger)
  const sheet = page.getByTestId('catalog-project')
  await sheet.getByRole('button', { name: 'Versiones', exact: true }).click()
  await sheet.locator('#catalog-target').selectOption(target)
  const id = provider === 'modrinth' ? `VVVV000${version}` : String(100 + version)
  if (version === 2) await expect(sheet.locator(`[data-version-id="${id}"]`).getByTestId('catalog-installed-version')).toBeVisible()
  await sheet.locator(`[data-version-id="${id}"]`).getByTestId('catalog-review-version').click()
  if (ready) await expect(page.getByTestId('catalog-install-confirm')).toBeEnabled()
  return page.getByTestId('catalog-install')
}

for (const provider of ['modrinth', 'curseforge']) test(`React reviews ${provider} required and optional mods before native installation into the captured target`, async ({ launcher, catalog }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  const form = await review(launcher, 'mod', provider, paths[1])
  await expect(form).toContainText('Fabric QA'); await expect(form.getByTestId('catalog-install-changes').locator('li')).toHaveCount(2)
  expect(await entries(join(paths[1], 'mods'))).toEqual([])
  if (provider === 'modrinth') {
    await form.getByRole('checkbox').check()
    await expect(page.getByTestId('catalog-install-confirm')).toBeEnabled()
    await expect(form.getByRole('checkbox')).toBeChecked()
    await expect(form.getByTestId('catalog-install-changes').locator('li')).toHaveCount(3)
  }
  await page.getByTestId('catalog-install-confirm').click({ clickCount: 2 })
  await expect(page.getByTestId('catalog-install-complete')).toContainText('instalados y comprobados')
  expect((await entries(join(paths[1], 'mods'))).sort()).toEqual(provider === 'modrinth' ? ['dependency.jar', 'optional.jar', 'root1.jar'] : ['dependency.jar', 'root1.jar'])
  expect(await entries(join(paths[0], 'mods'))).toEqual([])
  for (const key of provider === 'modrinth' ? ['root1', 'dependency', 'optional'] : ['root1', 'dependency']) {
    const asset = catalog.assets.find(asset => asset.key === key)!
    expect(await readFile(join(paths[1], 'mods', asset.filename))).toEqual(asset.bytes)
  }
  expect(catalog.content.transfers).toHaveLength(provider === 'modrinth' ? 3 : 2)
  expect(catalog.state.requests.every(request => !request.key && !request.authorization && !request.cancellationId)).toBe(true)
  expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
  await form.getByRole('button', { name: 'Volver a versiones', exact: true }).click()
  await page.getByTestId('catalog-project').getByRole('button', { name: 'Cerrar ficha', exact: true }).last().click()
  await review(launcher, 'mod', provider, paths[1], 2)
  await expect(page.getByTestId('catalog-install-changes').locator('li')).toHaveCount(2)
  await page.getByTestId('catalog-install-confirm').click()
  await expect(page.getByTestId('catalog-install-complete')).toBeVisible()
  expect((await entries(join(paths[1], 'mods'))).sort()).toEqual(provider === 'modrinth' ? ['dependency.jar', 'optional.jar', 'root2.jar'] : ['dependency.jar', 'root2.jar'])
  expect(await readFile(join(paths[1], 'mods', 'root2.jar'))).toEqual(catalog.assets.find(asset => asset.key === 'root2')!.bytes)
  const transfers = catalog.content.transfers.length
  await page.getByTestId('catalog-install').getByRole('button', { name: 'Volver a versiones', exact: true }).click()
  await page.getByTestId('catalog-project').getByRole('button', { name: 'Cerrar ficha', exact: true }).last().click()
  const installed = await review(launcher, 'mod', provider, paths[1], 2, false)
  await expect(installed).toContainText('Ya está instalado')
  await expect(page.getByTestId('catalog-install-confirm')).toHaveCount(0)
  expect(catalog.content.transfers).toHaveLength(transfers)
})

test.describe('resource pack catalog review', () => {
  test.use({ kind: 'resourcepack' })
  for (const provider of ['modrinth', 'curseforge']) test(`React installs then upgrades a ${provider} pack without changing its filename or unrelated options`, async ({ launcher, catalog }, info) => {
    const page = launcher.main, paths = await seedReactLibrary(page)
    await page.emulateMedia({ colorScheme: provider === 'modrinth' ? 'dark' : 'light', reducedMotion: 'reduce' })
    await writeFile(join(paths[1], 'options.txt'), 'resourcePacks:["vanilla"]\r\n', 'utf8')
    await review(launcher, 'resourcepack', provider, paths[1])
    await page.getByTestId('catalog-install-confirm').click()
    await expect(page.getByTestId('catalog-install-complete')).toBeVisible()
    const previousBackups = new Set(await entries(join(paths[1], '.backups')))
    await page.getByTestId('catalog-install').getByRole('button', { name: 'Volver a versiones', exact: true }).click()
    await page.getByTestId('catalog-project').getByRole('button', { name: 'Cerrar ficha', exact: true }).last().click()
    const form = await review(launcher, 'resourcepack', provider, paths[1], 2), win = await launcher.app.browserWindow(page)
    await expect(form.getByTestId('catalog-install-changes')).toContainText('resourcepacks/root1.zip')
    await expect(form.getByTestId('catalog-install-changes')).not.toContainText('resourcepacks/root2.zip')
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await expect(page.getByTestId('catalog-install-confirm')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const result = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(result.violations).toEqual([]); await writeFile(info.outputPath(`content-${width}-axe.json`), JSON.stringify(result, null, 2))
      await page.screenshot({ path: info.outputPath(`content-review-${width}.png`) })
    }
    await page.getByTestId('catalog-install-confirm').click()
    await expect(page.getByTestId('catalog-install-complete')).toBeVisible()
    expect(await readFile(join(paths[1], 'resourcepacks', 'root1.zip'))).toEqual(catalog.assets.find(asset => asset.key === 'root2')!.bytes)
    expect(await entries(join(paths[1], 'resourcepacks'))).not.toContain('root2.zip')
    expect(await readFile(join(paths[1], 'options.txt'), 'utf8')).toBe('resourcePacks:["vanilla"]\r\n')
    const backups = (await entries(join(paths[1], '.backups'))).filter(name => !previousBackups.has(name)); expect(backups).toHaveLength(1)
    expect(await readFile(join(paths[1], '.backups', backups[0], 'resourcepacks', 'root1.zip'))).toEqual(catalog.assets.find(asset => asset.key === 'root1')!.bytes)
  })
})

test.describe('shader catalog review', () => {
  test.use({ kind: 'shader' })
  for (const provider of ['modrinth', 'curseforge']) test(`React installs ${provider} shaders only after checking the target's Iris engine`, async ({ launcher, catalog }) => {
    const page = launcher.main, paths = await seedReactLibrary(page)
    await review(launcher, 'shader', provider, paths[1], 1, false)
    await expect(page.getByTestId('catalog-install-error')).toContainText('compatible')
    expect(catalog.content.transfers).toEqual([])
    await makeReactMod(paths[1], 'iris', 'Iris')
    await page.getByTestId('catalog-install').getByRole('button', { name: 'Reintentar', exact: true }).click()
    await expect(page.getByTestId('catalog-install-confirm')).toBeEnabled()
    await page.getByTestId('catalog-install-confirm').click()
    await expect(page.getByTestId('catalog-install-complete')).toBeVisible()
    expect((await entries(join(paths[1], 'shaderpacks'))).sort()).toEqual(['dependency.zip', 'root1.zip'])
    expect(await entries(join(paths[0], 'shaderpacks'))).toEqual([])
    expect(await readFile(join(paths[1], 'shaderpacks', 'root1.zip'))).toEqual(catalog.assets.find(asset => asset.key === 'root1')!.bytes)
    expect(await entries(join(paths[1], 'mods'))).toEqual(['iris.jar'])
  })
})

for (const provider of ['modrinth', 'curseforge']) test(`React stops ${provider} native metadata resolution without creating files and can retry`, async ({ launcher, catalog }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  catalog.content.metadataSlow = true
  const form = await review(launcher, 'mod', provider, paths[1], 1, false)
  await expect.poll(() => catalog.content.metadataStarted).toBe(true)
  await form.getByRole('button', { name: 'Detener operación', exact: true }).click()
  await expect(page.getByTestId('catalog-install-error')).toContainText('detenida')
  await expect.poll(() => catalog.content.metadataAborted).toBe(true)
  expect(catalog.content.transfers).toEqual([]); expect(await entries(join(paths[1], 'mods'))).toEqual([])
  catalog.content.metadataSlow = false
  await form.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByTestId('catalog-install-confirm')).toBeEnabled()
  expect(catalog.content.transfers).toEqual([])
  await page.getByTestId('catalog-install-confirm').click()
  await expect(page.getByTestId('catalog-install-complete')).toBeVisible()
})

test('React retains a stopped native installation and confirms its recovery before reporting completion', async ({ launcher, catalog }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  const form = await review(launcher, 'mod', 'modrinth', paths[1])
  catalog.content.slowDependency = true
  await page.getByTestId('catalog-install-confirm').click()
  await expect.poll(() => catalog.content.transfers.includes('dependency')).toBe(true)
  await expect.poll(() => entries(join(paths[1], 'mods'))).toContain('root1.jar')
  await form.getByRole('button', { name: 'Detener operación', exact: true }).click()
  await expect(page.getByTestId('catalog-install-error')).toContainText('detenida')
  await expect(page.getByTestId('catalog-install-complete')).toHaveCount(0)
  await expect.poll(() => catalog.content.transferAborted).toBe(true)
  await expect(form.getByRole('button', { name: 'Revisar recuperación', exact: true })).toBeVisible()
  catalog.content.slowDependency = false
  await form.getByRole('button', { name: 'Revisar recuperación', exact: true }).click()
  await expect(page.getByTestId('catalog-install-confirm')).toBeEnabled()
  await page.getByTestId('catalog-install-confirm').click()
  await expect(page.getByTestId('catalog-install-complete')).toBeVisible()
  expect((await entries(join(paths[1], 'mods'))).sort()).toEqual(['dependency.jar', 'root1.jar'])
})

test('React rejects an occupied archive name without replacing an unrelated local mod', async ({ launcher, catalog }) => {
  const paths = await seedReactLibrary(launcher.main)
  await makeReactMod(paths[1], 'root1', 'Unrelated local mod')
  const before = await readFile(join(paths[1], 'mods', 'root1.jar'))
  await review(launcher, 'mod', 'modrinth', paths[1], 1, false)
  await expect(launcher.main.getByTestId('catalog-install-error')).toContainText('Un archivo existente ocupa el nombre')
  await expect(launcher.main.getByTestId('catalog-install-confirm')).toHaveCount(0)
  expect(catalog.content.transfers).toEqual([])
  expect(await readFile(join(paths[1], 'mods', 'root1.jar'))).toEqual(before)
})

test('Native catalog installation blocks changed configuration before publishing a plan or files', async ({ launcher, catalog }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  const form = await review(launcher, 'mod', 'modrinth', paths[1])
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.20.4' } }), paths[1])
  await page.getByTestId('catalog-install-confirm').click()
  await expect(page.getByTestId('catalog-install-error')).toContainText('No se completó la instalación')
  await expect(page.getByTestId('catalog-install-complete')).toHaveCount(0)
  expect(await entries(join(paths[1], 'mods'))).toEqual([])
  expect(catalog.content.transfers).toEqual([])
  expect(await page.evaluate(async path => (window as any).serviceChannels.open('InstanceInstallService').call('getReviewedModInstalls', path, 'mods'), paths[1])).toEqual([])
  await form.getByRole('button', { name: 'Reintentar', exact: true }).click()
  await expect(page.getByTestId('catalog-install-error')).toContainText('no son compatibles')
})
