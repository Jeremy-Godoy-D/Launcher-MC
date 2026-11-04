import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import axe from 'axe-core'
import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { mockCreationMetadata } from '../../helpers/react-creation'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'

test.use({ launcherOptions: { locale: 'es-ES' } })
async function file(path: string, data: string) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data) }
async function openExport(page: Page, name: string) {
  await page.getByTestId('nav-library').click()
  await page.getByRole('button', { name: `Opciones de ${name}`, exact: true }).click()
  await page.getByRole('button', { name: 'Exportar archivos', exact: true }).click()
  const dialog = page.getByTestId('instance-operations')
  await expect(dialog.getByRole('button', { name: 'Volver a revisar archivos', exact: true })).toBeEnabled()
  return dialog
}
async function contents(path: string) {
  const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url))
  const { open, readAllEntries, readEntry } = require('@xmcl/unzip')
  const zip = await open(path)
  try { return Object.fromEntries(await Promise.all((await readAllEntries(zip)).filter((entry: any) => !entry.fileName.endsWith('/')).map(async (entry: any) => [entry.fileName, (await readEntry(zip, entry)).toString('utf8')]))) }
  finally { zip.close() }
}
test('local export reviews real files, blocks stale bytes and occupied destinations, and stays accessible at both sizes and themes', async ({ launcher }, testInfo) => {
  const page = launcher.main, paths = await seedReactLibrary(page), destination = join(launcher.gameDataPath, 'exports')
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await mkdir(destination)
  await file(join(paths[0], 'config/qa.toml'), 'config-before-review')
  await file(join(paths[0], 'config/.env'), 'do-not-export-secret')
  await file(join(paths[0], 'saves/World/level.dat'), 'personal-world')
  let dialog = await openExport(page, 'Mi mundo')
  await expect(dialog.getByRole('checkbox', { name: /config\/qa.toml/ })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: /saves\/World/ })).not.toBeChecked()
  await expect(dialog.getByText('config/.env', { exact: true })).toHaveCount(0)
  const main = await launcher.app.browserWindow(page), reports: unknown[] = []
  for (const appearance of ['dark', 'light']) {
    await page.keyboard.press('Escape'); await page.getByTestId('nav-settings').click()
    await page.getByLabel('Apariencia', { exact: true }).selectOption(appearance)
    await expect(page.locator('html')).toHaveAttribute('data-theme', appearance)
    dialog = await openExport(page, 'Mi mundo')
    for (const width of [1200, 800]) {
      await main.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await dialog.getByRole('button', { name: 'Volver', exact: true }).focus()
      await dialog.getByRole('button', { name: 'Elegir carpeta de destino', exact: true }).focus()
      await expect(dialog.getByRole('button', { name: 'Elegir carpeta de destino', exact: true })).toBeInViewport({ ratio: 1 })
      await expect(page.getByTestId('export-confirm')).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source)
      const report = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); reports.push({ appearance, width, ...report })
      await snap(launcher, `export-${appearance}-${width}`, 'Exportación con selección real, mundos desmarcados, búsqueda, cuerpo desplazable y acciones fijas.')
    }
  }
  await writeFile(testInfo.outputPath('export-accessibility.json'), JSON.stringify(reports, null, 2))
  await stubOpenDialog(launcher, destination)
  await dialog.getByRole('button', { name: 'Elegir carpeta de destino', exact: true }).click()
  await file(join(paths[0], 'config/qa.toml'), 'changed-after-review')
  await page.getByTestId('export-confirm').click()
  await expect(dialog.getByRole('alert')).toContainText('cambiaron desde la revisión')
  expect(await readdir(destination)).toEqual([])
  await dialog.getByRole('button', { name: 'Volver a revisar archivos', exact: true }).click()
  await expect(page.getByTestId('export-confirm')).toBeEnabled()
  await file(join(destination, 'Mi mundo-1.0.0.mrpack'), 'existing-do-not-replace')
  await page.getByTestId('export-confirm').click()
  await expect(dialog.getByRole('alert')).toContainText('Ya existe una copia')
  expect(await readFile(join(destination, 'Mi mundo-1.0.0.mrpack'), 'utf8')).toBe('existing-do-not-replace')
  await page.getByLabel('Versión de la copia', { exact: true }).fill('1.0.1')
  await page.getByTestId('export-confirm').click({ clickCount: 2 })
  await expect(dialog.getByRole('status')).toHaveText('Copia guardada.')
  const output = await page.getByTestId('export-result').textContent()
  expect(await contents(output!)).toEqual({ 'overrides/config/qa.toml': 'changed-after-review', 'modrinth.index.json': expect.any(String) })
  expect(await page.evaluate(() => localStorage.getItem('selectedInstancePath'))).toBe(paths[0])
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Opciones de Mi mundo', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})

for (const format of ['modrinth', 'curseforge'] as const) test(`${format} local archive round-trips through the real importer without account or Java settings`, async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page), destination = join(launcher.gameDataPath, 'exports')
  await mockCreationMetadata(launcher); await mkdir(destination)
  await file(join(paths[1], 'config/roundtrip.txt'), 'exported-by-native-service')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, java: 'C:/private/java.exe', vmOptions: ['-Dprivate=secret'] }), paths[1])
  const dialog = await openExport(page, 'Fabric QA')
  await page.getByLabel('Formato del archivo', { exact: true }).selectOption(format)
  await stubOpenDialog(launcher, destination)
  await dialog.getByRole('button', { name: 'Elegir carpeta de destino', exact: true }).click()
  await page.getByTestId('export-confirm').click()
  await expect(dialog.getByRole('status')).toHaveText('Copia guardada.')
  const output = (await page.getByTestId('export-result').textContent())!
  const entries = await contents(output), manifest = JSON.parse(entries[format === 'curseforge' ? 'manifest.json' : 'modrinth.index.json'])
  if (format === 'curseforge') expect(manifest.minecraft.modLoaders).toEqual([{ id: 'fabric-0.16.0', primary: true }])
  else expect(manifest.dependencies['fabric-loader']).toBe('0.16.0')
  expect(JSON.stringify(entries)).not.toMatch(/private|java.exe|xmcl.json/)
  await page.keyboard.press('Escape')
  await page.getByTestId('library-create-instance').click()
  const creation = page.getByRole('dialog')
  await creation.getByRole('button', { name: 'Importar modpack', exact: true }).click()
  await stubOpenDialog(launcher, output)
  await creation.getByRole('button', { name: 'Elegir archivo de modpack', exact: true }).click()
  await expect(page.getByTestId('instance-create-confirm')).toBeEnabled()
  await page.getByTestId('instance-name').fill(`Roundtrip ${format} QA`)
  await page.getByTestId('instance-create-confirm').click()
  await expect(creation.getByRole('status').filter({ hasText: 'Instancia guardada' })).toBeVisible()
  await creation.getByRole('button', { name: 'Ver instancia', exact: true }).click()
  const imported = (await page.evaluate(() => localStorage.getItem('selectedInstancePath')))!
  expect(await readFile(join(imported, 'config/roundtrip.txt'), 'utf8')).toBe('exported-by-native-service')
  const saved = JSON.parse(await readFile(join(imported, 'instance.json'), 'utf8'))
  expect(saved.java ?? '').not.toContain('private')
  expect(saved.vmOptions ?? []).not.toContain('-Dprivate=secret')
  expect(saved.runtime.fabricLoader).toBe('0.16.0')
})

test('offline export preserves an isolated client and version JSON without including worlds unless selected', async ({ launcher }) => {
  const page = launcher.main, paths = await seedReactLibrary(page), destination = join(launcher.gameDataPath, 'exports'), root = launcher.gameDataPath
  await mkdir(destination)
  await file(join(paths[0], 'config/qa.txt'), 'offline-config')
  await file(join(paths[0], 'saves/World/level.dat'), 'offline-world')
  const client = '.client-qa-export', id = 'vanilla-qa-export'
  const clientBytes = Buffer.from('synthetic-isolated-client')
  await file(join(root, `versions/${client}/${client}.jar`), clientBytes.toString())
  await file(join(root, `versions/${id}/${id}.json`), JSON.stringify({ id, clientVersion: '1.21.1', jar: client, mainClass: 'qa.Main', minecraftArguments: '--username ${auth_player_name}', libraries: [], assets: 'qa-export', downloads: { client: { url: '', sha1: createHash('sha1').update(clientBytes).digest('hex'), size: clientBytes.length } } }))
  await file(join(root, 'assets/indexes/qa-export.json'), '{"objects":{}}')
  await page.evaluate(async ({ path, id }) => {
    await (window as any).serviceChannels.open('VersionService').call('refreshVersion', id)
    await (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, version: id })
  }, { path: paths[0], id })
  const dialog = await openExport(page, 'Mi mundo')
  await expect(page.getByLabel('Formato del archivo', { exact: true })).toHaveValue('offline')
  await dialog.getByRole('checkbox', { name: /saves\/World/ }).check()
  await stubOpenDialog(launcher, destination)
  await dialog.getByRole('button', { name: 'Elegir carpeta de destino', exact: true }).click()
  await page.getByTestId('export-confirm').click()
  await expect(dialog.getByRole('status')).toHaveText('Copia guardada.')
  const output = (await page.getByTestId('export-result').textContent())!, entries = await contents(output)
  expect(entries[`versions/${client}/${client}.jar`]).toBe(clientBytes.toString())
  expect(JSON.parse(entries[`versions/${id}/${id}.json`]).jar).toBe(client)
  expect(entries['saves/World/level.dat']).toBe('offline-world')
  expect(entries['config/qa.txt']).toBe('offline-config')
  expect(entries['instance.json']).toBeUndefined()
  expect(JSON.parse(entries['launcher_profiles.json']).profiles.grimo.lastVersionId).toBe(id)
  expect(await page.evaluate(async () => (window as any).serviceChannels.open('LaunchService').call('getGameProcesses'))).toEqual([])
  await snap(launcher, 'offline-export-saved', 'ZIP generado por el servicio real con JAR aislado sintético, metadatos y mundo seleccionado. No se lanzó Java.')
  await page.keyboard.press('Escape')
  const source = join(root, 'extracted-offline')
  for (const [path, data] of Object.entries(entries)) await file(join(source, path), data as string)
  await mockCreationMetadata(launcher)
  await page.getByTestId('library-create-instance').click()
  const creation = page.getByRole('dialog')
  await creation.getByRole('button', { name: 'Importar modpack', exact: true }).click()
  await creation.getByRole('button', { name: 'Carpeta existente', exact: true }).click()
  await page.getByLabel('Formato de la carpeta', { exact: true }).selectOption('vanilla')
  await stubOpenDialog(launcher, source)
  await creation.getByRole('button', { name: 'Elegir carpeta de origen', exact: true }).click()
  await expect(page.getByTestId('instance-create-confirm')).toBeEnabled()
  await page.getByTestId('instance-name').fill('Restored offline QA')
  await page.getByTestId('instance-create-confirm').click()
  await expect(creation.getByRole('status').filter({ hasText: 'Instancia guardada' })).toBeVisible()
  await creation.getByRole('button', { name: 'Ver instancia', exact: true }).click()
  const restored = (await page.evaluate(() => localStorage.getItem('selectedInstancePath')))!
  expect(await readFile(join(restored, 'saves/World/level.dat'), 'utf8')).toBe('offline-world')
  const saved = JSON.parse(await readFile(join(restored, 'instance.json'), 'utf8'))
  const version = await page.evaluate(async id => (window as any).serviceChannels.open('VersionService').call('resolveLocalVersion', id), saved.version)
  expect(version.minecraftVersion).toBe('1.21.1')
  expect(await readFile(join(root, `versions/${version.clientJar}/${version.clientJar}.jar`))).toEqual(clientBytes)
})
