import { beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { lstat } from 'node:fs/promises'
import { LockKey } from '@xmcl/runtime-api'
import { RuntimeVersionsSchema } from '@xmcl/instance'
vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/service', () => ({ ExposeServiceKey: () => () => {} }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('./InstanceService', () => ({ InstanceService: class {} }))
vi.mock('../launch/LaunchService', () => ({ LaunchService: class {} }))
vi.mock('./AbstractInstanceDomainService', () => ({ AbstractInstanceDomainService: class { constructor(public app: any) {} get mutex() { return this.app.mutex } async watch() { return 'watched' } async isLinked() { return false } async showDirectory() {} } }))
vi.mock('node:fs/promises', async original => { const actual = await original<typeof import('node:fs/promises')>(); return { ...actual, lstat: vi.fn(async () => ({ isDirectory: () => true })) } })
vi.mock('../instanceIO/utils/instanceFileSource', () => ({ instanceFileSource: vi.fn(async () => ({})) }))
vi.mock('./utils/resourcePackSnapshot', () => ({ readResourcePackFilesSnapshot: vi.fn(async () => ({ fingerprint: 'a'.repeat(64), shared: false, authority: 'b'.repeat(64), entries: [] })) }))
vi.mock('./utils/localMods', () => ({ readModFilesSnapshot: vi.fn() }))
vi.mock('./utils/localResourcePacks', () => ({ installLocalResourcePacks: vi.fn(async () => ['installed']) }))
vi.mock('./utils/localShaders', () => ({ previewShaderRemoval: vi.fn(), removeReviewedShaders: vi.fn(async () => ({ backup: 'backup' })) }))
vi.mock('./utils/sharedResourcePacks', () => ({ previewResourcePackSharing: vi.fn(async () => ({ snapshot: 'b'.repeat(64), shared: true })), applyResourcePackSharing: vi.fn(async () => ({})) }))
vi.mock('./utils/shaderSelection', () => ({ readShaderSelection: vi.fn(), writeShaderSelection: vi.fn() }))
const { InstanceShaderPacksService } = await import('./InstanceShaderPacksService')
const { InstanceService } = await import('./InstanceService'), { LaunchService } = await import('../launch/LaunchService')
const { kGameDataPath } = await import('~/app'), { kResourceManager } = await import('~/resource')
const { readModFilesSnapshot } = await import('./utils/localMods'), { instanceFileSource } = await import('../instanceIO/utils/instanceFileSource')
const { readShaderSelection, writeShaderSelection } = await import('./utils/shaderSelection')
const { installLocalResourcePacks } = await import('./utils/localResourcePacks')
const { previewShaderRemoval, removeReviewedShaders } = await import('./utils/localShaders')
const { previewResourcePackSharing, applyResourcePackSharing } = await import('./utils/sharedResourcePacks')
const { readResourcePackFilesSnapshot } = await import('./utils/resourcePackSnapshot')
let metadata: ReturnType<typeof vi.fn>
let pause: ReturnType<typeof vi.fn>, resume: ReturnType<typeof vi.fn>, revalidate: ReturnType<typeof vi.fn>
const runtime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16' })
let instances: any[], processes: any[], files: any[], lock: Mutex, of: ReturnType<typeof vi.fn>, service: InstanceType<typeof InstanceShaderPacksService>
const change = { snapshot: 'a'.repeat(64), engine: 'iris', pack: 'New.zip', enabled: true } as const
beforeEach(() => {
  metadata = vi.fn(async () => [])
  pause = vi.fn(async () => {}); resume = vi.fn(); revalidate = vi.fn(async () => {})
  vi.clearAllMocks(); instances = [{ path: 'managed', edition: 'java', runtime, java: '', version: '' }]; processes = []; lock = new Mutex(); const global = new Mutex()
  of = vi.fn(key => key === 'resource-pack-options' ? global : lock)
  files = [{ path: 'managed/mods/iris.jar', fileName: 'iris.jar', metadata: { fabric: { schemaVersion: 1, id: 'iris', name: 'Iris', version: '1.0' } }, hash: 'c'.repeat(40), size: 10, ino: 1, mtime: 2, ctime: 3 }]
  vi.mocked(readModFilesSnapshot).mockResolvedValue({ fingerprint: 'b'.repeat(64), entries: [{ path: files[0].path, fileName: 'iris.jar', size: 10, ino: 1, dev: 1, mtime: 2, ctime: 3, directory: false }] })
  const app = { mutex: { of }, registry: { get: async (key: unknown) => {
    if (key === InstanceService) return { initialize: async () => {}, state: { get instances() { return instances } } }
    if (key === LaunchService) return { getGameProcesses: async () => processes }
    if (key === kGameDataPath) return () => 'shared-root'
    if (key === kResourceManager) return { getWatched: () => ({ state: { files }, pause, resume, revalidate }), getMetadataByHashes: metadata }
    throw new Error('Unexpected registry access')
  } } }; service = new InstanceShaderPacksService(app as any)
})
it('rejects unregistered and non-Java reads, writes and watchers before touching files', async () => {
  for (const edition of ['missing', 'bedrock']) {
    instances = edition === 'missing' ? [] : [{ path: 'managed', edition }]
    for (const action of [() => service.getSelection('managed'), () => service.setSelection('managed', change), () => service.watch('managed'), () => service.install({ path: 'managed', files: [] }), () => service.showDirectory('managed'), () => service.previewRemoval('managed', ['New.zip']), () => service.removeReviewed('managed', {} as any), () => service.uninstall({ path: 'managed', files: [] }), () => service.previewSharing('managed', true), () => service.applySharing('managed', {} as any), () => service.linkShared('managed'), () => service.unlinkShared('managed'), () => service.getShaderFilesSnapshot('managed'), () => service.getShaderSources('managed')]) await expect(action()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  }
  expect(readShaderSelection).not.toHaveBeenCalled(); expect(writeShaderSelection).not.toHaveBeenCalled(); expect(lstat).not.toHaveBeenCalled()
})
it('allows reads during a game but blocks mutation in Native', async () => {
  processes = [{ options: { gameDirectory: 'managed' } }]
  await service.getSelection('managed'); expect(readShaderSelection).toHaveBeenCalled()
  await expect(service.setSelection('managed', change)).rejects.toHaveProperty('name', 'InstanceRunningError'); expect(writeShaderSelection).not.toHaveBeenCalled()
})
it('rechecks registration after waiting for the instance lock', async () => {
  const release = await lock.acquire(), pending = service.setSelection('managed', change), failure = expect(pending).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  await vi.waitFor(() => expect(of).toHaveBeenCalledWith(LockKey.instance('managed'))); instances = []; release(); await failure
  expect(writeShaderSelection).not.toHaveBeenCalled()
})
it('derives engine availability from Native runtime and stat-aligned metadata', async () => {
  await service.getSelection('managed')
  expect(readShaderSelection).toHaveBeenCalledWith('managed', 'shared-root', expect.objectContaining({ engines: ['iris'], metadataPending: false, fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) }))
  files[0].mtime = 99; await service.getSelection('managed')
  expect(readShaderSelection).toHaveBeenLastCalledWith('managed', 'shared-root', expect.objectContaining({ engines: [], metadataPending: true }))
})
it('validates the authorized shader source before legacy watch setup', async () => {
  expect(await service.watch('managed')).toBe('watched')
  expect(instanceFileSource).toHaveBeenCalledWith('managed', 'shaderpacks', 'shared-root', true)
})
it('propagates an unsafe mods source without reading selection or trusting stale metadata', async () => {
  vi.mocked(instanceFileSource).mockRejectedValueOnce(new Error('Unsafe source'))
  await expect(service.getSelection('managed')).rejects.toThrow('Unsafe source'); expect(readShaderSelection).not.toHaveBeenCalled()
})

it('copies shaders through the existing verified pack installer without reading or changing selection', async () => {
  expect(await service.install({ path: 'managed', files: ['source.zip'] })).toEqual(['installed'])
  expect(installLocalResourcePacks).toHaveBeenCalledWith('managed', ['source.zip'], 'shared-root', 'shaderpacks')
  expect(readShaderSelection).not.toHaveBeenCalled(); expect(writeShaderSelection).not.toHaveBeenCalled()
})
it('blocks copying during this game or another game using the common shaders directory', async () => {
  processes = [{ options: { gameDirectory: 'managed' } }]
  await expect(service.install({ path: 'managed', files: ['source.zip'] })).rejects.toHaveProperty('name', 'InstanceRunningError')
  processes = [{ options: { gameDirectory: 'other' } }]; vi.spyOn(service, 'isLinked').mockResolvedValue(true)
  await expect(service.install({ path: 'managed', files: ['source.zip'] })).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
  expect(installLocalResourcePacks).not.toHaveBeenCalled()
})
it('allows a private shader import while another instance is running', async () => {
  processes = [{ options: { gameDirectory: 'other' } }]; vi.spyOn(service, 'isLinked').mockResolvedValue(false)
  await service.install({ path: 'managed', files: ['source.zip'] }); expect(installLocalResourcePacks).toHaveBeenCalled()
})
it('checks the shader folder authority before opening it', async () => {
  await service.showDirectory('managed'); expect(instanceFileSource).toHaveBeenCalledWith('managed', 'shaderpacks', 'shared-root', true)
})

it('allows a removal review during a game while blocking the actual Native mutation', async () => {
  processes = [{ options: { gameDirectory: 'managed' } }]; await service.previewRemoval('managed', ['New.zip']); expect(previewShaderRemoval).toHaveBeenCalledWith('managed', ['New.zip'], 'shared-root')
  await expect(service.removeReviewed('managed', {} as any)).rejects.toHaveProperty('name', 'InstanceRunningError'); expect(removeReviewedShaders).not.toHaveBeenCalled()
})
it('blocks shared shader removal used by another game but allows private file removal', async () => {
  processes = [{ options: { gameDirectory: 'other' } }]; const linked = vi.spyOn(service, 'isLinked').mockResolvedValue(true)
  await expect(service.removeReviewed('managed', {} as any)).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
  linked.mockResolvedValue(false); await service.removeReviewed('managed', {} as any); expect(removeReviewedShaders).toHaveBeenCalled()
})
it('keeps legacy uninstall names but routes them through the reviewed backup operation', async () => {
  const review = { snapshot: 'a'.repeat(64), files: [], configurations: [], sharedDirectory: false }; vi.mocked(previewShaderRemoval).mockResolvedValue(review)
  await service.uninstall({ path: 'managed', files: ['New.zip'] })
  expect(previewShaderRemoval).toHaveBeenCalledWith('managed', ['New.zip'], 'shared-root'); expect(removeReviewedShaders).toHaveBeenCalledWith('managed', review, 'shared-root')
})
it('rejects unmanaged legacy uninstall paths and keeps an empty request a no-op', async () => {
  for (const files of [['../other.zip'], ['nested/file.zip'], ['C:\\foreign\\file.zip'], [undefined]]) await expect(service.uninstall({ path: 'managed', files } as any)).rejects.toThrow()
  await service.uninstall({ path: 'managed', files: [] }); expect(previewShaderRemoval).not.toHaveBeenCalled(); expect(removeReviewedShaders).not.toHaveBeenCalled()
})


it('routes legacy shader links through reviewed copies and rebinds the existing watched state', async () => {
  await service.linkShared('managed'); await service.unlinkShared('managed')
  expect(previewResourcePackSharing).toHaveBeenNthCalledWith(1, 'managed', true, 'shared-root', 'shaderpacks')
  expect(previewResourcePackSharing).toHaveBeenNthCalledWith(2, 'managed', false, 'shared-root', 'shaderpacks')
  expect(applyResourcePackSharing).toHaveBeenCalledTimes(2); expect(pause).toHaveBeenCalledTimes(2); expect(resume).toHaveBeenCalledTimes(2); expect(revalidate).toHaveBeenCalledTimes(2)
})
it('blocks changing shared shaders while either this game or another linked game is running', async () => {
  processes = [{ options: { gameDirectory: 'managed' } }]
  await expect(service.applySharing('managed', {} as any)).rejects.toHaveProperty('name', 'InstanceRunningError')
  processes = [{ options: { gameDirectory: 'other' } }]; vi.spyOn(service, 'isLinked').mockImplementation(async path => path === 'other')
  await expect(service.linkShared('managed')).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
  expect(pause).not.toHaveBeenCalled(); expect(applyResourcePackSharing).not.toHaveBeenCalled()
})
it('allows private shader changes while another unrelated private game runs', async () => {
  processes = [{ options: { gameDirectory: 'other' } }]
  await service.linkShared('managed'); expect(applyResourcePackSharing).toHaveBeenCalledWith('managed', expect.anything(), 'shared-root', 'shaderpacks')
})
it('restores shader observation after closing or copying fails', async () => {
  pause.mockRejectedValueOnce(new Error('Close failed'))
  await expect(service.applySharing('managed', {} as any)).rejects.toThrow('Close failed')
  expect(resume).toHaveBeenCalledOnce(); expect(applyResourcePackSharing).not.toHaveBeenCalled()
  vi.mocked(applyResourcePackSharing).mockRejectedValueOnce(new Error('Copy failed'))
  await expect(service.applySharing('managed', {} as any)).rejects.toThrow('Copy failed')
  expect(resume).toHaveBeenCalledTimes(2); expect(revalidate).toHaveBeenCalledTimes(2)
})


it('captures shader inventory with its Native configuration and shader-only directory authority', async () => {
  await service.getShaderFilesSnapshot('managed')
  expect(readResourcePackFilesSnapshot).toHaveBeenCalledWith('managed', 'shared-root', { runtime, java: '', version: '' }, 'shaderpacks')
})
it('returns only watched shader public provider identities without unrelated metadata', async () => {
  const source = { projectId: 'abcdefgh', versionId: 'version1' }
  metadata.mockResolvedValue([{ sha1: files[0].hash, modrinth: source, unrelated: 'PRIVATE' }, { sha1: 'f'.repeat(40), curseforge: { projectId: 1, fileId: 2 } }])
  expect(await service.getShaderSources('managed')).toEqual([{ hash: files[0].hash, modrinth: source, curseforge: undefined }])
  expect(metadata).toHaveBeenCalledWith([files[0].hash])
  files = Array(10001).fill(files[0]); metadata.mockClear()
  await expect(service.getShaderSources('managed')).rejects.toThrow('Shader sources unavailable'); expect(metadata).not.toHaveBeenCalled()
})
