import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { makeReactWorld } from '../../e2e/helpers/react-world'
import { prepareWorldMetadata, readWorldMetadata } from './utils/worldFiles'
vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/instance', () => ({ InstanceService: class {} }))
vi.mock('~/launch', () => ({ LaunchService: class {} }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/market', () => ({ kMarketProvider: Symbol('market') }))
vi.mock('~/save', () => ({ kSaveWorker: Symbol('save') }))
vi.mock('~/service', () => ({ AbstractService: class { constructor(public app: any) {} get mutex() { return this.app.mutex } }, ExposeServiceKey: () => () => {}, ServiceStateManager: class {} }))
const { InstanceSavesService } = await import('./InstanceSavesService')
let root: string, source: string, destination: string, third: string, service: InstanceType<typeof InstanceSavesService>
let instances: { path: string; edition: string }[], processes: any[], sessions: { verify: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }[]
async function world(instance: string, name = 'Alpha') {
  const path = join(instance, 'saves', name); await mkdir(path, { recursive: true }); await writeFile(join(path, 'level.dat'), 'original-world')
  return path
}
beforeEach(async () => {
  root = await mkdtemp(join(process.cwd(), '.world-legacy-test-')); source = join(root, 'source'); destination = join(root, 'destination'); third = join(root, 'third')
  instances = [source, destination, third].map(path => ({ path, edition: 'java' })); processes = []; sessions = []
  for (const path of [source, destination, third, root]) await mkdir(join(path, 'saves'), { recursive: true })
  await world(source)
  const locks = new Map<string, Mutex>(), of = (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! }
  const app = {
    mutex: { of }, registry: { get: async () => ({ getGameProcesses: async () => processes, get: () => undefined }) },
    acquireWorldLock: async () => {
      const session = { verify: vi.fn(async () => { expect(of('resource-pack-options').isLocked()).toBe(true) }), release: vi.fn() }
      sessions.push(session); return session
    },
  }
  service = new InstanceSavesService(app as any, { initialize: async () => {}, state: { get instances() { return instances } } } as any, {} as any, (...parts) => join(root, ...parts), {} as any)
})
afterEach(async () => {
  vi.restoreAllMocks()
  if (root) { expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.world-legacy-test-'); await rm(root, { recursive: true, force: true }) }
})
it('clones through reviewed independent copies and refuses an occupied batch before publishing any destination', async () => {
  const existing = await world(third, 'Beta')
  const options = { srcInstancePath: source, destInstancePath: [destination, third], saveName: 'Alpha', newSaveName: 'Beta' }
  await expect(service.cloneSave(options)).rejects.toMatchObject({ name: 'WorldDestinationExistsError' })
  await expect(lstat(join(destination, 'saves/Beta'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(existing, 'level.dat'), 'utf8')).toBe('original-world')
  await service.cloneSave({ ...options, newSaveName: 'Gamma' })
  for (const path of [destination, third]) {
    const copy = join(path, 'saves/Gamma/level.dat'), original = join(source, 'saves/Alpha/level.dat')
    expect(await readFile(copy)).toEqual(await readFile(original))
    expect((await lstat(copy, { bigint: true })).ino).not.toBe((await lstat(original, { bigint: true })).ino)
  }
  expect(sessions.every(session => session.release.mock.calls.length === 1)).toBe(true)
})
it('rejects traversal, unknown and non-Java instances through both legacy entry points', async () => {
  for (const saveName of ['../outside', 'nested/world', 'NUL', '']) {
    await expect(service.cloneSave({ srcInstancePath: source, destInstancePath: destination, saveName })).rejects.toThrow()
    await expect(service.deleteSave({ instancePath: source, saveName })).rejects.toThrow()
  }
  for (const path of [join(root, 'unknown'), source]) {
    instances = instances.map(instance => instance.path === source ? { ...instance, edition: 'bedrock' } : instance)
    await expect(service.cloneSave({ srcInstancePath: path, destInstancePath: destination, saveName: 'Alpha' })).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
    await expect(service.deleteSave({ instancePath: path, saveName: 'Alpha' })).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
  }
  expect(await readFile(join(source, 'saves/Alpha/level.dat'), 'utf8')).toBe('original-world')
  expect(await readdir(join(destination, 'saves'))).toEqual([])
})
it('rejects a source changed after review without deleting its newer contents', async () => {
  const apply = service.applyWorldFiles.bind(service)
  vi.spyOn(service, 'applyWorldFiles').mockImplementation(async review => { await writeFile(join(source, 'saves/Alpha/level.dat'), 'newer-world'); return apply(review) })
  await expect(service.cloneSave({ srcInstancePath: source, destInstancePath: destination, saveName: 'Alpha' })).rejects.toMatchObject({ name: 'WorldFilesChangedError' })
  expect(await readFile(join(source, 'saves/Alpha/level.dat'), 'utf8')).toBe('newer-world')
  expect(await readdir(join(destination, 'saves'))).toEqual([])
})
it('backs up a legacy deletion and retains the void/idempotent contract', async () => {
  await expect(service.deleteSave({ instancePath: source, saveName: 'Alpha' })).resolves.toBeUndefined()
  await expect(lstat(join(source, 'saves/Alpha'))).rejects.toHaveProperty('code', 'ENOENT')
  const backups = await readdir(join(source, '.backups'))
  expect(backups).toHaveLength(1); expect(await readFile(join(source, '.backups', backups[0], 'Alpha/level.dat'), 'utf8')).toBe('original-world')
  await expect(service.deleteSave({ instancePath: source, saveName: 'Alpha' })).resolves.toBeUndefined()
  expect(sessions.every(session => session.release.mock.calls.length === 1)).toBe(true)
})
it('blocks legacy changes during a game and permits only Native authorization of the shared depot', async () => {
  await world(root)
  processes = [{ options: { gameDirectory: source } }]
  await expect(service.cloneSave({ srcInstancePath: source, destInstancePath: destination, saveName: 'Alpha' })).rejects.toMatchObject({ name: 'InstanceRunningError' })
  await expect(service.deleteSave({ instancePath: source, saveName: 'Alpha' })).rejects.toMatchObject({ name: 'InstanceRunningError' })
  await expect(service.deleteSave({ saveName: 'Alpha' })).rejects.toMatchObject({ name: 'SharedWorldRunningError' })
  const operation = { type: 'remove', instancePath: root, saveName: 'Alpha' }
  await expect((service.previewWorldFiles as any)(operation, true)).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
  await expect((service.applyWorldFiles as any)({ operation, snapshot: 'a'.repeat(64) }, true)).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
  processes = []; await service.deleteSave({ saveName: 'Alpha' })
  const backups = await readdir(join(root, '.backups'))
  expect(await readFile(join(root, '.backups', backups[0], 'Alpha/level.dat'), 'utf8')).toBe('original-world')
})
it('leaves a foreign linked world untouched and validates destinations before copying', async () => {
  const foreign = join(root, 'foreign'); await mkdir(foreign); await writeFile(join(foreign, 'level.dat'), 'PRIVATE')
  await symlink(foreign, join(source, 'saves/Foreign'), 'junction')
  await expect(service.deleteSave({ instancePath: source, saveName: 'Foreign' })).rejects.toThrow()
  for (const destInstancePath of [[], [destination, 1], Array(1001).fill(destination)] as any[]) await expect(service.cloneSave({ srcInstancePath: source, destInstancePath, saveName: 'Alpha' })).rejects.toThrow()
  expect(await readFile(join(foreign, 'level.dat'), 'utf8')).toBe('PRIVATE')
  expect(await readdir(join(destination, 'saves'))).toEqual([])
})

it('merges partial metadata safely, supports an existing zero seed and retains an exact original backup', async () => {
  const path = await makeReactWorld(source, 'Alpha'), original = await readFile(join(path, 'level.dat'))
  await service.updateSave({ instancePath: source, saveName: 'Alpha', metadata: { seed: '42' } })
  expect(await readWorldMetadata(path)).toMatchObject({ levelName: 'Alpha', seed: '42', difficulty: 2, cheat: true })
  const backup = (await readdir(join(source, '.backups'))).find(name => name.startsWith('world-metadata-'))!
  expect(await readFile(join(source, '.backups', backup, 'Alpha/level.dat'))).toEqual(original)
  const current = await readFile(join(path, 'level.dat'))
  for (const metadata of [{ seed: 'not-a-seed' }, { difficulty: 99 }, { levelName: '' }, { command: 'untrusted' }]) await expect(service.updateSave({ instancePath: source, saveName: 'Alpha', metadata: metadata as any })).rejects.toThrow()
  expect(await readFile(join(path, 'level.dat'))).toEqual(current)
})

it('refuses to overwrite fields another writer changed while a partial metadata update was being prepared', async () => {
  const path = await makeReactWorld(source, 'Alpha'), preview = service.previewWorldFiles.bind(service)
  vi.spyOn(service, 'previewWorldFiles').mockImplementationOnce(async operation => {
    const next = await prepareWorldMetadata(path, { levelName: 'Newer title', seed: '0', difficulty: 2, cheat: true })
    await writeFile(join(path, 'level.dat'), next.bytes)
    return preview(operation)
  })
  await expect(service.updateSave({ instancePath: source, saveName: 'Alpha', metadata: { seed: '42' } })).rejects.toMatchObject({ name: 'WorldFilesChangedError' })
  expect(await readWorldMetadata(path)).toMatchObject({ levelName: 'Newer title', seed: '0' })
})

it('imports independent datapacks and backs up the installed contents and provider sidecars on removal', async () => {
  const incoming = join(root, 'Incoming'), savePath = join(source, 'saves/Alpha')
  await mkdir(incoming); await writeFile(join(incoming, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'Local pack' } }))
  const installed = await service.importDatapack({ savePath, path: incoming })
  expect(await readFile(join(installed, 'pack.mcmeta'))).toEqual(await readFile(join(incoming, 'pack.mcmeta')))
  await writeFile(join(installed, 'extra.txt'), 'installed-only')
  const sidecar = JSON.stringify({ projectId: 1, fileId: 2 })
  await writeFile(join(savePath, 'datapacks/.Incoming.curseforge'), sidecar)
  await service.deleteDatapack({ savePath, fileName: 'Incoming' })
  await expect(lstat(installed)).rejects.toHaveProperty('code', 'ENOENT')
  const backup = (await readdir(join(source, '.backups'))).find(name => name.startsWith('world-datapacks-'))!
  expect(await readFile(join(source, '.backups', backup, 'Alpha/Incoming/extra.txt'), 'utf8')).toBe('installed-only')
  expect(await readFile(join(source, '.backups', backup, 'Alpha/.Incoming.curseforge'), 'utf8')).toBe(sidecar)
  await expect(lstat(join(incoming, 'extra.txt'))).rejects.toHaveProperty('code', 'ENOENT')
  await service.deleteDatapack({ savePath, fileName: 'Incoming' })
})

it('rejects foreign datapack destinations and blocks shared-depot modifications during a game', async () => {
  const incoming = join(root, 'Incoming'), foreign = join(root, 'foreign'), shared = await world(root, 'Shared')
  await mkdir(incoming); await writeFile(join(incoming, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'Local pack' } }))
  await mkdir(foreign); await writeFile(join(foreign, 'level.dat'), 'PRIVATE')
  await expect(service.importDatapack({ savePath: foreign, path: incoming })).rejects.toThrow()
  await expect(service.deleteDatapack({ savePath: join(source, 'saves/Alpha'), fileName: '../outside' })).rejects.toThrow()
  processes = [{ options: { gameDirectory: source } }]
  await expect(service.importDatapack({ savePath: shared, path: incoming })).rejects.toMatchObject({ name: 'SharedWorldRunningError' })
  processes = []; await service.importDatapack({ savePath: shared, path: incoming })
  processes = [{ options: { gameDirectory: source } }]
  await expect(service.deleteDatapack({ savePath: shared, fileName: 'Incoming' })).rejects.toMatchObject({ name: 'SharedWorldRunningError' })
  expect(await readFile(join(shared, 'datapacks/Incoming/pack.mcmeta'))).toEqual(await readFile(join(incoming, 'pack.mcmeta')))
  expect(await readFile(join(foreign, 'level.dat'), 'utf8')).toBe('PRIVATE')
})
