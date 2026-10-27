import { beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { LockKey } from '@xmcl/runtime-api'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app') }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/service', () => ({ ExposeServiceKey: () => () => {} }))
vi.mock('./InstanceService', () => ({ InstanceService: class {} }))
vi.mock('../launch/LaunchService', () => ({ LaunchService: class {} }))
vi.mock('./AbstractInstanceDomainService', () => ({ AbstractInstanceDomainService: class {
  constructor(public app: any) {}
  get mutex() { return this.app.mutex }
} }))
const { InstanceModsService } = await import('./InstanceModsService')
const { InstanceService } = await import('./InstanceService')
const { LaunchService } = await import('../launch/LaunchService')
let instances: { path: string; edition: string }[], processes: { options: { gameDirectory: string } }[], lock: Mutex
let service: InstanceType<typeof InstanceModsService>, of: ReturnType<typeof vi.fn>
beforeEach(() => {
  instances = [{ path: 'managed', edition: 'java' }]; processes = []; lock = new Mutex(); of = vi.fn(() => lock)
  const app = { mutex: { of }, registry: { get: async (key: unknown) => {
    if (key === InstanceService) return { initialize: async () => {}, state: { get instances() { return instances } } }
    if (key === LaunchService) return { getGameProcesses: async () => processes }
    throw new Error('unexpected registry access')
  } } }
  service = new InstanceModsService(app as any, {} as any)
})
const operations = (path = 'managed') => [() => service.install({ path, files: [] }), () => service.uninstall({ path, files: [] }), () => service.enable({ path, files: [] }), () => service.disable({ path, files: [] })]
it('rejects absent and Bedrock records before any filesystem operation', async () => {
  for (const op of operations('unregistered')) await expect(op()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  instances[0].edition = 'bedrock'
  for (const op of operations()) await expect(op()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  expect(of).not.toHaveBeenCalled()
})
it('blocks every file mutation while this instance has a tracked game process', async () => {
  processes.push({ options: { gameDirectory: 'managed' } })
  for (const op of operations()) await expect(op()).rejects.toHaveProperty('name', 'InstanceRunningError')
  expect(of).toHaveBeenCalledWith(LockKey.instance('managed'))
})
it('checks registration again after waiting for the installation/deletion lock', async () => {
  const release = await lock.acquire()
  const pending = service.uninstall({ path: 'managed', files: [] })
  const result = expect(pending).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  await vi.waitFor(() => expect(of).toHaveBeenCalledWith(LockKey.instance('managed')))
  instances = []; release(); await result
})
it('checks a game started while waiting for the instance lock before writing', async () => {
  const release = await lock.acquire()
  const pending = service.install({ path: 'managed', files: [] })
  const result = expect(pending).rejects.toHaveProperty('name', 'InstanceRunningError')
  await vi.waitFor(() => expect(of).toHaveBeenCalled())
  processes.push({ options: { gameDirectory: 'managed' } }); release(); await result
})
