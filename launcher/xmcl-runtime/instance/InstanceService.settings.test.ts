import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { InstanceSchema, computeInstanceEditChanges } from '@xmcl/instance'
import { InstanceState } from '@xmcl/runtime-api'
import { instanceSettingsSnapshot } from '@xmcl/runtime-api/src/util/instanceSettings'
import { Mutex } from 'async-mutex'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('path') }))
vi.mock('~/infra', () => ({ ImageStorage: class {}, Tasks: class {}, kTasks: Symbol('tasks') }))
vi.mock('~/install', () => ({ VersionMetadataService: class {} }))
vi.mock('../launch/LaunchService', () => ({ LaunchService: class {} }))
vi.mock('@xmcl/instance', async original => { const actual = await original<typeof import('@xmcl/instance')>(); return { ...actual, computeInstanceEditChanges: vi.fn(actual.computeInstanceEditChanges) } })
const { InstanceService } = await import('./InstanceService')
let root: string, path: string, service: InstanceType<typeof InstanceService>, state: InstanceState, processes: any[], processError: Error | undefined
const snapshot = () => instanceSettingsSnapshot(state.all[path])
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'grimo-settings-write-'))); path = join(root, 'instance'); await mkdir(path)
  const instance = { ...InstanceSchema.parse({ name: 'Local', runtime: { minecraft: '1.21.1' } }), path, creationDate: 1, lastAccessDate: 1, lastPlayedDate: 0, playtime: 0 }
  await writeFile(join(path, 'instance.json'), JSON.stringify(instance)); state = new InstanceState(); Object.assign(state, { subscribe: vi.fn() }); state.instanceAdd(instance)
  processes = []; processError = undefined; const locks = new Map<string, Mutex>()
  const app = { appDataPath: root, registry: { get: async () => ({ getGameProcesses: async () => { if (processError) throw processError; return processes } }) }, getLogger: () => ({ log() {}, warn() {}, error() {} }), controller: { broadcast() {} }, mutex: { of: (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! } } }
  service = new InstanceService(app as any, { registerStatic: () => state } as any, {} as any, (...parts: string[]) => join(root, ...parts), {} as any, {} as any)
  vi.spyOn(service, 'initialize').mockResolvedValue(undefined); vi.mocked(computeInstanceEditChanges).mockClear()
})
afterEach(async () => { expect(dirname(root)).toBe(await realpath(tmpdir())); expect(root).toContain('grimo-settings-write-'); await rm(root, { recursive: true, force: true }) })
it('updates only selected settings, resets inheritance and preserves nested metadata', async () => {
  state.instanceEdit({ path, resolution: { width: 1280, monitor: 'display-2' }, server: { host: 'localhost', name: 'Local server' }, hideLauncher: false })
  await service.editInstanceSettings({ instancePath: path, expected: snapshot(), changes: { vmOptions: ['a b', ''], fastLaunch: true } })
  expect(state.all[path]).toMatchObject({ vmOptions: ['a b', ''], fastLaunch: true, hideLauncher: false, resolution: { width: 1280, monitor: 'display-2' }, server: { host: 'localhost', name: 'Local server' } })
  await service.editInstanceSettings({ instancePath: path, expected: snapshot(), changes: { fastLaunch: null, assignMemory: 'auto' } })
  expect(state.all[path].fastLaunch).toBeUndefined(); expect(state.all[path].assignMemory).toBe('auto')
})
it('rejects stale writes while allowing disjoint edits from the same original snapshot', async () => {
  const expected = snapshot()
  await service.editInstanceSettings({ instancePath: path, expected, changes: { vmOptions: ['first'] } })
  await expect(service.editInstanceSettings({ instancePath: path, expected, changes: { vmOptions: ['stale'] } })).rejects.toHaveProperty('name', 'InstanceSettingsChanged')
  await service.editInstanceSettings({ instancePath: path, expected, changes: { hideLauncher: true } })
  expect(state.all[path]).toMatchObject({ vmOptions: ['first'], hideLauncher: true })
})
it('serializes competing writes and rejects a changed memory group', async () => {
  const expected = snapshot(), results = await Promise.allSettled(['first', 'second'].map(value => service.editInstanceSettings({ instancePath: path, expected, changes: { java: value } })))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  state.instanceEdit({ path, assignMemory: true, minMemory: 1024, maxMemory: 4096 }); const before = snapshot()
  await service.editInstanceSettings({ instancePath: path, expected: before, changes: { maxMemory: 2048 } })
  await expect(service.editInstanceSettings({ instancePath: path, expected: before, changes: { minMemory: 3072 } })).rejects.toHaveProperty('name', 'InstanceSettingsChanged')
})
it('refuses unregistered and non-Java instances without force loading them', async () => {
  const expected = snapshot(), load = vi.spyOn(service, 'loadInstance')
  await expect(service.editInstanceSettings({ instancePath: join(root, 'foreign'), expected, changes: { java: null } })).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  state.instanceEdit({ path, edition: 'bedrock' }); await expect(service.editInstanceSettings({ instancePath: path, expected, changes: { java: null } })).rejects.toHaveProperty('name', 'InstanceNotFoundError'); expect(load).not.toHaveBeenCalled()
})
it('blocks a running game using an alias and fails closed on process-read errors', async () => {
  const alias = join(root, 'alias'); await symlink(path, alias, 'junction'); const expected = snapshot()
  processes = [{ options: { gameDirectory: alias } }]
  await expect(service.editInstanceSettings({ instancePath: path, expected, changes: { showLog: true } })).rejects.toHaveProperty('name', 'InstanceRunningError')
  processes = []; processError = new Error('process read unavailable')
  await expect(service.editInstanceSettings({ instancePath: path, expected, changes: { showLog: true } })).rejects.toThrow('process read unavailable')
  expect(snapshot()).toEqual(expected)
})
it('does not let a delayed legacy edit overwrite a newer reviewed setting', async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve })
  vi.mocked(computeInstanceEditChanges).mockImplementationOnce(async () => { await gate; return { vmOptions: ['legacy'] } })
  const expected = snapshot(), pending = service.editInstance({ instancePath: path, vmOptions: ['legacy'] }), refusal = expect(pending).rejects.toHaveProperty('name', 'InstanceSettingsChanged')
  try { await vi.waitFor(() => expect(computeInstanceEditChanges).toHaveBeenCalled()); await service.editInstanceSettings({ instancePath: path, expected, changes: { vmOptions: ['reviewed'] } }) }
  finally { release(); await refusal }
  expect(state.all[path].vmOptions).toEqual(['reviewed'])
})
it('rejects a delayed legacy minimum when a reviewed maximum changed the coupled memory group', async () => {
  state.instanceEdit({ path, assignMemory: true, minMemory: 1024, maxMemory: 4096 })
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve })
  vi.mocked(computeInstanceEditChanges).mockImplementationOnce(async () => { await gate; return { minMemory: 3072 } })
  const expected = snapshot(), pending = service.editInstance({ instancePath: path, minMemory: 3072 }), refusal = expect(pending).rejects.toHaveProperty('name', 'InstanceSettingsChanged')
  try { await vi.waitFor(() => expect(computeInstanceEditChanges).toHaveBeenCalled()); await service.editInstanceSettings({ instancePath: path, expected, changes: { maxMemory: 2048 } }) }
  finally { release(); await refusal }
  expect(state.all[path]).toMatchObject({ minMemory: 1024, maxMemory: 2048 })
})
it('allows an explicit zero maximum, which leaves Java without a launcher maximum', async () => {
  await service.editInstanceSettings({ instancePath: path, expected: snapshot(), changes: { assignMemory: true, minMemory: 1024, maxMemory: 0 } })
  expect(state.all[path]).toMatchObject({ assignMemory: true, minMemory: 1024, maxMemory: 0 })
})
