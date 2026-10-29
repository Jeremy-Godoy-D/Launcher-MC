import { beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { LockKey } from '@xmcl/runtime-api'
vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/service', () => ({ ExposeServiceKey: () => () => {} }))
vi.mock('./InstanceService', () => ({ InstanceService: class {} }))
vi.mock('./InstanceOptionsService', () => ({ InstanceOptionsService: class {} }))
vi.mock('../launch/LaunchService', () => ({ LaunchService: class {} }))
vi.mock('./AbstractInstanceDomainService', () => ({ AbstractInstanceDomainService: class {
  constructor(public app: any) {} get mutex() { return this.app.mutex }
  async isLinked() { return false }
} }))
vi.mock('./utils/localResourcePacks', () => ({ installLocalResourcePacks: vi.fn(async () => []), previewResourcePackRemoval: vi.fn(), removeReviewedResourcePacks: vi.fn() }))
const { InstanceResourcePackService } = await import('./InstanceResourcePacksService')
const { InstanceService } = await import('./InstanceService')
const { InstanceOptionsService } = await import('./InstanceOptionsService')
const { LaunchService } = await import('../launch/LaunchService')
const { kGameDataPath } = await import('~/app')
const { kResourceManager } = await import('~/resource')
const { installLocalResourcePacks, previewResourcePackRemoval, removeReviewedResourcePacks } = await import('./utils/localResourcePacks')
let instances: { path: string; edition: string }[], processes: { options: { gameDirectory: string } }[], lock: Mutex
let service: InstanceType<typeof InstanceResourcePackService>, linkedOptions: ReturnType<typeof vi.fn>, of: ReturnType<typeof vi.fn>
const review = { snapshot: 'a'.repeat(64), files: [{ fileName: 'a.zip', directory: false, size: 1, entries: 1 }], sharedDirectory: false, sharedOptions: false }
beforeEach(() => {
  vi.clearAllMocks(); instances = [{ path: 'managed', edition: 'java' }]; processes = []; lock = new Mutex(); const shared = new Mutex()
  linkedOptions = vi.fn(async () => false); of = vi.fn(key => key === 'resource-pack-options' ? shared : lock)
  const app = { mutex: { of }, registry: { get: async (key: unknown) => {
    if (key === InstanceService) return { initialize: async () => {}, state: { get instances() { return instances } } }
    if (key === LaunchService) return { getGameProcesses: async () => processes }
    if (key === InstanceOptionsService) return { isGameOptionsLinked: linkedOptions }
    if (key === kGameDataPath) return () => 'shared-root'
    if (key === kResourceManager) return { getWatched: () => ({}) }
    throw new Error('Unexpected registry access')
  } } }
  service = new InstanceResourcePackService(app as any)
})
it('rejects unregistered and Bedrock operations before reading or writing', async () => {
  for (const edition of ['unknown', 'bedrock']) {
    instances = edition === 'unknown' ? [] : [{ path: 'managed', edition }]
    for (const op of [() => service.install({ path: 'managed', files: [] }), () => service.previewRemoval('managed', ['a.zip']), () => service.removeReviewed('managed', review)]) await expect(op()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  }
  expect(installLocalResourcePacks).not.toHaveBeenCalled(); expect(previewResourcePackRemoval).not.toHaveBeenCalled(); expect(removeReviewedResourcePacks).not.toHaveBeenCalled()
})
it('allows read-only review but blocks mutation while this instance is running', async () => {
  processes.push({ options: { gameDirectory: 'managed' } })
  await service.previewRemoval('managed', ['a.zip'])
  expect(previewResourcePackRemoval).toHaveBeenCalledWith('managed', ['a.zip'], 'shared-root')
  await expect(service.install({ path: 'managed', files: [] })).rejects.toHaveProperty('name', 'InstanceRunningError')
  await expect(service.removeReviewed('managed', review)).rejects.toHaveProperty('name', 'InstanceRunningError')
  expect(removeReviewedResourcePacks).not.toHaveBeenCalled()
})
it('blocks another tracked game sharing the pack directory', async () => {
  processes.push({ options: { gameDirectory: 'other' } }); vi.spyOn(service, 'isLinked').mockResolvedValue(true)
  await expect(service.install({ path: 'managed', files: [] })).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
  await expect(service.removeReviewed('managed', review)).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
})
it('checks shared options only when removal also changes their selection', async () => {
  processes.push({ options: { gameDirectory: 'other' } }); linkedOptions.mockResolvedValue(true)
  await service.install({ path: 'managed', files: [] }); expect(installLocalResourcePacks).toHaveBeenCalled()
  await expect(service.removeReviewed('managed', review)).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
  expect(removeReviewedResourcePacks).not.toHaveBeenCalled()
})
it('checks registration again after waiting for the instance lock', async () => {
  const release = await lock.acquire(), pending = service.removeReviewed('managed', review), failure = expect(pending).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  await vi.waitFor(() => expect(of).toHaveBeenCalledWith(LockKey.instance('managed')))
  instances = []; release(); await failure
  expect(removeReviewedResourcePacks).not.toHaveBeenCalled()
})
