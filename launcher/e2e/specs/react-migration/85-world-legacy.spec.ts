import { lstat, mkdir, readFile, readdir, realpath, rename, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { test, expect, type Page } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { javaWorldLock } from '../../helpers/java-world-lock'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
const require = createRequire(new URL('../../../xmcl-runtime/package.json', import.meta.url))
const { ZipFile } = require('yazl'), { open, readAllEntries, readEntry } = require('@xmcl/unzip')
async function writeZip(zip: any, path: string) { zip.end(); await pipeline(zip.outputStream, createWriteStream(path, { flags: 'wx' })) }
async function instances(page: Page) {
  return page.evaluate(async () => {
    const service = (window as any).serviceChannels.open('InstanceService'), result: string[] = []
    for (const name of ['Legacy source', 'Legacy first', 'Legacy second']) result.push(await service.call('createInstance', { name, runtime: { minecraft: '1.21.1' } }))
    return result
  })
}
async function call(page: Page, method: string, ...args: any[]) {
  return page.evaluate(async ({ method, args }) => {
    try { return await (window as any).serviceChannels.open('InstanceSavesService').call(method, ...args) }
    catch (error) { throw new Error(`${method}: ${JSON.stringify(error)}`) }
  }, { method, args })
}
async function rejected(page: Page, method: string, ...args: any[]) {
  return page.evaluate(async ({ method, args }) => {
    try { await (window as any).serviceChannels.open('InstanceSavesService').call(method, ...args); return false }
    catch { return true }
  }, { method, args })
}

test('legacy clone preflights its batch and legacy delete retains an exact backup through the packaged bridge', async ({ launcher }) => {
  const page = launcher.main, [source, first, second] = await instances(page)
  const original = await makeReactWorld(source, 'Alpha'), occupied = await makeReactWorld(second, 'Beta')
  const bytes = await readFile(join(original, 'level.dat')), occupiedBytes = await readFile(join(occupied, 'level.dat'))
  const input = { srcInstancePath: source, destInstancePath: [first, second], saveName: 'Alpha', newSaveName: 'Beta' }
  expect(await rejected(page, 'cloneSave', input)).toBe(true)
  await expect(lstat(join(first, 'saves/Beta'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(occupied, 'level.dat'))).toEqual(occupiedBytes)
  await call(page, 'cloneSave', { ...input, newSaveName: 'Gamma' })
  for (const path of [first, second]) {
    const file = join(path, 'saves/Gamma/level.dat')
    expect(await readFile(file)).toEqual(bytes)
    expect((await lstat(file, { bigint: true })).ino).not.toBe((await lstat(join(original, 'level.dat'), { bigint: true })).ino)
  }
  await call(page, 'updateSave', { instancePath: source, saveName: 'Alpha', metadata: { seed: '99' } })
  expect((await call(page, 'getInstanceSaves', source))[0]).toMatchObject({ seed: '99', levelName: 'Alpha', cheat: true, difficulty: 2 })
  const updatedBytes = await readFile(join(original, 'level.dat'))
  await call(page, 'deleteSave', { instancePath: source, saveName: 'Alpha' })
  await expect(lstat(original)).rejects.toHaveProperty('code', 'ENOENT')
  const backups = await readdir(join(source, '.backups'))
  expect(backups).toHaveLength(2)
  const metadataBackup = backups.find(name => name.startsWith('world-metadata-'))!, deletedBackup = backups.find(name => !name.startsWith('world-metadata-'))!
  expect(await readFile(join(source, '.backups', metadataBackup, 'Alpha/level.dat'))).toEqual(bytes)
  expect(await readFile(join(source, '.backups', deletedBackup, 'Alpha/level.dat'))).toEqual(updatedBytes)
  await call(page, 'deleteSave', { instancePath: source, saveName: 'Alpha' })
  expect(await call(page, 'getInstanceSaves', source)).toEqual([])
})

test('legacy world calls refuse traversal, foreign junctions and renderer-supplied depot authorization', async ({ launcher }) => {
  const page = launcher.main, [source, destination] = await instances(page), foreign = join(launcher.gameDataPath, 'foreign-world')
  await mkdir(foreign); await writeFile(join(foreign, 'level.dat'), 'PRIVATE')
  await mkdir(join(source, 'saves'), { recursive: true }); await symlink(foreign, join(source, 'saves/Foreign'), 'junction')
  expect(await rejected(page, 'deleteSave', { instancePath: source, saveName: 'Foreign' })).toBe(true)
  for (const saveName of ['../foreign-world', 'a/b', 'NUL', '']) {
    expect(await rejected(page, 'deleteSave', { instancePath: source, saveName })).toBe(true)
    expect(await rejected(page, 'cloneSave', { srcInstancePath: source, destInstancePath: destination, saveName })).toBe(true)
  }
  const operation = { type: 'remove', instancePath: foreign, saveName: 'Alpha' }
  expect(await rejected(page, 'previewWorldFiles', operation, true)).toBe(true)
  expect(await rejected(page, 'applyWorldFiles', { operation, snapshot: 'a'.repeat(64) }, true)).toBe(true)
  expect(await readFile(join(foreign, 'level.dat'), 'utf8')).toBe('PRIVATE')
})

test('legacy shared-world deletion waits for a real Java session and preserves its original bytes in a backup', async ({ launcher }) => {
  const page = launcher.main, world = await makeReactWorld(launcher.gameDataPath, 'SharedLegacy'), bytes = await readFile(join(world, 'level.dat'))
  await writeFile(join(world, 'session.lock'), '☃')
  const external = await javaWorldLock(world); expect(external.status).toBe('LOCKED')
  try {
    expect(await rejected(page, 'deleteSave', { saveName: 'SharedLegacy' })).toBe(true)
    expect(await readFile(join(world, 'level.dat'))).toEqual(bytes)
  } finally { await external.release() }
  expect(await readFile(join(world, 'session.lock'), 'utf8')).toBe('☃')
  await call(page, 'deleteSave', { saveName: 'SharedLegacy' })
  await expect(lstat(world)).rejects.toHaveProperty('code', 'ENOENT')
  const backups = await readdir(join(launcher.gameDataPath, '.backups'))
  expect(backups).toHaveLength(1)
  expect(await readFile(join(launcher.gameDataPath, '.backups', backups[0], 'SharedLegacy/level.dat'))).toEqual(bytes)
  expect(await readFile(join(launcher.gameDataPath, '.backups', backups[0], 'SharedLegacy/session.lock'), 'utf8')).toBe('☃')
})

test('legacy datapack calls copy independently, retain sidecars in a backup and reject a foreign world', async ({ launcher }) => {
  const page = launcher.main, [instance] = await instances(page), world = await makeReactWorld(instance, 'Packs'), incoming = join(launcher.gameDataPath, 'IncomingLegacy')
  await mkdir(incoming); await writeFile(join(incoming, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'Fixture pack' } }))
  const installed = await call(page, 'importDatapack', { savePath: world, path: incoming })
  expect(await readFile(join(installed, 'pack.mcmeta'))).toEqual(await readFile(join(incoming, 'pack.mcmeta')))
  expect((await lstat(join(installed, 'pack.mcmeta'), { bigint: true })).ino).not.toBe((await lstat(join(incoming, 'pack.mcmeta'), { bigint: true })).ino)
  const sidecar = JSON.stringify({ projectId: 1, fileId: 2 })
  await writeFile(join(world, 'datapacks/.IncomingLegacy.curseforge'), sidecar)
  await call(page, 'deleteDatapack', { savePath: world, fileName: 'IncomingLegacy' })
  const backup = (await readdir(join(instance, '.backups'))).find(name => name.startsWith('world-datapacks-'))!
  expect(await readFile(join(instance, '.backups', backup, 'Packs/IncomingLegacy/pack.mcmeta'))).toEqual(await readFile(join(incoming, 'pack.mcmeta')))
  expect(await readFile(join(instance, '.backups', backup, 'Packs/.IncomingLegacy.curseforge'), 'utf8')).toBe(sidecar)
  await call(page, 'deleteDatapack', { savePath: world, fileName: 'IncomingLegacy' })
  expect(await rejected(page, 'importDatapack', { savePath: incoming, path: incoming })).toBe(true)
  expect(await rejected(page, 'deleteDatapack', { savePath: world, fileName: '../outside' })).toBe(true)
  expect(await readFile(join(incoming, 'pack.mcmeta'), 'utf8')).toContain('Fixture pack')
})

test('legacy imports and exports complete independent worlds with collision protection through the packaged bridge', async ({ launcher }) => {
  const page = launcher.main, [instance] = await instances(page), external = join(dirname(launcher.gameDataPath), 'legacy-transfer')
  await mkdir(external, { recursive: true })
  const original = await makeReactWorld(external, 'Vanilla.world'), bytes = await readFile(join(original, 'level.dat'))
  await mkdir(join(original, 'empty')); await writeFile(join(original, '.keep'), 'HIDDEN')
  const installed = await call(page, 'importSave', { instancePath: instance, path: original })
  expect(installed).toBe(join(instance, 'saves/Vanilla.world'))
  expect((await lstat(join(installed, 'level.dat'), { bigint: true })).ino).not.toBe((await lstat(join(original, 'level.dat'), { bigint: true })).ino)
  expect(await call(page, 'importSave', { instancePath: instance, path: original })).toBe(join(instance, 'saves/Vanilla.world (1)'))
  const archive = join(external, 'Export.zip'), folder = join(external, 'Exported')
  await call(page, 'exportSave', { instancePath: instance, saveName: 'Vanilla.world', destination: archive })
  const zip = await open(archive)
  try {
    const entries = await readAllEntries(zip)
    expect(entries.map((entry: { fileName: string }) => entry.fileName)).toEqual(expect.arrayContaining(['level.dat', '.keep', 'empty/']))
    expect(await readEntry(zip, entries.find((entry: { fileName: string }) => entry.fileName === 'level.dat')!)).toEqual(bytes)
  } finally { zip.close() }
  await call(page, 'exportSave', { instancePath: instance, saveName: 'Vanilla.world', destination: folder, zip: false })
  expect(await readFile(join(folder, 'level.dat'))).toEqual(bytes); expect(await readFile(join(folder, '.keep'), 'utf8')).toBe('HIDDEN')
  expect((await lstat(join(folder, 'empty'))).isDirectory()).toBe(true)
  expect((await lstat(join(folder, 'level.dat'), { bigint: true })).ino).not.toBe((await lstat(join(installed, 'level.dat'), { bigint: true })).ino)
  expect(await rejected(page, 'exportSave', { instancePath: instance, saveName: 'Vanilla.world', destination: folder, zip: false })).toBe(true)
  expect(await readFile(join(original, 'level.dat'))).toEqual(bytes)
})

test('legacy ZIP import validates archive roots and provider IDs before publishing a world', async ({ launcher }) => {
  const page = launcher.main, [instance] = await instances(page), external = join(dirname(launcher.gameDataPath), 'legacy-zip')
  await mkdir(external, { recursive: true }); const world = await makeReactWorld(external, 'Original'), bytes = await readFile(join(world, 'level.dat'))
  const path = join(external, 'Wrapped.zip'), zip = new ZipFile(), curseforge = { projectId: 123, fileId: 456 }
  zip.addBuffer(bytes, 'wrapper/level.dat'); zip.addBuffer(Buffer.from('SOURCE PROVIDER'), 'wrapper/.curseforge'); zip.addEmptyDirectory('wrapper/empty')
  await writeZip(zip, path); const archiveBytes = await readFile(path)
  const installed = await call(page, 'importSave', { instancePath: instance, path, curseforge })
  expect(await readFile(join(installed, 'level.dat'))).toEqual(bytes)
  expect(JSON.parse(await readFile(join(installed, '.curseforge'), 'utf8'))).toEqual(curseforge)
  expect(await readFile(path)).toEqual(archiveBytes)
  const invalid = new ZipFile(), bad = join(external, 'Ambiguous.zip')
  invalid.addBuffer(bytes, 'one/level.dat'); invalid.addBuffer(bytes, 'two/level.dat'); await writeZip(invalid, bad)
  expect(await rejected(page, 'importSave', { instancePath: instance, path: bad })).toBe(true)
  expect(await rejected(page, 'importSave', { instancePath: instance, path, saveName: '../outside' })).toBe(true)
  expect(await rejected(page, 'importSave', { instancePath: instance, path, saveName: 'Invalid IDs', curseforge: { projectId: 0, fileId: 1 } })).toBe(true)
  for (const name of ['Ambiguous', 'Invalid IDs']) await expect(lstat(join(instance, 'saves', name))).rejects.toHaveProperty('code', 'ENOENT')
})

test('legacy shared-world activation respects a real Java session and preserves link semantics without losing the depot world', async ({ launcher }) => {
  const page = launcher.main, [instance] = await instances(page), shared = await makeReactWorld(launcher.gameDataPath, 'SharedActivation')
  const bytes = await readFile(join(shared, 'level.dat')); await writeFile(join(shared, 'session.lock'), '☃')
  const external = await javaWorldLock(shared); expect(external.status).toBe('LOCKED')
  try {
    expect(await rejected(page, 'importSave', { instancePath: instance, path: shared, saveName: 'Waiting' })).toBe(true)
    await expect(lstat(join(instance, 'saves/Waiting'))).rejects.toHaveProperty('code', 'ENOENT')
  } finally { await external.release() }
  const installed = await call(page, 'importSave', { instancePath: instance, path: shared })
  expect((await lstat(installed)).isSymbolicLink()).toBe(true); expect(await realpath(installed)).toBe(await realpath(shared))
  expect((await call(page, 'getInstanceSaves', instance))[0]).toMatchObject({ name: 'SharedActivation', linkTo: await realpath(shared) })
  await call(page, 'deleteSave', { instancePath: instance, saveName: 'SharedActivation' })
  await expect(lstat(installed)).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(shared, 'level.dat'))).toEqual(bytes)
})

test('sharing worlds retains collision contents, originals and notes while disconnecting preserves the depot', async ({ launcher }, testInfo) => {
  const page = launcher.main, prepared = join(launcher.gameDataPath, 'instances/Legacy source')
  // Vue can start its observer as soon as an instance is published; seed the fixture first.
  const original = await makeReactWorld(prepared, 'Alpha', 'LOCAL ALPHA'), originalBytes = await readFile(join(original, 'level.dat'))
  const instance = await page.evaluate(path => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Legacy source', path, runtime: { minecraft: '1.21.1' } }), prepared)
  expect(instance).toBe(prepared)
  await call(page, 'watch', instance)
  const watchActive = async () => {
    const root = (await realpath(join(instance, 'saves'))).replace(/\\/g, '/').toLowerCase()
    return launcher.app.evaluate((_electron, root) => ((process.report.getReport() as any).libuv ?? []).some((handle: any) => handle.type === 'fs_event' && typeof handle.filename === 'string' && handle.filename.replace(/\\/g, '/').toLowerCase().endsWith(root)), root)
  }
  await expect.poll(watchActive).toBe(true)
  const occupied = await makeReactWorld(launcher.gameDataPath, 'Alpha', 'DEPOT ALPHA'), occupiedBytes = await readFile(join(occupied, 'level.dat'))
  await call(page, 'shareSave', { instancePath: instance, saveName: 'Alpha' })
  await expect(lstat(original)).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(launcher.gameDataPath, 'saves/Alpha (1)/level.dat'))).toEqual(originalBytes)
  expect(await readFile(join(occupied, 'level.dat'))).toEqual(occupiedBytes)
  const [worldBackup] = await readdir(join(instance, '.backups'))
  expect(await readFile(join(instance, '.backups', worldBackup, 'Alpha/level.dat'))).toEqual(originalBytes)
  const first = await makeReactWorld(instance, 'Beta', 'FIRST BETA'), second = await makeReactWorld(instance, 'Beta (1)', 'SECOND BETA')
  const firstBytes = await readFile(join(first, 'level.dat')), secondBytes = await readFile(join(second, 'level.dat'))
  await makeReactWorld(launcher.gameDataPath, 'Beta', 'DEPOT BETA'); await writeFile(join(instance, 'saves/.note'), 'LOCAL NOTE')
  await symlink(occupied, join(instance, 'saves/Owned alias'), 'junction')
  const folderID = (await lstat(join(instance, 'saves'), { bigint: true })).ino
  const watches = await launcher.app.evaluate(() => ((process.report.getReport() as any).libuv ?? []).filter((handle: any) => handle.type === 'fs_event').map((handle: any) => ({ type: handle.type, filename: handle.filename, is_active: handle.is_active })))
  await writeFile(testInfo.outputPath('folder-watches.json'), JSON.stringify(watches, null, 2))
  await call(page, 'linkSharedSave', instance)
  await expect.poll(watchActive).toBe(true)
  expect(await call(page, 'isSaveLinked', instance)).toBe(true)
  expect((await lstat(join(instance, 'saves'))).isSymbolicLink()).toBe(true)
  expect(await readFile(join(launcher.gameDataPath, 'saves/Beta (1)/level.dat'))).toEqual(firstBytes)
  expect(await readFile(join(launcher.gameDataPath, 'saves/Beta (1) (1)/level.dat'))).toEqual(secondBytes)
  const folderBackup = (await readdir(join(instance, '.backups'))).find(name => name.startsWith('world-sharing-'))!
  const retained = join(instance, '.backups', folderBackup, 'saves')
  expect((await lstat(retained, { bigint: true })).ino).toBe(folderID)
  expect(await readFile(join(retained, '.note'), 'utf8')).toBe('LOCAL NOTE')
  expect((await lstat(join(retained, 'Owned alias'))).isSymbolicLink()).toBe(true)
  await call(page, 'linkSharedSave', instance); expect(await readdir(join(instance, '.backups'))).toHaveLength(2)
  await call(page, 'unlinkSharedSave', instance)
  await expect.poll(watchActive).toBe(true)
  expect(await call(page, 'isSaveLinked', instance)).toBe(false); expect(await readdir(join(instance, 'saves'))).toEqual([])
  expect(await readFile(join(occupied, 'level.dat'))).toEqual(occupiedBytes)
  expect(await readFile(join(launcher.gameDataPath, 'saves/Beta (1)/level.dat'))).toEqual(firstBytes)
  expect(await readdir(join(instance, '.backups'))).toHaveLength(3)
})

test('whole-folder sharing and disconnect refuse real external Java sessions before replacing the folder', async ({ launcher }) => {
  const page = launcher.main, [instance] = await instances(page), world = await makeReactWorld(instance, 'Guarded')
  const bytes = await readFile(join(world, 'level.dat')); await writeFile(join(world, 'session.lock'), '☃')
  const external = await javaWorldLock(world); expect(external.status).toBe('LOCKED')
  try {
    expect(await rejected(page, 'linkSharedSave', instance)).toBe(true)
    expect((await lstat(join(instance, 'saves'))).isSymbolicLink()).toBe(false)
    await expect(lstat(join(launcher.gameDataPath, 'saves/Guarded'))).rejects.toHaveProperty('code', 'ENOENT')
  } finally { await external.release() }
  await call(page, 'linkSharedSave', instance)
  const shared = join(launcher.gameDataPath, 'saves/Guarded'), active = await javaWorldLock(shared)
  expect(active.status).toBe('LOCKED')
  try {
    expect(await rejected(page, 'unlinkSharedSave', instance)).toBe(true)
    expect((await lstat(join(instance, 'saves'))).isSymbolicLink()).toBe(true)
    expect(await readFile(join(shared, 'level.dat'))).toEqual(bytes)
  } finally { await active.release() }
  await call(page, 'unlinkSharedSave', instance)
  expect(await readdir(join(instance, 'saves'))).toEqual([])
  expect(await readFile(join(shared, 'level.dat'))).toEqual(bytes)
})

test('creation can link empty saves while whole-folder calls reject unregistered roots and foreign junctions', async ({ launcher }) => {
  const page = launcher.main, [, empty, unsafe] = await instances(page)
  await call(page, 'linkSharedSave', empty); expect(await call(page, 'isSaveLinked', empty)).toBe(true)
  await call(page, 'unlinkSharedSave', empty); expect(await readdir(join(empty, 'saves'))).toEqual([])
  const foreign = join(launcher.gameDataPath, 'foreign-saves'); await mkdir(foreign); await writeFile(join(foreign, 'private'), 'KEEP')
  await mkdir(join(unsafe, 'saves'), { recursive: true }); await rename(join(unsafe, 'saves'), join(unsafe, 'retained-saves'))
  await symlink(foreign, join(unsafe, 'saves'), 'junction')
  for (const method of ['linkSharedSave', 'unlinkSharedSave', 'isSaveLinked']) {
    expect(await rejected(page, method, unsafe)).toBe(true)
    expect(await rejected(page, method, launcher.gameDataPath, true)).toBe(true)
  }
  expect(await readFile(join(foreign, 'private'), 'utf8')).toBe('KEEP')
  expect((await lstat(join(unsafe, 'saves'))).isSymbolicLink()).toBe(true)
})
