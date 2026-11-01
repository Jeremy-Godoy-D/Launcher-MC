import { lstat, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, type Page } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { javaWorldLock } from '../../helpers/java-world-lock'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function instances(page: Page) {
  return page.evaluate(async () => {
    const service = (window as any).serviceChannels.open('InstanceService'), result: string[] = []
    for (const name of ['Legacy source', 'Legacy first', 'Legacy second']) result.push(await service.call('createInstance', { name, runtime: { minecraft: '1.21.1' } }))
    return result
  })
}
async function call(page: Page, method: string, ...args: any[]) {
  return page.evaluate(({ method, args }) => (window as any).serviceChannels.open('InstanceSavesService').call(method, ...args), { method, args })
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
