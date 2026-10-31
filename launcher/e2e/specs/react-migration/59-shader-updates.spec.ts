import { test, expect, snap, type Page } from '../../helpers/scratch'
import type { LauncherFixture } from '../../fixtures/launcher'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactShaderPack } from '../../helpers/react-content'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer, type ServerResponse } from 'node:http'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const hash = (bytes: Buffer) => createHash('sha1').update(bytes).digest('hex')
async function fixture(launcher: LauncherFixture, provider = 'modrinthOnly', shared = false) {
  const page = launcher.main, [path, other] = await seedReactLibrary(page), root = launcher.gameDataPath, source = join(root, 'shader-update-source')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', optifine: 'HD_U' } }), path)
  await makeReactShaderPack(path, 'alpha', 'Original'); await makeReactShaderPack(source, 'next', 'Updated')
  const original = await readFile(join(path, 'shaderpacks/alpha.zip')), next = await readFile(join(source, 'shaderpacks/next.zip'))
  if (shared) for (const directory of [path, other]) await page.evaluate(async path => (window as any).serviceChannels.open('InstanceShaderPacksService').call('linkShared', path), directory)
  const sha1 = hash(original), newHash = hash(next), download = pathToFileURL(join(source, 'shaderpacks/next.zip')).href
  // Only provider metadata and the download source are fixtures. Native snapshot, review, install, backup and recovery run unchanged.
  await launcher.app.evaluate(({ ipcMain }, { sha1, download }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call'); (globalThis as any).__shaderUpdateCalls = []
    ipcMain.removeHandler('service-call')
    ipcMain.handle('service-call', async (event: unknown, service: string, method: string, ...args: any[]) => {
      if (service === 'InstanceShaderPacksService' && method === 'refreshMetadata') return { result: undefined }
      if (service === 'InstanceShaderPacksService' && method === 'getShaderSources') return { result: [{ hash: sha1, modrinth: { projectId: 'abcdefgh', versionId: 'version1' }, curseforge: { projectId: 11, fileId: 1 } }] }
      if (service === 'InstanceInstallService' && method === 'installInstanceFiles') {
        ;(globalThis as any).__shaderUpdateCalls.push(args[0])
        args[0] = { ...args[0], files: args[0].files.map((file: any) => ({ ...file, downloads: [download] })) }
      }
      return original(event, service, method, ...args)
    })
  }, { sha1, download })
  await page.addInitScript(({ sha1, newHash }) => {
    const original = window.fetch.bind(window); (window as any).__shaderProviderCalls = []
    window.fetch = async (input, init) => {
      const url = String(input)
      if (!url.startsWith('https://api.modrinth.com/') && !url.startsWith('https://api.curseforge.com/')) return original(input, init)
      ;(window as any).__shaderProviderCalls.push({ url, body: init?.body, headers: init?.headers })
      const old = { id: 'version1', project_id: 'abcdefgh', version_type: 'release', game_versions: ['1.21.1'], loaders: ['optifine'], version_number: '1', date_published: '2026-01-01', files: [{ primary: true, filename: 'alpha.zip', hashes: { sha1 } }] }
      let result: unknown
      if (url.includes('api.modrinth.com')) result = { [sha1]: url.endsWith('/version_files/update') ? { ...old, id: 'version2', version_number: '2.0.0', date_published: '2026-02-01', files: [{ primary: true, filename: 'alpha-new.zip', hashes: { sha1: newHash } }] } : old }
      else {
        const current = { id: 1, modId: 11, fileName: 'alpha.zip', gameVersions: ['1.21.1'], fileDate: '2026-01-01', hashes: [{ algo: 1, value: sha1 }] }
        result = url.includes('/mods/11/files') ? { data: [{ ...current, id: 2, fileName: 'alpha-new.zip', displayName: '2.0.0', fileDate: '2026-02-01', releaseType: 1, isAvailable: true, hashes: [{ algo: 1, value: newHash }] }], pagination: { index: 0, pageSize: 50, totalCount: 1, resultCount: 1 } } : { data: [current] }
      }
      return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } })
    }
  }, { sha1, newHash })
  await page.evaluate(({ path, provider }) => localStorage.setItem(`shaderpacksUpgradePolicy:${path}`, JSON.stringify(provider)), { path, provider }); await page.reload()
  return { path, other, root, original, next }
}
async function open(page: Page) {
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Shaders', exact: true }).click()
  const area = page.getByTestId('instance-shaders'), trigger = area.getByRole('button', { name: 'Buscar actualizaciones', exact: true })
  await expect(trigger).toBeEnabled(); await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Actualizar shaders', exact: true })
  await expect(dialog.getByRole('button', { name: 'Consultar proveedores', exact: true })).toBeEnabled()
  return { area, trigger, dialog }
}
for (const provider of ['modrinthOnly', 'curseforgeOnly']) test(`shader ${provider}: Native updates preserve shared shader names, engine configurations, groups, worlds and backups`, async ({ launcher }, testInfo) => {
  const page = launcher.main, f = await fixture(launcher, provider, true)
  const options = 'resourcePacks:["vanilla","file/alpha.zip"]\r\nlang:es_es\r\n', groups = '{"Visual":{"color":"#abcdef","files":["alpha.zip"]}}'
  const configurations = ['optionsshaders.txt', 'config/iris.properties', 'config/oculus.properties']
  for (const path of [f.path, f.other]) {
    await writeFile(join(path, 'options.txt'), options); await writeFile(join(path, 'shaderpacks-groups.json'), groups); await mkdir(join(path, 'config'), { recursive: true })
    for (const file of configurations) await writeFile(join(path, file), '# KEEP\nshaderPack=alpha.zip\nunknown=retained\n')
  }
  await mkdir(join(f.path, 'saves/keep'), { recursive: true }); await writeFile(join(f.path, 'saves/keep/level.dat'), 'KEEP WORLD')
  const { dialog, trigger } = await open(page)
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog).toContainText('2.0.0')
  await expect(dialog).toContainText('todas las instancias vinculadas')
  await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click()
  await expect(dialog.locator('.mod-update-changes')).toContainText('shaderpacks/alpha.zip'); await expect(dialog.locator('.mod-update-changes')).not.toContainText('alpha-new.zip')
  expect(await readFile(join(f.path, 'shaderpacks/alpha.zip'))).toEqual(f.original)
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused()
  expect(await launcher.app.evaluate(() => (globalThis as any).__shaderUpdateCalls)).toEqual([])
  await trigger.click(); await dialog.getByRole('button', { name: 'Instalar estos cambios', exact: true }).click()
  await expect(dialog).toContainText('Actualización completada', { timeout: 60000 })
  expect(await readFile(join(f.path, 'shaderpacks/alpha.zip'))).toEqual(f.next); expect(await readFile(join(f.other, 'shaderpacks/alpha.zip'))).toEqual(f.next)
  for (const path of [f.path, f.other]) { expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe(options); expect(await readFile(join(path, 'shaderpacks-groups.json'), 'utf8')).toBe(groups) }
  expect(await readFile(join(f.path, 'saves/keep/level.dat'), 'utf8')).toBe('KEEP WORLD')
  for (const path of [f.path, f.other]) for (const file of configurations) expect(await readFile(join(path, file), 'utf8')).toBe('# KEEP\nshaderPack=alpha.zip\nunknown=retained\n')
  const backups = await readdir(join(f.path, '.backups')), operation = backups.find(name => !name.startsWith('shaderpacks-share-'))!
  expect(await readFile(join(f.path, '.backups', operation, 'shaderpacks/alpha.zip'))).toEqual(f.original)
  expect(await readdir(join(f.root, 'shaderpacks'))).toEqual(['alpha.zip'])
  const requests = await page.evaluate(() => (window as any).__shaderProviderCalls)
  if (provider === 'modrinthOnly') expect(JSON.parse(requests.find((request: any) => request.url.endsWith('/update')).body).loaders).toEqual(['optifine'])
  else expect(requests.find((request: any) => request.url.includes('/mods/11/files')).url).not.toContain('modLoaderType')
  const calls = await launcher.app.evaluate(() => (globalThis as any).__shaderUpdateCalls)
  expect(calls).toHaveLength(1); expect(calls[0].review.domain).toBe('shaderpacks')
  await writeFile(testInfo.outputPath(`${provider}-request.json`), JSON.stringify({ requests, calls }, null, 2))
})
test('shader confirmation rejects edits after review without replacing bytes or creating a recovery operation', async ({ launcher }) => {
  const page = launcher.main, f = await fixture(launcher), { dialog } = await open(page)
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog).toContainText('2.0.0')
  await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click(); await expect(dialog.locator('.mod-update-changes')).toContainText('shaderpacks/alpha.zip')
  await makeReactShaderPack(f.path, 'alpha', 'USER EDIT'); const edited = await readFile(join(f.path, 'shaderpacks/alpha.zip'))
  await dialog.getByRole('button', { name: 'Instalar estos cambios', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('cambiaron')
  expect(await readFile(join(f.path, 'shaderpacks/alpha.zip'))).toEqual(edited)
  expect(await page.evaluate(async path => (window as any).serviceChannels.open('InstanceInstallService').call('getReviewedModInstalls', path), f.path)).toEqual([])
  expect(await page.evaluate(async path => (window as any).serviceChannels.open('InstanceInstallService').call('getReviewedModInstalls', path, 'shaderpacks'), f.path)).toEqual([])
})

test('an engine change after searching blocks review without calling the Native installer', async ({ launcher }, testInfo) => {
  const page = launcher.main, f = await fixture(launcher), { dialog } = await open(page)
  await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog).toContainText('2.0.0')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', optifine: '' } }), f.path)
  await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('cambiaron')
  expect(await readFile(join(f.path, 'shaderpacks/alpha.zip'))).toEqual(f.original)
  expect(await launcher.app.evaluate(() => (globalThis as any).__shaderUpdateCalls)).toEqual([])
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  await page.getByTestId('instance-shaders').getByRole('button', { name: 'Buscar actualizaciones', exact: true }).click()
  await expect(dialog.getByRole('button', { name: 'Consultar proveedores', exact: true })).toBeDisabled(); await expect(dialog.getByRole('alert')).toContainText('motor detectado')
  await expect(dialog).not.toContainText('2.0.0')
  const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400))
  await expect(dialog.getByRole('alert')).toBeInViewport({ ratio: 1 })
  await page.addScriptTag({ content: axe.source }); const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
  expect(result.violations).toEqual([]); await writeFile(testInfo.outputPath('no-engine-800-axe.json'), JSON.stringify(result, null, 2)); await snap(launcher, 'shader-updates-no-engine-800', 'The missing-engine explanation stays visible with queries disabled and recovery available.')
})
test('shader recovery UI cancels a real held download, reviews user edits and preserves their backup', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'shader-recovery')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', optifine: 'HD_U' } }), path)
  await makeReactShaderPack(path, 'alpha', 'OLD'); await makeReactShaderPack(source, 'next', 'NEW')
  const original = await readFile(join(path, 'shaderpacks/alpha.zip')), next = await readFile(join(source, 'shaderpacks/next.zip'))
  let mode: 'fail' | 'hold' | 'allow' = 'fail'; const held = new Set<ServerResponse>()
  const server = createServer((request, response) => {
    if (mode === 'fail') { response.writeHead(503); response.end(); return }
    response.writeHead(200, { 'content-length': next.length }); if (request.method === 'HEAD') { response.end(); return }
    if (mode === 'allow') { response.end(next); return }; response.flushHeaders(); held.add(response); response.once('close', () => held.delete(response))
  }); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No fixture server')
  try {
    const initial = await page.evaluate(async ({ path, originalHash, newHash, url }) => {
      const install = (window as any).serviceChannels.open('InstanceInstallService'), packs = (window as any).serviceChannels.open('InstanceShaderPacksService')
      const snapshot = await packs.call('getShaderFilesSnapshot', path)
      const options = { path, oldFiles: [{ path: 'shaderpacks/alpha.zip', hashes: { sha1: originalHash } }], files: [{ path: 'shaderpacks/alpha.zip', hashes: { sha1: newHash }, downloads: [url] }], review: { domain: 'shaderpacks', snapshot: snapshot.fingerprint, changes: [] } }
      const changes = await install.call('previewInstanceFiles', options)
      options.review.changes = changes.map((change: any) => ({ path: change.file.path, operation: change.operation }))
      try { await install.call('installInstanceFiles', options); return false } catch { return true }
    }, { path, originalHash: hash(original), newHash: hash(next), url: `http://127.0.0.1:${address.port}/next.zip` })
    expect(initial).toBe(true); mode = 'hold'
    const { dialog } = await open(page)
    await dialog.getByRole('button', { name: 'Reanudar esta operación', exact: true }).click(); await expect.poll(() => held.size).toBeGreaterThan(0)
    await dialog.getByRole('button', { name: 'Detener operación', exact: true }).click(); await expect(dialog.getByRole('alert')).toContainText('Operación detenida', { timeout: 30000 })
    await makeReactShaderPack(path, 'alpha', 'USER EDIT'); const edited = await readFile(join(path, 'shaderpacks/alpha.zip'))
    await dialog.getByRole('button', { name: 'Revisar esta operación', exact: true }).click(); await expect(dialog.locator('.mod-update-changes')).toContainText('Respaldar y añadir')
    mode = 'allow'; await dialog.getByRole('button', { name: 'Aplicar recuperación revisada', exact: true }).click(); await expect(dialog).toContainText('Actualización completada', { timeout: 30000 })
    expect(await readFile(join(path, 'shaderpacks/alpha.zip'))).toEqual(next)
    const [backup] = await readdir(join(path, '.backups')); expect(await readFile(join(path, '.backups', backup, 'shaderpacks/alpha.zip'))).toEqual(edited)
  } finally { for (const response of held) response.destroy(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
test('shader updates and review remain accessible in both themes and supported window sizes', async ({ launcher }, testInfo) => {
  const page = launcher.main, errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await fixture(launcher, 'modrinthOnly', true); await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { const key = 'launcher.react.preferences', prefs = JSON.parse(localStorage.getItem(key)!); localStorage.setItem(key, JSON.stringify({ ...prefs, appearance: theme })) }, theme); await page.reload()
    const { dialog } = await open(page), win = await launcher.app.browserWindow(page)
    for (const size of [[1200, 720], [800, 400]]) {
      await win.evaluate((win, size) => win.setContentSize(size[0], size[1]), size)
      await dialog.getByRole('button', { name: 'Consultar proveedores', exact: true }).click(); await expect(dialog).toContainText('2.0.0')
      for (const state of ['selection', 'review']) {
        if (state === 'review') await dialog.getByRole('button', { name: 'Revisar archivos', exact: true }).click()
        const action = dialog.getByRole('button', { name: state === 'review' ? 'Instalar estos cambios' : 'Revisar archivos', exact: true }); await action.focus(); await expect(action).toBeInViewport({ ratio: 1 })
        await expect(dialog.getByRole('heading', { name: 'Actualizar shaders', exact: true })).toBeInViewport({ ratio: 1 })
        expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        const region = dialog.getByRole('region', { name: 'Versiones, selección y archivos' }); await region.focus(); await page.keyboard.press('End')
        await page.addScriptTag({ content: axe.source }); const result = await page.evaluate(async () => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } }))
        expect(result.violations).toEqual([]); await writeFile(testInfo.outputPath(`${theme}-${size[0]}-${state}-axe.json`), JSON.stringify(result, null, 2))
        await snap(launcher, `shader-updates-${theme}-${size[0]}-${state}`, 'Pack ZIP updates preserve identity and expose shared effects, backup and confirmation with keyboard-accessible controls.')
      }
      await dialog.getByRole('button', { name: 'Volver a la selección', exact: true }).click()
    }
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  }
  expect(errors).toEqual([])
})
