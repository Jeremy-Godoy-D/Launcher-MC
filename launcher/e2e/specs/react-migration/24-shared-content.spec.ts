import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { mkdir, readFile, readdir, lstat, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import axe from 'axe-core'
import type { LauncherFixture } from '../../fixtures/launcher'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function file(path: string, data: string | Buffer) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data) }
async function options(page: Page, name: string) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Opciones de ${name}`, exact: true }).click()
}
async function contents(path: string) {
  const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url))
  const { open, readAllEntries, readEntry } = require('@xmcl/unzip'), zip = await open(path)
  try { return Object.fromEntries(await Promise.all((await readAllEntries(zip)).filter((entry: any) => !entry.fileName.endsWith('/')).map(async (entry: any) => [entry.fileName, (await readEntry(zip, entry)).toString('utf8')]))) }
  finally { zip.close() }
}
async function stallReview(launcher: LauncherFixture) {
  await launcher.app.evaluate(() => {
    const fs = (process as any).getBuiltinModule('node:fs'), original = fs.createReadStream
    ;(globalThis as any).__restoreReviewStream = () => { fs.createReadStream = original }
    fs.createReadStream = (path: any, options: any) => {
      const stream = original(path, options)
      if (String(path).replaceAll('\\', '/').endsWith('/a-review.bin')) {
        // Controlled I/O stall, not a throughput measurement. Native AbortSignal must close it.
        stream._read = () => {}
        ;(globalThis as any).__stalledReviewStream = stream
      }
      return stream
    }
  })
}

test('native shared folders and hard-linked options copy independently and export only reviewed bytes', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page), root = launcher.gameDataPath, errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const [path, value] of [['saves/World/level.dat', 'shared-world'], ['resourcepacks/pack.zip', 'shared-pack'], ['shaderpacks/shader.zip', 'shared-shader'], ['options.txt', 'shared-options'], ['servers.dat', 'shared-servers'], ['resourcepacks/token.json', 'private-fixture']]) await file(join(root, path), value)
  await page.evaluate(async path => {
    for (const [service, method] of [['InstanceSavesService', 'linkSharedSave'], ['InstanceResourcePacksService', 'linkShared'], ['InstanceShaderPacksService', 'linkShared'], ['InstanceOptionsService', 'linkGameOptions'], ['InstanceServerInfoService', 'link']]) await (window as any).serviceChannels.open(service).call(method, path)
  }, paths[0])
  expect((await lstat(join(paths[0], 'saves'))).isSymbolicLink()).toBe(true)
  await options(page, 'Mi mundo'); await page.getByRole('button', { name: 'Duplicar', exact: true }).click()
  await page.getByTestId('instance-operation-confirm').click()
  await expect(page.getByTestId('instance-operations')).toHaveCount(0)
  const copy = (await page.evaluate(() => localStorage.getItem('selectedInstancePath')))!
  expect(copy).not.toBe(paths[0])
  for (const [path, value] of [['saves/World/level.dat', 'shared-world'], ['resourcepacks/pack.zip', 'shared-pack'], ['shaderpacks/shader.zip', 'shared-shader'], ['options.txt', 'shared-options'], ['servers.dat', 'shared-servers']]) {
    expect(await readFile(join(copy, path), 'utf8')).toBe(value)
    expect((await lstat(join(copy, path.split('/')[0]))).isSymbolicLink()).toBe(false)
    await file(join(copy, path), `copy-only:${value}`)
    expect(await readFile(join(root, path), 'utf8')).toBe(value)
  }
  const destination = join(root, 'exports'); await mkdir(destination)
  const reports: unknown[] = [], win = await launcher.app.browserWindow(page)
  for (const appearance of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await options(page, 'Mi mundo'); await page.getByRole('button', { name: 'Exportar archivos', exact: true }).click()
    const dialog = page.getByTestId('instance-operations')
    await expect(dialog.getByRole('checkbox', { name: /resourcepacks\/pack.zip/ })).toBeChecked()
    await expect(dialog.getByRole('checkbox', { name: /shaderpacks\/shader.zip/ })).toBeChecked()
    for (const name of [/saves\/World/, /options.txt/, /servers.dat/]) { await expect(dialog.getByRole('checkbox', { name })).not.toBeChecked(); await dialog.getByRole('checkbox', { name }).check() }
    await expect(dialog.getByText('resourcepacks/token.json', { exact: true })).toHaveCount(0)
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await dialog.getByRole('button', { name: 'Elegir carpeta de destino', exact: true }).focus()
      await expect(page.getByTestId('export-confirm')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); reports.push({ appearance, width, ...report })
      await snap(launcher, `shared-export-${appearance}-${width}`, 'Archivos de las carpetas compartidas nativas: revisión explícita, mundos/opciones opcionales y credenciales excluidas.')
    }
    if (appearance === 'dark') await page.keyboard.press('Escape')
  }
  await writeFile(testInfo.outputPath('shared-accessibility.json'), JSON.stringify(reports, null, 2))
  await stubOpenDialog(launcher, join(root, 'resourcepacks'))
  await page.getByRole('button', { name: 'Elegir carpeta de destino', exact: true }).click()
  await page.getByTestId('export-confirm').click()
  await expect(page.getByTestId('instance-operations').getByRole('alert')).toContainText('fuera de la instancia y de sus carpetas compartidas')
  expect((await readdir(join(root, 'resourcepacks'))).sort()).toEqual(['pack.zip', 'token.json'])
  await stubOpenDialog(launcher, destination)
  await page.getByRole('button', { name: 'Elegir carpeta de destino', exact: true }).click()
  await page.getByTestId('export-confirm').click()
  await expect(page.getByTestId('instance-operations').getByRole('status')).toHaveText('Copia guardada.')
  const exported = await contents((await page.getByTestId('export-result').textContent())!)
  expect(exported['overrides/saves/World/level.dat']).toBe('shared-world')
  expect(exported['overrides/resourcepacks/pack.zip']).toBe('shared-pack')
  expect(exported['overrides/shaderpacks/shader.zip']).toBe('shared-shader')
  expect(exported['overrides/options.txt']).toBe('shared-options'); expect(exported['overrides/servers.dat']).toBe('shared-servers')
  expect(Object.keys(exported).some(path => path.includes('token'))).toBe(false)
  expect(await readFile(join(root, 'saves/World/level.dat'), 'utf8')).toBe('shared-world')
  expect(errors).toEqual([])
})

test('external import cannot enable shared-link trust through IPC and retargeted native links fail closed', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page), root = launcher.gameDataPath
  await file(join(root, 'saves/World/level.dat'), 'keep-world')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceSavesService').call('linkSharedSave', path), paths[0])
  const rejected = await page.evaluate(async ({ path, root }) => {
    try { await (window as any).serviceChannels.open('InstanceIOService').call('previewFolderFiles', path, 'vanilla', { sharedRoot: root }); return false } catch { return true }
  }, { path: paths[0], root })
  expect(rejected).toBe(true)
  const outside = join(root, 'outside'); await file(join(outside, 'World/level.dat'), 'do-not-read')
  await rm(join(paths[0], 'saves')); await symlink(outside, join(paths[0], 'saves'), 'junction')
  const failures = await page.evaluate(async ({ path, outside }) => {
    const output: boolean[] = []
    for (const [service, method, extra] of [['InstanceService', 'duplicateInstance', 'invalid-link-copy'], ['ModpackService', 'previewInstanceExport', outside]]) try { await (window as any).serviceChannels.open(service).call(method, path, extra); output.push(false) } catch { output.push(true) }
    return output
  }, { path: paths[0], outside })
  expect(failures).toEqual([true, true]); expect((await readdir(join(root, 'instances'))).length).toBe(3)
  expect(await readFile(join(root, 'saves/World/level.dat'), 'utf8')).toBe('keep-world')
  expect(await readFile(join(outside, 'World/level.dat'), 'utf8')).toBe('do-not-read')
})

test('cancelling an intentionally stalled native review closes its read stream before any destination exists', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page)
  const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
  await file(join(paths[0], 'a-review.bin'), Buffer.alloc(1024 * 1024, 0x41))
  await stallReview(launcher)
  try {
    await options(page, 'Mi mundo'); await page.getByRole('button', { name: 'Duplicar', exact: true }).click()
    await page.getByTestId('instance-operation-confirm').click()
    await expect.poll(() => launcher.app.evaluate(() => !!(globalThis as any).__stalledReviewStream)).toBe(true)
    const destination = (await page.getByTestId('copy-path').textContent())!
    await page.getByTestId('copy-cancel').click()
    await expect(page.getByTestId('instance-copy').getByRole('alert')).toContainText('Copia cancelada')
    await expect(page.getByTestId('instance-copy').getByRole('alert')).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('instance-operation-confirm')).toBeEnabled()
    await expect(page.getByTestId('instance-operation-confirm')).toBeInViewport({ ratio: 1 })
    const details = page.getByRole('region', { name: 'Archivos y estado de copia', exact: true })
    await details.focus(); await details.press('End')
    await expect.poll(() => details.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__stalledReviewStream.closed)).toBe(true)
    await expect(readFile(join(destination, 'instance.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await readdir(join(launcher.gameDataPath, 'instances'))).length).toBe(3)
    expect((await readFile(join(paths[0], 'a-review.bin'))).length).toBe(1024 * 1024)
    await page.evaluate(axe.source)
    const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    expect(report.violations).toEqual([]); await writeFile(testInfo.outputPath('cancel-copy-accessibility.json'), JSON.stringify(report, null, 2))
    await snap(launcher, 'cancel-source-review-800', 'Cancelación normalizada durante la revisión: no se creó destino y la acción para reintentar sigue visible.')
  } finally { await launcher.app.evaluate(() => (globalThis as any).__restoreReviewStream()) }
})

test('export review cancellation preserves the originals and retries without publishing a partial archive', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page), destination = join(launcher.gameDataPath, 'exports')
  const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
  await file(join(paths[0], 'config/a-review.bin'), Buffer.alloc(1024 * 1024, 0x41)); await mkdir(destination)
  await options(page, 'Mi mundo'); await page.getByRole('button', { name: 'Exportar archivos', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: /config\/a-review.bin/ })).toBeChecked()
  await stubOpenDialog(launcher, destination); await page.getByRole('button', { name: 'Elegir carpeta de destino', exact: true }).click()
  await stallReview(launcher)
  try {
    await page.getByTestId('export-confirm').click()
    await expect.poll(() => launcher.app.evaluate(() => !!(globalThis as any).__stalledReviewStream)).toBe(true)
    await page.getByRole('button', { name: 'Cancelar exportación', exact: true }).click()
    await expect(page.getByTestId('instance-operations').getByRole('alert')).toContainText('Exportación cancelada')
    await expect(page.getByTestId('instance-operations').getByRole('alert')).toBeInViewport({ ratio: 1 })
    await expect(page.getByTestId('export-confirm')).toBeEnabled()
    await expect(page.getByTestId('export-confirm')).toBeInViewport({ ratio: 1 })
    await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__stalledReviewStream.closed)).toBe(true)
    expect(await readdir(destination)).toEqual([])
    expect((await readFile(join(paths[0], 'config/a-review.bin'))).length).toBe(1024 * 1024)
    await page.evaluate(axe.source)
    const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
    expect(report.violations).toEqual([]); await writeFile(testInfo.outputPath('cancel-export-accessibility.json'), JSON.stringify(report, null, 2))
    await snap(launcher, 'cancel-export-review-800', 'La exportación cancelada conserva selección/destino, no publica un ZIP parcial y permite reintentar sin duplicar.')
  } finally { await launcher.app.evaluate(() => (globalThis as any).__restoreReviewStream()) }
  await page.getByTestId('export-confirm').click()
  await expect(page.getByTestId('instance-operations').getByRole('status')).toHaveText('Copia guardada.')
  expect((await readdir(destination)).length).toBe(1)
  const result = await contents((await page.getByTestId('export-result').textContent())!)
  expect(result['overrides/config/a-review.bin'].length).toBe(1024 * 1024)
})
