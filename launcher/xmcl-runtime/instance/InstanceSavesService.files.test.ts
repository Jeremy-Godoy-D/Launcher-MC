import { beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { LockKey } from '@xmcl/runtime-api'
vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/instance', () => ({ InstanceService: class {} }))
vi.mock('~/launch', () => ({ LaunchService: class {} }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/market', () => ({ kMarketProvider: Symbol('market') }))
vi.mock('~/save', () => ({ kSaveWorker: Symbol('save') }))
vi.mock('~/service', () => ({ AbstractService: class { constructor(public app: any) {} get mutex() { return this.app.mutex } }, ExposeServiceKey: () => () => {}, ServiceStateManager: class {} }))
vi.mock('./utils/worldOperations', () => ({ previewWorldFiles: vi.fn(), applyWorldFiles: vi.fn() }))
const { InstanceSavesService } = await import('./InstanceSavesService')
const { previewWorldFiles, applyWorldFiles } = await import('./utils/worldOperations')
let service: InstanceType<typeof InstanceSavesService>, instances: any[], processes: any[], lock: Mutex, of: ReturnType<typeof vi.fn<(key: string) => Mutex>>
const operation = { type: 'copy', instancePath: 'source', saveName: 'Alpha', destinationInstancePath: 'destination', destinationName: 'Beta' } as const
let review: any
beforeEach(() => {
  vi.clearAllMocks(); instances = ['source', 'destination'].map(path => ({ path, edition: 'java' })); processes = []; lock = new Mutex(); const global = new Mutex()
  of = vi.fn(key => key === 'resource-pack-options' ? global : lock)
  review = { operation, snapshot: 'a'.repeat(64), shared: false, linkOnly: false }
  vi.mocked(previewWorldFiles).mockImplementation(async () => review)
  vi.mocked(applyWorldFiles).mockImplementation(async (value, root, verify) => { await verify!(review); return { path: 'created' } })
  // Distinct instance locks avoid manufacturing a self-deadlock in a two-instance operation.
  const others = new Map<string, Mutex>()
  const mutexOf = vi.fn(key => { of(key); if (key === 'resource-pack-options') return global; if (key === LockKey.instance('source')) return lock; if (!others.has(key)) others.set(key, new Mutex()); return others.get(key)! })
  const app = { mutex: { of: mutexOf }, registry: { get: async () => ({ getGameProcesses: async () => processes }) } }
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
