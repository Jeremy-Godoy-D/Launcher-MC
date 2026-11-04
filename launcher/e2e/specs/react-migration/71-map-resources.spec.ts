import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { focusLauncher } from '../../helpers/focus-launcher'
import { copyFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const source = fileURLToPath(new URL('../../../mock/saves/1.19.3/region/r.0.0.mca', import.meta.url))

test('map bounds pending renders and cache, discards obsolete heights and releases bitmaps on close', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = await makeReactWorld(path, 'MapResources', 'Mapa de recursos')
  await mkdir(join(root, 'region'))
  for (let x = -3; x < 3; x++) for (let z = -3; z < 3; z++) await copyFile(source, join(root, 'region', `r.${x}.${z}.mca`))
  await page.addInitScript(() => {
    const stats = { created: 0, closed: 0, live: 0, maximum: 0 }, live = new Set<ImageBitmap>(), create = window.createImageBitmap.bind(window), close = ImageBitmap.prototype.close
    ;(window as any).__regionBitmaps = stats
    ;(window as any).createImageBitmap = async (...args: any[]) => {
      const bitmap = await (create as any)(...args)
      live.add(bitmap); stats.created++; stats.live = live.size; stats.maximum = Math.max(stats.maximum, live.size)
      return bitmap
    }
    ImageBitmap.prototype.close = function () { if (live.delete(this)) stats.closed++; stats.live = live.size; close.call(this) }
  })
  await page.reload()
  await launcher.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call'), gate = new Promise<void>(resolve => { (globalThis as any).__releaseRegionRenders = resolve })
    const stats = { active: 0, maximum: 0, heights: [] as Array<number | undefined> }; (globalThis as any).__regionRenders = stats
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event: unknown, service: string, method: string, ...args: any[]) => {
      if (service !== 'InstanceSavesService' || method !== 'renderSaveRegion') return original(event, service, method, ...args)
      stats.active++; stats.maximum = Math.max(stats.maximum, stats.active); stats.heights.push(args[4])
      try { await gate; return await original(event, service, method, ...args) } finally { stats.active-- }
    })
  })
  try {
    await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
    await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
    const area = page.getByTestId('instance-worlds'); await expect(area).toHaveAttribute('aria-busy', 'false')
    await area.locator('[data-world-name="MapResources"]').getByTestId('world-action-map').click()
    const map = page.getByTestId('world-map'), canvas = map.getByTestId('save-world-map-canvas')
    await focusLauncher(launcher); await canvas.scrollIntoViewIfNeeded(); await canvas.focus()
    await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__regionRenders.active)).toBe(2)
    for (let index = 0; index < 11; index++) await page.keyboard.press('-')
    const height = map.getByRole('slider', { name: 'Altura Y' })
    await height.focus(); await height.press('Home'); await height.press('ArrowRight')
    await expect(height).toHaveValue('-63')
    expect(await launcher.app.evaluate(() => (globalThis as any).__regionRenders.maximum)).toBe(2)
    await launcher.app.evaluate(() => (globalThis as any).__releaseRegionRenders())
    await canvas.focus()
    await expect(map).toHaveAttribute('data-rendered-regions', '32', { timeout: 60000 })
    await expect(map).toHaveAttribute('aria-busy', 'false')
    const renders = await launcher.app.evaluate(() => (globalThis as any).__regionRenders), bitmaps = await page.evaluate(() => (window as any).__regionBitmaps)
    expect(renders.maximum).toBe(2); expect(renders.heights.slice(0, 2)).toEqual([undefined, undefined]); expect(renders.heights.slice(2)).toHaveLength(32)
    expect(renders.heights.slice(2).every((value: number) => value === -63)).toBe(true)
    expect(bitmaps.created).toBe(32); expect(bitmaps.live).toBe(32); expect(bitmaps.maximum).toBeLessThanOrEqual(34)
    await page.getByTestId('world-info').getByRole('button', { name: 'Cerrar información del mundo', exact: true }).click()
    await expect(map).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).__regionBitmaps.live)).toBe(0)
    expect(await page.evaluate(() => (window as any).__regionBitmaps.closed)).toBe(32)
  } finally { await launcher.app.evaluate(() => (globalThis as any).__releaseRegionRenders?.()) }
})
