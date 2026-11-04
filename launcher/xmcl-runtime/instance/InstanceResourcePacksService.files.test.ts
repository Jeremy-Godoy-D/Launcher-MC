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
  async watch() { return 'watched' }
} }))
vi.mock('./utils/resourcePackSnapshot', () => ({ readResourcePackFilesSnapshot: vi.fn(async () => ({ fingerprint: 'a'.repeat(64), shared: false, authority: 'b'.repeat(64), entries: [] })) }))
vi.mock('./utils/localResourcePacks', () => ({ installLocalResourcePacks: vi.fn(async () => []), previewResourcePackRemoval: vi.fn(), removeReviewedResourcePacks: vi.fn() }))
vi.mock('./utils/sharedResourcePacks', () => ({ previewResourcePackSharing: vi.fn(async () => ({ snapshot: 'b'.repeat(64), shared: true })), applyResourcePackSharing: vi.fn(async () => ({})) }))
vi.mock('../instanceIO/utils/instanceFileSource', () => ({ instanceFileSource: vi.fn(async () => ({})) }))
const { InstanceResourcePackService } = await import('./InstanceResourcePacksService')
const { InstanceService } = await import('./InstanceService')
const { InstanceOptionsService } = await import('./InstanceOptionsService')
const { LaunchService } = await import('../launch/LaunchService')
const { kGameDataPath } = await import('~/app')
const { kResourceManager } = await import('~/resource')
const { installLocalResourcePacks, previewResourcePackRemoval, removeReviewedResourcePacks } = await import('./utils/localResourcePacks')
const { previewResourcePackSharing, applyResourcePackSharing } = await import('./utils/sharedResourcePacks')
const { readResourcePackFilesSnapshot } = await import('./utils/resourcePackSnapshot')
const { instanceFileSource } = await import('../instanceIO/utils/instanceFileSource')
let instances: { path: string; edition: string; runtime?: Record<string, string>; java?: string; version?: string }[], processes: { options: { gameDirectory: string } }[], lock: Mutex
let metadata: ReturnType<typeof vi.fn>, watched: { files: { hash: string }[] } | undefined
let service: InstanceType<typeof InstanceResourcePackService>, linkedOptions: ReturnType<typeof vi.fn>, of: ReturnType<typeof vi.fn>, pause: ReturnType<typeof vi.fn>, resume: ReturnType<typeof vi.fn>
const review = { snapshot: 'a'.repeat(64), files: [{ fileName: 'a.zip', directory: false, size: 1, entries: 1 }], sharedDirectory: false, sharedOptions: false }
beforeEach(() => {
  vi.clearAllMocks(); instances = [{ path: 'managed', edition: 'java' }]; processes = []; lock = new Mutex(); const shared = new Mutex()
  linkedOptions = vi.fn(async () => false); of = vi.fn(key => key === 'resource-pack-options' ? shared : lock)
  pause = vi.fn(async () => {}); resume = vi.fn(); watched = { files: [{ hash: 'c'.repeat(40) }] }; metadata = vi.fn(async () => [])
  const app = { mutex: { of }, registry: { get: async (key: unknown) => {
    if (key === InstanceService) return { initialize: async () => {}, state: { get instances() { return instances } } }
    if (key === LaunchService) return { getGameProcesses: async () => processes }
    if (key === InstanceOptionsService) return { isGameOptionsLinked: linkedOptions }
    if (key === kGameDataPath) return () => 'shared-root'
    if (key === kResourceManager) return { getWatched: () => watched && ({ pause, resume, revalidate: async () => {}, state: watched }), getMetadataByHashes: metadata }
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
it('guards reviewed and legacy sharing calls and watchers for unregistered instances', async () => {
  instances = []
  const review = { snapshot: 'b'.repeat(64), shared: true } as any
  for (const action of [() => service.previewSharing('managed', true), () => service.applySharing('managed', review), () => service.linkShared('managed'), () => service.unlinkShared('managed'), () => service.watch('managed')]) await expect(action()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  expect(previewResourcePackSharing).not.toHaveBeenCalled(); expect(applyResourcePackSharing).not.toHaveBeenCalled(); expect(instanceFileSource).not.toHaveBeenCalled()
})
it('blocks linking an initially private instance while another game uses the common folder', async () => {
  processes.push({ options: { gameDirectory: 'other' } })
  vi.spyOn(service, 'isLinked').mockImplementation(async path => path === 'other')
  await service.previewSharing('managed', true)
  await expect(service.linkShared('managed')).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
  await expect(service.applySharing('managed', { snapshot: 'b'.repeat(64), shared: true } as any)).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
  expect(applyResourcePackSharing).not.toHaveBeenCalled()
})
it('serializes watch setup through the same instance lock and validates the authorized source first', async () => {
  const release = await lock.acquire(), pending = service.watch('managed')
  await vi.waitFor(() => expect(of).toHaveBeenCalledWith(LockKey.instance('managed')))
  expect(instanceFileSource).not.toHaveBeenCalled(); release()
  expect(await pending).toBe('watched'); expect(instanceFileSource).toHaveBeenCalledWith('managed', 'resourcepacks', 'shared-root', true)
})
it('legacy callers use the same reviewed copying implementation without reentering locks', async () => {
  await service.linkShared('managed'); await service.unlinkShared('managed')
  expect(previewResourcePackSharing).toHaveBeenNthCalledWith(1, 'managed', true, 'shared-root')
  expect(previewResourcePackSharing).toHaveBeenNthCalledWith(2, 'managed', false, 'shared-root')
  expect(applyResourcePackSharing).toHaveBeenCalledTimes(2)
  expect(pause).toHaveBeenCalledTimes(2); expect(resume).toHaveBeenCalledTimes(2)
})
it('resumes the same resource watcher even when the reviewed sharing operation fails', async () => {
  vi.mocked(applyResourcePackSharing).mockRejectedValueOnce(new Error('Fixture sharing failure'))
  await expect(service.applySharing('managed', { snapshot: 'b'.repeat(64), shared: true } as any)).rejects.toThrow('Fixture sharing failure')
  expect(pause).toHaveBeenCalledOnce(); expect(resume).toHaveBeenCalledOnce()
})
it('restores observation if closing the watcher fails before any file operation', async () => {
  pause.mockRejectedValueOnce(new Error('Fixture watcher close failure'))
  await expect(service.applySharing('managed', { snapshot: 'b'.repeat(64), shared: true } as any)).rejects.toThrow('Fixture watcher close failure')
  expect(resume).toHaveBeenCalledOnce(); expect(applyResourcePackSharing).not.toHaveBeenCalled()
})

it('reads inventory configuration under the read lock and retrieves only watched public provider identities', async () => {
  instances = [{ path: 'managed', edition: 'java', runtime: { minecraft: '1.21.1' }, java: '', version: '' }]
  processes.push({ options: { gameDirectory: 'managed' } })
  await service.getPackFilesSnapshot('managed')
  expect(readResourcePackFilesSnapshot).toHaveBeenCalledWith('managed', 'shared-root', { runtime: { minecraft: '1.21.1' }, java: '', version: '' })
  metadata.mockResolvedValue([{ sha1: 'c'.repeat(40), modrinth: { projectId: 'project', versionId: 'version' } }, { sha1: 'd'.repeat(40), curseforge: { projectId: 1, fileId: 2 } }])
  expect(await service.getPackSources('managed')).toEqual([{ hash: 'c'.repeat(40), modrinth: { projectId: 'project', versionId: 'version' }, curseforge: undefined }])
  expect(metadata).toHaveBeenCalledWith(['c'.repeat(40)])
})
it('rejects unregistered inventory/source reads, missing watchers and oversized source sets', async () => {
  instances = []
  await expect(service.getPackFilesSnapshot('managed')).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  await expect(service.getPackSources('managed')).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  expect(readResourcePackFilesSnapshot).not.toHaveBeenCalled(); expect(metadata).not.toHaveBeenCalled()
  instances = [{ path: 'managed', edition: 'java' }]; watched = undefined
  await expect(service.getPackSources('managed')).rejects.toThrow('not watched')
  watched = { files: Array(10001).fill({ hash: 'c'.repeat(40) }) }
  await expect(service.getPackSources('managed')).rejects.toThrow('Too many resource pack sources')
  expect(metadata).not.toHaveBeenCalled()
})
