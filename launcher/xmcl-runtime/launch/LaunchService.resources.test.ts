import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { setImmediate } from 'node:timers/promises'
import type { ChildProcess } from 'node:child_process'
import type { LaunchOptions } from '@xmcl/runtime-api'
import { LaunchException, LockKey } from '@xmcl/runtime-api'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), server: vi.fn(), watcher: vi.fn(), history: vi.fn(), command: vi.fn() }))
vi.mock('child_process', async original => ({ ...await original<typeof import('node:child_process')>(), spawn: mocks.command }))
vi.mock('@xmcl/core', async original => ({ ...await original<typeof import('@xmcl/core')>(), launch: mocks.launch, launchServer: mocks.server, createMinecraftProcessWatcher: mocks.watcher }))
vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/encoding', () => ({ kEncodingWorker: Symbol('encoding') }))
vi.mock('~/user', () => ({ kUserTokenStorage: Symbol('tokens') }))
vi.mock('~/user/YggdrasilSeriveRegistry', () => ({ kYggdrasilSeriveRegistry: Symbol('auth') }))
vi.mock('~/constant', () => ({ IS_DEV: false }))
vi.mock('~/service', async () => {
  const { EventEmitter } = await import('node:events')
  return { ExposeServiceKey: () => () => {}, AbstractService: class extends EventEmitter {
    constructor(public app: any) { super() }
    get mutex() { return this.app.mutex }
    getAppDataPath() { return 'fixture-history' }
    log() {} warn() {} error() {}
  } }
})
vi.mock('create-desktop-shortcuts', () => ({ default: () => true }))
vi.mock('create-desktop-shortcuts/src/windows.vbs', () => ({ default: '' }))
vi.mock('./VersionService', () => ({ VersionService: class {} }))
vi.mock('./LaunchHistoryStore', () => ({ LaunchHistoryStore: class { begin = mocks.history; markReady = async () => {}; complete = async () => {} } }))
vi.mock('../infra/telemetry_context', () => ({ runWithInternalSpan: (_name: string, work: () => unknown) => work() }))
vi.mock('../instance/instanceCopy', () => ({ assertInstanceCopyComplete: async () => {} }))
vi.mock('fs-extra', async original => {
  const actual = await original<typeof import('fs-extra')>()
  return { ...actual, access: async () => {}, stat: async () => { throw Object.assign(new Error('No fixture logs'), { code: 'ENOENT' }) } }
})
const { LaunchService } = await import('./LaunchService')
let service: InstanceType<typeof LaunchService>, locks: Map<string, Mutex>, child: ChildProcess, watcher: EventEmitter
const path = 'fixture-instance', key = 'resource-pack-options'
const options = (side: 'client' | 'server' = 'server'): LaunchOptions => ({ version: 'fixture', gameDirectory: path, side, java: 'fixture-java', user: { id: 'local', username: 'Local', selectedProfile: 'profile', profiles: { profile: { id: 'profile', name: 'Local' } } } as any })
beforeEach(() => {
  vi.stubEnv('XMCL_E2E_NO_LAUNCH', ''); vi.clearAllMocks()
  locks = new Map(); const of = (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! }
  child = Object.assign(new EventEmitter(), { pid: 12345, stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), unref: vi.fn(), kill: vi.fn() }) as unknown as ChildProcess
  watcher = new EventEmitter(); mocks.watcher.mockReturnValue(watcher); mocks.launch.mockResolvedValue(child); mocks.server.mockResolvedValue(child); mocks.history.mockResolvedValue(undefined)
  const version = { id: 'fixture', minecraftVersion: '1.21.1', mainClass: 'Fixture', libraries: [], arguments: { jvm: [], game: [] } }
  service = new LaunchService({ mutex: { of }, platform: { os: 'windows', osRelease: 'fixture' }, version: 'fixture' } as any, () => 'fixture-root', { get: async () => undefined } as any, {} as any, { resolveLocalVersion: async () => ({ ...version, inheritances: ['1.21.1'] }), resolveServerVersion: async () => version } as any)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })
const lock = (name: string) => { if (!locks.has(name)) locks.set(name, new Mutex()); return locks.get(name)! }

it.each(['client', 'server'] as const)('waits for a pack mutation before %s middleware and spawn', async side => {
  const release = await lock(key).acquire(), middleware = vi.fn(async () => {})
  service.registerMiddleware({ name: 'resource-read', onBeforeLaunch: middleware })
  const pending = service.launch(options(side))
  try {
    await setImmediate()
    expect(middleware.mock.calls.length).toBe(0); expect(mocks.launch.mock.calls.length).toBe(0); expect(mocks.server.mock.calls.length).toBe(0)
  } finally { release() }
  expect(await pending).toBe(12345); expect(middleware).toHaveBeenCalledOnce()
})
it('keeps both locks through the spawn-registration gap, then releases before slow history I/O', async () => {
  const spawning = Promise.withResolvers<ChildProcess>(), entered = Promise.withResolvers<void>(), history = Promise.withResolvers<void>()
  mocks.server.mockImplementation(() => { entered.resolve(); return spawning.promise }); mocks.history.mockReturnValue(history.promise)
  const pending = service.launch(options()); await entered.promise
  expect(lock(key).isLocked()).toBe(true); expect(lock(LockKey.instance(path)).isLocked()).toBe(true)
  let seen = -1
  const mutation = lock(key).runExclusive(async () => { seen = (await service.getGameProcesses()).length })
  await setImmediate(); expect(seen).toBe(-1)
  spawning.resolve(child); await mutation
  expect(seen).toBe(1); expect(lock(LockKey.instance(path)).isLocked()).toBe(false)
  history.resolve(); expect(await pending).toBe(12345)
})
it.each(['middleware', 'spawn'] as const)('releases both locks when %s fails so a later launch can proceed', async phase => {
  const middleware = vi.fn(async () => {})
  service.registerMiddleware({ name: 'failing', onBeforeLaunch: middleware })
  if (phase === 'spawn') mocks.server.mockRejectedValueOnce(new Error('fixture failure'))
  else middleware.mockRejectedValueOnce(new LaunchException({ type: 'launchNoProperJava', javaPath: 'fixture' }))
  await expect(service.launch(options())).rejects.toThrow()
  expect(lock(key).isLocked()).toBe(false); expect(lock(LockKey.instance(path)).isLocked()).toBe(false)
  expect(await service.launch(options())).toBe(12345)
})
it('keeps a stopping game visible to mutation guards until the actual exit event', async () => {
  const pid = await service.launch(options()); watcher.emit('minecraft-window-ready')
  await service.kill(pid)
  expect((await service.getGameProcesses()).map(process => process.pid)).toEqual([pid])
  watcher.emit('minecraft-exit', { code: 0 })
  expect(await service.getGameProcesses()).toEqual([])
})
it('runs user pre-commands before taking the non-reentrant pack and instance locks', async () => {
  const release = await lock(key).acquire(), pre = new EventEmitter(), entered = Promise.withResolvers<void>()
  mocks.command.mockImplementation(() => { entered.resolve(); return pre })
  const pending = service.launch({ ...options(), preExecuteCommand: 'fixture command' })
  await entered.promise; expect(lock(LockKey.instance(path)).isLocked()).toBe(false)
  pre.emit('exit', 0); await setImmediate(); expect(mocks.server).not.toHaveBeenCalled()
  release(); expect(await pending).toBe(12345)
})
it('allows Java/version middleware to use its own locks without acquiring the resource lock again', async () => {
  service.registerMiddleware({ name: 'java-install-lock-fixture', onBeforeLaunch: () => lock('java-install-fixture').runExclusive(() => lock(LockKey.instanceVersion(path)).runExclusive(async () => {})) })
  expect(await service.launch(options())).toBe(12345)
})
it('does not send duplicate graceful stop commands while waiting for exit', async () => {
  const pid = await service.launch(options()), write = vi.spyOn(child.stdin!, 'write')
  watcher.emit('minecraft-window-ready')
  await service.kill(pid); await service.kill(pid)
  expect(write).toHaveBeenCalledTimes(1)
})
it.each(['client', 'server'] as const)('does not log the full %s environment or user arguments', async side => {
  const log = vi.spyOn(service as any, 'log')
  await service.launch({ ...options(side), env: { GRIMO_FIXTURE_SECRET: 'NEVER_LOG_FIXTURE_ENV' }, vmOptions: ['-Dfixture=NEVER_LOG_FIXTURE_ARG'] })
  const output = JSON.stringify(log.mock.calls)
  expect(output.includes('NEVER_LOG_FIXTURE_ENV')).toBe(false)
  expect(output.includes('NEVER_LOG_FIXTURE_ARG')).toBe(false)
})
it('allows another stop request after sending the first signal throws', async () => {
  const pid = await service.launch(options('client'))
  vi.mocked(child.kill).mockImplementationOnce(() => { throw new Error('Signal fixture failure') })
  await expect(service.kill(pid)).rejects.toThrow('Signal fixture failure')
  await service.kill(pid)
  expect(vi.mocked(child.kill).mock.calls.length).toBe(2)
  expect((await service.getGameProcesses()).length).toBe(1)
})
