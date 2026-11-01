import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { RendererClient } from '@launcher/renderer-client'
import { InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'
import { UserState } from '@xmcl/runtime-api/src/services/UserService'
import { InstanceInstallStatus } from '@xmcl/runtime-api/src/services/InstanceInstallService'
import { JavaState } from '@xmcl/runtime-api/src/services/JavaService'
import { LocalVersions } from '@xmcl/runtime-api/src/entities/version'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { Settings } from '@xmcl/runtime-api/src/entities/setting'
import { InstanceSchema } from '../../../../packages/instance/instance'
import { LaunchStore } from './store'
import { readState } from './read'
import { instanceSettingsEdit, instanceSettingsSnapshot } from '@xmcl/runtime-api/src/util/instanceSettings'
import { createInstanceSettingsDraft, instanceSettingsChanges, type InstanceSettingsForm } from '../instance/settingsDraft'

function shared<T extends object>(model: T, id: string) {
  const events = new EventEmitter()
  const raw = Object.assign(model, {
    id,
    subscribe: (event: string, listener: (...args: any[]) => void) => {
      events.on(event, listener)
      return raw
    },
    unsubscribe: (event: string, listener: (...args: any[]) => void) => {
      events.off(event, listener)
      return raw
    },
    subscribeAll: (listener: (...args: any[]) => void) => {
      events.on('*', listener)
      return raw
    },
    unsubscribeAll: (listener: (...args: any[]) => void) => {
      events.off('*', listener)
      return raw
    },
    unref: vi.fn(),
    revalidate: vi.fn(async () => {
      if (model instanceof InstanceInstallStatus) {
        events.emit('*', 'pendingFileCountSet', model.pendingFileCount)
        events.emit('*', 'unresolvedFilesSet', model.unresolvedFiles)
      }
    }),
  })
  return {
    raw,
    events,
    mutate(method: string, value: unknown) {
      ;(model as any)[method](value)
      events.emit('*', method, value)
    },
  }
}
const settle = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve()
}
function fixture(startup?: () => Promise<any[]>) {
  const path = '/qa/First'
  const instance = {
    ...InstanceSchema.parse({
      name: 'First',
      runtime: { minecraft: '1.20.4' },
      version: '1.20.4',
      env: { local: 'yes' },
    }),
    path,
  }
  const instances = shared(new InstanceState(), 'instances')
  instances.raw.instanceAdd(instance)
  const users = shared(new UserState(), 'users')
  const user = {
    id: 'OFFLINE',
    username: 'OFFLINE',
    authority: 'x://dev',
    selectedProfile: 'p1',
    profiles: {
      p1: { id: 'p1', name: 'PlayerOne', textures: {} },
      p2: { id: 'p2', name: 'PlayerTwo', textures: {} },
    },
    invalidated: false,
    expiredAt: 0,
  }
  users.raw.users = { OFFLINE: user as any }
  const java = shared(new JavaState(), 'java')
  java.raw.all = [{ path: '/java', version: '17', majorVersion: 17, valid: true }]
  const local = shared(new LocalVersions(), 'local')
  local.raw.local = [{ id: '1.20.4', minecraft: '1.20.4', inheritances: [] } as any]
  const settings = shared(new Settings(), 'settings')
  Object.assign(settings.raw, {
    globalDisableAuthlibInjector: true,
    globalAssignMemory: true,
    globalMinMemory: 1024,
    globalMaxMemory: 4096,
    globalResolution: { width: 1280, height: 720 },
    globalEnv: { global: 'yes' },
  })
  const pending = shared(new InstanceInstallStatus(), 'pending')
  const mods = shared(new ResourceState(), 'mods')
  const events = new Map<string, EventEmitter>()
  const processes = new Map<number, any>()
  let manifest: any
  const call = vi.fn(async (service: string, method: string, ...args: any[]): Promise<any> => {
    const key = `${service}.${method}`
    switch (key) {
      case 'InstanceService.getSharedInstancesState':
        return instances.raw
      case 'InstanceService.validateInstancePath':
        return undefined
      case 'InstanceService.getInstanceCopyState':
        return instances.raw.pendingCopies[args[0]]
      case 'InstanceService.editInstance':
        instances.mutate('instanceEdit', { ...args[0], path: args[0].instancePath })
        return
      case 'UserService.getUserState':
        return users.raw
      case 'UserService.refreshUser':
        return user
      case 'JavaService.getJavaState':
        return java.raw
      case 'JavaService.resolveJava':
        return java.raw.all.find((java) => java.path === args[0])
      case 'BaseService.getSettings':
        return settings.raw
      case 'BaseService.getMemoryStatus':
        return { total: 16 * 1024 ** 3, free: 8 * 1024 ** 3 }
      case 'VersionService.getLocalVersions':
        return local.raw
      case 'VersionService.resolveLocalVersion':
        return {
          id: '1.20.4',
          minecraftVersion: '1.20.4',
          javaVersion: { majorVersion: 17, component: 'java-runtime-gamma' },
        }
      case 'VersionInstallService.diagnose':
        return undefined
      case 'VersionInstallService.installInstance':
        return { version: '1.20.4' }
      case 'VersionInstallService.install':
        java.raw.all = [{ path: '/java', version: '17', majorVersion: 17, valid: true }]
        return java.raw.all[0]
      case 'InstanceInstallService.watchInstanceInstall':
        return pending.raw
      case 'InstanceInstallService.getInstanceInstallManifest':
        return manifest
      case 'InstanceInstallService.resumeInstanceInstall':
        return undefined
      case 'InstanceInstallService.applyInstanceInstallManifest':
        manifest = undefined
        pending.raw.pendingFileCount = 0
        return
      case 'InstanceModsService.watch':
        return mods.raw
      case 'LaunchService.getGameProcesses':
        return startup ? startup() : [...processes.values()]
      case 'LaunchService.getGameProcess':
        return processes.get(args[0])
      case 'LaunchService.launch':
        processes.set(4242, { pid: 4242, launchId: 'fixture-launch', options: args[0] })
        events.get('LaunchService')?.emit('minecraft-start', { ...args[0], pid: 4242, launchId: 'fixture-launch' })
        return 4242
      case 'LaunchService.kill':
        if (!args[2] || processes.get(args[0])?.launchId === args[2]) {
          const process = processes.get(args[0])
          processes.delete(args[0])
          events.get('LaunchService')?.emit('minecraft-exit', { pid: args[0], launchId: process?.launchId, ...process?.options })
        }
        return
      default:
        throw new Error(`Unexpected ${key}`)
    }
  })
  const client = new RendererClient({
    open(key: string) {
      const event = events.get(key) ?? new EventEmitter()
      events.set(key, event)
      return {
        key,
        on: (name: string, listener: (...args: any[]) => void) => event.on(name, listener),
        once: (name: string, listener: (...args: any[]) => void) => event.once(name, listener),
        removeListener: (name: string, listener: (...args: any[]) => void) =>
          event.off(name, listener),
        call: (method: string, ...args: any[]) => call(key, method, ...args),
      } as any
    },
  } as any)
  const flow = new LaunchStore(client)
  const stop = flow.subscribe(() => {})
  const profile = { userId: 'OFFLINE', profileId: 'p1', name: 'PlayerOne' }
  const ready = async () => {
    flow.open(path, 'First', profile)
    await vi.waitFor(() => expect(flow.getSnapshot().phase).toBe('ready'))
  }
  const dispose = async () => {
    stop()
    flow.dispose()
    client.dispose()
    await settle()
  }
  return {
    flow,
    client,
    ready,
    dispose,
    call,
    instances,
    users,
    user,
    java,
    local,
    settings,
    pending,
    events,
    path,
    profile,
    setManifest: (value: unknown) => {
      manifest = value
    },
  }
}

describe('Java launch flow', () => {
  it.each([
    { label: 'inherit every override', values: { java: '', assignMemory: null, minMemory: '', maxMemory: '', vmOptions: null, mcOptions: null, fastLaunch: null, hideLauncher: null, showLog: null }, inheritResolution: true, expected: { java: '/global-java', minMemory: 1536, maxMemory: 5120, vmOptions: ['-Dglobal=two words'], mcOptions: ['--global value'], hideLauncher: true, showLog: true, skipAssetsCheck: true, resolution: { width: 1500, height: 850, fullscreen: true, monitor: 'global-monitor' } } },
    { label: 'explicit false and empty arrays override globals', values: { assignMemory: false, vmOptions: [], mcOptions: [] }, expected: { java: '/own-java', minMemory: undefined, maxMemory: undefined, vmOptions: [], mcOptions: [], hideLauncher: false, showLog: false, skipAssetsCheck: false } },
    { label: 'automatic allocation ignores saved manual bounds', values: { assignMemory: 'auto' }, expected: { minMemory: 1024, maxMemory: undefined } },
    { label: 'minimum inherits separately', values: { assignMemory: true, minMemory: '', maxMemory: '3072' }, expected: { minMemory: 1536, maxMemory: 3072 } },
    { label: 'maximum inherits separately', values: { assignMemory: true, minMemory: '2048', maxMemory: '' }, expected: { minMemory: 2048, maxMemory: 5120 } },
    { label: 'explicit zero limits do not inherit', values: { assignMemory: true, minMemory: '0', maxMemory: '0' }, expected: { minMemory: undefined, maxMemory: undefined } },
    { label: 'inherited disabled allocation ignores saved bounds', values: { assignMemory: null }, globalAssignMemory: false, expected: { minMemory: undefined, maxMemory: undefined } },
    { label: 'inherited automatic allocation ignores saved bounds', values: { assignMemory: null }, globalAssignMemory: 'auto', expected: { minMemory: 1024, maxMemory: undefined } },
  ] as { label: string; values: Partial<InstanceSettingsForm>; inheritResolution?: boolean; globalAssignMemory?: boolean | 'auto'; expected: Record<string, unknown> }[])('resolves saved settings through the launch coordinator: $label', async ({ values, inheritResolution, globalAssignMemory = true, expected }) => {
    const f = fixture()
    try {
      f.instances.mutate('instanceEdit', { path: f.path, java: '/own-java', assignMemory: true, minMemory: 768, maxMemory: 6144, vmOptions: ['-Down=two words', ''], mcOptions: ['--own value'], resolution: { width: 960, height: 540, monitor: 'own-monitor' }, fastLaunch: false, hideLauncher: false, showLog: false })
      const draft = createInstanceSettingsDraft(instanceSettingsSnapshot(f.instances.raw.all[f.path]))
      Object.assign(draft.values, values)
      if (inheritResolution) draft.values.resolution.enabled = false
      f.instances.mutate('instanceEdit', { path: f.path, ...instanceSettingsEdit(instanceSettingsChanges(draft)) })
      f.java.raw.all = ['/own-java', '/global-java'].map(path => ({ path, version: '17', majorVersion: 17, valid: true }))
      await f.ready()
      // The global values change after inspection, before the user's launch confirmation.
      f.settings.mutate('globalInstanceSetting', { ...f.settings.raw, globalJava: '/global-java', globalAssignMemory, globalMinMemory: 1536, globalMaxMemory: 5120, globalVmOptions: ['-Dglobal=two words'], globalMcOptions: ['--global value'], globalHideLauncher: true, globalShowLog: true, globalFastLaunch: true, globalResolution: { width: 1500, height: 850, fullscreen: true, monitor: 'global-monitor' } })
      await f.flow.run()
      const launches = f.call.mock.calls.filter(([key, method]) => key === 'LaunchService' && method === 'launch')
      expect(launches).toHaveLength(1)
      for (const [key, value] of Object.entries(expected)) expect(Reflect.get(launches[0][2], key)).toEqual(value)
      expect(f.flow.getSnapshot().phase).toBe('running')
      if (!Object.hasOwn(values, 'vmOptions')) expect(launches[0][2].vmOptions).toEqual(['-Down=two words', ''])
      expect(f.settings.raw.globalVmOptions).toEqual(['-Dglobal=two words'])
      if (!inheritResolution) expect(launches[0][2].resolution).toEqual({ width: 960, height: 540, monitor: 'own-monitor' })
    } finally { await f.dispose() }
  })
  it('blocks a resolved inherited maximum below the saved minimum without losing either setting', async () => {
    const f = fixture()
    try {
      f.instances.mutate('instanceEdit', { path: f.path, assignMemory: true, minMemory: 8192, maxMemory: null })
      await f.ready(); await f.flow.run()
      expect(f.flow.getSnapshot().reason).toBe('memory')
      expect(f.call.mock.calls.some(([key, method]) => key === 'LaunchService' && method === 'launch')).toBe(false)
      expect(f.instances.raw.all[f.path].minMemory).toBe(8192); expect(f.instances.raw.all[f.path].maxMemory).toBeUndefined()
      expect(f.settings.raw.globalMaxMemory).toBe(4096)
    } finally { await f.dispose() }
  })
  it('blocks incomplete copies before installing files, Java or starting a process', async () => {
    const f = fixture()
    try {
      f.instances.raw.instanceCopyState({ path: f.path, copy: { sourcePath: '/qa/Source', totalFiles: 3 } })
      f.flow.open(f.path, 'First', f.profile)
      await vi.waitFor(() => expect(f.flow.getSnapshot()).toMatchObject({ phase: 'blocked', reason: 'copy' }))
      expect(f.call.mock.calls.some(([service, method]) => method === 'launch' || service === 'InstanceInstallService' && method === 'applyInstanceInstallManifest' || service === 'VersionInstallService' && method === 'installInstance')).toBe(false)
    } finally { await f.dispose() }
  })
  it('works without randomUUID on the packaged HTTP origin and does not resurrect an immediate exit', async () => {
    const f = fixture()
    vi.stubGlobal('crypto', undefined)
    try {
      await f.ready()
      const original = f.call.getMockImplementation()!
      f.call.mockImplementation(async (service, method, ...args) => {
        if (service === 'LaunchService' && method === 'launch') {
          expect(args[0].operationId).toMatch(/^op-/)
          f.events
            .get(service)
            ?.emit('minecraft-start', { pid: 4242, launchId: 'short', gameDirectory: f.path })
          f.events.get(service)?.emit('minecraft-exit', { pid: 4242, launchId: 'short', gameDirectory: f.path })
          return 4242
        }
        return original(service, method, ...args)
      })
      await f.flow.run()
      expect(f.flow.getSnapshot().running).toEqual([])
      expect(f.flow.getSnapshot().phase).toBe('idle')
    } finally {
      vi.unstubAllGlobals()
      await f.dispose()
    }
  })
  it('never launches while inspecting, inherits settings and launches once on repeated confirmation', async () => {
    const f = fixture()
    await f.ready()
    expect(
      f.call.mock.calls.some(([key, method]) => key === 'LaunchService' && method === 'launch'),
    ).toBe(false)
    const first = f.flow.run()
    expect(f.flow.run()).toBe(first)
    await first
    const calls = f.call.mock.calls.filter(
      ([key, method]) => key === 'LaunchService' && method === 'launch',
    )
    expect(calls).toHaveLength(1)
    expect(calls[0][2]).toMatchObject({
      gameDirectory: f.path,
      version: '1.20.4',
      java: '/java',
      user: { selectedProfile: 'p1' },
      minMemory: 1024,
      maxMemory: 4096,
      resolution: { width: 1280, height: 720 },
      env: { local: 'yes', global: 'yes' },
    })
    expect(f.flow.getSnapshot().running[0].pid).toBe(4242)
    await f.flow.stop(4242)
    expect(f.flow.getSnapshot().running).toEqual([])
    await f.dispose()
  })
  it('blocks absent profiles, missing directories and invalid version identifiers before installation', async () => {
    for (const reason of ['profile', 'path', 'version']) {
      const f = fixture()
      if (reason === 'profile') f.user.profiles = {} as any
      if (reason === 'path') {
        const original = f.call.getMockImplementation()!
        f.call.mockImplementation((service, method, ...args) =>
          service === 'InstanceService' && method === 'validateInstancePath'
            ? Promise.resolve('bad')
            : original(service, method, ...args),
        )
      }
      if (reason === 'version')
        f.instances.mutate('instanceEdit', { path: f.path, runtime: { minecraft: '../outside' } })
      f.flow.open(f.path, 'First', f.profile)
      await vi.waitFor(() => expect(f.flow.getSnapshot().reason).toBe(reason))
      expect(
        f.call.mock.calls.some(
          ([key, method]) => key === 'VersionInstallService' && method === 'installInstance',
        ),
      ).toBe(false)
      await f.dispose()
    }
  })
  it('keeps the captured profile and refuses changed instance execution settings', async () => {
    const f = fixture()
    await f.ready()
    f.user.selectedProfile = 'p2'
    await f.flow.run()
    const launch = f.call.mock.calls.find(
      ([key, method]) => key === 'LaunchService' && method === 'launch',
    )
    expect(launch?.[2].user.selectedProfile).toBe('p1')
    await f.flow.stop(4242)
    await f.ready()
    f.instances.mutate('instanceEdit', { path: f.path, vmOptions: ['-Dchanged=true'] })
    const before = f.call.mock.calls.filter(
      ([key, method]) => key === 'LaunchService' && method === 'launch',
    ).length
    await f.flow.run()
    expect(f.flow.getSnapshot().reason).toBe('changed')
    expect(
      f.call.mock.calls.filter(([key, method]) => key === 'LaunchService' && method === 'launch'),
    ).toHaveLength(before)
    await f.dispose()
  })
  it('resumes and applies a staged manifest before version preparation; unresolved files block launch', async () => {
    const f = fixture()
    f.setManifest({ files: [{ path: 'config/qa.txt' }] })
    await f.ready()
    expect(f.flow.getSnapshot().needsInstall).toBe(true)
    f.pending.raw.unresolvedFiles = [{ path: 'mods/missing.jar', hashes: {} }]
    await f.flow.run()
    expect(f.flow.getSnapshot().reason).toBe('files')
    const names = f.call.mock.calls.map(([service, method]) => `${service}.${method}`)
    expect(names.indexOf('InstanceInstallService.resumeInstanceInstall')).toBeLessThan(
      names.indexOf('InstanceInstallService.applyInstanceInstallManifest'),
    )
    expect(names).not.toContain('LaunchService.launch')
    await f.dispose()
  })
  it('waits for the native step after cancellation and never starts the game', async () => {
    const f = fixture()
    await f.ready()
    let release!: () => void
    const original = f.call.getMockImplementation()!
    f.call.mockImplementation(async (service, method, ...args) => {
      if (service === 'VersionInstallService' && method === 'installInstance') {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return { version: '1.20.4' }
      }
      return original(service, method, ...args)
    })
    const running = f.flow.run()
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    f.flow.cancel()
    expect(f.flow.getSnapshot().phase).toBe('preparing')
    release()
    await running
    expect(f.flow.getSnapshot().reason).toBe('cancelled')
    expect(
      f.call.mock.calls.some(([key, method]) => key === 'LaunchService' && method === 'launch'),
    ).toBe(false)
    await f.dispose()
  })
  it('blocks impossible RAM and installs a compatible Java only after confirmation', async () => {
    const f = fixture()
    f.java.raw.all = []
    await f.ready()
    expect(f.flow.getSnapshot().needsInstall).toBe(true)
    f.settings.raw.globalMaxMemory = 65536
    await f.flow.run()
    expect(
      f.call.mock.calls.some(
        ([key, method]) => key === 'VersionInstallService' && method === 'install',
      ),
    ).toBe(true)
    expect(f.flow.getSnapshot().reason).toBe('memory')
    expect(
      f.call.mock.calls.some(([key, method]) => key === 'LaunchService' && method === 'launch'),
    ).toBe(false)
    await f.dispose()
  })
  it.each([8, 17, 21])(
    'downloads the resolved Java %s only after confirmation and preserves the system preference',
    async (majorVersion) => {
      const f = fixture()
      f.java.raw.all = []
      const original = f.call.getMockImplementation()!
      f.call.mockImplementation(async (service, method, ...args) => {
        if (service === 'VersionService' && method === 'resolveLocalVersion')
          return {
            id: '1.20.4',
            javaVersion: { majorVersion, component: `fixture-${majorVersion}` },
          }
        if (service === 'VersionInstallService' && method === 'install') {
          expect(args[0]).toEqual({
            type: 'java',
            target: { majorVersion, component: `fixture-${majorVersion}` },
          })
          expect(f.flow.getSnapshot().installingJava).toBe(true)
          f.java.raw.all = [
            {
              path: `/java-${majorVersion}`,
              majorVersion,
              version: `${majorVersion}`,
              valid: true,
            },
          ]
          return
        }
        return original(service, method, ...args)
      })
      await f.ready()
      expect(
        f.call.mock.calls.some(
          ([service, method]) => service === 'VersionInstallService' && method === 'install',
        ),
      ).toBe(false)
      await f.flow.run()
      expect(
        f.call.mock.calls.find(
          ([service, method]) => service === 'LaunchService' && method === 'launch',
        )?.[2].java,
      ).toBe(`/java-${majorVersion}`)
      expect(f.settings.raw.globalJava).toBe('')
      await f.dispose()
    },
  )
  it('retains the required Java on download failure and detects a manually installed runtime without auto-launching', async () => {
    const f = fixture()
    f.java.raw.all = []
    const original = f.call.getMockImplementation()!
    f.call.mockImplementation(async (service, method, ...args) => {
      if (service === 'VersionInstallService' && method === 'install')
        throw new Error('Fixture download failed')
      if (service === 'JavaService' && method === 'refreshLocalJava') {
        expect(args[0]).toBe(true)
        f.java.raw.all = [{ path: '/java', majorVersion: 17, version: '17', valid: true }]
        return
      }
      return original(service, method, ...args)
    })
    await f.ready()
    await f.flow.run()
    expect(f.flow.getSnapshot()).toMatchObject({
      reason: 'java',
      javaMajor: 17,
      installingJava: false,
    })
    await f.flow.redetectJava()
    await vi.waitFor(() => expect(f.flow.getSnapshot().phase).toBe('ready'))
    expect(
      f.call.mock.calls.some(
        ([service, method]) => service === 'LaunchService' && method === 'launch',
      ),
    ).toBe(false)
    await f.dispose()
  })
  it('does not resurrect an exited process from a delayed startup query and removes event listeners', async () => {
    let resolve!: (processes: any[]) => void
    const g = fixture(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    await settle()
    g.events
      .get('LaunchService')
      ?.emit('minecraft-start', { pid: 55, launchId: 'owned', gameDirectory: g.path })
    g.events.get('LaunchService')?.emit('minecraft-exit', { pid: 55, launchId: 'owned', gameDirectory: g.path })
    resolve([{ pid: 55, launchId: 'owned', options: { gameDirectory: g.path } }])
    await settle()
    expect(g.flow.getSnapshot().running).toEqual([])
    await g.dispose()
    expect(g.events.get('LaunchService')?.listenerCount('minecraft-start')).toBe(0)
  })
  it('keeps a newer launch over a stale bootstrap snapshot and ignores the old exit for a reused PID', async () => {
    const pending = Promise.withResolvers<any[]>(), f = fixture(() => pending.promise)
    await settle()
    const channel = f.events.get('LaunchService')!
    channel.emit('minecraft-start', { pid: 55, launchId: 'new', gameDirectory: '/qa/New' })
    channel.emit('minecraft-exit', { pid: 55, launchId: 'old', gameDirectory: f.path })
    pending.resolve([{ pid: 55, launchId: 'old', options: { gameDirectory: f.path } }])
    await settle()
    expect(f.flow.getSnapshot().running).toEqual([{ pid: 55, launchId: 'new', path: '/qa/New' }])
    await f.flow.stop(55, 'old')
    expect(f.call.mock.calls.some(([service, method]) => service === 'LaunchService' && method === 'kill')).toBe(false)
    expect(Object.isFrozen(f.flow.getSnapshot().running[0])).toBe(true)
    await f.dispose()
  })
  it('retries process discovery without duplicate listeners, removes absent entries and shares concurrent queries', async () => {
    let fail = true, calls = 0
    const pending = Promise.withResolvers<any[]>(), f = fixture(async () => { calls++; if (fail) throw new Error('fixture query failure'); return pending.promise })
    await settle(); expect(f.flow.getSnapshot().processError).toBe(true)
    f.events.get('LaunchService')!.emit('minecraft-start', { pid: 55, launchId: 'gone', gameDirectory: f.path })
    fail = false
    const first = f.flow.refreshProcesses(), second = f.flow.refreshProcesses()
    expect(first).toBe(second); expect(calls).toBe(2)
    expect(f.events.get('LaunchService')!.listenerCount('minecraft-start')).toBe(1)
    pending.resolve([]); await first
    expect(f.flow.getSnapshot()).toMatchObject({ running: [], processError: false })
    await f.dispose()
  })
  it('does not publish a late process result after disposal', async () => {
    const pending = Promise.withResolvers<any[]>(), f = fixture(() => pending.promise), observer = vi.fn()
    f.flow.subscribe(observer)
    const snapshot = f.flow.getSnapshot()
    await f.dispose()
    pending.resolve([{ pid: 55, launchId: 'late', options: { gameDirectory: f.path } }])
    await settle()
    expect(f.flow.getSnapshot()).toBe(snapshot); expect(observer).not.toHaveBeenCalled()
  })
  it('batches live publications, captures while the console is closed and cleans timers and listeners', async () => {
    vi.useFakeTimers()
    const f = fixture()
    try {
      await settle()
      const channel = f.events.get('LaunchService')!, identity = { pid: 42, launchId: 'stream', gameDirectory: f.path, side: 'client' }
      channel.emit('minecraft-start', identity)
      channel.emit('minecraft-stdout', { ...identity, sequence: 1, stdout: 'before-' })
      const listener = vi.fn(), stop = f.flow.subscribeLogs(listener), initial = f.flow.getLogsSnapshot()
      expect(initial.entries.at(-1)?.raw).toBe('before-')
      for (let sequence = 2; sequence <= 101; sequence++) channel.emit('minecraft-stdout', { ...identity, sequence, stdout: 'x' })
      expect(f.flow.getLogsSnapshot()).toBe(initial); expect(listener).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(33); expect(listener).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1); expect(listener).toHaveBeenCalledTimes(1)
      expect(f.flow.getLogsSnapshot().entries.at(-1)?.raw).toBe('before-' + 'x'.repeat(100))
      channel.emit('minecraft-stdout', { ...identity, sequence: 102, stdout: '-after' })
      stop(); expect(vi.getTimerCount()).toBe(0)
      channel.emit('minecraft-exit', { ...identity, code: 0 })
      const again = f.flow.subscribeLogs(listener)
      expect(f.flow.getLogsSnapshot().entries.at(-2)?.raw).toContain('-after')
      f.flow.clearLogs(f.path); expect(f.flow.getLogsSnapshot().entries).toEqual([])
      again(); await f.dispose()
      expect(vi.getTimerCount()).toBe(0)
      for (const name of ['minecraft-start', 'minecraft-exit', 'minecraft-stdout', 'minecraft-stderr']) expect(channel.listenerCount(name)).toBe(0)
    } finally { await f.dispose(); vi.useRealTimers() }
  })
  it('cancels a slow launch using its captured identity after the PID has already been reused', async () => {
    const f = fixture(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
    await f.ready()
    const original = f.call.getMockImplementation()!
    f.call.mockImplementation(async (service, method, ...args) => {
      if (service === 'LaunchService' && method === 'launch') {
        f.events.get(service)!.emit('minecraft-start', { ...args[0], pid: 4242, launchId: 'cancelled-launch' })
        entered.resolve(); await release.promise
        return 4242
      }
      if (service === 'LaunchService' && method === 'kill') return
      return original(service, method, ...args)
    })
    const running = f.flow.run(); await entered.promise; f.flow.cancel()
    f.events.get('LaunchService')!.emit('minecraft-start', { pid: 4242, launchId: 'next-launch', gameDirectory: '/qa/Other', operationId: 'other-operation' })
    release.resolve(); await running
    expect(f.call.mock.calls.find(([service, method]) => service === 'LaunchService' && method === 'kill')?.slice(2)).toEqual([4242, false, 'cancelled-launch'])
    expect(f.flow.getSnapshot().running[0]).toMatchObject({ launchId: 'next-launch', path: '/qa/Other' })
    await f.dispose()
  })
  it('cancels a pending shared-state read and releases its late native acquisition', async () => {
    const f = fixture()
    const controller = new AbortController()
    const state = shared(new JavaState(), 'late-java')
    let release!: (value: any) => void
    const pending = readState(
      f.client,
      {
        key: 'late-java',
        Type: JavaState,
        load: () =>
          new Promise<any>((resolve) => {
            release = resolve
          }),
      },
      controller.signal,
    )
    await settle()
    controller.abort()
    await expect(pending).rejects.toHaveProperty('name', 'AbortError')
    release(state.raw)
    await settle()
    expect(state.raw.unref).toHaveBeenCalledTimes(1)
    expect(state.events.listenerCount('*')).toBe(0)
    await f.dispose()
  })
})
