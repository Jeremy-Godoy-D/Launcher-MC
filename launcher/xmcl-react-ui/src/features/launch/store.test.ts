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
  let manifest: any
  const call = vi.fn(async (service: string, method: string, ...args: any[]): Promise<any> => {
    const key = `${service}.${method}`
    switch (key) {
      case 'InstanceService.getSharedInstancesState':
        return instances.raw
      case 'InstanceService.validateInstancePath':
        return undefined
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
        return startup ? startup() : []
      case 'LaunchService.launch':
        return 4242
      case 'LaunchService.kill':
        events.get('LaunchService')?.emit('minecraft-exit', { pid: args[0] })
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
          f.events.get(service)?.emit('minecraft-exit', { pid: 4242 })
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
    g.events.get('LaunchService')?.emit('minecraft-exit', { pid: 55 })
    resolve([{ pid: 55, launchId: 'owned', options: { gameDirectory: g.path } }])
    await settle()
    expect(g.flow.getSnapshot().running).toEqual([])
    await g.dispose()
    expect(g.events.get('LaunchService')?.listenerCount('minecraft-start')).toBe(0)
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
