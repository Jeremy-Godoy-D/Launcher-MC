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
vi.mock('./utils/localMods', () => ({ readModFilesSnapshot: vi.fn() }))
vi.mock('./utils/localResourcePacks', () => ({ installLocalResourcePacks: vi.fn(async () => ['installed']) }))
vi.mock('./utils/shaderSelection', () => ({ readShaderSelection: vi.fn(), writeShaderSelection: vi.fn() }))
const { InstanceShaderPacksService } = await import('./InstanceShaderPacksService')
const { InstanceService } = await import('./InstanceService'), { LaunchService } = await import('../launch/LaunchService')
const { kGameDataPath } = await import('~/app'), { kResourceManager } = await import('~/resource')
const { readModFilesSnapshot } = await import('./utils/localMods'), { instanceFileSource } = await import('../instanceIO/utils/instanceFileSource')
const { readShaderSelection, writeShaderSelection } = await import('./utils/shaderSelection')
const { installLocalResourcePacks } = await import('./utils/localResourcePacks')
const runtime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16' })
let instances: any[], processes: any[], files: any[], lock: Mutex, of: ReturnType<typeof vi.fn>, service: InstanceType<typeof InstanceShaderPacksService>
const change = { snapshot: 'a'.repeat(64), engine: 'iris', pack: 'New.zip', enabled: true } as const
beforeEach(() => {
  vi.clearAllMocks(); instances = [{ path: 'managed', edition: 'java', runtime, java: '', version: '' }]; processes = []; lock = new Mutex(); const global = new Mutex()
  of = vi.fn(key => key === 'resource-pack-options' ? global : lock)
  files = [{ path: 'managed/mods/iris.jar', fileName: 'iris.jar', metadata: { fabric: { schemaVersion: 1, id: 'iris', name: 'Iris', version: '1.0' } }, hash: 'c'.repeat(40), size: 10, ino: 1, mtime: 2, ctime: 3 }]
  vi.mocked(readModFilesSnapshot).mockResolvedValue({ fingerprint: 'b'.repeat(64), entries: [{ path: files[0].path, fileName: 'iris.jar', size: 10, ino: 1, dev: 1, mtime: 2, ctime: 3, directory: false }] })
  const app = { mutex: { of }, registry: { get: async (key: unknown) => {
    if (key === InstanceService) return { initialize: async () => {}, state: { get instances() { return instances } } }
    if (key === LaunchService) return { getGameProcesses: async () => processes }
    if (key === kGameDataPath) return () => 'shared-root'
    if (key === kResourceManager) return { getWatched: () => ({ state: { files } }) }
    throw new Error('Unexpected registry access')
  } } }; service = new InstanceShaderPacksService(app as any)
})
it('rejects unregistered and non-Java reads, writes and watchers before touching files', async () => {
  for (const edition of ['missing', 'bedrock']) {
    instances = edition === 'missing' ? [] : [{ path: 'managed', edition }]
    for (const action of [() => service.getSelection('managed'), () => service.setSelection('managed', change), () => service.watch('managed'), () => service.install({ path: 'managed', files: [] }), () => service.showDirectory('managed')]) await expect(action()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
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
