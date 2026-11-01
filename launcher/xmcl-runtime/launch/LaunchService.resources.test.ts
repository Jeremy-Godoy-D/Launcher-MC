import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { EventEmitter, once } from 'node:events'
import { PassThrough } from 'node:stream'
import { setImmediate } from 'node:timers/promises'
import type { ChildProcess } from 'node:child_process'
import type { LaunchOptions } from '@xmcl/runtime-api'
import { LaunchException, LockKey } from '@xmcl/runtime-api'

const mocks = vi.hoisted(() => ({ launch: vi.fn(), server: vi.fn(), watcher: vi.fn(), history: vi.fn(), complete: vi.fn(), ready: vi.fn(), command: vi.fn() }))
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
vi.mock('./LaunchHistoryStore', () => ({ LaunchHistoryStore: class { begin = mocks.history; markReady = mocks.ready; complete = mocks.complete } }))
vi.mock('../infra/telemetry_context', () => ({ runWithInternalSpan: (_name: string, work: () => unknown) => work() }))
vi.mock('../instance/instanceCopy', () => ({ assertInstanceCopyComplete: async () => {} }))
vi.mock('fs-extra', async original => {
  const actual = await original<typeof import('fs-extra')>()
  return { ...actual, access: async () => {}, stat: async () => { throw Object.assign(new Error('No fixture logs'), { code: 'ENOENT' }) } }
})
const { LaunchService } = await import('./LaunchService')
let service: InstanceType<typeof LaunchService>, locks: Map<string, Mutex>, child: ChildProcess, watcher: EventEmitter
let extraChildren: ChildProcess[]
const path = 'fixture-instance', key = 'resource-pack-options'
const options = (side: 'client' | 'server' = 'server'): LaunchOptions => ({ version: 'fixture', gameDirectory: path, side, java: 'fixture-java', user: { id: 'local', username: 'Local', selectedProfile: 'profile', profiles: { profile: { id: 'profile', name: 'Local' } } } as any })
beforeEach(() => {
  vi.stubEnv('XMCL_E2E_NO_LAUNCH', ''); vi.clearAllMocks(); extraChildren = []
  locks = new Map(); const of = (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! }
  child = Object.assign(new EventEmitter(), { pid: 12345, stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), unref: vi.fn(), kill: vi.fn() }) as unknown as ChildProcess
  watcher = new EventEmitter(); mocks.watcher.mockReturnValue(watcher); mocks.launch.mockResolvedValue(child); mocks.server.mockResolvedValue(child); mocks.history.mockResolvedValue(undefined); mocks.complete.mockResolvedValue(undefined); mocks.ready.mockResolvedValue(undefined)
  const version = { id: 'fixture', minecraftVersion: '1.21.1', mainClass: 'Fixture', libraries: [], arguments: { jvm: [], game: [] } }
  service = new LaunchService({ mutex: { of }, platform: { os: 'windows', osRelease: 'fixture' }, version: 'fixture' } as any, () => 'fixture-root', { get: async () => undefined } as any, { guessEncodingByBuffer: async () => 'windows1252' } as any, { resolveLocalVersion: async () => ({ ...version, inheritances: ['1.21.1'] }), resolveServerVersion: async () => version } as any)
})
afterEach(async () => {
  for (const process of [child, ...extraChildren]) for (const stream of [process.stdout, process.stderr]) if (stream instanceof PassThrough) stream.end()
  await setImmediate(); vi.unstubAllEnvs(); vi.restoreAllMocks()
})
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
it.each(['client', 'server'] as const)('refuses a stale launch identity before graceful or forced %s termination', async side => {
  const pid = await service.launch(options(side)), current = (await service.getGameProcess(pid))!
  watcher.emit('minecraft-window-ready')
  const write = vi.spyOn(child.stdin!, 'write')
  await service.kill(pid, false, 'old-launch'); await service.kill(pid, true, 'old-launch')
  expect(child.kill).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(mocks.command).not.toHaveBeenCalled()
  await service.kill(pid, false, current.launchId)
  if (side === 'client') expect(child.kill).toHaveBeenCalledOnce()
  else expect(write).toHaveBeenCalledWith('/stop\n')
})
it.each(['client', 'server'] as const)('does not log the full %s environment or user arguments', async side => {
  const log = vi.spyOn(service as any, 'log')
  await service.launch({ ...options(side), env: { GRIMO_FIXTURE_SECRET: 'NEVER_LOG_FIXTURE_ENV' }, vmOptions: ['-Dfixture=NEVER_LOG_FIXTURE_ARG'] })
  const output = JSON.stringify(log.mock.calls)
  expect(output.includes('NEVER_LOG_FIXTURE_ENV')).toBe(false)
  expect(output.includes('NEVER_LOG_FIXTURE_ARG')).toBe(false)
})
it.each(['client', 'server'] as const)('preserves exact %s argument boundaries, quotes and empty values', async side => {
  const vmOptions = ['-Dpath=C:\\Games with spaces\\Java', '-Dquoted="literal value"', ''], mcOptions = ['--server', 'host with spaces', '', '"quoted"']
  await service.launch({ ...options(side), vmOptions, mcOptions })
  const actual = (side === 'client' ? mocks.launch : mocks.server).mock.calls[0][0]
  expect(actual.extraJVMArgs).toEqual(vmOptions); expect(actual.extraMCArgs).toEqual(mcOptions)
  expect(actual.extraJVMArgs).not.toBe(vmOptions); expect(actual.extraMCArgs).not.toBe(mcOptions)
})
it('allows another stop request after sending the first signal throws', async () => {
  const pid = await service.launch(options('client'))
  vi.mocked(child.kill).mockImplementationOnce(() => { throw new Error('Signal fixture failure') })
  await expect(service.kill(pid)).rejects.toThrow('Signal fixture failure')
  await service.kill(pid)
  expect(vi.mocked(child.kill).mock.calls.length).toBe(2)
  expect((await service.getGameProcesses()).length).toBe(1)
})

it('subscribes before slow history and preserves both decoded pipes and authoritative launch identity', async () => {
  let now = 100
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  const core = await vi.importActual<typeof import('@xmcl/core')>('@xmcl/core')
  mocks.watcher.mockImplementationOnce(core.createMinecraftProcessWatcher)
  const history = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>()
  mocks.history.mockImplementation(() => { entered.resolve(); return history.promise })
  const events: any[] = []
  for (const name of ['minecraft-start', 'minecraft-stdout', 'minecraft-stderr', 'minecraft-exit']) service.on(name, event => events.push({ name, ...event }))
  const ended = once(service, 'minecraft-exit')
  const pending = service.launch({ ...options(), pid: 999, launchId: 'spoofed-id' } as any)
  try {
    await entered.promise
    expect(events[0]).toMatchObject({ name: 'minecraft-start', pid: 12345 })
    expect(events[0].launchId).not.toBe('spoofed-id')
    const bytes = Buffer.from('ASCII café 漢字 😀\n')
    for (const byte of bytes) (child.stdout as PassThrough).write(Buffer.from([byte]))
    ;(child.stderr as PassThrough).write(Buffer.from('error caf')); (child.stderr as PassThrough).end(Buffer.from([0xe9, 10]))
    now = 200; child.emit('exit', 0, null); (child.stdout as PassThrough).end()
    expect(await service.getGameProcesses()).toEqual([])
    await setImmediate()
    expect(events.some(event => event.name === 'minecraft-exit')).toBe(false)
    now = 500
  } finally { history.resolve() }
  expect(await pending).toBe(12345)
  const [exit] = await ended
  expect(events.filter(event => event.name === 'minecraft-stdout').map(event => event.stdout).join('')).toBe('ASCII café 漢字 😀\n')
  expect(events.filter(event => event.name === 'minecraft-stderr').map(event => event.stderr).join('')).toBe('error café\n')
  const output = events.filter(event => event.sequence !== undefined)
  expect(output.map(event => event.sequence)).toEqual(output.map((_, index) => index + 1))
  for (const event of output) expect(event).toMatchObject({ pid: 12345, launchId: events[0].launchId, gameDirectory: path, side: 'server' })
  expect(exit).toMatchObject({ pid: 12345, launchId: events[0].launchId, code: 0, errorLog: 'error café\n', stdLog: 'ASCII café 漢字 😀\n' })
  expect(exit.signal).toBeUndefined(); expect(events.at(-1).name).toBe('minecraft-exit'); expect(mocks.complete).toHaveBeenCalledOnce()
  expect(exit.duration).toBe(100); expect(mocks.complete.mock.calls[0][2].endedAt).toBe(200)
})
it('captures a Unicode crash location arriving after the process exit notification', async () => {
  const core = await vi.importActual<typeof import('@xmcl/core')>('@xmcl/core'); mocks.watcher.mockImplementationOnce(core.createMinecraftProcessWatcher)
  await service.launch(options())
  const ended = once(service, 'minecraft-exit')
  child.emit('exit', 1, null)
  const bytes = Buffer.from('---- Minecraft Crash Report ----\nCrash report saved to: #@!@# C:/Mundos/café-😀.txt\n')
  for (const byte of bytes) (child.stdout as PassThrough).write(Buffer.from([byte]))
  ;(child.stdout as PassThrough).end(); (child.stderr as PassThrough).end()
  const [event] = await ended
  expect(event.crashReportLocation).toBe('C:/Mundos/café-😀.txt')
  expect(mocks.complete.mock.calls[0][2]).toMatchObject({ crashReportPath: 'C:/Mundos/café-😀.txt', crashed: true })
})
it('keeps all captured summaries finite when pipes produce megabytes of output', async () => {
  const core = await vi.importActual<typeof import('@xmcl/core')>('@xmcl/core'); mocks.watcher.mockImplementationOnce(core.createMinecraftProcessWatcher)
  await service.launch(options()); const ended = once(service, 'minecraft-exit')
  ;(child.stdout as PassThrough).end(Buffer.alloc(3 * 1024 * 1024, 0x61)); (child.stderr as PassThrough).end(Buffer.alloc(3 * 1024 * 1024, 0x62)); child.emit('exit', 1, null)
  const [event] = await ended
  for (const text of [event.errorLog, event.stdLog, mocks.complete.mock.calls[0][2].launcherOutput]) { expect(text.length).toBeLessThanOrEqual(1024 * 1024); expect(text).toMatch(/^\[earlier output truncated\]\n/) }
})
it('does not remove a newer process with a reused PID when the older pipe finally closes', async () => {
  const core = await vi.importActual<typeof import('@xmcl/core')>('@xmcl/core'); mocks.watcher.mockImplementation(core.createMinecraftProcessWatcher)
  await service.launch(options()); const first = (await service.getGameProcesses())[0]
  child.emit('exit', 0, null)
  const second = Object.assign(new EventEmitter(), { pid: 12345, stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), unref: vi.fn(), kill: vi.fn() }) as unknown as ChildProcess
  extraChildren.push(second); mocks.server.mockResolvedValueOnce(second)
  await service.launch(options()); const current = (await service.getGameProcesses())[0]
  expect(current.launchId).not.toBe(first.launchId)
  const ended = once(service, 'minecraft-exit')
  ;(child.stdout as PassThrough).end(); (child.stderr as PassThrough).end()
  expect((await ended)[0].launchId).toBe(first.launchId)
  expect((await service.getGameProcesses())[0].launchId).toBe(current.launchId)
  const secondEnd = once(service, 'minecraft-exit')
  ;(second.stdout as PassThrough).end(); (second.stderr as PassThrough).end(); second.emit('exit', 0, null)
  await secondEnd; expect(await service.getGameProcesses()).toEqual([])
})

it('decodes a real owned Node child through the Native launch lifecycle and drains both OS pipes', async () => {
  const core = await vi.importActual<typeof import('@xmcl/core')>('@xmcl/core')
  const { spawn } = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  mocks.watcher.mockImplementationOnce(core.createMinecraftProcessWatcher)
  const script = "(async()=>{const wait=()=>new Promise(r=>setTimeout(r,2));process.stdout.write('start\\n');for(const b of Buffer.from('café 漢字 😀\\n')){process.stdout.write(Buffer.from([b]));await wait()}process.stderr.write('error caf');process.stderr.write(Buffer.from([0xe9]));await wait();process.stderr.write('\\n');process.exitCode=1})()"
  const process = spawn(globalThis.process.execPath, ['-e', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  extraChildren.push(process); mocks.server.mockResolvedValueOnce(process)
  const closed = once(process, 'close'), ended = once(service, 'minecraft-exit'), output: any[] = []
  for (const channel of ['minecraft-stdout', 'minecraft-stderr']) service.on(channel, event => output.push({ channel, ...event }))
  try {
    expect(await service.launch(options())).toBe(process.pid)
    const [event] = await ended
    expect(output.filter(value => value.channel === 'minecraft-stdout').map(value => value.stdout).join('')).toBe('start\ncafé 漢字 😀\n')
    expect(output.filter(value => value.channel === 'minecraft-stderr').map(value => value.stderr).join('')).toBe('error café\n')
    expect(output.map(value => value.sequence)).toEqual(output.map((_, index) => index + 1))
    for (const value of output) expect(value).toMatchObject({ pid: process.pid, launchId: event.launchId, gameDirectory: path, side: 'server' })
    expect(event).toMatchObject({ code: 1, stdLog: 'start\ncafé 漢字 😀\n', errorLog: 'error café\n' })
    expect(event.signal).toBeUndefined(); expect(mocks.complete).toHaveBeenCalledOnce()
  } finally {
    if (process.exitCode === null && process.signalCode === null) process.kill()
    await closed
  }
})
