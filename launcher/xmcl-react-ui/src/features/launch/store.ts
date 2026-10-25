import type { RendererClient } from '@launcher/renderer-client'
import { InstanceServiceKey, InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'
import {
  InstanceInstallServiceKey,
  InstanceInstallStatus,
} from '@xmcl/runtime-api/src/services/InstanceInstallService'
import { VersionInstallServiceKey } from '@xmcl/runtime-api/src/services/InstallService'
import {
  VersionServiceKey,
  type VersionService,
} from '@xmcl/runtime-api/src/services/VersionService'
import { UserServiceKey, UserState } from '@xmcl/runtime-api/src/services/UserService'
import { BaseServiceKey } from '@xmcl/runtime-api/src/services/BaseService'
import { JavaServiceKey, JavaState } from '@xmcl/runtime-api/src/services/JavaService'
import { AuthlibInjectorServiceKey } from '@xmcl/runtime-api/src/services/AuthlibInjectorService'
import { InstanceModsServiceKey } from '@xmcl/runtime-api/src/services/InstanceModsService'
import { LaunchServiceKey } from '@xmcl/runtime-api/src/services/LaunchService'
import { LocalVersions, findMatchedVersion } from '@xmcl/runtime-api/src/entities/version'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { Settings } from '@xmcl/runtime-api/src/entities/setting'
import type { UserProfile } from '@xmcl/runtime-api/src/entities/user.schema'
import { AUTHORITY_DEV } from '@xmcl/runtime-api/src/util/authority'
import {
  createOperationId,
  generateLaunchOptionsWithGlobal,
} from '@xmcl/runtime-api/src/util/launch'
import { getAutoSelectedJava } from '@xmcl/runtime-api/src/util/java'
import type { Instance } from '../../../../packages/instance/instance'
import { validVersionId } from '../library/creation'
import { readState } from './read'

export type LaunchReason =
  | 'profile'
  | 'path'
  | 'changed'
  | 'files'
  | 'java'
  | 'mods'
  | 'version'
  | 'network'
  | 'cancelled'
  | 'process'
  | 'memory'
  | 'permission'
  | 'disk'
export type LaunchPhase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'preparing'
  | 'running'
  | 'blocked'
  | 'error'
type Profile = { userId: string; profileId: string; name?: string }
type Running = { pid: number; launchId: string; path: string }
export type LaunchSnapshot = Readonly<{
  dialog: boolean
  phase: LaunchPhase
  request?: { path: string; name: string; profile?: Profile }
  reason?: LaunchReason
  needsInstall: boolean
  javaFallback: boolean
  javaMajor?: number
  installingJava: boolean
  running: readonly Running[]
  stopping: readonly number[]
  processError: boolean
}>
class Blocked extends Error {
  constructor(readonly reason: LaunchReason) {
    super(reason)
  }
}
function reasonFor(error: unknown, signal: AbortSignal): LaunchReason {
  if (signal.aborted) return 'cancelled'
  if (error instanceof Blocked) return error.reason
  if (error && typeof error === 'object') {
    if ('code' in error && (error.code === 'EPERM' || error.code === 'EACCES')) return 'permission'
    if ('code' in error && error.code === 'ENOSPC') return 'disk'
    if (
      'name' in error &&
      typeof error.name === 'string' &&
      error.name.toLowerCase().includes('java')
    )
      return 'java'
    const exception = 'exception' in error ? error.exception : undefined
    const type =
      exception && typeof exception === 'object' && 'type' in exception ? exception.type : undefined
    if (typeof type === 'string') {
      if (type.toLowerCase().includes('java')) return 'java'
      if (type === 'launchBadVersion' || type === 'launchNoVersionInstalled') return 'version'
      if (type === 'userAccessTokenExpired') return 'profile'
      if (type === 'launchSpawnProcessFailed') return 'process'
    }
  }
  return 'network'
}
const configKey = (instance: Instance) =>
  JSON.stringify({
    ...instance,
    name: '',
    description: '',
    icon: '',
    author: '',
    lastAccessDate: 0,
    lastPlayedDate: 0,
    creationDate: 0,
    playtime: 0,
  })

export class LaunchStore {
  private listeners = new Set<() => void>()
  private cleanups: (() => void)[] = []
  private controller?: AbortController
  private initial?: Promise<void>
  private exited = new Set<number>()
  private disposed = false
  private captured?: Instance
  private operation?: Promise<void>
  private snapshot: LaunchSnapshot = Object.freeze({
    dialog: false,
    phase: 'idle',
    needsInstall: false,
    javaFallback: false,
    installingJava: false,
    running: [],
    stopping: [],
    processError: false,
  })
  constructor(private client: RendererClient) {}
  getSnapshot = () => this.snapshot
  private publish(update: Partial<LaunchSnapshot>) {
    if (this.disposed) return
    this.snapshot = Object.freeze({ ...this.snapshot, ...update })
    for (const listener of this.listeners) listener()
  }
  private markRunning = (process: Running) => {
    this.exited.delete(process.pid)
    const previous = this.snapshot.running.find((value) => value.pid === process.pid)
    if (previous && !process.launchId) return
    this.publish({
      running: [...this.snapshot.running.filter((value) => value.pid !== process.pid), process],
    })
  }
  private markStopped = (pid: number) => {
    this.exited.add(pid)
    if (this.exited.size > 256) this.exited.delete(this.exited.values().next().value!)
    const running = this.snapshot.running.filter((process) => process.pid !== pid)
    this.publish({
      running,
      ...(this.snapshot.phase === 'running' &&
      !running.some((process) => process.path === this.snapshot.request?.path)
        ? { phase: 'idle' }
        : {}),
    })
  }
  private start() {
    if (this.initial && this.snapshot.processError) {
      for (const stop of this.cleanups) stop()
      this.cleanups = []
      this.initial = undefined
      this.publish({ processError: false })
    }
    if (this.initial) return this.initial
    this.cleanups.push(
      this.client.listen(LaunchServiceKey, 'minecraft-start', (event) =>
        this.markRunning({ pid: event.pid, launchId: event.launchId, path: event.gameDirectory }),
      ),
      this.client.listen(LaunchServiceKey, 'minecraft-exit', (event) =>
        this.markStopped(event.pid),
      ),
    )
    this.initial = this.client
      .service(LaunchServiceKey)
      .getGameProcesses()
      .then((processes) => {
        for (const process of processes)
          if (!this.exited.has(process.pid))
            this.markRunning({
              pid: process.pid,
              launchId: process.launchId,
              path: process.options.gameDirectory,
            })
      })
      .catch(() => this.publish({ processError: true }))
      .finally(() => {
        this.exited.clear()
      })
    return this.initial
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    void this.start()
    return () => {
      this.listeners.delete(listener)
    }
  }
  private async instance(path: string, signal: AbortSignal) {
    const data = await readState(
      this.client,
      {
        key: 'instances',
        Type: InstanceState,
        load: (client) => client.service(InstanceServiceKey).getSharedInstancesState(),
      },
      signal,
    )
    const instance = data.instances.find(
      (instance) => instance.path === path && instance.edition !== 'bedrock',
    )
    if (!instance) throw new Blocked('path')
    if (
      !instance.runtime.minecraft ||
      Object.values(instance.runtime).some((value) => value && !validVersionId(value)) ||
      (instance.version && !validVersionId(instance.version))
    )
      throw new Blocked('version')
    return structuredClone(instance) as Instance
  }
  private async user(profile: Profile | undefined, signal: AbortSignal) {
    if (!profile) throw new Blocked('profile')
    const data = await readState(
      this.client,
      {
        key: 'users',
        Type: UserState,
        load: (client) => client.service(UserServiceKey).getUserState(),
      },
      signal,
    )
    const user = data.users[profile.userId]
    if (!user || user.authority !== AUTHORITY_DEV || !user.profiles[profile.profileId])
      throw new Blocked('profile')
    return { ...structuredClone(user), selectedProfile: profile.profileId } as UserProfile
  }
  private async pending(path: string, signal: AbortSignal) {
    const descriptor = {
      key: `instance-install:${path}`,
      Type: InstanceInstallStatus,
      load: (client: RendererClient) =>
        client.service(InstanceInstallServiceKey).watchInstanceInstall(path),
    }
    await readState(this.client, descriptor, signal)
    const store = this.client.state(descriptor.key, descriptor.Type, () =>
      descriptor.load(this.client),
    )
    // Keep the watch alive while native revalidation runs, then release through its store.
    const stop = store.subscribe(() => {})
    try {
      await store.revalidate()
      const snapshot = store.getSnapshot()
      if (snapshot.status !== 'ready' || !snapshot.data) throw new Blocked('files')
      return snapshot.data
    } finally {
      stop()
    }
  }
  private async java(
    instance: Instance,
    version: Awaited<ReturnType<VersionService['resolveLocalVersion']>> | undefined,
    settings: Settings,
    signal: AbortSignal,
  ) {
    const data = await readState(
      this.client,
      {
        key: 'java',
        Type: JavaState,
        load: (client) => client.service(JavaServiceKey).getJavaState(),
      },
      signal,
    )
    const criteria = getAutoSelectedJava(
      data.all.map((java) => ({ ...java })),
      instance.runtime.minecraft,
      instance.runtime.forge,
      version,
      settings.globalJava,
    )
    const service = this.client.service(JavaServiceKey)
    const pinned = instance.java ? await service.resolveJava(instance.java) : undefined
    const auto = criteria.java ? await service.resolveJava(criteria.java.path) : undefined
    const selected =
      pinned &&
      (!('valid' in pinned) || pinned.valid !== false) &&
      criteria.preference.match(pinned)
        ? pinned
        : auto && (!('valid' in auto) || auto.valid !== false) && criteria.preference.match(auto)
          ? auto
          : undefined
    return { criteria, selected, fallback: !!instance.java && selected?.path !== instance.java }
  }
  private settings(signal: AbortSignal) {
    return readState(
      this.client,
      {
        key: 'settings',
        Type: Settings,
        load: (client) => client.service(BaseServiceKey).getSettings(),
      },
      signal,
    ).then((value) => structuredClone(value) as Settings)
  }
  open = (path: string, name: string, profile?: Profile) => {
    if (this.operation || this.disposed) return
    this.controller?.abort()
    const controller = (this.controller = new AbortController())
    this.captured = undefined
    this.publish({
      dialog: true,
      phase: 'checking',
      request: { path, name, profile },
      reason: undefined,
      javaFallback: false,
      needsInstall: false,
      installingJava: false,
    })
    void this.inspect(path, profile, controller.signal).catch((error) => {
      if (!controller.signal.aborted)
        this.publish({
          phase: error instanceof Blocked ? 'blocked' : 'error',
          reason: reasonFor(error, controller.signal),
        })
    })
  }
  private async inspect(path: string, profile: Profile | undefined, signal: AbortSignal) {
    await this.start()
    if (this.snapshot.processError) throw new Blocked('process')
    const instance = await this.instance(path, signal)
    if (this.snapshot.running.some((process) => process.path === path)) {
      if (!signal.aborted) this.publish({ phase: 'running' })
      return
    }
    await this.user(profile, signal)
    if (await this.client.service(InstanceServiceKey).validateInstancePath(path))
      throw new Blocked('path')
    const local = await readState(
      this.client,
      {
        key: 'local-versions',
        Type: LocalVersions,
        load: (client) => client.service(VersionServiceKey).getLocalVersions(),
      },
      signal,
    )
    const header = findMatchedVersion(
      local.local.map((version) => ({ ...version, inheritances: [...version.inheritances] })),
      instance.version,
      instance.runtime,
    )
    const resolved = header
      ? await this.client.service(VersionServiceKey).resolveLocalVersion(header.id)
      : undefined
    const issue = resolved
      ? await this.client
          .service(VersionInstallServiceKey)
          .diagnose({ version: resolved.id, side: 'client' })
      : undefined
    const pending = await this.pending(path, signal)
    const manifest = await this.client
      .service(InstanceInstallServiceKey)
      .getInstanceInstallManifest(path)
    const java = await this.java(instance, resolved, await this.settings(signal), signal)
    if (signal.aborted) return
    this.captured = instance
    this.publish({
      phase: 'ready',
      needsInstall:
        !header ||
        (!!issue &&
          Object.values(issue).some((value) => (Array.isArray(value) ? value.length : !!value))) ||
        !!manifest ||
        pending.pendingFileCount > 0 ||
        pending.unresolvedFiles.length > 0 ||
        !java.selected,
      javaFallback: java.fallback,
      javaMajor: resolved
        ? (java.selected?.majorVersion ?? java.criteria.javaVersion.majorVersion)
        : undefined,
    })
  }
  private assertCurrent = async (expected: Instance, signal: AbortSignal) => {
    if (signal.aborted) throw new Blocked('cancelled')
    const current = await this.instance(expected.path, signal)
    if (configKey(expected) !== configKey(current)) throw new Blocked('changed')
    if (await this.client.service(InstanceServiceKey).validateInstancePath(expected.path))
      throw new Blocked('path')
    return current
  }
  run = (): Promise<void> => {
    if (this.operation) return this.operation
    if (this.snapshot.phase !== 'ready' || !this.captured || !this.snapshot.request)
      return Promise.resolve()
    const instance = structuredClone(this.captured)
    const profile = this.snapshot.request.profile
    const controller = (this.controller = new AbortController())
    this.publish({ phase: 'preparing', reason: undefined })
    this.operation = this.prepare(instance, profile, controller.signal)
      .catch((error) => {
        this.publish({
          phase: error instanceof Blocked ? 'blocked' : 'error',
          reason: reasonFor(error, controller.signal),
        })
      })
      .finally(() => {
        this.operation = undefined
      })
    return this.operation
  }
  private async prepare(instance: Instance, profile: Profile | undefined, signal: AbortSignal) {
    await this.assertCurrent(instance, signal)
    await this.user(profile, signal)
    if (this.snapshot.running.some((process) => process.path === instance.path))
      throw new Blocked('process')
    const installFiles = this.client.service(InstanceInstallServiceKey)
    const errors = await installFiles.resumeInstanceInstall(instance.path)
    if (errors?.length) throw new Blocked('files')
    await this.assertCurrent(instance, signal)
    await installFiles.applyInstanceInstallManifest(instance.path)
    const pending = await this.pending(instance.path, signal)
    if (pending.pendingFileCount || pending.unresolvedFiles.length) throw new Blocked('files')
    this.publish({ javaMajor: undefined })
    const installed = await this.client.service(VersionInstallServiceKey).installInstance({
      type: 'instance',
      instancePath: instance.path,
      runtime: instance.runtime,
      selectedVersion: instance.version,
    })
    await this.assertCurrent(instance, signal)
    if (installed.version !== instance.version) {
      await this.client
        .service(InstanceServiceKey)
        .editInstance({ instancePath: instance.path, version: installed.version })
      instance.version = installed.version
    }
    const resolved = await this.client
      .service(VersionServiceKey)
      .resolveLocalVersion(installed.version)
    const settings = await this.settings(signal)
    let java = await this.java(instance, resolved, settings, signal)
    if (!java.selected) {
      this.publish({ installingJava: true, javaMajor: java.criteria.javaVersion.majorVersion })
      try {
        await this.client
          .service(VersionInstallServiceKey)
          .install({ type: 'java', target: java.criteria.javaVersion })
      } catch (error) {
        if (reasonFor(error, signal) === 'network') throw new Blocked('java')
        throw error
      } finally {
        this.publish({ installingJava: false })
      }
      java = await this.java(instance, resolved, settings, signal)
    }
    if (!java.selected) throw new Blocked('java')
    const refreshed = await this.client.service(UserServiceKey).refreshUser(profile!.userId)
    if (!refreshed.profiles[profile!.profileId]) throw new Blocked('profile')
    const user = { ...refreshed, selectedProfile: profile!.profileId }
    const mods = await readState(
      this.client,
      {
        key: `mods:${instance.path}`,
        Type: ResourceState,
        load: (client) => client.service(InstanceModsServiceKey).watch(instance.path),
      },
      signal,
    )
    if (mods.errors.length) throw new Blocked('mods')
    const options = await generateLaunchOptionsWithGlobal(instance, user, installed.version, {
      token: '',
      operationId: createOperationId(),
      side: 'client',
      javaPath: java.selected.path,
      globalEnv: settings.globalEnv,
      globalVmOptions: settings.globalVmOptions,
      globalMcOptions: settings.globalMcOptions,
      globalPrependCommand: settings.globalPrependCommand,
      globalPreExecuteCommand: settings.globalPreExecuteCommand,
      globalAssignMemory: settings.globalAssignMemory,
      globalMinMemory: settings.globalMinMemory,
      globalMaxMemory: settings.globalMaxMemory,
      globalHideLauncher: settings.globalHideLauncher,
      globalShowLog: settings.globalShowLog,
      globalFastLaunch: settings.globalFastLaunch,
      globalDisableAuthlibInjector: settings.globalDisableAuthlibInjector,
      globalDisableElyByAuthlib: settings.globalDisableElyByAuthlib,
      globalResolution: settings.globalResolution,
      modCount: mods.files.length,
      getOrInstallAuthlibInjector: () =>
        this.client.service(AuthlibInjectorServiceKey).getOrInstallAuthlibInjector(),
      track: async (_, operation) => operation(),
    })
    const memory = await this.client.service(BaseServiceKey).getMemoryStatus()
    if (
      [options.minMemory, options.maxMemory].some(
        (value) =>
          value !== undefined &&
          (!Number.isFinite(value) || value < 0 || value * 1024 * 1024 > memory.total),
      ) ||
      (options.minMemory !== undefined &&
        options.maxMemory !== undefined &&
        options.minMemory > options.maxMemory)
    )
      throw new Blocked('memory')
    await this.assertCurrent(instance, signal)
    options.user = await this.user(profile, signal)
    if (this.snapshot.running.some((process) => process.path === instance.path))
      throw new Blocked('process')
    const pid = await this.client.service(LaunchServiceKey).launch(options)
    if (!pid) throw new Blocked('process')
    if (signal.aborted) {
      await this.client.service(LaunchServiceKey).kill(pid)
      throw new Blocked('cancelled')
    }
    // A short-lived process may exit before the launch promise resolves.
    if (!this.exited.has(pid)) this.markRunning({ pid, path: instance.path, launchId: '' })
    this.publish({
      phase: this.snapshot.running.some((process) => process.path === instance.path)
        ? 'running'
        : 'idle',
    })
  }
  close = () => {
    if (this.operation) return
    this.controller?.abort()
    this.publish({ dialog: false })
  }
  cancel = () => {
    this.controller?.abort()
  }
  redetectJava = async () => {
    const request = this.snapshot.request
    if (this.operation || this.snapshot.phase === 'checking' || !request) return
    this.controller?.abort()
    const controller = (this.controller = new AbortController())
    this.publish({ phase: 'checking', reason: undefined })
    try {
      await this.client.service(JavaServiceKey).refreshLocalJava(true)
      if (!controller.signal.aborted) this.open(request.path, request.name, request.profile)
    } catch {
      if (!controller.signal.aborted) this.publish({ phase: 'error', reason: 'java' })
    }
  }
  stop = async (pid: number) => {
    if (
      !this.snapshot.running.some((process) => process.pid === pid) ||
      this.snapshot.stopping.includes(pid)
    )
      return
    this.publish({ stopping: [...this.snapshot.stopping, pid] })
    try {
      await this.client.service(LaunchServiceKey).kill(pid)
    } catch {
      this.publish({ reason: 'process', phase: 'error' })
    } finally {
      this.publish({ stopping: this.snapshot.stopping.filter((value) => value !== pid) })
    }
  }
  dispose() {
    this.disposed = true
    this.controller?.abort()
    for (const stop of this.cleanups) stop()
    this.cleanups = []
    this.listeners.clear()
  }
}
