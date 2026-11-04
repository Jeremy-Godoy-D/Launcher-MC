import { afterEach, beforeEach, expect, it, vi, type MockInstance } from 'vitest'
import { InstanceSchema } from '@xmcl/instance'
import { InstanceState, LockKey } from '@xmcl/runtime-api'
import { Mutex } from 'async-mutex'
import { EventEmitter } from 'node:events'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { rm as remove } from 'fs-extra'
import { dirname, join } from 'node:path'
import { FSWatcher } from 'chokidar'
import { makeReactWorld } from '../../e2e/helpers/react-world'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/infra', () => ({ ImageStorage: class {}, Tasks: class {}, kTasks: Symbol('tasks') }))
vi.mock('~/install', () => ({ VersionMetadataService: class {} }))
vi.mock('~/instance', () => ({ InstanceService: class {} }))
vi.mock('~/launch', () => ({ LaunchService: class {} }))
vi.mock('~/save', () => ({ kSaveWorker: Symbol('save') }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/market', () => ({ kMarketProvider: Symbol('market') }))
vi.mock('fs-extra', async original => { const fs = await original<any>(); return { ...fs.default, ...fs, rm: vi.fn(fs.rm) } })
const { InstanceService } = await import('./InstanceService')
const { InstanceSavesService } = await import('./InstanceSavesService')
let root: string, path: string, state: InstanceState, service: InstanceType<typeof InstanceService>, worlds: InstanceType<typeof InstanceSavesService>, app: any, processes: any[]
let add: MockInstance<FSWatcher['add']>
beforeEach(async () => {
  root = await mkdtemp(join(process.cwd(), '.instance-world-removal-')); path = join(root, 'instances/Owned'); processes = []
  await mkdir(path, { recursive: true }); await writeFile(join(path, 'instance.json'), '{}')
  state = new InstanceState(); Object.assign(state, { subscribe: vi.fn() }); state.instanceAdd({ ...InstanceSchema.parse({ name: 'Owned' }), path })
  const locks = new Map<string, Mutex>(), monitor = Object.assign(new EventEmitter(), { getGameProcesses: async () => processes, isParked: () => false, get: () => undefined, getSnapshot: async () => undefined, getMetadataByHash: async () => undefined, registerOrGet: async (_key: string, factory: any) => factory({ defineAsyncOperation: (fn: any) => fn }) })
  app = { getLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }), controller: { broadcast: vi.fn() }, registry: { get: async () => monitor, getOrCreate: async () => worlds }, mutex: { of: (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! } }, acquireWorldLock: vi.fn(async () => ({ verify: async () => {}, release: vi.fn() })) }
  service = new InstanceService(app, { registerStatic: () => state } as any, {} as any, (...parts) => join(root, ...parts), {} as any, {} as any)
  vi.spyOn(service, 'initialize').mockResolvedValue(undefined)
  worlds = new InstanceSavesService(app, service, (...parts) => join(root, ...parts), {} as any); await worlds.initialize()
  add = vi.spyOn(FSWatcher.prototype, 'add'); vi.mocked(remove).mockClear()
})
afterEach(async () => {
  for (const watcher of new Set(add.mock.results.map(value => value.value).filter(value => value instanceof FSWatcher))) await (watcher as FSWatcher).close()
  vi.restoreAllMocks(); expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.instance-world-removal-'); await rm(root, { recursive: true, force: true })
})

it('preserves independent worlds, root notes and prior backups before deletion, then clears active observers', async () => {
  const world = await makeReactWorld(path, 'Alpha'), bytes = await readFile(join(world, 'level.dat'))
  await mkdir(join(world, 'datapacks')); await writeFile(join(path, 'saves/.note'), 'KEEP NOTE')
  await mkdir(join(path, 'saves/Misc')); await writeFile(join(path, 'saves/Misc/keep'), 'NON-WORLD DATA')
  await mkdir(join(path, '.backups/previous'), { recursive: true }); await writeFile(join(path, '.backups/previous/keep'), 'PRIOR BACKUP')
  const [saves, stopSaves] = await worlds.watch(path) as any, [packs, stopPacks] = await worlds.watchSaveDatapacks(world) as any
  await app.mutex.of('resource-pack-options').waitForUnlock()
  try {
    expect(saves.saves).toHaveLength(1); await service.deleteInstance(path)
    expect(state.all[path]).toBeUndefined(); await expect(lstat(path)).rejects.toHaveProperty('code', 'ENOENT')
    const installed = join(root, 'saves/Alpha/level.dat'); expect(await readFile(installed)).toEqual(bytes)
    const [folder] = await readdir(join(root, '.backups')), previous = join(root, '.backups', folder, 'previous')
    expect(await readFile(join(previous, 'previous/keep'), 'utf8')).toBe('PRIOR BACKUP')
    const sharing = (await readdir(previous)).find(name => name.startsWith('world-sharing-'))!
    expect(await readFile(join(previous, sharing, 'saves/.note'), 'utf8')).toBe('KEEP NOTE')
    expect(await readFile(join(previous, sharing, 'saves/Misc/keep'), 'utf8')).toBe('NON-WORLD DATA')
    const original = join(previous, sharing, 'saves/Alpha/level.dat'); expect(await readFile(original)).toEqual(bytes)
    expect((await lstat(original, { bigint: true })).ino).not.toBe((await lstat(installed, { bigint: true })).ino)
    expect(saves.saves).toEqual([]); expect(packs.datapacks).toEqual([])
    for (const watcher of new Set(add.mock.results.map(value => value.value))) expect(watcher.getWatched()).toEqual({})
  } finally { stopSaves(); stopPacks() }
})
it('preserves files/state and restores observation after a filesystem removal failure', async () => {
  const world = await makeReactWorld(path, 'Alpha'), [saves, stop] = await worlds.watch(path) as any
  await app.mutex.of('resource-pack-options').waitForUnlock()
  vi.mocked(remove).mockRejectedValueOnce(Object.assign(new Error('DENIED'), { code: 'EACCES' }))
  try {
    await expect(service.deleteInstance(path)).rejects.toThrow('DENIED'); expect(state.all[path]).toBeDefined()
    expect(await readFile(join(path, 'instance.json'), 'utf8')).toBe('{}'); expect(await readFile(join(root, 'saves/Alpha/level.dat'))).toEqual(await readFile(join(world, 'level.dat')))
    await makeReactWorld(root, 'Beta'); for (const watcher of new Set(add.mock.results.map(value => value.value))) watcher.emit('all', 'change', join(root, 'saves/Beta/level.dat'))
    await vi.waitFor(() => expect(saves.saves.map((row: any) => row.name)).toEqual(['Alpha', 'Beta']))
    await service.deleteInstance(path); expect(state.all[path]).toBeUndefined()
  } finally { stop() }
})
it('refuses a busy global world lock without deadlocking a writer waiting for the instance', async () => {
  await makeReactWorld(path, 'Alpha'); const release = await app.mutex.of('resource-pack-options').acquire()
  try { await expect(service.deleteInstance(path)).rejects.toHaveProperty('name', 'WorldOperationBusyError'); expect(remove).not.toHaveBeenCalled(); expect(state.all[path]).toBeDefined() }
  finally { release() }
})
it('blocks both deletion and retirement for active processes and unavailable native world protection', async () => {
  const world = await makeReactWorld(path, 'Alpha'), bytes = await readFile(join(world, 'level.dat'))
  processes = [{ options: { gameDirectory: path } }]
  for (const flag of [true, false]) await expect(service.deleteInstance(path, flag)).rejects.toHaveProperty('name', 'InstanceRunningError')
  processes = []; app.acquireWorldLock.mockResolvedValueOnce(undefined)
  await expect(service.deleteInstance(path, false)).rejects.toHaveProperty('name', 'WorldLockUnavailableError')
  expect(remove).not.toHaveBeenCalled(); expect(state.all[path]).toBeDefined(); expect(await readFile(join(world, 'level.dat'))).toEqual(bytes)
})
it('retires an idle instance with all its files and closes the old world observer', async () => {
  await makeReactWorld(path, 'Alpha'); const [saves, stop] = await worlds.watch(path) as any
  await app.mutex.of('resource-pack-options').waitForUnlock()
  try {
    await service.deleteInstance(path, false)
    expect(state.all[path]).toBeUndefined(); expect(await readFile(join(root, 'instances/.Owned/saves/Alpha/level.dat'))).toBeDefined()
    expect(await readdir(join(root, 'saves'))).toEqual([]); expect(saves.saves).toEqual([])
  } finally { stop() }
})
it('revalidates managed roots after removal handlers and never deletes a replacement junction', async () => {
  const foreign = join(root, 'foreign'); await mkdir(foreign); await writeFile(join(foreign, 'keep'), 'PRIVATE')
  service.registerRemoveHandler(path, async () => { await rename(path, join(root, 'retained')); await symlink(foreign, path, 'junction') })
  await expect(service.deleteInstance(path)).rejects.toThrow('Unsafe'); expect(remove).not.toHaveBeenCalled(); expect(state.all[path]).toBeDefined()
  expect(await readFile(join(foreign, 'keep'), 'utf8')).toBe('PRIVATE'); expect(await readFile(join(root, 'retained/instance.json'), 'utf8')).toBe('{}')
})
it('keeps legacy non-Java directories inert and removes the old unguarded IPC method', async () => {
  state.all[path].edition = 'bedrock'; await writeFile(join(path, 'keep'), 'INERT')
  await service.deleteInstance(path)
  expect(await readFile(join(path, 'keep'), 'utf8')).toBe('INERT'); expect(remove).not.toHaveBeenCalled(); expect(state.all[path]).toBeUndefined()
  expect((service as any).moveSavesToShared).toBeUndefined(); expect((worlds as any).guardInstanceRemoval).toBeUndefined()
})
