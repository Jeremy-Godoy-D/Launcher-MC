import { beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { LockKey } from '@xmcl/runtime-api'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/service', () => ({ AbstractService: class { constructor(public app: any) {} get mutex() { return this.app.mutex } }, ExposeServiceKey: () => () => {} }))
vi.mock('./InstanceService', () => ({ InstanceService: class {} }))
vi.mock('../launch/LaunchService', () => ({ LaunchService: class {} }))
vi.mock('./utils/resourcePackSelection', () => ({ readResourcePackSelection: vi.fn(async () => ({ packs: [], snapshot: 'a'.repeat(64) })), writeResourcePackSelection: vi.fn() }))
const { InstanceOptionsService } = await import('./InstanceOptionsService')
const { InstanceService } = await import('./InstanceService')
const { LaunchService } = await import('../launch/LaunchService')
const { readResourcePackSelection, writeResourcePackSelection } = await import('./utils/resourcePackSelection')
let instances: { path: string; edition: string }[], processes: { options: { gameDirectory: string } }[], lock: Mutex, service: InstanceType<typeof InstanceOptionsService>
let of: ReturnType<typeof vi.fn>
const selection = { packs: ['vanilla'], snapshot: 'a'.repeat(64), shared: false }
beforeEach(() => {
  vi.clearAllMocks(); instances = [{ path: 'managed', edition: 'java' }]; processes = []; lock = new Mutex()
  const shared = new Mutex(); of = vi.fn(key => key === 'resource-pack-options' ? shared : lock)
  const app = { mutex: { of }, registry: { get: async (key: unknown) => {
    if (key === InstanceService) return { initialize: async () => {}, state: { get instances() { return instances } } }
    if (key === LaunchService) return { getGameProcesses: async () => processes }
    throw new Error('Unexpected registry key')
  } } }
  service = new InstanceOptionsService(app as any, name => `shared/${name}`)
  vi.spyOn(service, 'isGameOptionsLinked').mockResolvedValue(false)
})
it('rejects unknown and Bedrock instances before filesystem access', async () => {
  await expect(service.getResourcePackSelection('unknown')).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  instances[0].edition = 'bedrock'
  await expect(service.editResourcePackSelection('managed', selection)).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  expect(readResourcePackSelection).not.toHaveBeenCalled(); expect(writeResourcePackSelection).not.toHaveBeenCalled()
})
it('checks the tracked process in Native before editing', async () => {
  processes.push({ options: { gameDirectory: 'managed' } })
  await expect(service.editResourcePackSelection('managed', selection)).rejects.toHaveProperty('name', 'InstanceRunningError')
  expect(writeResourcePackSelection).not.toHaveBeenCalled()
})
it('also blocks a game using the same shared options through another instance', async () => {
  processes.push({ options: { gameDirectory: 'other' } })
  vi.mocked(service.isGameOptionsLinked).mockResolvedValue(true)
  await expect(service.editResourcePackSelection('managed', selection)).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
  expect(writeResourcePackSelection).not.toHaveBeenCalled()
})
it('checks registration again after waiting for the instance lock', async () => {
  const release = await lock.acquire(), pending = service.editResourcePackSelection('managed', selection)
  const failure = expect(pending).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  await vi.waitFor(() => expect(of).toHaveBeenCalledWith(LockKey.instance('managed')))
  instances = []; release(); await failure
  expect(writeResourcePackSelection).not.toHaveBeenCalled()
})
it('passes only Native-managed shared locations to the writer', async () => {
  await service.editResourcePackSelection('managed', selection)
  expect(writeResourcePackSelection).toHaveBeenCalledWith('managed', selection, 'shared/resourcepacks', 'shared/options.txt')
})
