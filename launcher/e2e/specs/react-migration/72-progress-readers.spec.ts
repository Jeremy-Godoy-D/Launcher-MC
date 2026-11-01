import { test, expect, snap, type Page, type LauncherFixture } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { activateLauncherControl, focusLauncher } from '../../helpers/focus-launcher'
import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
async function fixture(launcher: LauncherFixture, client = false) {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = await makeReactWorld(path, 'Progress', 'Mundo de progreso')
  await mkdir(join(root, 'advancements')); await mkdir(join(root, 'stats'))
  await writeFile(join(root, 'advancements/player.json'), JSON.stringify({ 'minecraft:story/root': { done: true, criteria: { first: '2026-01-01 00:00:00 +0000' } } }))
  await writeFile(join(root, 'stats/player.json'), JSON.stringify({ stats: { 'minecraft:custom': { 'minecraft:deaths': 2 } } }))
  if (client) {
    const id = 'progress-fixture', dir = join(launcher.gameDataPath, 'versions', id); await mkdir(dir, { recursive: true })
    await writeFile(join(dir, id + '.json'), JSON.stringify({ id, mainClass: 'net.minecraft.client.main.Main', libraries: [], assets: id, assetIndex: { id } }))
    const { ZipFile } = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url))('yazl'), zip = new ZipFile()
    zip.addBuffer(Buffer.from('{"fixture.title":"Fixture advancement"}'), 'assets/minecraft/lang/en_us.json')
    zip.addBuffer(Buffer.from('\uFEFF{"fixture.title":"Avance comprobado"}'), 'assets/minecraft/lang/es_es.json')
    zip.addBuffer(Buffer.from(JSON.stringify({ display: { title: { translate: 'fixture.title' }, description: 'Recursos del cliente local', icon: { id: 'minecraft:fixture' }, frame: 'goal' }, criteria: { first: {} } })), 'data/minecraft/advancement/story/root.json')
    zip.addBuffer(png, 'assets/minecraft/textures/item/fixture.png')
    const done = pipeline(zip.outputStream, createWriteStream(join(dir, id + '.jar'))); zip.end(); await done
    await page.evaluate(async ({ path, id }) => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, version: id }), { path, id })
  }
  return { path, root }
}
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds'); await expect(area).toHaveAttribute('aria-busy', 'false')
  await area.locator('[data-world-name="Progress"]').getByTestId('world-action-progress').click()
  return page.getByTestId('world-progress')
}

test('progress refuses linked resources and recovers through the real UI without exposing external content', async ({ launcher }) => {
  const { path, root } = await fixture(launcher), outside = join(launcher.gameDataPath, 'external-progress')
  await mkdir(outside); await writeFile(join(outside, 'player.json'), '{"external:secret":{"done":true}}')
  await unlink(join(root, 'advancements/player.json'))
  // Keep the legitimate directory; place the link where a player file is expected.
  await symlink(outside, join(root, 'advancements/player.json'), 'junction')
  const progress = await open(launcher.main)
  await expect(progress.getByRole('alert')).toContainText('No se pudo leer el progreso')
  await expect(progress.getByTestId('progress-list')).toHaveCount(0)
  expect(await readFile(join(outside, 'player.json'), 'utf8')).toBe('{"external:secret":{"done":true}}')
  await unlink(join(root, 'advancements/player.json')); await writeFile(join(root, 'advancements/player.json'), '{"minecraft:story/root":{"done":true,"criteria":{}}}')
  await activateLauncherControl(launcher, progress.getByTestId('progress-refresh'))
  await expect(progress.getByRole('alert')).toHaveCount(0); await expect(progress.getByTestId('progress-list')).toContainText('minecraft:story/root')
  const chapters = join(path, 'config/ftbquests/quests/chapters'); await mkdir(chapters, { recursive: true })
  await writeFile(join(chapters, 'chapter.snbt'), '{ id:"chapter" quests:[{id:"available",title:"Disponible"},{id:"dependent",title:"Dependiente",dependencies:["available"]}] }')
  await activateLauncherControl(launcher, progress.getByTestId('progress-refresh')); await progress.getByTestId('progress-quests').click()
  const quests = progress.getByTestId('progress-quests-container')
  await expect(quests.locator('li').filter({ hasText: 'Disponible' })).toContainText('Pendiente')
  await expect(quests.locator('li').filter({ hasText: 'Dependiente' })).toContainText('Bloqueado')
})

test('progress reads localized client ZIP resources, renders verified PNGs and recovers from malformed statistics', async ({ launcher }) => {
  const { root } = await fixture(launcher, true), page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  const progress = await open(page), row = progress.getByTestId('progress-list').locator('li').filter({ hasText: 'Avance comprobado' })
  await expect(row).toBeVisible(); await expect(row).toContainText('Objetivo'); await row.locator('img').scrollIntoViewIfNeeded(); await expect(row.locator('img')).toHaveAttribute('src', 'data:image/png;base64,' + png.toString('base64'))
  await expect.poll(() => row.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(1)
  await snap(launcher, 'progress-localized-zip', 'Advancement title and verified PNG are read from the selected local client ZIP in the application locale.')
  await writeFile(join(root, 'stats/player.json'), '{'); await activateLauncherControl(launcher, progress.getByTestId('progress-refresh'))
  await expect(progress.getByRole('alert')).toBeVisible(); await expect(progress.getByTestId('progress-list')).toHaveCount(0)
  await snap(launcher, 'progress-invalid-statistics', 'Invalid statistics produce a recoverable error; stale progress is cleared.')
  await writeFile(join(root, 'stats/player.json'), '{"stats":{"minecraft:custom":{"minecraft:deaths":3}}}')
  await activateLauncherControl(launcher, progress.getByTestId('progress-refresh')); await expect(row).toBeVisible(); await expect(progress.getByRole('alert')).toHaveCount(0)
  await progress.getByTestId('progress-stats').click(); await expect(progress.getByTestId('progress-stats-container')).toContainText('3')
  expect(errors).toEqual([])
})

test('progress success and read errors retain keyboard recovery in both themes and native window sizes', async ({ launcher }, testInfo) => {
  const { root } = await fixture(launcher, true), page = launcher.main, win = await launcher.app.browserWindow(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    const progress = await open(page), refresh = progress.getByTestId('progress-refresh')
    for (const [width, height] of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), [width, height]); await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]); await focusLauncher(launcher)
      for (const state of ['ready', 'error']) {
        await writeFile(join(root, 'stats/player.json'), state === 'ready' ? '{}' : '{')
        await activateLauncherControl(launcher, refresh)
        if (state === 'ready') {
          await expect(progress.getByTestId('progress-list')).toContainText('Avance comprobado')
          await refresh.press('Tab'); await expect(progress.getByTestId('progress-filter')).toBeFocused(); await expect(progress.getByTestId('progress-filter')).toBeInViewport({ ratio: 1 })
        } else { await expect(progress.getByRole('alert')).toBeVisible(); await refresh.focus(); await expect(refresh).toBeInViewport({ ratio: 1 }) }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
        await writeFile(testInfo.outputPath(`${state}-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
        await snap(launcher, `progress-${state}-${theme}-${width}`, 'Native progress resources and keyboard recovery in the persisted theme and supported native window size.')
      }
    }
  }
})
