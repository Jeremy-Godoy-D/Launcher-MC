import { test, expect, snap, type Page, type LauncherFixture } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { activateLauncherControl, focusLauncher } from '../../helpers/focus-launcher'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })

function region() {
  const bytes = Buffer.alloc(16384)
  for (const [sector, x] of [[2, 0], [3, 31]]) {
    const xTag = Buffer.from([3, 0, 4, 120, 80, 111, 115, 0, 0, 0, x]), zTag = Buffer.from([3, 0, 4, 122, 80, 111, 115, 0, 0, 0, 0])
    const payload = deflateSync(Buffer.concat([Buffer.from([10, 0, 0]), xTag, zTag, Buffer.from([0])]))
    bytes.writeUInt32BE((sector << 8) | 1, x * 4); bytes.writeUInt32BE(payload.length + 1, sector * 4096); bytes[sector * 4096 + 4] = 2; payload.copy(bytes, sector * 4096 + 5)
  }
  return bytes
}
async function fixture(launcher: LauncherFixture) {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = await makeReactWorld(path, 'Reviewed', 'Mundo de revisión')
  await mkdir(join(root, 'region')); await writeFile(join(root, 'region/r.0.0.mca'), region())
  return { path, root }
}
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click()
  await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
  const area = page.getByTestId('instance-worlds'); await expect(area).toHaveAttribute('aria-busy', 'false')
  await area.locator('[data-world-name="Reviewed"]').getByTestId('world-action-map').click()
  return page.getByTestId('world-map')
}
async function selectOrigin(launcher: LauncherFixture) {
  const map = launcher.main.getByTestId('world-map'), clear = map.getByTestId('save-world-map-clear-selection')
  if (await clear.count()) await clear.click()
  await map.getByLabel('Coordenada X del chunk').fill('0'); await map.getByLabel('Coordenada Z del chunk').fill('0')
  await activateLauncherControl(launcher, map.getByRole('button', { name: 'Ir al chunk', exact: true }))
  await expect(map.getByTestId('save-world-map-canvas')).toBeFocused(); await launcher.main.keyboard.press('Enter')
  await expect(map.getByTestId('save-world-map-selected-count')).toContainText('1')
}
async function review(launcher: LauncherFixture) {
  const modal = launcher.main.getByTestId('confirm-dialog')
  await activateLauncherControl(launcher, modal.getByTestId('chunk-change-submit'))
  await expect(modal.getByTestId('chunk-change-review')).toBeVisible()
  return modal
}

test('chunk review refuses stale bytes and restores an exact backup after reopening the renderer', async ({ launcher }) => {
  const { root } = await fixture(launcher), page = launcher.main, map = await open(page)
  await selectOrigin(launcher); await map.getByTestId('save-world-map-delete').click()
  const modal = await review(launcher), file = join(root, 'region/r.0.0.mca'), concurrent = await readFile(file)
  concurrent.writeUInt32BE(123, 4096); await writeFile(file, concurrent)
  await activateLauncherControl(launcher, modal.getByTestId('chunk-change-submit'))
  await expect(modal.getByRole('alert')).toContainText('cambiaron desde la revisión')
  await snap(launcher, 'chunk-review-stale', 'A stale review is refused without replacing region bytes; the user can review the current world again.')
  expect(await readFile(file)).toEqual(concurrent)
  await review(launcher); await activateLauncherControl(launcher, modal.getByTestId('chunk-change-submit'))
  await expect(modal).toHaveCount(0)
  const backups = (await readdir(join(root, '.backups'))).filter(name => name.startsWith('world-chunks-'))
  expect(backups).toHaveLength(1); expect(await readFile(join(root, '.backups', backups[0], 'Reviewed/minecraft_overworld/r.0.0.mca'))).toEqual(concurrent)
  await page.reload(); const reopened = await open(page), history = reopened.getByTestId('chunk-backups')
  await history.locator('summary').click(); await expect(history.getByRole('combobox')).toHaveValue(backups[0].slice('world-chunks-'.length))
  await history.getByRole('button', { name: 'Revisar restauración', exact: true }).click()
  await review(launcher); await activateLauncherControl(launcher, modal.getByTestId('chunk-change-submit'))
  await expect(modal).toHaveCount(0); expect(await readFile(file)).toEqual(concurrent)
})

test('a failed second region replacement exposes recovery in the real dialog and preserves the source', async ({ launcher }) => {
  const { root } = await fixture(launcher), page = launcher.main, map = await open(page), file = join(root, 'region/r.0.0.mca'), original = await readFile(file)
  await selectOrigin(launcher)
  await map.getByLabel('Coordenada X del chunk').fill('31'); await activateLauncherControl(launcher, map.getByRole('button', { name: 'Ir al chunk', exact: true })); await page.keyboard.press('Enter')
  await map.getByTestId('save-world-map-copy').click(); await expect(map.getByTestId('save-world-map-paste')).toBeVisible(); await map.getByTestId('save-world-map-paste').click()
  const modal = page.getByTestId('confirm-dialog'); await modal.getByLabel('Desplazamiento X (chunks)').fill('1'); await review(launcher)
  const target = join(await realpath(root), 'region/r.1.0.mca')
  await launcher.app.evaluate((_, target) => {
    const fs = process.getBuiltinModule('fs/promises'), modules = process.getBuiltinModule('module'), original = fs.rename, globals = globalThis as any
    globals.__chunkRenameFailures = 0; globals.__restoreChunkRename = () => { fs.rename = original; modules.syncBuiltinESMExports() }
    fs.rename = async (from: any, to: any) => {
      if (!globals.__chunkRenameFailures && String(to) === target && String(from).includes('.prepared')) { globals.__chunkRenameFailures++; throw Object.assign(new Error('fixture second region failure'), { code: 'EIO' }) }
      return original(from, to)
    }
    modules.syncBuiltinESMExports()
  }, target)
  try {
    await activateLauncherControl(launcher, modal.getByTestId('chunk-change-submit'))
    await expect(modal.getByRole('alert')).toContainText('operación se interrumpió')
    expect(await launcher.app.evaluate(() => (globalThis as any).__chunkRenameFailures)).toBe(1)
    await expect(modal.getByTestId('chunk-change-submit')).toBeDisabled()
    const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400)); await focusLauncher(launcher)
    const recovery = modal.getByRole('button', { name: 'Revisar restauración', exact: true }); await recovery.focus(); await expect(recovery).toBeFocused(); await expect(recovery).toBeInViewport({ ratio: 1 })
    await snap(launcher, 'chunk-review-incomplete-800', 'An interrupted two-region edit retains its backups and exposes a keyboard-reachable restore action in the minimum native window.')
    await recovery.click()
    await review(launcher); await activateLauncherControl(launcher, modal.getByTestId('chunk-change-submit'))
    await expect(modal).toHaveCount(0); expect(await readFile(file)).toEqual(original)
    await expect(readFile(join(root, 'region/r.1.0.mca'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await launcher.app.evaluate(() => (globalThis as any).__restoreChunkRename()) }
})

test('chunk forms and native reviews keep keyboard actions reachable in both themes and native sizes', async ({ launcher }, testInfo) => {
  const { root } = await fixture(launcher), page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(async savePath => (window as any).serviceChannels.open('InstanceSavesService').call('deleteSaveChunks', { savePath, dimension: 'minecraft:overworld', chunks: [{ chunkX: 31, chunkZ: 0 }] }), root)
  const win = await launcher.app.browserWindow(page), modal = page.getByTestId('confirm-dialog')
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    const map = await open(page)
    for (const [width, height] of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), [width, height]); await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]); await focusLauncher(launcher)
      await selectOrigin(launcher); await map.getByTestId('save-world-map-copy').click(); await expect(map.getByTestId('save-world-map-paste')).toBeVisible()
      for (const type of ['delete', 'paste', 'restore']) {
        if (type === 'restore') { const history = map.getByTestId('chunk-backups'); await history.locator('summary').click(); await history.getByRole('button', { name: 'Revisar restauración', exact: true }).click() }
        else await map.getByTestId(type === 'paste' ? 'save-world-map-paste' : 'save-world-map-delete').click()
        await review(launcher)
        await expect(modal.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible()
        const submit = modal.getByTestId('chunk-change-submit'); await submit.focus(); await expect(submit).toBeFocused(); await expect(submit).toBeInViewport({ ratio: 1 })
        await submit.press('Tab'); await expect(modal.getByRole('button', { name: 'Cerrar operación de mundo', exact: true })).toBeFocused()
        await page.keyboard.press('Shift+Tab'); await expect(submit).toBeFocused()
        if (width === 800) {
          const body = modal.getByRole('region', { name: 'Revisar cambios de chunks', exact: true })
          await body.focus(); await body.press('End'); await expect.poll(() => body.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
          await body.press('Home'); await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0)
          await submit.focus()
        }
        expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        await page.addScriptTag({ content: axe.source }); const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
        await writeFile(testInfo.outputPath(`${type}-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2)); expect(report.violations).toEqual([])
        await snap(launcher, `chunks-${type}-${theme}-${width}`, 'Native chunk review with preserved backup, explicit destination and reachable keyboard confirmation.')
        await page.keyboard.press('Escape'); await expect(modal).toHaveCount(0)
        if (type === 'restore') await map.getByTestId('chunk-backups').locator('summary').click()
      }
    }
  }
  expect(errors).toEqual([])
})
