import { readFile, writeFile } from 'node:fs/promises'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

// Read-only public provider smoke. Explicit opt-in; deterministic CI uses the cached fixtures in spec 27.
test.skip(process.env.XMCL_E2E_LIVE_PRESENTATION !== '1', 'Enable live public metadata/image requests explicitly')
test.use({ launcherOptions: { locale: 'es-ES' } })

for (const [provider, upstream] of [
  ['modrinth', { type: 'modrinth-modpack', projectId: '1KVo5zza', versionId: 'fixture-not-installed' }],
  ['curseforge', { type: 'curseforge-modpack', modId: 925200, fileId: 1 }],
] as const) test(`${provider} public project metadata resolves and decodes its own gallery through the packaged native service`, async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await page.evaluate(async ({ path, upstream }) => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, upstream }), { path: paths[0], upstream })
  const result = await page.evaluate(async path => (window as any).serviceChannels.open('PresentationService').call('resolveInstanceMedia', path), paths[0])
  expect(result).toMatchObject({ provider })
  const url = new URL(result.image)
  expect(url.origin).toBe('http://launcher')
  expect((await readFile(url.searchParams.get('path')!)).byteLength).toBeLessThanOrEqual(8 * 1024 * 1024)
  await page.reload()
  await expect(page.getByTestId('app-backdrop')).toHaveAttribute('data-media-provider', provider)
  await expect.poll(() => page.locator('.ambient img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 100)).toBe(true)
  await expect(page.locator('.ambient img')).toHaveAttribute('src', result.image)
  await writeFile(testInfo.outputPath('live-provider-cover.json'), JSON.stringify({ provider, upstream, sourceUrl: result.sourceUrl, projectUrl: result.projectUrl, bytes: (await readFile(url.searchParams.get('path')!)).byteLength }))
})

test('a public CurseForge modpack without a gallery retains a labelled bundled fallback', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, upstream: { type: 'curseforge-modpack', modId: 285109, fileId: 1 } }), paths[0])
  expect(await page.evaluate(async path => (window as any).serviceChannels.open('PresentationService').call('resolveInstanceMedia', path), paths[0])).toBeUndefined()
  await page.reload()
  await expect(page.locator('.featured').getByText('Paisaje ambiental de Minecraft Vanilla.', { exact: true })).toBeVisible()
  await expect(page.getByTestId('featured-play')).toBeEnabled()
})
