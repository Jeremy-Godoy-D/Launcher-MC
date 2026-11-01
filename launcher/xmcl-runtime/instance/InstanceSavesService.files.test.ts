import { beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { LockKey } from '@xmcl/runtime-api'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/instance', () => ({ InstanceService: class {} }))
vi.mock('~/launch', () => ({ LaunchService: class {} }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/market', () => ({ kMarketProvider: Symbol('market') }))
vi.mock('~/save', () => ({ kSaveWorker: Symbol('save') }))
vi.mock('~/service', () => ({ AbstractService: class { constructor(public app: any) {} get mutex() { return this.app.mutex } }, ExposeServiceKey: () => () => {}, ServiceStateManager: class {} }))
vi.mock('./utils/worldOperations', () => ({ previewWorldFiles: vi.fn(), applyWorldFiles: vi.fn() }))
vi.mock('./utils/worldFiles', async original => ({ ...await original<typeof import('./utils/worldFiles')>(), worldLocation: async (path: string, name: string) => ({ root: join(path, 'saves', name) }) }))
const { InstanceSavesService } = await import('./InstanceSavesService')
const { previewWorldFiles, applyWorldFiles } = await import('./utils/worldOperations')
let service: InstanceType<typeof InstanceSavesService>, instances: any[], processes: any[], lock: Mutex, of: ReturnType<typeof vi.fn<(key: string) => Mutex>>
const operation = { type: 'copy', instancePath: 'source', saveName: 'Alpha', destinationInstancePath: 'destination', destinationName: 'Beta' } as const
let review: any
let session: { verify: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }, acquireSession: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks(); instances = ['source', 'destination'].map(path => ({ path, edition: 'java' })); processes = []; lock = new Mutex(); const global = new Mutex()
  of = vi.fn(key => key === 'resource-pack-options' ? global : lock)
  review = { operation, snapshot: 'a'.repeat(64), shared: false, linkOnly: false }
  vi.mocked(previewWorldFiles).mockImplementation(async () => review)
  vi.mocked(applyWorldFiles).mockImplementation(async (value, root, verify) => { await verify!(review); return { path: 'created' } })
  // Distinct instance locks avoid manufacturing a self-deadlock in a two-instance operation.
  const others = new Map<string, Mutex>()
  const mutexOf = vi.fn(key => { of(key); if (key === 'resource-pack-options') return global; if (key === LockKey.instance('source')) return lock; if (!others.has(key)) others.set(key, new Mutex()); return others.get(key)! })
  session = { verify: vi.fn(async () => {}), release: vi.fn() }; acquireSession = vi.fn(async () => session)
  const app = { acquireWorldLock: acquireSession, mutex: { of: mutexOf }, registry: { get: async () => ({ getGameProcesses: async () => processes }) } }
  service = new InstanceSavesService(app as any, { initialize: async () => {}, state: { get instances() { return instances } } } as any, {} as any, () => 'root', {} as any)
})
it('requires both source and destination to be registered Java instances before filesystem review', async () => {
  for (const path of ['source', 'destination']) for (const edition of ['missing', 'bedrock']) {
    instances = ['source', 'destination'].flatMap(value => value === path && edition === 'missing' ? [] : [{ path: value, edition: value === path ? edition : 'java' }])
    await expect(service.previewWorldFiles(operation)).rejects.toHaveProperty('name', 'InstanceNotFoundError'); await expect(service.applyWorldFiles(review)).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  }
  expect(previewWorldFiles).not.toHaveBeenCalled(); expect(applyWorldFiles).not.toHaveBeenCalled()
})
it('rechecks registration after waiting on a lock', async () => {
  const release = await lock.acquire(), pending = service.previewWorldFiles(operation), failure = expect(pending).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  await vi.waitFor(() => expect(of).toHaveBeenCalledWith(LockKey.instance('source'))); instances = []; release(); await failure; expect(previewWorldFiles).not.toHaveBeenCalled()
})
it('blocks source and destination games and blocks other games only for shared file operations', async () => {
  for (const path of ['source', 'destination']) {
    processes = [{ options: { gameDirectory: path } }]; await expect(service.applyWorldFiles(review)).rejects.toHaveProperty('name', 'InstanceRunningError')
  }
  processes = [{ options: { gameDirectory: 'other' } }]; await expect(service.applyWorldFiles(review)).resolves.toEqual({ path: 'created' })
  review.shared = true; await expect(service.applyWorldFiles(review)).rejects.toHaveProperty('name', 'SharedWorldRunningError')
  review.linkOnly = true; await expect(service.applyWorldFiles(review)).resolves.toEqual({ path: 'created' })
})
it('requires only the registered Java destination when importing an external source and blocks its game', async () => {
  const root = await mkdtemp(join(process.cwd(), '.world-import-idle-')), source = join(root, 'World.zip')
  await writeFile(source, '')
  try {
  instances = [{ path: 'destination', edition: 'java' }]
  review.operation = { type: 'import', instancePath: 'destination', saveName: 'Imported', sourcePath: source }
  await expect(service.previewWorldFiles(review.operation)).resolves.toBe(review)
  processes = [{ options: { gameDirectory: 'destination' } }]; await expect(service.applyWorldFiles(review)).rejects.toHaveProperty('name', 'InstanceRunningError')
  instances = []; await expect(service.applyWorldFiles(review)).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  } finally { expect(dirname(root)).toBe(process.cwd()); expect(root.startsWith(join(process.cwd(), '.world-import-idle-'))).toBe(true); await rm(root, { recursive: true, force: true }) }
})
it('blocks world file operations when the running game uses an alias for the same instance', async () => {
  const root = await mkdtemp(join(process.cwd(), '.world-idle-test-')), source = join(root, 'source'), destination = join(root, 'destination'), alias = join(root, 'alias')
  try {
    await mkdir(source); await mkdir(destination); await symlink(source, alias, 'junction')
    instances = [source, destination].map(path => ({ path, edition: 'java' })); processes = [{ options: { gameDirectory: alias } }]
    review.operation = { type: 'copy', instancePath: source, destinationInstancePath: destination, saveName: 'Alpha', destinationName: 'Beta' }
    await expect(service.applyWorldFiles(review)).rejects.toHaveProperty('name', 'InstanceRunningError')
  } finally { expect(dirname(root)).toBe(process.cwd()); expect(root.startsWith(join(process.cwd(), '.world-idle-test-'))).toBe(true); await rm(root, { recursive: true, force: true }) }
})
it('requires a registered Java instance and idle world locks for metadata edits', async () => {
  instances = [{ path: 'source', edition: 'java' }]
  review.operation = { type: 'metadata', instancePath: 'source', saveName: 'Alpha', metadata: { levelName: 'Alpha', seed: '1', difficulty: 2, cheat: false } }
  await expect(service.previewWorldFiles(review.operation)).resolves.toBe(review)
  processes = [{ options: { gameDirectory: 'source' } }]; await expect(service.applyWorldFiles(review)).rejects.toHaveProperty('name', 'InstanceRunningError')
  processes = [{ options: { gameDirectory: 'other' } }]; review.shared = true; await expect(service.applyWorldFiles(review)).rejects.toHaveProperty('name', 'SharedWorldRunningError')
})
it('holds one native session through repeated publication checks and releases it on failure', async () => {
  vi.mocked(applyWorldFiles).mockImplementation(async (_, __, verify) => {
    await verify!(review); await verify!(review); expect(session.release).not.toHaveBeenCalled(); throw new Error('write failed')
  })
  await expect(service.applyWorldFiles(review)).rejects.toThrow('write failed')
  expect(acquireSession).toHaveBeenCalledExactlyOnceWith(join('source', 'saves', 'Alpha'), true)
  expect(session.verify).toHaveBeenCalledTimes(2); expect(session.release).toHaveBeenCalledTimes(1)
})
it('releases the control handle immediately before a Windows whole-world rename', async () => {
  review.operation = { type: 'remove', instancePath: 'source', saveName: 'Alpha' }
  vi.mocked(applyWorldFiles).mockImplementation(async (_, __, verify) => {
    await verify!(review); expect(session.release).not.toHaveBeenCalled()
    await verify!(review, true); expect(session.release).toHaveBeenCalledTimes(1); return { path: 'removed' }
  })
  await expect(service.applyWorldFiles(review)).resolves.toEqual({ path: 'removed' }); expect(session.release).toHaveBeenCalledTimes(1)
})
