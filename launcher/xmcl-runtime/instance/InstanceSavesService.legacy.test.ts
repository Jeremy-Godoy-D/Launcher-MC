import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { FSWatcher } from 'chokidar'
import { LockKey, MarketType } from '@xmcl/runtime-api'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { ZipFile } from 'yazl'
import { writeZipFile } from '../util/zip'
import { makeReactWorld } from '../../e2e/helpers/react-world'
import { prepareWorldMetadata, readWorldMetadata } from './utils/worldFiles'
const sharingFailure = vi.hoisted(() => ({ publish: undefined as { path: string; occupy: boolean } | undefined }))
vi.mock('node:fs/promises', async (original) => {
  const fs = await original<typeof import('node:fs/promises')>()
  return { ...fs, symlink: async (target: string, path: string, type: any) => {
    if (sharingFailure.publish?.path === path) {
      if (sharingFailure.publish.occupy) await fs.writeFile(path, 'OTHER ENTRY', { flag: 'wx' })
      throw Object.assign(new Error('fixture publication failure'), { code: 'EIO' })
    }
    return fs.symlink(target, path, type)
  } }
})
vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/instance', () => ({ InstanceService: class {} }))
vi.mock('~/launch', () => ({ LaunchService: class {} }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/market', () => ({ kMarketProvider: Symbol('market') }))
vi.mock('~/save', () => ({ kSaveWorker: Symbol('save'), readInstanceSaveMetadata: vi.fn(async (path: string, instanceName: string) => ({ path, instanceName })) }))
vi.mock('./utils/worldDatapacks', async original => {
  const actual = await original<typeof import('./utils/worldDatapacks')>()
  return { ...actual, readWorldDatapacks: vi.fn(actual.readWorldDatapacks) }
})
vi.mock('~/service', () => ({ AbstractService: class { constructor(public app: any) {} get mutex() { return this.app.mutex } }, ExposeServiceKey: () => () => {}, ServiceStateManager: class {} }))
const { InstanceSavesService } = await import('./InstanceSavesService')
const { readWorldDatapacks } = await import('./utils/worldDatapacks')
let root: string, exports: string, source: string, destination: string, third: string, service: InstanceType<typeof InstanceSavesService>
let instances: { path: string; edition: string }[], processes: any[], sessions: { verify: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }[]
let installFile: ReturnType<typeof vi.fn>
let getSnapshot: ReturnType<typeof vi.fn>, getMetadataByHash: ReturnType<typeof vi.fn>, registerOrGet: ReturnType<typeof vi.fn>
async function downloadedPack(directory: string, fileName = 'Market.zip', metadata: any = { curseforge: { projectId: 1, fileId: 2 } }) {
  const path = join(directory, fileName), zip = new ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify({ pack: { pack_format: 48, description: 'Market pack' } })), 'pack.mcmeta')
  await writeZipFile(zip, path)
  return { path, metadata, uris: [] }
}
async function world(instance: string, name = 'Alpha') {
  const path = join(instance, 'saves', name); await mkdir(path, { recursive: true }); await writeFile(join(path, 'level.dat'), 'original-world')
  return path
}
beforeEach(async () => {
  sharingFailure.publish = undefined
  root = await mkdtemp(join(process.cwd(), '.world-legacy-test-')); source = join(root, 'source'); destination = join(root, 'destination'); third = join(root, 'third')
  exports = await mkdtemp(join(process.cwd(), '.world-legacy-export-'))
  instances = [source, destination, third].map(path => ({ path, edition: 'java' })); processes = []; sessions = []
  installFile = vi.fn()
  getSnapshot = vi.fn(async () => undefined); getMetadataByHash = vi.fn(async () => undefined)
  registerOrGet = vi.fn(async (_key, factory) => factory({ defineAsyncOperation: (fn: any) => fn }))
  for (const path of [source, destination, third, root]) await mkdir(join(path, 'saves'), { recursive: true })
  await world(source)
  const locks = new Map<string, Mutex>(), of = (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! }
  const app = {
    mutex: { of }, registry: { get: async () => ({ getGameProcesses: async () => processes, get: () => undefined, installFile, getSnapshot, getMetadataByHash, registerOrGet, on: vi.fn(), off: vi.fn(), isParked: () => false }) },
    acquireWorldLock: async () => {
      const session = { verify: vi.fn(async () => { expect(of('resource-pack-options').isLocked()).toBe(true) }), release: vi.fn() }
      sessions.push(session); return session
    },
  }
  service = new InstanceSavesService(app as any, { initialize: async () => {}, state: { get instances() { return instances } } } as any, {} as any, (...parts) => join(root, ...parts), {} as any)
  ;(service as any).warn = vi.fn(); (service as any).error = vi.fn()
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const [path, prefix] of [[root, '.world-legacy-test-'], [exports, '.world-legacy-export-']]) {
    if (path) { expect(dirname(path)).toBe(process.cwd()); expect(path).toContain(prefix); await rm(path, { recursive: true, force: true }) }
  }
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

it('imports external folders independently, preserves dotted names and chooses a new name on collision', async () => {
  const incoming = join(exports, 'Incoming.world'); await mkdir(incoming); await writeFile(join(incoming, 'level.dat'), 'IMPORTED')
  const first = await service.importSave({ instancePath: destination, path: incoming })
  const second = await service.importSave({ instancePath: destination, path: incoming })
  expect(first).toBe(join(destination, 'saves/Incoming.world')); expect(second).toBe(join(destination, 'saves/Incoming.world (1)'))
  expect((await lstat(join(first, 'level.dat'), { bigint: true })).ino).not.toBe((await lstat(join(incoming, 'level.dat'), { bigint: true })).ino)
  await writeFile(join(first, 'level.dat'), 'ONLY INSTALLED')
  expect(await readFile(join(incoming, 'level.dat'), 'utf8')).toBe('IMPORTED')
})

it('imports wrapped ZIPs through the bounded importer with reviewed provider metadata', async () => {
  const zip = new ZipFile(), path = join(exports, 'World.zip')
  zip.addBuffer(Buffer.from('IMPORTED'), 'wrapped/level.dat'); zip.addBuffer(Buffer.from('SOURCE PROVIDER'), 'wrapped/.curseforge'); zip.addEmptyDirectory('wrapped/empty')
  await writeZipFile(zip, path); const bytes = await readFile(path), curseforge = { projectId: 1, fileId: 2 }
  const installed = await service.importSave({ instancePath: destination, path, curseforge })
  expect(await readFile(join(installed, 'level.dat'), 'utf8')).toBe('IMPORTED')
  expect(JSON.parse(await readFile(join(installed, '.curseforge'), 'utf8'))).toEqual(curseforge)
  expect((await lstat(join(installed, 'empty'))).isDirectory()).toBe(true)
  expect(await readFile(path)).toEqual(bytes)
  const invalid = new ZipFile(), bad = join(exports, 'Bad.zip')
  invalid.addBuffer(Buffer.from('ONE'), 'one/level.dat'); invalid.addBuffer(Buffer.from('TWO'), 'two/level.dat'); await writeZipFile(invalid, bad)
  await expect(service.importSave({ instancePath: destination, path: bad })).rejects.toMatchObject({ name: 'WorldArchiveInvalidError' })
  await expect(lstat(join(destination, 'saves/Bad'))).rejects.toHaveProperty('code', 'ENOENT')
})

it('enables only direct owned depot worlds as links while sibling-prefix folders remain independent', async () => {
  const shared = await world(root, 'Shared'), enabled = await service.importSave({ instancePath: destination, path: shared })
  expect((await lstat(enabled)).isSymbolicLink()).toBe(true); expect(await realpath(enabled)).toBe(await realpath(shared))
  const incoming = join(root, 'saves-foreign/External'); await mkdir(incoming, { recursive: true }); await writeFile(join(incoming, 'level.dat'), 'FOREIGN PREFIX')
  const copied = await service.importSave({ instancePath: third, path: incoming })
  expect((await lstat(copied)).isSymbolicLink()).toBe(false)
  expect((await lstat(join(copied, 'level.dat'), { bigint: true })).ino).not.toBe((await lstat(join(incoming, 'level.dat'), { bigint: true })).ino)
  await expect(service.importSave({ instancePath: third, path: shared, curseforge: { projectId: 1, fileId: 2 } })).rejects.toThrow()
  await rename(join(third, 'saves'), join(third, 'retained-saves')); await symlink(join(root, 'saves'), join(third, 'saves'), 'junction')
  await expect(service.importSave({ instancePath: third, path: shared })).rejects.toThrow()
  expect(await readdir(join(root, 'saves'))).toEqual(['Shared'])
})

it('does not expose shared-link publication or depot authorization through extra public arguments', async () => {
  const operation = { type: 'copy' as const, instancePath: source, saveName: 'Alpha', destinationInstancePath: destination, destinationName: 'Independent' }
  const review = await service.previewWorldFiles(operation)
  await (service.applyWorldFiles as any)(review, true, true)
  expect((await lstat(join(destination, 'saves/Independent'))).isSymbolicLink()).toBe(false)
  expect((await lstat(join(destination, 'saves/Independent/level.dat'), { bigint: true })).ino).not.toBe((await lstat(join(source, 'saves/Alpha/level.dat'), { bigint: true })).ino)
  await expect(service.importSave({ instancePath: root, path: join(source, 'saves/Alpha') })).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
})

it('rejects invalid legacy transfers before creating a world or touching an existing export', async () => {
  const incoming = join(source, 'saves/Alpha'), archive = join(exports, 'existing.zip'); await writeFile(archive, 'KEEP')
  for (const saveName of ['../Outside', 'a/b', 'NUL', '']) {
    await expect(service.importSave({ instancePath: destination, path: incoming, saveName })).rejects.toThrow()
    await expect(service.exportSave({ instancePath: source, saveName, destination: archive })).rejects.toThrow()
  }
  await expect(service.importSave({ instancePath: destination, path: incoming, curseforge: { projectId: -1, fileId: 2 } })).rejects.toThrow()
  await expect(service.exportSave({ instancePath: source, saveName: 'Alpha', destination: archive })).rejects.toMatchObject({ name: 'WorldDestinationExistsError' })
  await expect(service.exportSave({ instancePath: source, saveName: 'Alpha', destination: join(destination, 'inside.zip') })).rejects.toThrow()
  expect(await readFile(archive, 'utf8')).toBe('KEEP'); expect(await readdir(join(destination, 'saves'))).toEqual([])
  processes = [{ options: { gameDirectory: source } }]
  await expect(service.importSave({ instancePath: destination, path: incoming })).rejects.toMatchObject({ name: 'InstanceRunningError' })
  await expect(service.exportSave({ instancePath: source, saveName: 'Alpha', destination: join(exports, 'busy'), zip: false })).rejects.toMatchObject({ name: 'InstanceRunningError' })
})

it('exports the actual saves directory as ZIP or independent folder and never merges into an existing folder', async () => {
  const save = join(source, 'saves/Alpha'); await writeFile(join(save, '.keep'), 'HIDDEN'); await mkdir(join(save, 'empty'))
  const path = join(exports, 'Alpha.zip'); await service.exportSave({ instancePath: source, saveName: 'Alpha', destination: path })
  const zip = await open(path)
  try {
    const entries = await readAllEntries(zip); expect(entries.map(entry => entry.fileName)).toEqual(expect.arrayContaining(['level.dat', '.keep', 'empty/']))
    expect((await readEntry(zip, entries.find(entry => entry.fileName === 'level.dat')!)).toString()).toBe('original-world')
  } finally { zip.close() }
  const folder = join(exports, 'Alpha.folder'); await service.exportSave({ instancePath: source, saveName: 'Alpha', destination: folder, zip: false })
  expect(await readFile(join(folder, '.keep'), 'utf8')).toBe('HIDDEN'); expect((await lstat(join(folder, 'empty'))).isDirectory()).toBe(true)
  expect((await lstat(join(folder, 'level.dat'), { bigint: true })).ino).not.toBe((await lstat(join(save, 'level.dat'), { bigint: true })).ino)
  await expect(service.exportSave({ instancePath: source, saveName: 'Alpha', destination: folder, zip: false })).rejects.toMatchObject({ name: 'WorldDestinationExistsError' })
  expect(await readFile(join(folder, 'level.dat'), 'utf8')).toBe('original-world')
})

it('shares an independent world without replacing a depot collision and retains its exact original in a backup', async () => {
  const existing = await world(root, 'Alpha'); await writeFile(join(existing, 'level.dat'), 'EXISTING DEPOT')
  const original = join(source, 'saves/Alpha/level.dat'), info = await lstat(original, { bigint: true })
  await service.shareSave({ instancePath: source, saveName: 'Alpha' })
  expect(await readFile(join(existing, 'level.dat'), 'utf8')).toBe('EXISTING DEPOT')
  const shared = join(root, 'saves/Alpha (1)/level.dat')
  expect(await readFile(shared, 'utf8')).toBe('original-world'); expect((await lstat(shared, { bigint: true })).ino).not.toBe(info.ino)
  await expect(lstat(original)).rejects.toHaveProperty('code', 'ENOENT')
  const backup = (await readdir(join(source, '.backups')))[0]
  expect((await lstat(join(source, '.backups', backup, 'Alpha/level.dat'), { bigint: true })).ino).toBe(info.ino)
})

it('sharing an owned per-world link detaches only the link and never copies or moves its depot target', async () => {
  const shared = await world(root, 'Shared'); await symlink(shared, join(source, 'saves/Alias'), 'junction')
  await service.shareSave({ instancePath: source, saveName: 'Alias' })
  expect(await readdir(join(root, 'saves'))).toEqual(['Shared'])
  expect(await readFile(join(shared, 'level.dat'), 'utf8')).toBe('original-world')
  await expect(lstat(join(source, 'saves/Alias'))).rejects.toHaveProperty('code', 'ENOENT')
})

it('merges worlds with reserved collision names and backs up all original entries before linking; disconnect leaves an empty local folder', async () => {
  const existing = await world(root, 'Alpha'), shared = await world(root, 'Shared')
  await writeFile(join(existing, 'level.dat'), 'DEPOT'); await writeFile(join(source, 'saves/Alpha/level.dat'), 'FIRST')
  const second = await world(source, 'Alpha (1)'); await writeFile(join(second, 'level.dat'), 'SECOND')
  await writeFile(join(source, 'saves/.note'), 'LOCAL NOTE'); await symlink(shared, join(source, 'saves/Alias'), 'junction')
  const original = await lstat(join(source, 'saves'), { bigint: true })
  await service.linkSharedSave(source)
  expect(await service.isSaveLinked(source)).toBe(true); expect((await lstat(join(source, 'saves'))).isSymbolicLink()).toBe(true)
  expect(await readFile(join(root, 'saves/Alpha/level.dat'), 'utf8')).toBe('DEPOT')
  expect(await readFile(join(root, 'saves/Alpha (1)/level.dat'), 'utf8')).toBe('FIRST')
  expect(await readFile(join(root, 'saves/Alpha (1) (1)/level.dat'), 'utf8')).toBe('SECOND')
  const [name] = await readdir(join(source, '.backups')), backup = join(source, '.backups', name, 'saves')
  expect((await lstat(backup, { bigint: true })).ino).toBe(original.ino)
  expect(await readFile(join(backup, '.note'), 'utf8')).toBe('LOCAL NOTE'); expect((await lstat(join(backup, 'Alias'))).isSymbolicLink()).toBe(true)
  await service.linkSharedSave(source); expect(await readdir(join(source, '.backups'))).toEqual([name])
  await service.unlinkSharedSave(source)
  expect(await service.isSaveLinked(source)).toBe(false); expect(await readdir(join(source, 'saves'))).toEqual([])
  expect(await readdir(join(source, '.backups'))).toHaveLength(2)
  expect(await readFile(join(root, 'saves/Alpha/level.dat'), 'utf8')).toBe('DEPOT')
  expect(await readFile(join(shared, 'level.dat'), 'utf8')).toBe('original-world')
  await service.unlinkSharedSave(source)
})

it('links missing or empty saves for creation and refuses an unknown instance, Bedrock, traversal and a running game', async () => {
  await rename(join(destination, 'saves'), join(destination, 'unused-empty-saves'))
  await service.linkSharedSave(destination); expect(await service.isSaveLinked(destination)).toBe(true)
  await service.linkSharedSave(third); expect(await service.isSaveLinked(third)).toBe(true)
  for (const path of [join(root, 'unknown'), root]) {
    await expect(service.linkSharedSave(path)).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
    await expect(service.unlinkSharedSave(path)).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
    await expect(service.isSaveLinked(path)).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
  }
  await expect(service.shareSave({ instancePath: source, saveName: '../Outside' })).rejects.toThrow()
  instances = instances.map(instance => instance.path === source ? { ...instance, edition: 'bedrock' } : instance)
  await expect(service.linkSharedSave(source)).rejects.toMatchObject({ name: 'InstanceNotFoundError' })
  instances = instances.map(instance => ({ ...instance, edition: 'java' })); processes = [{ options: { gameDirectory: third } }]
  await expect(service.linkSharedSave(source)).rejects.toMatchObject({ name: 'SharedWorldRunningError' })
  await expect(service.unlinkSharedSave(destination)).rejects.toMatchObject({ name: 'SharedWorldRunningError' })
  await expect(service.shareSave({ instancePath: source, saveName: 'Alpha' })).rejects.toMatchObject({ name: 'SharedWorldRunningError' })
  expect(await readFile(join(source, 'saves/Alpha/level.dat'), 'utf8')).toBe('original-world')
})

it('rejects foreign world links and unsafe backup roots before replacing the original folder', async () => {
  const foreign = await world(exports, 'Foreign'); await symlink(foreign, join(source, 'saves/Foreign'), 'junction')
  await expect(service.linkSharedSave(source)).rejects.toThrow()
  expect(await readdir(join(root, 'saves'))).toEqual([])
  expect(await readFile(join(foreign, 'level.dat'), 'utf8')).toBe('original-world')
  const other = await world(destination, 'Beta')
  await symlink(exports, join(destination, '.backups'), 'junction')
  await expect(service.linkSharedSave(destination)).rejects.toThrow()
  expect((await lstat(join(destination, 'saves'))).isDirectory()).toBe(true)
  expect(await readFile(join(other, 'level.dat'), 'utf8')).toBe('original-world')
  expect(await readdir(exports)).toEqual(['saves'])
  expect(await readdir(join(root, 'saves'))).toEqual([])
})

it('releases earlier session handles on a preflight failure without publishing a copied world', async () => {
  await world(source, 'Beta')
  const acquire = (service as any).app.acquireWorldLock
  vi.spyOn((service as any).app, 'acquireWorldLock').mockImplementationOnce(acquire).mockRejectedValueOnce(new Error('BUSY SESSION'))
  await expect(service.linkSharedSave(source)).rejects.toThrow('BUSY SESSION')
  expect(sessions).toHaveLength(1); expect(sessions[0].release).toHaveBeenCalledTimes(1)
  expect(await readdir(join(root, 'saves'))).toEqual([])
  expect(await readFile(join(source, 'saves/Alpha/level.dat'), 'utf8')).toBe('original-world')
})

it('rechecks copied worlds after acquiring the final folder guards and preserves a newer uncooperative write', async () => {
  const app = (service as any).app, acquire = app.acquireWorldLock, path = join(source, 'saves/Alpha'); let writes = 0
  vi.spyOn(app, 'acquireWorldLock').mockImplementation(async (root: any, create: any) => {
    const lock = await acquire(root, create)
    if (root === path && create && ++writes === 2) await writeFile(join(path, 'level.dat'), 'NEWER WORLD')
    return lock
  })
  await expect(service.linkSharedSave(source)).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  expect(await readFile(join(path, 'level.dat'), 'utf8')).toBe('NEWER WORLD')
  expect((await lstat(join(source, 'saves'))).isSymbolicLink()).toBe(false)
  expect(await readFile(join(root, 'saves/Alpha/level.dat'), 'utf8')).toBe('original-world')
  await expect(lstat(join(source, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
})

it.each([false, true])('retains original bytes after link publication fails, preserving a competing entry=%s', async (occupy) => {
  const original = await lstat(join(source, 'saves'), { bigint: true })
  sharingFailure.publish = { path: join(source, 'saves'), occupy }
  await expect(service.linkSharedSave(source)).rejects.toMatchObject({ name: 'WorldSharingIncompleteError' })
  if (occupy) {
    expect(await readFile(join(source, 'saves'), 'utf8')).toBe('OTHER ENTRY')
    const [backup] = await readdir(join(source, '.backups'))
    expect((await lstat(join(source, '.backups', backup, 'saves'), { bigint: true })).ino).toBe(original.ino)
    expect(await readFile(join(source, '.backups', backup, 'saves/Alpha/level.dat'), 'utf8')).toBe('original-world')
  } else {
    expect((await lstat(join(source, 'saves'), { bigint: true })).ino).toBe(original.ino)
    expect(await readFile(join(source, 'saves/Alpha/level.dat'), 'utf8')).toBe('original-world')
  }
  expect(await readFile(join(root, 'saves/Alpha/level.dat'), 'utf8')).toBe('original-world')
})

it('waits for the instance mutation before starting a new watcher and disposes the observer', async () => {
  await makeReactWorld(source, 'Alpha')
  const app = (service as any).app
  const register = vi.fn(async (_key, factory) => factory({ defineAsyncOperation: (fn: any) => fn }))
  app.registry.get = async () => ({ registerOrGet: register, on: vi.fn(), off: vi.fn(), isParked: () => false })
  ;(service as any).warn = vi.fn()
  const add = vi.spyOn(FSWatcher.prototype, 'add'), unlock = await app.mutex.of(LockKey.instance(source)).acquire()
  const pending = service.watch(source)
  await vi.waitFor(() => expect(register).toHaveBeenCalled())
  expect(add).not.toHaveBeenCalled()
  unlock()
  const [, dispose] = await pending as any
  expect(add).toHaveBeenCalledWith(join(source, 'saves'))
  const watcher = add.mock.results[0].value as FSWatcher
  dispose(); await watcher.close()
})

it('removes the launch listener if a queued watcher can no longer initialize', async () => {
  const app = (service as any).app, off = vi.fn()
  const register = vi.fn(async (_key, factory) => factory({ defineAsyncOperation: (fn: any) => fn }))
  app.registry.get = async () => ({ registerOrGet: register, on: vi.fn(), off, isParked: () => false })
  const unlock = await app.mutex.of(LockKey.instance(source)).acquire(), pending = service.watch(source)
  await vi.waitFor(() => expect(register).toHaveBeenCalled())
  instances = []; unlock()
  await expect(pending).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  expect(off).toHaveBeenCalledWith('minecraft-exit', expect.any(Function))
})

it.each([MarketType.CurseForge, MarketType.Modrinth])('installs a reviewed market batch into a new datapacks directory with provider sidecars: %s', async (market) => {
  const savePath = join(source, 'saves/Alpha'), metadata = market === MarketType.CurseForge ? { curseforge: { projectId: 1, fileId: 2 } } : { modrinth: { projectId: 'project1', versionId: 'version2' } }
  let staging = ''; const inodes: bigint[] = []
  installFile.mockImplementation(async (options) => {
    staging = options.directory
    expect(options).not.toHaveProperty('domain'); expect(options).not.toHaveProperty('savePath')
    expect(dirname(staging)).toBe(root); expect(staging).not.toBe(join(savePath, 'datapacks'))
    await expect(lstat(join(savePath, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
    const files = [await downloadedPack(staging, 'First.zip', metadata), await downloadedPack(staging, 'Second.zip', metadata)]
    for (const file of files) inodes.push((await lstat(file.path, { bigint: true })).ino)
    return files
  })
  const paths = await service.installDatapackFromMarket({ market, savePath, ...(market === MarketType.CurseForge ? { file: { fileId: 1 } } : { version: { versionId: 'version2' } }), domain: '../forbidden' } as any)
  expect(paths).toEqual(['First.zip', 'Second.zip'].map(name => join(savePath, 'datapacks', name)))
  for (const [index, path] of paths.entries()) {
    expect((await lstat(path, { bigint: true })).ino).not.toBe(inodes[index])
    const provider = market === MarketType.CurseForge ? 'curseforge' : 'modrinth'
    expect(JSON.parse(await readFile(join(savePath, 'datapacks', `.${index ? 'Second' : 'First'}.zip.${provider}`), 'utf8'))).toEqual((metadata as any)[provider])
  }
  await expect(lstat(staging)).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(savePath, 'level.dat'), 'utf8')).toBe('original-world')
})

it('validates market destinations and managed processes before any download and rechecks after downloading', async () => {
  const savePath = join(source, 'saves/Alpha'), foreign = await world(exports, 'Foreign')
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath: foreign } as any)).rejects.toThrow()
  processes = [{ options: { gameDirectory: source } }]
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath } as any)).rejects.toHaveProperty('name', 'InstanceRunningError')
  expect(installFile).not.toHaveBeenCalled(); processes = []
  let staging = ''
  installFile.mockImplementation(async ({ directory }) => { staging = directory; const file = await downloadedPack(directory); processes = [{ options: { gameDirectory: source } }]; return [file] })
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath } as any)).rejects.toHaveProperty('name', 'InstanceRunningError')
  await expect(lstat(join(savePath, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
  await expect(lstat(staging)).rejects.toHaveProperty('code', 'ENOENT')
})

it.each(['invalid archive', 'invalid IDs', 'duplicate name'])('preflights the complete market batch and keeps the world untouched for %s', async (failure) => {
  const savePath = join(source, 'saves/Alpha')
  installFile.mockImplementation(async ({ directory }) => {
    const first = await downloadedPack(directory, 'First.zip'), second = await downloadedPack(directory, 'Second.zip')
    if (failure === 'invalid archive') await writeFile(second.path, 'INVALID ZIP')
    if (failure === 'invalid IDs') second.metadata = { curseforge: { projectId: -1, fileId: 2 } }
    return [first, failure === 'duplicate name' ? first : second]
  })
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath } as any)).rejects.toThrow()
  await expect(lstat(join(savePath, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
  expect((await readdir(root)).some(name => name.startsWith('.datapack-download-'))).toBe(false)
})

it('refuses orphan provider metadata instead of adopting or replacing it during market installation', async () => {
  const savePath = join(source, 'saves/Alpha'), sidecar = join(savePath, 'datapacks/.Market.zip.modrinth')
  await mkdir(dirname(sidecar)); await writeFile(sidecar, 'ORPHAN DATA')
  installFile.mockImplementation(async ({ directory }) => [await downloadedPack(directory)])
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath } as any)).rejects.toHaveProperty('name', 'WorldDestinationExistsError')
  expect(await readFile(sidecar, 'utf8')).toBe('ORPHAN DATA')
  await expect(lstat(join(savePath, 'datapacks/Market.zip'))).rejects.toHaveProperty('code', 'ENOENT')
})

it('binds market installation to the reviewed world rather than a replacement at the same path', async () => {
  const savePath = join(source, 'saves/Alpha')
  installFile.mockImplementation(async ({ directory }) => {
    await rename(savePath, join(source, 'retained-world')); await world(source)
    return [await downloadedPack(directory)]
  })
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath } as any)).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  expect(await readFile(join(source, 'retained-world/level.dat'), 'utf8')).toBe('original-world')
  await expect(lstat(join(savePath, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
})

it('rejects provider paths outside the staging workspace and never removes external data', async () => {
  const file = await downloadedPack(exports), bytes = await readFile(file.path), savePath = join(source, 'saves/Alpha')
  installFile.mockResolvedValue([file])
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath } as any)).rejects.toThrow('Invalid staged market file')
  expect(await readFile(file.path)).toEqual(bytes)
  await expect(lstat(join(savePath, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
})

it('does not clean a rebound download workspace or publish into the world', async () => {
  const file = await downloadedPack(exports), bytes = await readFile(file.path), savePath = join(source, 'saves/Alpha')
  installFile.mockImplementation(async ({ directory }) => { await rename(directory, directory + '-retained'); await symlink(exports, directory, 'junction'); return [file] })
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath } as any)).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  expect(await readFile(file.path)).toEqual(bytes)
  await expect(lstat(join(savePath, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
})


it('rejects invalid market references and unsafe datapack folders before contacting a provider', async () => {
  const savePath = join(source, 'saves/Alpha')
  for (const input of [
    { market: MarketType.CurseForge, file: { fileId: 0 } },
    { market: MarketType.CurseForge, file: [] },
    { market: MarketType.CurseForge, file: Array.from({ length: 1001 }, () => ({ fileId: 1 })) },
    { market: MarketType.Modrinth, version: { versionId: '../escape' } },
    { market: MarketType.Modrinth, version: { versionId: 'v1' } },
    { market: MarketType.Modrinth, version: [] },
    { market: MarketType.Modrinth, version: { versionId: 'version2', filename: '../escape.zip' } },
    { market: MarketType.CurseForge, file: { fileId: 1, icon: 'bad\nicon' } },
  ]) await expect(service.installDatapackFromMarket({ ...input, savePath } as any)).rejects.toThrow()
  await symlink(exports, join(savePath, 'datapacks'), 'junction')
  await expect(service.installDatapackFromMarket({ market: MarketType.CurseForge, file: { fileId: 1 }, savePath })).rejects.toThrow()
  expect(installFile).not.toHaveBeenCalled(); expect(await readdir(exports)).toEqual([])
})

it.each([MarketType.CurseForge, MarketType.Modrinth])('rejects a missing provider result without reporting installation success: %s', async market => {
  const savePath = join(source, 'saves/Alpha')
  installFile.mockResolvedValue([])
  await expect(service.installDatapackFromMarket({ market, savePath, ...(market === MarketType.CurseForge ? { file: { fileId: 1 } } : { version: { versionId: 'version2' } }) } as any)).rejects.toThrow('Invalid datapack download batch')
  await expect(lstat(join(savePath, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
  expect((await readdir(root)).filter(name => name.startsWith('.datapack-download-'))).toEqual([])
})


it('uses the same owned staging for a CurseForge world and preserves occupied user archives', async () => {
  const occupied = join(root, 'saves/World.zip'); await writeFile(occupied, 'USER ARCHIVE')
  installFile.mockImplementation(async ({ directory, ...request }) => {
    expect(request).not.toHaveProperty('domain'); expect(request).not.toHaveProperty('instancePath')
    const zip = new ZipFile(), path = join(directory, 'World.zip'); zip.addBuffer(Buffer.from('IMPORTED WORLD'), 'level.dat'); await writeZipFile(zip, path)
    return [{ path, metadata: { curseforge: { projectId: 1, fileId: 2 } }, uris: [] }]
  })
  const path = await service.installFromMarket({ market: MarketType.CurseForge, file: { fileId: 2 }, instancePath: destination, domain: '../outside' } as any)
  expect(path).toBe(join(destination, 'saves/World')); expect(await readFile(join(path, 'level.dat'), 'utf8')).toBe('IMPORTED WORLD')
  expect(await readFile(occupied, 'utf8')).toBe('USER ARCHIVE')
  expect((await readdir(root)).some(name => name.startsWith('.datapack-download-'))).toBe(false)
})

it('validates a world market destination before downloading', async () => {
  await expect(service.installFromMarket({ market: MarketType.CurseForge, file: { fileId: 2 }, instancePath: exports })).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  expect(installFile).not.toHaveBeenCalled()
})


it('rejects foreign datapack watches and unregistered/non-Java aggregate reads without creating directories', async () => {
  const foreign = await world(exports, 'Foreign')
  for (const savePath of [foreign, exports, 'relative/world']) await expect(service.watchSaveDatapacks(savePath)).rejects.toThrow()
  for (const path of [exports, root]) await expect(service.getInstanceSaveDatapacks(path)).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  instances = instances.map(row => ({ ...row, edition: 'bedrock' }))
  await expect(service.getInstanceSaveDatapacks(source)).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  expect(registerOrGet).not.toHaveBeenCalled()
  await expect(lstat(join(foreign, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
  expect((service as any).readDatapack).toBeUndefined()
})

it('preserves logical paths and valid sidecar/cache provenance across bounded aggregate datapack reads', async () => {
  const savePath = await makeReactWorld(source, 'Alpha'), second = await makeReactWorld(source, 'Beta')
  const worldBytes = await readFile(join(savePath, 'level.dat'))
  await mkdir(join(savePath, 'datapacks')); await mkdir(join(second, 'datapacks'))
  await downloadedPack(join(savePath, 'datapacks'), 'Sidecar.zip')
  await writeFile(join(savePath, 'datapacks/.Sidecar.zip.curseforge'), JSON.stringify({ projectId: 1, fileId: 2, ignored: 'OTHER' }))
  await downloadedPack(join(second, 'datapacks'), 'Cached.zip')
  getSnapshot.mockResolvedValue({ sha1: 'a'.repeat(40) }); getMetadataByHash.mockResolvedValue({ modrinth: { projectId: 'project1', versionId: 'version1', ignored: 'OTHER' } })
  const result = await service.getInstanceSaveDatapacks(source)
  expect(result).toHaveLength(2)
  expect(result[0]).toMatchObject({ savePath, path: join(savePath, 'datapacks/Sidecar.zip'), curseforge: { projectId: 1, fileId: 2 } })
  expect(result[1]).toMatchObject({ savePath: second, path: join(second, 'datapacks/Cached.zip'), modrinth: { projectId: 'project1', versionId: 'version1' } })
  expect(result[0].curseforge).not.toHaveProperty('ignored'); expect(result[1].modrinth).not.toHaveProperty('ignored')
  expect(getSnapshot).toHaveBeenCalledExactlyOnceWith(join(second, 'datapacks/Cached.zip'))
  expect(await readFile(join(savePath, 'level.dat'))).toEqual(worldBytes)
})

it('observes a missing datapacks directory without creating it, ignores event-supplied paths and stops after disposal', async () => {
  const savePath = join(source, 'saves/Alpha'), add = vi.spyOn(FSWatcher.prototype, 'add')
  const [state, dispose, refresh] = await service.watchSaveDatapacks(savePath) as any
  const watcher = add.mock.results[0].value as FSWatcher
  try {
    expect(state.datapacks).toEqual([])
    await expect(lstat(join(savePath, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
    await mkdir(join(savePath, 'datapacks')); await downloadedPack(join(savePath, 'datapacks'))
    watcher.emit('all', 'add', join(exports, 'Foreign.zip'))
    await vi.waitFor(() => expect(state.datapacks).toHaveLength(1))
    expect(state.datapacks[0].path).toBe(join(savePath, 'datapacks/Market.zip'))
    dispose(); await watcher.close(); await rm(join(savePath, 'datapacks/Market.zip'))
    await refresh(); expect(state.datapacks).toHaveLength(1)
    expect(await readdir(exports)).toEqual([])
  } finally { dispose(); await watcher.close() }
})

it('clears a datapack watch after its authority is removed and rejects a foreign datapack junction', async () => {
  const savePath = join(source, 'saves/Alpha'); await mkdir(join(savePath, 'datapacks')); await downloadedPack(join(savePath, 'datapacks'))
  const add = vi.spyOn(FSWatcher.prototype, 'add'), [state, dispose, refresh] = await service.watchSaveDatapacks(savePath) as any
  const watcher = add.mock.results[0].value as FSWatcher
  try {
    expect(state.datapacks).toHaveLength(1)
    // Windows holds the watched directory open; release it before simulating an external replacement.
    await watcher.close()
    await rename(join(savePath, 'datapacks'), join(savePath, 'retained')); await symlink(exports, join(savePath, 'datapacks'), 'junction')
    await expect(refresh()).rejects.toThrow(); expect(state.datapacks).toEqual([])
    expect(await readdir(exports)).toEqual([])
    await rm(join(savePath, 'datapacks')); await rename(join(savePath, 'retained'), join(savePath, 'datapacks'))
    instances = []; await expect(refresh()).rejects.toThrow(); expect(state.datapacks).toEqual([])
  } finally { dispose(); await watcher.close() }
})

it('bounds the combined datapack result before returning an oversized list', async () => {
  await makeReactWorld(source, 'Alpha')
  vi.mocked(readWorldDatapacks).mockResolvedValueOnce(Array.from({ length: 10001 }, (_, i) => ({ path: '', savePath: '', fileName: `Pack${i}.zip`, name: 'Fixture', description: '', icon: '', mtime: 0, packFormat: 48 })))
  await expect(service.getInstanceSaveDatapacks(source)).rejects.toThrow('Too many instance datapacks')
})


it('pauses both world and datapack observers while replacing saves and clears a disconnected datapack state', async () => {
  const savePath = await makeReactWorld(source, 'Alpha'); await mkdir(join(savePath, 'datapacks')); await downloadedPack(join(savePath, 'datapacks'))
  const add = vi.spyOn(FSWatcher.prototype, 'add')
  const [, stopWorlds] = await service.watch(source) as any
  const [state, stopDatapacks] = await service.watchSaveDatapacks(savePath) as any
  const first = add.mock.results.map(call => call.value as FSWatcher)
  try {
    expect(first).toHaveLength(2)
    await service.linkSharedSave(source)
    for (const watcher of first) expect(watcher.getWatched()).toEqual({})
    expect(add.mock.results.length).toBeGreaterThanOrEqual(4)
    await vi.waitFor(() => expect(state.datapacks).toHaveLength(1))
    expect(state.datapacks[0].path).toBe(join(savePath, 'datapacks/Market.zip'))
    await service.unlinkSharedSave(source)
    expect(state.datapacks).toEqual([])
    expect(await readFile(join(root, 'saves/Alpha/datapacks/Market.zip'))).toBeDefined()
  } finally {
    stopDatapacks(); stopWorlds()
    for (const call of add.mock.results) if (call.value instanceof FSWatcher) await call.value.close()
  }
})

it('restores earlier observers when closing another observer fails before a folder mutation', async () => {
  const savePath = await makeReactWorld(source, 'Alpha'), add = vi.spyOn(FSWatcher.prototype, 'add')
  const original = await lstat(join(source, 'saves'), { bigint: true }), bytes = await readFile(join(savePath, 'level.dat'))
  const [, stopWorlds] = await service.watch(source) as any
  const [, stopDatapacks] = await service.watchSaveDatapacks(savePath) as any
  const second = add.mock.results[1].value as FSWatcher, close = vi.spyOn(second, 'close').mockRejectedValueOnce(new Error('Fixture close failure'))
  try {
    await expect(service.linkSharedSave(source)).rejects.toThrow('Fixture close failure')
    expect(new Set(add.mock.results.map(call => call.value)).size).toBe(3)
    expect(close).toHaveBeenCalledOnce()
    expect((await lstat(join(source, 'saves'), { bigint: true })).ino).toBe(original.ino)
    expect(await readFile(join(savePath, 'level.dat'))).toEqual(bytes)
    expect(await readFile(join(root, 'saves/Alpha/level.dat'))).toEqual(bytes)
    expect((await lstat(join(root, 'saves/Alpha/level.dat'), { bigint: true })).ino).not.toBe((await lstat(join(savePath, 'level.dat'), { bigint: true })).ino)
  } finally {
    stopDatapacks(); stopWorlds()
    for (const call of add.mock.results) if (call.value instanceof FSWatcher) await call.value.close()
  }
})


it('pauses a datapack observer before backing up its world and clears the detached state', async () => {
  const savePath = await makeReactWorld(source, 'Alpha'), bytes = await readFile(join(savePath, 'level.dat'))
  await mkdir(join(savePath, 'datapacks')); await downloadedPack(join(savePath, 'datapacks'))
  const add = vi.spyOn(FSWatcher.prototype, 'add'), [state, dispose] = await service.watchSaveDatapacks(savePath) as any
  const watcher = add.mock.results[0].value as FSWatcher, close = vi.spyOn(watcher, 'close')
  try {
    await service.deleteSave({ instancePath: source, saveName: 'Alpha' })
    expect(close).toHaveBeenCalled(); expect(state.datapacks).toEqual([])
    await expect(lstat(savePath)).rejects.toHaveProperty('code', 'ENOENT')
    const [backup] = await readdir(join(source, '.backups'))
    expect(await readFile(join(source, '.backups', backup, 'Alpha/level.dat'))).toEqual(bytes)
  } finally { dispose(); await watcher.close() }
})
