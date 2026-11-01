import { test, expect, snap, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactWorld } from '../../helpers/react-world'
import { javaWorldLock } from '../../helpers/java-world-lock'
import { activateLauncherControl, focusLauncher } from '../../helpers/focus-launcher'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const region = fileURLToPath(new URL('../../../mock/saves/1.19.3/region/r.0.0.mca', import.meta.url))
async function call(page: Page, method: string, ...args: any[]) {
  return page.evaluate(({ method, args }) => (window as any).serviceChannels.open('InstanceSavesService').call(method, ...args), { method, args })
}
async function rejected(page: Page, method: string, ...args: any[]) {
  return page.evaluate(async ({ method, args }) => {
    try { await (window as any).serviceChannels.open('InstanceSavesService').call(method, ...args); return 'accepted' }
    catch (error: any) { return error.name }
  }, { method, args })
}

test('metadata edits recover after an external Java session and keep its original lock bytes', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = await makeReactWorld(path, 'Alpha'), original = await readFile(join(root, 'level.dat'))
  await writeFile(join(root, 'session.lock'), '☃')
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByLabel('Secciones de la instancia').getByRole('link', { name: 'Mundos', exact: true }).click()
  await page.getByRole('button', { name: 'Editar metadatos de Alpha', exact: true }).click()
  const dialog = page.getByTestId('world-files-dialog'); await dialog.getByLabel('Nombre del mundo').fill('Alpha seguro')
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true }))
  const external = await javaWorldLock(root); expect(external.status).toBe('LOCKED')
  try {
    await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('Cierra la partida', { timeout: 5000 })
    expect(await readFile(join(root, 'level.dat'))).toEqual(original)
    const win = await launcher.app.browserWindow(page); await win.evaluate(win => win.setContentSize(800, 400)); await focusLauncher(launcher)
    await snap(launcher, 'external-session-blocked-800', 'A real Java NIO lock blocks the reviewed metadata edit, preserves world bytes and exposes recovery.')
  } finally { await external.release() }
  await activateLauncherControl(launcher, dialog.getByRole('button', { name: 'Revisar archivos del mundo', exact: true })); await dialog.getByRole('button', { name: 'Confirmar operación', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Metadatos actualizados')
  const backup = (await readdir(join(path, '.backups'))).find(name => name.startsWith('world-metadata-'))!
  expect(await readFile(join(path, '.backups', backup, 'Alpha/level.dat'))).toEqual(original)
  expect(await readFile(join(root, 'session.lock'), 'utf8')).toBe('☃')
})

test('reviewed file operations reject external sessions and copy/export no stale session control', async ({ launcher }) => {
  const page = launcher.main, [path, destination] = await seedReactLibrary(page), root = await makeReactWorld(path, 'Alpha'), original = await readFile(join(root, 'level.dat'))
  await writeFile(join(root, 'session.lock'), '☃'); const externalRoot = join(launcher.appDataPath, 'world-session-files'), exports = join(externalRoot, 'exports'), pack = join(externalRoot, 'new-pack')
  await mkdir(exports, { recursive: true }); await mkdir(pack); await writeFile(join(pack, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'test' } }))
  await mkdir(join(root, 'datapacks/existing'), { recursive: true }); await writeFile(join(root, 'datapacks/existing/pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'keep' } }))
  const operations = [
    { type: 'metadata', instancePath: path, saveName: 'Alpha', metadata: { levelName: 'changed', seed: '1', difficulty: 2, cheat: false } },
    { type: 'copy', instancePath: path, saveName: 'Alpha', destinationInstancePath: destination, destinationName: 'Beta' },
    { type: 'export', instancePath: path, saveName: 'Alpha', destinationDirectory: exports, fileName: 'Alpha.zip' },
    { type: 'remove', instancePath: path, saveName: 'Alpha' },
    { type: 'import-datapack', instancePath: path, saveName: 'Alpha', sourcePath: pack, fileName: 'new-pack' },
    { type: 'remove-datapack', instancePath: path, saveName: 'Alpha', fileName: 'existing' },
  ]
  const reviews = []; for (const operation of operations) reviews.push(await call(page, 'previewWorldFiles', operation))
  const external = await javaWorldLock(root); expect(external.status).toBe('LOCKED')
  try {
    for (let i = 0; i < operations.length; i++) {
      expect(await rejected(page, 'previewWorldFiles', operations[i])).toBe('InstanceRunningError')
      expect(await rejected(page, 'applyWorldFiles', reviews[i])).toBe('InstanceRunningError')
    }
    expect(await readFile(join(root, 'level.dat'))).toEqual(original); expect(await readdir(exports)).toEqual([])
    await expect(lstat(join(destination, 'saves/Beta'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await external.release() }
  await call(page, 'applyWorldFiles', reviews[1]); expect(await readFile(join(destination, 'saves/Beta/level.dat'))).toEqual(original)
  await expect(lstat(join(destination, 'saves/Beta/session.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  await call(page, 'applyWorldFiles', reviews[2])
  const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url)), { open, readAllEntries } = require('@xmcl/unzip'), zip = await open(join(exports, 'Alpha.zip'))
  try { expect((await readAllEntries(zip)).map((entry: any) => entry.fileName)).not.toContain('session.lock') } finally { zip.close() }
  await launcher.app.evaluate((_, source) => {
    const fs = process.getBuiltinModule('fs/promises'), modules = process.getBuiltinModule('module'), original = fs.rename, globals = globalThis as any
    globals.__sessionRemovePaused = false
    globals.__restoreSessionRemove = () => { fs.rename = original; modules.syncBuiltinESMExports(); globals.__resumeSessionRemove?.() }
    fs.rename = async (from: any, to: any) => {
      if (String(from) === source && String(to).includes('world-')) { globals.__sessionRemovePaused = true; await new Promise<void>(resolve => { globals.__resumeSessionRemove = resolve }) }
      return original(from, to)
    }; modules.syncBuiltinESMExports()
  }, await realpath(root))
  const removing = rejected(page, 'applyWorldFiles', reviews[3]); let raced: Awaited<ReturnType<typeof javaWorldLock>> | undefined
  try {
    await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__sessionRemovePaused)).toBe(true)
    raced = await javaWorldLock(root); expect(raced.status).toBe('LOCKED')
    await launcher.app.evaluate(() => (globalThis as any).__resumeSessionRemove())
    expect(await removing).not.toBe('accepted'); expect(await readFile(join(root, 'level.dat'))).toEqual(original)
  } finally { await launcher.app.evaluate(() => (globalThis as any).__restoreSessionRemove()); await removing; await raced?.release() }
  const removed = await call(page, 'applyWorldFiles', reviews[3]); expect(await readFile(join(removed.backup, 'Alpha/level.dat'))).toEqual(original)
  expect(await readFile(join(removed.backup, 'Alpha/session.lock'), 'utf8')).toBe('☃')
})

test('folder import checks an external session without creating or changing its control file', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = await makeReactWorld(launcher.appDataPath, 'External'), original = await readFile(join(source, 'level.dat'))
  const operation = { type: 'import', instancePath: path, saveName: 'Imported', sourcePath: source }, review = await call(page, 'previewWorldFiles', operation)
  await expect(lstat(join(source, 'session.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  const external = await javaWorldLock(source); expect(external.status).toBe('LOCKED')
  try {
    expect(await rejected(page, 'applyWorldFiles', review)).toBe('InstanceRunningError')
    await expect(lstat(join(path, 'saves/Imported'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await external.release() }
  const control = await lstat(join(source, 'session.lock')); await call(page, 'applyWorldFiles', review)
  expect(await readFile(join(path, 'saves/Imported/level.dat'))).toEqual(original); expect(await readFile(join(source, 'level.dat'))).toEqual(original)
  expect((await lstat(join(source, 'session.lock'))).mtimeMs).toBe(control.mtimeMs)
  await expect(lstat(join(path, 'saves/Imported/session.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('chunk publication holds its session lock until the last rename and releases it afterward', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), root = await makeReactWorld(path, 'Alpha')
  await mkdir(join(root, 'region')); const file = join(root, 'region/r.0.0.mca'); await copyFile(region, file); const original = await readFile(file)
  const change = { type: 'delete', savePath: root, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] }, review = await call(page, 'previewSaveChunkChanges', change)
  await expect(lstat(join(root, 'session.lock'))).rejects.toMatchObject({ code: 'ENOENT' })
  const external = await javaWorldLock(root); expect(external.status).toBe('LOCKED')
  try {
    expect(await rejected(page, 'previewSaveChunkChanges', change)).toBe('InstanceRunningError')
    expect(await rejected(page, 'applySaveChunkChanges', change, review.snapshot)).toBe('InstanceRunningError')
    expect(await readFile(file)).toEqual(original)
  } finally { await external.release() }
  await launcher.app.evaluate((_, target) => {
    const fs = process.getBuiltinModule('fs/promises'), modules = process.getBuiltinModule('module'), original = fs.rename, globals = globalThis as any
    globals.__sessionPublishPaused = false
    globals.__restoreSessionPublish = () => { fs.rename = original; modules.syncBuiltinESMExports(); globals.__resumeSessionPublish?.() }
    fs.rename = async (from: any, to: any) => {
      if (String(to) === target && String(from).includes('.prepared')) { globals.__sessionPublishPaused = true; await new Promise<void>(resolve => { globals.__resumeSessionPublish = resolve }) }
      return original(from, to)
    }; modules.syncBuiltinESMExports()
  }, join(await realpath(root), 'region/r.0.0.mca'))
  const writing = call(page, 'applySaveChunkChanges', change, review.snapshot); void writing.catch(() => {})
  try {
    await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__sessionPublishPaused)).toBe(true)
    const during = await javaWorldLock(root, 'probe'); try { expect(during.status).toBe('BUSY') } finally { await during.release() }
    expect(await readFile(file)).toEqual(original)
    await launcher.app.evaluate(() => (globalThis as any).__resumeSessionPublish()); await writing
  } finally { await launcher.app.evaluate(() => (globalThis as any).__restoreSessionPublish()); await writing.catch(() => {}) }
  const after = await javaWorldLock(root, 'probe'); try { expect(after.status).toBe('LOCKED') } finally { await after.release() }
  expect(await readFile(file)).not.toEqual(original)
  const backup = (await readdir(join(root, '.backups'))).find(name => name.startsWith('world-chunks-'))!
  expect(await readFile(join(root, '.backups', backup, 'Alpha/minecraft_overworld/r.0.0.mca'))).toEqual(original)
})
