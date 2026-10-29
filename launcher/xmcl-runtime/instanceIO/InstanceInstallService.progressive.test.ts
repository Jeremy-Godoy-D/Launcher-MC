import { InstanceDataSchema, type InstanceFile, type InstanceInstallLock } from '@xmcl/instance'
import { LockKey, TaskState, type InstanceInstallStatus } from '@xmcl/runtime-api'
import { FSWatcher } from 'chokidar'
import { createHash } from 'crypto'
import { ensureDir, link, mkdtemp, pathExists, readFile, readJson, readdir, rename, rm, symlink, utimes, writeFile, writeJson } from 'fs-extra'
import { basename, dirname, join, relative, sep } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MutexManager from '~/app/MutexManager'
import { kDownloadOptions } from '~/network'
import { ServiceStateManager } from '~/service'
import { downloadInstanceFiles } from './utils/downloadInstanceFiles'
import { readPendingInstalls } from './utils/pendingInstall'
import { readModFilesSnapshot } from '../instance/utils/localMods'
import { readResourcePackFilesSnapshot } from '../instance/utils/resourcePackSnapshot'

vi.mock('~/app', () => ({
  Inject: () => () => {},
  LauncherApp: class LauncherApp {},
  LauncherAppKey: Symbol('LauncherAppKey'),
  kGameDataPath: Symbol('kGameDataPath'),
}))

vi.mock('~/infra', () => ({
  ZipManager: class ZipManager {},
  kTasks: Symbol('kTasks'),
}))

vi.mock('~/instance/InstanceService', () => ({
  InstanceService: class InstanceService {},
}))

vi.mock('~/instance/InstanceModsGroupService', () => ({
  InstanceModsGroupService: class InstanceModsGroupService {},
}))

vi.mock('../launch/LaunchService', () => ({ LaunchService: class LaunchService {} }))

vi.mock('~/peer', () => ({
  kPeerFacade: Symbol('kPeerFacade'),
}))

vi.mock('./utils/downloadInstanceFiles', () => ({
  downloadInstanceFiles: vi.fn(),
}))

vi.mock('./utils/resolveInstanceFiles', () => ({
  resolveInstanceFiles: vi.fn().mockResolvedValue(false),
}))

const { InstanceInstallService } = await import('./InstanceInstallService')
const { InstanceService } = await import('~/instance/InstanceService')
const { LaunchService } = await import('../launch/LaunchService')
const { kGameDataPath } = await import('~/app')

const sha1 = (content: string | Buffer) => createHash('sha1').update(content).digest('hex')
const mockedDownload = vi.mocked(downloadInstanceFiles)
type Download = Parameters<typeof downloadInstanceFiles>[0][number]

describe('InstanceInstallService progressive installation', () => {
  const roots: string[] = []
  const disposers: Array<() => void> = []

  beforeEach(() => {
    mockedDownload.mockReset()
  })

  afterEach(async () => {
    for (const dispose of disposers.splice(0)) dispose()
    vi.restoreAllMocks()
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
  })

  async function fixture() {
    const root = await mkdtemp(join(process.cwd(), '.progressive-install-test-'))
    roots.push(root)
    const instancePath = join(root, 'instance')
    await ensureDir(instancePath)
    const contents = new Map<string, string>()
    const file = (path: string, content = path): InstanceFile => {
      const hash = sha1(content)
      contents.set(hash, content)
      return { path, hashes: { sha1: hash }, downloads: [`https://example.invalid/${path}`] }
    }
    const write = async (path: string, content: string) => {
      await ensureDir(dirname(path))
      await writeFile(path, content)
    }
    const materialize = async ({ file, options }: Download, finished: Set<string>) => {
      const content = contents.get(file.hashes.sha1)
      if (content === undefined) throw new Error(`Unknown fixture content: ${file.path}`)
      await write(options.destination, content)
      finished.add(file.path)
    }
    const downloadAll: typeof downloadInstanceFiles = async (downloads, finished) => {
      await Promise.all(downloads.map(download => materialize(download, finished)))
    }
    const removeHandlers = new Set<() => void | Promise<void>>()
    const processes: Array<{ options: { gameDirectory: string } }> = []
    const instanceService = {
      initialize: vi.fn(async () => {}),
      state: { all: { [instancePath]: { ...InstanceDataSchema.parse({ name: 'Fixture', runtime: { minecraft: '1.21.1' } }), path: instancePath } }, get instances() { return Object.values(this.all) } },
      registerRemoveHandler: vi.fn((path: string, handler: () => void | Promise<void>) => {
        expect(path).toBe(instancePath)
        removeHandlers.add(handler)
        return () => removeHandlers.delete(handler)
      }),
    }
    const sharedStates = new Map<string, InstanceInstallStatus>()
    const revalidators = new Map<string, () => Promise<void>>()
    const stateManager = {
      registerOrGet: vi.fn(async (
        key: string,
        factory: () => Promise<[InstanceInstallStatus, () => void, () => Promise<void>]>,
      ) => {
        if (sharedStates.has(key)) return sharedStates.get(key)!
        const [state, dispose, revalidate] = await factory()
        revalidators.set(key, revalidate)
        sharedStates.set(key, state)
        disposers.push(dispose)
        return state
      }),
    }
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const app = {
      appDataPath: root,
      minecraftDataPath: root,
      controller: { broadcast: vi.fn() },
      getLogger: () => logger,
      platform: { os: 'windows' },
      registry: {
        getOrCreate: vi.fn(async () => ({})),
        get: vi.fn(async key => {
          if (key === kDownloadOptions) return {}
          if (key === kGameDataPath) return (...parts: string[]) => join(root, ...parts)
          if (key === InstanceService) return instanceService
          if (key === LaunchService) return { getGameProcesses: async () => processes }
          if (key === ServiceStateManager) return stateManager
          return undefined
        }),
        getIfPresent: vi.fn(async () => undefined),
      },
    } as any
    app.mutex = new MutexManager(app)
    const tasks = {
      create: vi.fn(task => ({
        ...task,
        id: crypto.randomUUID(),
        progress: 0,
        substate: {},
        state: TaskState.Running,
        controller: new AbortController(),
        complete: vi.fn(),
        fail: vi.fn(),
        wrap: <T>(promise: Promise<T>) => promise,
      })),
    }
    const resourceManager = {
      getSnapshotByHash: vi.fn(async () => undefined),
      getSnapshotByDomainedPath: vi.fn(async () => undefined),
      getSnapshot: vi.fn(async (file: { path: string }) => ({ sha1: sha1(await readFile(file.path)) })),
      validateSnapshotFile: vi.fn(async () => undefined),
      updateMetadata: vi.fn(async () => []),
    }
    const worker = {
      checksum: vi.fn(async (path: string, algorithm = 'sha1') => createHash(algorithm).update(await readFile(path)).digest('hex')),
    }
    const createService = () => new InstanceInstallService(
      app,
      resourceManager as any,
      tasks as any,
      worker as any,
      {} as any,
      { getProjectVersionsByHash: vi.fn(async () => ({})) } as any,
    )
    const review = async (oldFiles: InstanceFile[], files: InstanceFile[], domain: 'mods' | 'resourcepacks' = 'mods') => {
      await ensureDir(join(instancePath, domain))
      const instance = instanceService.state.all[instancePath]
      const configuration = { runtime: { ...instance.runtime }, java: instance.java, version: instance.version }
      const snapshot = domain === 'resourcepacks' ? await readResourcePackFilesSnapshot(instancePath, root, configuration) : await readModFilesSnapshot(instancePath, configuration)
      const options = { path: instancePath, oldFiles, files, review: { ...(domain === 'resourcepacks' ? { domain } : {}), snapshot: snapshot.fingerprint, changes: [] } }
      const updates = await createService().previewInstanceFiles(options)
      return { ...options, review: { ...options.review, changes: updates.map(update => ({ path: update.file.path, operation: update.operation })) } }
    }
    return {
      root,
      instancePath,
      file,
      review,
      write,
      materialize,
      downloadAll,
      createService,
      service: createService(),
      tasks,
      mutex: app.mutex as MutexManager,
      removeHandlers,
      instanceService,
      processes,
      resourceManager,
      worker,
      refreshStatus: () => revalidators.get(`instance-install://${instancePath}`)!(),
    }
  }

  function expectLocalProfile(instancePath: string, profile: { path: string; state: InstanceInstallLock }) {
    expect(dirname(profile.path)).toBe(join(instancePath, '.install'))
    expect(basename(profile.path)).toMatch(/^[\da-f-]+\.json$/i)
    expect(relative(instancePath, profile.state.workspace).split(sep)[0]).toBe('.install')
    expect(profile.state.oldFiles).toBeDefined()
  }

  it('publishes a ready mod and its lock while another download is still running, and serializes resume', async () => {
    const f = await fixture()
    const ready = f.file('mods/ready.jar')
    const slow = f.file('mods/slow.jar')
    const started = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const status = await f.service.watchInstanceInstall(f.instancePath)
    mockedDownload.mockImplementationOnce(async (downloads, finished) => {
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      started.resolve()
      await release.promise
      throw new Error('slow download failed')
    }).mockImplementation(f.downloadAll)
    const installing = f.service.installInstanceFiles({
      path: f.instancePath, upstream: { type: 'peer', id: 'streaming-pack' }, files: [ready, slow],
    })
    const rejected = expect(installing).rejects.toThrow('slow download failed')
    let resuming: Promise<unknown> | undefined
    try {
      await started.promise
      await vi.waitFor(async () => {
        expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
        expect((await readJson(join(f.instancePath, 'instance-lock.json'))).files).toEqual([ready])
        expect(status.pendingFileCount).toBe(1)
      }, { timeout: 3000 })
      expect(f.tasks.create).toHaveBeenCalledTimes(1)
      resuming = f.service.resumeInstanceInstall(f.instancePath)
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(f.tasks.create).toHaveBeenCalledTimes(1)
    } finally {
      release.resolve()
      await rejected
      await resuming
    }
    expect(mockedDownload.mock.calls[1][0].map(download => download.file.path)).toEqual([slow.path])
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
    expect(status.pendingFileCount).toBe(0)
    expect((await readJson(join(f.instancePath, 'instance-lock.json'))).files).toEqual([ready, slow])
  }, 15000)

  it('persists legacy baseline removals across failure and a fresh-service resume', async () => {
    const f = await fixture()
    const obsolete = f.file('mods/obsolete.jar')
    const ready = f.file('mods/ready.jar')
    const missing = f.file('mods/missing.jar')
    const upstream = { type: 'modrinth-modpack' as const, projectId: 'pack', versionId: 'old' }
    await f.write(join(f.instancePath, obsolete.path), obsolete.path)
    vi.spyOn(f.service, 'getLegacyLock').mockResolvedValue({ version: 1, upstream, files: [obsolete] })
    mockedDownload.mockImplementationOnce(async (downloads, finished) => {
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      throw new Error('legacy partial failure')
    }).mockImplementation(f.downloadAll)
    await expect(f.service.installInstanceFiles({
      path: f.instancePath, upstream: { ...upstream, versionId: 'new' }, files: [ready, missing],
    })).rejects.toThrow('legacy partial failure')
    const [profile] = await readPendingInstalls(f.instancePath)
    expect(profile.state.baseline?.files).toEqual([obsolete])
    expect((await readJson(join(f.instancePath, 'instance-lock.json'))).files).toEqual([obsolete, ready])

    const restarted = f.createService()
    const legacyLookup = vi.spyOn(restarted, 'getLegacyLock')
    await restarted.resumeInstanceInstall(f.instancePath)
    expect(legacyLookup).not.toHaveBeenCalled()
    expect(await pathExists(join(f.instancePath, obsolete.path))).toBe(false)
    expect((await readJson(join(f.instancePath, 'instance-lock.json'))).files).toEqual([ready, missing])
  })

  it('does not let a batch of unchanged staged files starve newly downloaded files', async () => {
    const f = await fixture()
    const kept = Array.from({ length: 256 }, (_, i) => f.file(`config/kept-${i}.txt`))
    for (const file of kept) await f.write(join(f.instancePath, file.path), file.path)
    const ready = f.file('mods/ready.jar')
    const slow = f.file('mods/slow.jar')
    const release = Promise.withResolvers<void>()
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      await release.promise
      await f.materialize(downloads.find(download => download.file.path === slow.path)!, finished)
    })
    const installing = f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [...kept, ready, slow],
    })
    try {
      await vi.waitFor(async () => {
        expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
        const [profile] = await readPendingInstalls(f.instancePath)
        expect(profile.state.committedPath).toHaveLength(257)
      }, { timeout: 10_000 })
    } finally {
      release.resolve()
      await installing
    }
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  }, 10_000)

  it('does not resurrect an older project version when unrelated pending files resume', async () => {
    const f = await fixture()
    const old = { ...f.file('mods/old.jar'), modrinth: { projectId: 'project', versionId: 'old' } }
    const next = { ...f.file('mods/new.jar'), modrinth: { projectId: 'project', versionId: 'new' } }
    const unrelated = f.file('config/unrelated.txt')
    mockedDownload.mockImplementationOnce(async (downloads, finished) => {
      await f.materialize(downloads.find(download => download.file.path === old.path)!, finished)
      throw new Error('unrelated unavailable')
    }).mockImplementation(f.downloadAll)
    await expect(f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [old, unrelated],
    })).rejects.toThrow('unrelated unavailable')
    await f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [next] })
    expect(await pathExists(join(f.instancePath, old.path))).toBe(false)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe(next.path)
    const [pending] = await readPendingInstalls(f.instancePath)
    expect(pending.state.supersededPaths).toContain(old.path)
    await f.createService().resumeInstanceInstall(f.instancePath)
    expect(mockedDownload.mock.calls[2][0].map(download => download.file.path)).toEqual([unrelated.path])
    expect(await pathExists(join(f.instancePath, old.path))).toBe(false)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe(next.path)
    expect(await pathExists(join(f.instancePath, '.install'))).toBe(false)
  })

  it('does not let an older deferred removal delete a newer selection', async () => {
    const f = await fixture()
    const old = f.file('mods/shared.jar', 'old')
    const next = f.file(old.path, 'new')
    const missing = f.file('config/missing.txt')
    await f.write(join(f.instancePath, old.path), 'old')
    mockedDownload.mockRejectedValueOnce(new Error('failed')).mockImplementation(f.downloadAll)
    await expect(f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [old], files: [missing],
    })).rejects.toThrow('failed')
    await f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [next] })
    await f.createService().resumeInstanceInstall(f.instancePath)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe('new')
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it('aborts superseded active work and waits for its late writer without publishing it', async () => {
    const f = await fixture()
    const old = { ...f.file('mods/old.jar'), curseforge: { projectId: 1, fileId: 1 } }
    const next = { ...f.file('mods/new.jar'), curseforge: { projectId: 1, fileId: 2 } }
    const started = Promise.withResolvers<void>()
    mockedDownload.mockImplementationOnce(async (downloads, finished, signal) => {
      const aborted = new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
      started.resolve()
      await aborted
      await f.materialize(downloads[0], finished)
      signal.throwIfAborted()
    }).mockImplementation(f.downloadAll)
    const installing = f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [old] })
    const rejected = expect(installing).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    await f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [next] })
    await rejected
    expect(await pathExists(join(f.instancePath, old.path))).toBe(false)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe(next.path)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
    expect(await pathExists(join(f.instancePath, '.install'))).toBe(false)
  })

  it('replays interrupted ownership registration before completing the newer upstream plan', async () => {
    const f = await fixture()
    const old = f.file('mods/old.jar')
    const next = f.file('mods/new.jar')
    const upstream = { type: 'peer' as const, id: 'pack' }
    mockedDownload.mockRejectedValue(new Error('offline'))
    await expect(f.service.installInstanceFiles({
      path: f.instancePath, upstream, files: [old],
    })).rejects.toThrow('offline')
    const [older] = await readPendingInstalls(f.instancePath)
    await expect(f.service.installInstanceFiles({
      path: f.instancePath, upstream, files: [next],
    })).rejects.toThrow('offline')
    // Simulate a durable newer plan whose older-profile rewrite was interrupted.
    await ensureDir(older.state.workspace)
    await writeJson(older.path, older.state)
    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)
    await f.createService().resumeInstanceInstall(f.instancePath)
    expect(mockedDownload.mock.calls.flatMap(([downloads]) => downloads.map(download => download.file.path))).toEqual([next.path])
    expect(await pathExists(join(f.instancePath, old.path))).toBe(false)
    expect((await readJson(join(f.instancePath, 'instance-lock.json'))).files).toEqual([next])
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it.each(['sha256', 'sha512'])('replaces same-size incorrect content using a declared %s hash', async (algorithm) => {
    const f = await fixture()
    const next: InstanceFile = {
      path: 'mods/same-size.jar',
      size: 3,
      hashes: { [algorithm]: createHash(algorithm).update('BBB').digest('hex') },
      downloads: ['https://example.invalid/strong.jar'],
    }
    await f.write(join(f.instancePath, next.path), 'AAA')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.write(downloads[0].options.destination, 'BBB')
      finished.add(next.path)
    })
    await f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [next] })
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe('BBB')
    expect(f.worker.checksum).toHaveBeenCalledWith(join(f.instancePath, next.path), algorithm)
  })

  it('publishes ready files on failure and a fresh service downloads only the missing file on resume', async () => {
    const f = await fixture()
    const ready = f.file('mods/ready.jar')
    const missing = f.file('mods/missing.jar')
    const failure = new Error('missing download failed')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      expect(downloads.map(download => download.file.path).sort()).toEqual([missing.path, ready.path])
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      throw failure
    })

    await expect(f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [ready, missing],
    })).rejects.toBe(failure)

    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
    expect(await pathExists(join(f.instancePath, missing.path))).toBe(false)
    const profiles = await readPendingInstalls(f.instancePath)
    expect(profiles).toHaveLength(1)
    expectLocalProfile(f.instancePath, profiles[0])
    expect(profiles[0].state.files).toEqual([ready, missing])
    expect(profiles[0].state.committedPath).toEqual([ready.path])
    expect(profiles[0].state.finishedPath).not.toContain(ready.path)
    expect(await pathExists(join(profiles[0].state.workspace, ready.path))).toBe(false)
    expect(await pathExists(join(f.instancePath, '.install-profile'))).toBe(false)
    expect(await pathExists(join(f.instancePath, 'instance-lock.json'))).toBe(false)
    expect(await readdir(f.root)).toEqual(['instance'])
    expect(f.tasks.create.mock.results[0].value.complete).not.toHaveBeenCalled()
    expect(f.tasks.create.mock.results[0].value.fail).toHaveBeenCalledWith(failure)
    expect(failure).toMatchObject({ installInstance: { instancePath: f.instancePath } })

    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)
    const restarted = f.createService()
    expect(restarted).not.toBe(f.service)
    await restarted.resumeInstanceInstall(f.instancePath)

    expect(mockedDownload).toHaveBeenCalledTimes(1)
    expect(mockedDownload.mock.calls[0][0].map(download => download.file.path)).toEqual([missing.path])
    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
    expect(await readFile(join(f.instancePath, missing.path), 'utf8')).toBe(missing.path)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
    expect(await pathExists(profiles[0].path)).toBe(false)
    expect(await pathExists(profiles[0].state.workspace)).toBe(false)
    expect(await pathExists(join(f.instancePath, 'instance-lock.json'))).toBe(false)
  })

  it('attaches retained-instance metadata to every nested aggregate error leaf', async () => {
    const f = await fixture()
    const ready = f.file('mods/ready.jar')
    const firstMissing = f.file('config/first.txt')
    const secondMissing = f.file('config/second.txt')
    const firstError = Object.assign(new Error('first unavailable'), { name: 'DownloadError' })
    const secondError = Object.assign(new Error('second unavailable'), { name: 'RequestError' })
    const nested = new AggregateError([secondError], 'nested downloads')
    const failure = new AggregateError([firstError, nested], 'downloads failed')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      throw failure
    })

    await expect(f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [ready, firstMissing, secondMissing],
    })).rejects.toBe(failure)

    for (const error of [failure, nested, firstError, secondError]) {
      expect(error).toMatchObject({ installInstance: { instancePath: f.instancePath } })
    }
    expect(firstError.name).toBe('DownloadError')
    expect(secondError.name).toBe('RequestError')
    expect(f.tasks.create.mock.results[0].value.fail).toHaveBeenCalledWith(failure)
    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
    expect((await readPendingInstalls(f.instancePath))[0].state.committedPath).toEqual([ready.path])
  })

  it('updates watched pending counts from preparing to partial failure to completed retry', async () => {
    const f = await fixture()
    const ready = f.file('mods/ready.jar')
    const missing = f.file('config/missing.txt')
    const status = await f.service.watchInstanceInstall(f.instancePath)
    expect(status.pendingFileCount).toBe(0)
    const started = Promise.withResolvers<void>()
    const releaseDownloads = Promise.withResolvers<void>()
    mockedDownload.mockImplementation(async (downloads, finished) => {
      started.resolve()
      await releaseDownloads.promise
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      throw new Error('watched download failed')
    })
    const installing = f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [ready, missing],
    })
    const rejected = expect(installing).rejects.toThrow('watched download failed')
    try {
      await started.promise
      await vi.waitFor(() => expect(status.pendingFileCount).toBe(2))
    } finally {
      releaseDownloads.resolve()
      await rejected
    }
    await vi.waitFor(() => expect(status.pendingFileCount).toBe(1))
    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)

    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.resumeInstanceInstall(f.instancePath)

    expect(mockedDownload.mock.calls.flatMap(([downloads]) => downloads.map(download => download.file.path))).toEqual([missing.path])
    expect(await pathExists(join(f.instancePath, '.install'))).toBe(false)
    await vi.waitFor(() => expect(status.pendingFileCount).toBe(0))
  })

  it('refreshes watched pending counts when the whole staging root is removed and recreated', async () => {
    const f = await fixture()
    const missing = f.file('config/missing.txt')
    mockedDownload.mockRejectedValue(new Error('download failed'))
    await expect(f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [missing],
    })).rejects.toThrow('download failed')
    const [profile] = await readPendingInstalls(f.instancePath)
    const emitted = vi.spyOn(FSWatcher.prototype, 'emit')
    const status = await f.service.watchInstanceInstall(f.instancePath)
    expect(status.pendingFileCount).toBe(1)
    await vi.waitFor(() => expect(emitted).toHaveBeenCalledWith('ready'))

    await rm(join(f.instancePath, '.install'), { recursive: true })
    await vi.waitFor(() => expect(status.pendingFileCount).toBe(0))

    await ensureDir(dirname(profile.path))
    await writeJson(profile.path, profile.state)
    await vi.waitFor(() => expect(status.pendingFileCount).toBe(1))

    await rm(join(f.instancePath, '.install'), { recursive: true })
    await vi.waitFor(() => expect(status.pendingFileCount).toBe(0))
  })

  it('records only published upstream files and defers removals without advancing the old mtime on failure', async () => {
    const f = await fixture()
    const obsolete = f.file('mods/obsolete.jar')
    const edited = f.file('config/edited.txt', 'original settings')
    const ready = f.file('mods/ready.jar')
    const missing = f.file('mods/missing.jar')
    const upstream = { type: 'peer' as const, id: 'upstream-pack' }
    const oldMtime = Date.now() - 60_000
    await f.write(join(f.instancePath, obsolete.path), obsolete.path)
    await f.write(join(f.instancePath, edited.path), 'user settings')
    await utimes(join(f.instancePath, obsolete.path), (oldMtime - 10_000) / 1000, (oldMtime - 10_000) / 1000)
    await utimes(join(f.instancePath, edited.path), (oldMtime + 10_000) / 1000, (oldMtime + 10_000) / 1000)
    const lockPath = join(f.instancePath, 'instance-lock.json')
    await writeJson(lockPath, { version: 1, upstream, files: [obsolete, edited], mtime: oldMtime })
    const failure = new Error('one upstream download failed')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      throw failure
    })

    await expect(f.service.installInstanceFiles({
      path: f.instancePath, upstream, files: [ready, missing],
    })).rejects.toBe(failure)

    const partialLock = await readJson(lockPath)
    expect(partialLock.files).toEqual([obsolete, edited, ready])
    expect(partialLock.mtime).toBe(oldMtime)
    expect(partialLock.upstream).toEqual(upstream)
    expect(await readFile(join(f.instancePath, obsolete.path), 'utf8')).toBe(obsolete.path)
    expect(await readFile(join(f.instancePath, edited.path), 'utf8')).toBe('user settings')
    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
    expect(await pathExists(join(f.instancePath, missing.path))).toBe(false)
    const [profile] = await readPendingInstalls(f.instancePath)
    expect(dirname(profile.path)).toBe(join(f.instancePath, '.install'))
    expect(profile.state.oldFiles).toBeUndefined()
    expect(profile.state.committedPath).toEqual([ready.path])
    expect(relative(f.instancePath, profile.state.workspace).split(sep)[0]).toBe('.install')
    expect(await pathExists(join(profile.state.backup, edited.path))).toBe(false)

    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)
    const beforeResume = Date.now()
    await f.createService().resumeInstanceInstall(f.instancePath)

    expect(mockedDownload).toHaveBeenCalledTimes(1)
    expect(mockedDownload.mock.calls[0][0].map(download => download.file.path)).toEqual([missing.path])
    expect(await pathExists(join(f.instancePath, obsolete.path))).toBe(false)
    expect(await pathExists(join(f.instancePath, edited.path))).toBe(false)
    expect(await readFile(join(profile.state.backup, edited.path), 'utf8')).toBe('user settings')
    expect(await pathExists(join(profile.state.backup, obsolete.path))).toBe(false)
    const completedLock = await readJson(lockPath)
    expect(completedLock.files).toEqual([ready, missing])
    expect(completedLock.mtime).toBeGreaterThanOrEqual(beforeResume)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it('does not mark a staged file committed when publishing fails and reuses it on resume', async () => {
    const f = await fixture()
    const ready = f.file('mods/ready.jar')
    const blocked = f.file('mods/blocked.jar')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await Promise.all(downloads.map(download => f.materialize(download, finished)))
      // A directory created after preparation prevents renaming this file.
      await ensureDir(join(f.instancePath, blocked.path))
    })

    await expect(f.service.installInstanceFiles({
      path: f.instancePath, upstream: { type: 'peer', id: 'upstream-pack' }, files: [ready, blocked],
    })).rejects.toBeInstanceOf(Error)

    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
    const profiles = await readPendingInstalls(f.instancePath)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].state.committedPath).toEqual([ready.path])
    expect(profiles[0].state.finishedPath).toEqual([blocked.path])
    expect(await readFile(join(profiles[0].state.workspace, blocked.path), 'utf8')).toBe(blocked.path)
    expect((await readJson(join(f.instancePath, 'instance-lock.json'))).files).toEqual([ready])

    await rm(join(f.instancePath, blocked.path), { recursive: true })
    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)
    await f.createService().resumeInstanceInstall(f.instancePath)

    expect(mockedDownload).not.toHaveBeenCalled()
    expect(await readFile(join(f.instancePath, blocked.path), 'utf8')).toBe(blocked.path)
    expect((await readJson(join(f.instancePath, 'instance-lock.json'))).files).toEqual([ready, blocked])
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it('publishes completed downloads when cancelled and retains a recoverable pending profile', async () => {
    const f = await fixture()
    const ready = f.file('mods/ready.jar')
    const missing = f.file('mods/missing.jar')
    const prepared = Promise.withResolvers<void>()
    mockedDownload.mockImplementation(async (downloads, finished, signal) => {
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      const aborted = new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve(), { once: true }))
      prepared.resolve()
      await aborted
      signal.throwIfAborted()
    })
    const installing = f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [ready, missing],
    })
    const rejected = expect(installing).rejects.toMatchObject({ name: 'AbortError' })
    await prepared.promise
    const task = f.tasks.create.mock.results[0].value
    task.controller.abort()
    await rejected

    expect(task.complete).not.toHaveBeenCalled()
    expect(task.fail).toHaveBeenCalled()
    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
    expect(await pathExists(join(f.instancePath, missing.path))).toBe(false)
    const profiles = await readPendingInstalls(f.instancePath)
    expect(profiles).toHaveLength(1)
    expectLocalProfile(f.instancePath, profiles[0])
    expect(profiles[0].state.committedPath).toEqual([ready.path])

    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)
    await f.createService().resumeInstanceInstall(f.instancePath)
    expect(mockedDownload.mock.calls.flatMap(([downloads]) => downloads.map(download => download.file.path))).toEqual([missing.path])
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it('managed removal waits beyond three seconds for outside-lock writers without resurrecting the root', async () => {
    const f = await fixture()
    const file = f.file('mods/late.jar')
    const started = Promise.withResolvers<void>()
    const releaseWriter = Promise.withResolvers<void>()
    const removalEntered = Promise.withResolvers<void>()
    const events: string[] = []
    let downloadSignal: AbortSignal | undefined
    mockedDownload.mockImplementation(async (downloads, finished, signal) => {
      downloadSignal = signal
      started.resolve()
      // Model IO already in flight when abort arrives: it still has to settle.
      await releaseWriter.promise
      await f.materialize(downloads[0], finished)
      events.push('writer settled')
      signal.throwIfAborted()
    })
    const installing = f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [file],
    }).then(() => ({ error: undefined }), error => ({ error }))
    await started.promise
    const instanceLock = f.mutex.of(LockKey.instance(f.instancePath))
    expect(instanceLock.isLocked()).toBe(false)
    let handlerResults: Array<void | Promise<void>> = []
    // Match InstanceService.deleteInstance: cancel waiters, signal handlers,
    // then await their writers while holding the same instance mutex as commit.
    const removing = f.mutex.of(LockKey.instanceRemove(f.instancePath)).runExclusive(async () => {
      instanceLock.cancel()
      handlerResults = [...f.removeHandlers].map(handler => handler())
      await instanceLock.runExclusive(async () => {
        removalEntered.resolve()
        await Promise.allSettled(handlerResults)
        events.push('remove root')
        await rm(f.instancePath, { recursive: true, force: true })
      })
    })
    try {
      await removalEntered.promise
      expect(downloadSignal?.aborted).toBe(true)
      expect(handlerResults).toHaveLength(1)
      expect(handlerResults[0]).toBeInstanceOf(Promise)
      await new Promise(resolve => setTimeout(resolve, 3200))
      expect(events).toEqual([])
      expect(await pathExists(f.instancePath)).toBe(true)
    } finally {
      releaseWriter.resolve()
      await removing
      await installing
    }
    const outcome = await installing
    expect(outcome.error).toMatchObject({ name: 'AbortError' })
    expect(events).toEqual(['writer settled', 'remove root'])
    expect(await pathExists(f.instancePath)).toBe(false)
    expect(await readdir(f.root)).toEqual([])
    expect(f.removeHandlers.size).toBe(0)
  }, 10000)

  it('does not deadlock deletion while initialization is still waiting for the instance mutex', async () => {
    const f = await fixture()
    let installing: Promise<unknown> | undefined
    try {
      await f.mutex.of(LockKey.instance(f.instancePath)).runExclusive(async () => {
        installing = f.service.installInstanceFiles({
          path: f.instancePath, oldFiles: [], files: [f.file('mods/queued.jar')],
        }).catch(error => error)
        await vi.waitFor(() => expect(f.removeHandlers.size).toBe(1))
        let settled = false
        const removing = Promise.all([...f.removeHandlers].map(handler => handler())).then(() => { settled = true })
        await vi.waitFor(() => expect(settled).toBe(true), { timeout: 500 })
        await removing
        await rm(f.instancePath, { recursive: true })
      })
    } finally {
      expect(await installing).toMatchObject({ name: 'AbortError' })
    }
    expect(mockedDownload).not.toHaveBeenCalled()
    expect(await pathExists(f.instancePath)).toBe(false)
  })

  it('keeps separate profiles for concurrent failed diffs and resumes both missing files', async () => {
    const f = await fixture()
    const first = [f.file('mods/first-ready.jar'), f.file('mods/first-missing.jar')]
    const second = [f.file('mods/second-ready.jar'), f.file('mods/second-missing.jar')]
    const releaseDownloads = Promise.withResolvers<void>()
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await releaseDownloads.promise
      await f.materialize(downloads.find(download => download.file.path.endsWith('-ready.jar'))!, finished)
      throw new Error('missing concurrent download')
    })
    const installs = [first, second].map(files => f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files,
    }))
    const settled = Promise.allSettled(installs)
    try {
      await vi.waitFor(() => expect(mockedDownload).toHaveBeenCalledTimes(2))
    } finally {
      releaseDownloads.resolve()
      await settled
    }
    expect((await settled).map(result => result.status)).toEqual(['rejected', 'rejected'])
    const profiles = await readPendingInstalls(f.instancePath)
    expect(profiles).toHaveLength(2)
    expect(new Set(profiles.map(profile => profile.path)).size).toBe(2)
    expect(new Set(profiles.map(profile => profile.state.workspace)).size).toBe(2)
    for (const profile of profiles) {
      expectLocalProfile(f.instancePath, profile)
      const files = profile.state.files
      expect([first, second]).toContainEqual(files)
      expect(profile.state.committedPath).toEqual([files[0].path])
      expect(await readFile(join(f.instancePath, files[0].path), 'utf8')).toBe(files[0].path)
      expect(await pathExists(join(f.instancePath, files[1].path))).toBe(false)
    }

    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)
    await f.createService().resumeInstanceInstall(f.instancePath)

    expect(mockedDownload).toHaveBeenCalledTimes(2)
    expect(mockedDownload.mock.calls.flatMap(([downloads]) => downloads.map(download => download.file.path)).sort())
      .toEqual([first[1].path, second[1].path])
    for (const file of [...first, ...second]) {
      expect(await readFile(join(f.instancePath, file.path), 'utf8')).toBe(file.path)
    }
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
    expect(await pathExists(join(f.instancePath, '.install-profile'))).toBe(false)
    expect(await pathExists(join(f.instancePath, 'instance-lock.json'))).toBe(false)
  })

  it.each(['local diff', 'legacy peer profile'])('never rewrites the upstream lock when recovering a %s', async (layout) => {
    const f = await fixture()
    const managed = f.file('mods/managed.jar')
    const ready = f.file('mods/local-ready.jar')
    const missing = f.file('mods/local-missing.jar')
    await f.write(join(f.instancePath, managed.path), managed.path)
    const lockPath = join(f.instancePath, 'instance-lock.json')
    await writeJson(lockPath, {
      version: 1, upstream: { type: 'peer', id: 'real-upstream' }, files: [managed], mtime: 123456789,
    })
    const originalLock = await readFile(lockPath, 'utf8')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      throw new Error('local download failed')
    })
    await expect(f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [ready, missing],
    })).rejects.toThrow('local download failed')
    const [profile] = await readPendingInstalls(f.instancePath)
    expectLocalProfile(f.instancePath, profile)
    expect(await readFile(lockPath, 'utf8')).toBe(originalLock)
    if (layout === 'legacy peer profile') {
      delete profile.state.oldFiles
      await writeJson(profile.path, profile.state)
      await rename(profile.path, join(f.instancePath, '.install-profile'))
    }
    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)

    await f.createService().resumeInstanceInstall(f.instancePath)

    expect(mockedDownload.mock.calls.flatMap(([downloads]) => downloads.map(download => download.file.path))).toEqual([missing.path])
    expect(await readFile(lockPath, 'utf8')).toBe(originalLock)
    expect(await readFile(join(f.instancePath, managed.path), 'utf8')).toBe(managed.path)
    expect(await readFile(join(f.instancePath, missing.path), 'utf8')).toBe(missing.path)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it('finishes deferred removals on resume when every target file was already committed', async () => {
    const f = await fixture()
    const obsolete = f.file('mods/obsolete.jar')
    const ready = f.file('mods/ready.jar')
    await f.write(join(f.instancePath, obsolete.path), obsolete.path)
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await Promise.all(downloads.map(download => f.materialize(download, finished)))
      throw new Error('batch failed after its last completed file')
    })
    await expect(f.service.installInstanceFiles({
      path: f.instancePath, oldFiles: [obsolete], files: [ready],
    })).rejects.toThrow('batch failed after its last completed file')
    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
    expect(await pathExists(join(f.instancePath, obsolete.path))).toBe(true)
    const profiles = await readPendingInstalls(f.instancePath)
    expect(profiles).toHaveLength(1)
    expect(profiles[0].state.committedPath).toEqual([ready.path])
    const status = await f.service.watchInstanceInstall(f.instancePath)
    expect(status.pendingFileCount).toBe(1)

    mockedDownload.mockClear()
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.resumeInstanceInstall(f.instancePath)

    expect(mockedDownload).not.toHaveBeenCalled()
    expect(await pathExists(join(f.instancePath, obsolete.path))).toBe(false)
    expect(await readFile(join(f.instancePath, ready.path), 'utf8')).toBe(ready.path)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
    await vi.waitFor(() => expect(status.pendingFileCount).toBe(0))
  })

  it('loads unresolved files at acquisition/revalidation and fails closed on a malformed file', async () => {
    const f = await fixture()
    const file = f.file('mods/missing.jar')
    const unresolved = join(f.instancePath, 'unresolved-files.json')
    await writeJson(unresolved, [file])
    const status = await f.service.watchInstanceInstall(f.instancePath)
    expect(status.unresolvedFiles).toEqual([file])
    await writeJson(unresolved, null)
    await f.refreshStatus()
    expect(status.pendingFileCount).toBeGreaterThan(0)
    expect(Array.isArray(status.unresolvedFiles)).toBe(true)
    await rm(unresolved)
    await f.refreshStatus()
    expect(status.unresolvedFiles).toEqual([])
    expect(status.pendingFileCount).toBe(0)
  })

  it.each([false, true])('reconciles a staged manifest after retry without removing a newer revision (%s)', async (newerRevision) => {
    const f = await fixture()
    const ready = f.file('mods/ready.jar')
    const missing = f.file('mods/missing.jar')
    const manifest = await f.service.stageInstanceFiles({
      path: f.instancePath, oldFiles: [], files: [ready, missing],
    })
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads.find(download => download.file.path === ready.path)!, finished)
      throw new Error('manifest download failed')
    })
    await expect(f.service.applyInstanceInstallManifest(f.instancePath)).rejects.toThrow('manifest download failed')
    expect(await f.service.getInstanceInstallManifest(f.instancePath)).toEqual(manifest)
    if (newerRevision) {
      await writeJson(join(f.instancePath, '.install-manifest'), {
        ...manifest,
        updatedAt: manifest.updatedAt + 1,
        files: [f.file('mods/future.jar')],
      })
    }
    mockedDownload.mockImplementation(f.downloadAll)
    await f.createService().resumeInstanceInstall(f.instancePath)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
    const remaining = await f.service.getInstanceInstallManifest(f.instancePath)
    if (newerRevision) expect(remaining?.files.map(file => file.path)).toEqual(['mods/future.jar'])
    else expect(remaining).toBeUndefined()
  })

  it('rejects unmanaged and non-Java roots before any task, state write or watcher', async () => {
    const f = await fixture(), outside = join(f.root, 'unregistered')
    await ensureDir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
    const operations = (path: string) => [
      () => f.service.installInstanceFiles({ path, oldFiles: [], files: [] }),
      () => f.service.previewInstanceFiles({ path, oldFiles: [], files: [] }),
      () => f.service.getInstanceInstallManifest(path),
      () => f.service.getReviewedModInstalls(path),
      () => f.service.previewModInstallRecovery(path, '00000000-0000-0000-0000-000000000000'),
      () => f.service.stageInstanceFiles({ path, oldFiles: [], files: [] }),
      () => f.service.setInstanceInstallManifest({ path, oldFiles: [], files: [] }),
      () => f.service.applyInstanceInstallManifest(path),
      () => f.service.discardInstanceInstallManifest(path),
      () => f.service.resumeInstanceInstall(path),
      () => f.service.dismissUnresolvedFiles(path),
      () => f.service.watchInstanceInstall(path),
      () => f.service.getLegacyLock(path),
    ]
    for (const op of operations(outside)) await expect(op()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
    f.instanceService.state.all[f.instancePath].edition = 'bedrock'
    for (const op of operations(f.instancePath)) await expect(op()).rejects.toHaveProperty('name', 'InstanceNotFoundError')
    expect(f.tasks.create).not.toHaveBeenCalled()
    expect(await readdir(outside)).toEqual(['keep'])
    expect(await readdir(f.instancePath)).toEqual([])
    for (const method of ['getInstallFile', 'getSha1', 'getCrc32', 'getChecksum', 'resumeInstallProfile']) expect((f.service as unknown as Record<string, unknown>)[method]).toBeUndefined()
  })

  it('rechecks registration and tracked games after waiting for the instance lock', async () => {
    for (const change of ['registration', 'process']) {
      const f = await fixture(), file = f.file('mods/next.jar')
      const release = await f.mutex.of(LockKey.instance(f.instancePath)).acquire()
      const installing = f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [file] })
      const rejected = expect(installing).rejects.toHaveProperty('name', change === 'registration' ? 'InstanceNotFoundError' : 'InstanceRunningError')
      try {
        await vi.waitFor(() => expect(f.tasks.create).toHaveBeenCalledTimes(1))
        if (change === 'registration') delete f.instanceService.state.all[f.instancePath]
        else f.processes.push({ options: { gameDirectory: f.instancePath } })
      } finally { release(); await rejected }
      expect(await readdir(f.instancePath)).toEqual([])
      expect(mockedDownload).not.toHaveBeenCalled()
    }
  })

  it('keeps published files unchanged when a game starts during preparation and can resume after it stops', async () => {
    const f = await fixture(), file = f.file('mods/next.jar', 'NEW')
    await f.write(join(f.instancePath, 'mods/keep.jar'), 'KEEP')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      for (const download of downloads) await f.materialize(download, finished)
      f.processes.push({ options: { gameDirectory: f.instancePath } })
    })
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [file] })).rejects.toHaveProperty('name', 'InstanceRunningError')
    expect(await pathExists(join(f.instancePath, file.path))).toBe(false)
    expect(await readFile(join(f.instancePath, 'mods/keep.jar'), 'utf8')).toBe('KEEP')
    expect(await readPendingInstalls(f.instancePath)).toHaveLength(1)
    f.processes.splice(0); mockedDownload.mockImplementation(f.downloadAll)
    await f.service.resumeInstanceInstall(f.instancePath)
    expect(await readFile(join(f.instancePath, file.path), 'utf8')).toBe('NEW')
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it('rejects a registered directory replaced by a junction without touching its target', async () => {
    const f = await fixture(), outside = join(f.root, 'outside')
    await ensureDir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
    await rename(f.instancePath, `${f.instancePath}-saved`); await symlink(outside, f.instancePath, 'junction')
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [] })).rejects.toHaveProperty('name', 'UnsafeInstanceDirectory')
    await expect(f.service.stageInstanceFiles({ path: f.instancePath, oldFiles: [], files: [] })).rejects.toHaveProperty('name', 'UnsafeInstanceDirectory')
    expect(await readdir(outside)).toEqual(['keep'])
    expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
    expect(f.tasks.create).not.toHaveBeenCalled()
  })

  it('allows metadata-only staging while playing but refuses application, preserving linked originals', async () => {
    const f = await fixture(), outside = join(f.root, 'original.json')
    const original = { version: 1, createdAt: 1, updatedAt: 1, oldFiles: [], files: [] }
    await writeJson(outside, original); await link(outside, join(f.instancePath, '.install-manifest'))
    f.processes.push({ options: { gameDirectory: f.instancePath } })
    const file = f.file('mods/next.jar')
    await f.service.stageInstanceFiles({ path: f.instancePath, oldFiles: [], files: [file] })
    expect(await readJson(outside)).toEqual(original)
    expect((await f.service.getInstanceInstallManifest(f.instancePath))?.files).toEqual([file])
    await expect(f.service.applyInstanceInstallManifest(f.instancePath)).rejects.toHaveProperty('name', 'InstanceRunningError')
    await f.service.discardInstanceInstallManifest(f.instancePath)
    expect(await pathExists(join(f.instancePath, '.install-manifest'))).toBe(false)
    expect(await readJson(outside)).toEqual(original)
    expect(f.tasks.create).not.toHaveBeenCalled()
  })

  it('refuses traversal and launcher metadata in preview, staging and installation before reading target files', async () => {
    const f = await fixture()
    await writeFile(join(f.instancePath, 'instance.json'), 'KEEP')
    for (const path of ['../outside', 'instance.json', 'config/../INSTANCE.JSON', '.install-state-old.tmp', '']) {
      const options = { path: f.instancePath, oldFiles: [], files: [f.file(path)] }
      await expect(f.service.previewInstanceFiles(options)).rejects.toThrow('Invalid instance install path')
      await expect(f.service.stageInstanceFiles(options)).rejects.toThrow('Invalid instance install path')
      await expect(f.service.installInstanceFiles(options)).rejects.toThrow('Invalid instance install path')
    }
    expect(await readFile(join(f.instancePath, 'instance.json'), 'utf8')).toBe('KEEP')
    expect(await readdir(f.instancePath)).toEqual(['instance.json'])
    expect(f.tasks.create).not.toHaveBeenCalled()
  })

  it('preserves malformed unresolved metadata instead of deleting it during a partial dismissal', async () => {
    const f = await fixture(), file = join(f.instancePath, 'unresolved-files.json')
    await writeFile(file, 'invalid JSON')
    await expect(f.service.dismissUnresolvedFiles(f.instancePath, ['mods/unknown.jar'])).rejects.toThrow()
    expect(await readFile(file, 'utf8')).toBe('invalid JSON')
    const a = f.file('mods/a.jar'), b = f.file('mods/b.jar')
    await writeJson(file, [a, b]); await f.service.dismissUnresolvedFiles(f.instancePath, [a.path])
    expect(await readJson(file)).toEqual([b])
  })

  it.each(['.install', '.backups'])('rejects a linked %s directory before creating anything in its target', async (name) => {
    const f = await fixture(), outside = join(f.root, 'outside')
    await ensureDir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
    await symlink(outside, join(f.instancePath, name), 'junction')
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [f.file('mods/next.jar')] })).rejects.toThrow('Unsafe install directory')
    expect(await readdir(outside)).toEqual(['keep'])
    expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
    expect(mockedDownload).not.toHaveBeenCalled()
    expect(f.tasks.create).not.toHaveBeenCalled()
  })

  it.each(['workspace', 'backup'])('refuses a persisted external %s without touching files or rewriting the profile', async (field) => {
    const f = await fixture(), outside = join(f.root, 'outside')
    await ensureDir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
    mockedDownload.mockRejectedValue(new Error('download failed'))
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [f.file('mods/next.jar')] })).rejects.toThrow('download failed')
    const [profile] = await readPendingInstalls(f.instancePath)
    await writeJson(profile.path, { ...profile.state, [field]: outside })
    const before = await readFile(profile.path, 'utf8'), taskCount = f.tasks.create.mock.calls.length
    await expect(f.createService().resumeInstanceInstall(f.instancePath)).rejects.toThrow('Unsafe install state paths')
    expect(await readFile(profile.path, 'utf8')).toBe(before)
    expect(f.tasks.create).toHaveBeenCalledTimes(taskCount)
    expect(await readdir(outside)).toEqual(['keep'])
    expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
  })

  it('recovers a legacy external workspace by preparing again privately, preserving its original files', async () => {
    const f = await fixture(), file = f.file('mods/next.jar'), outside = join(f.root, '.instance-install-legacy')
    mockedDownload.mockRejectedValue(new Error('old install interrupted'))
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [file] })).rejects.toThrow('old install interrupted')
    const [profile] = await readPendingInstalls(f.instancePath)
    await ensureDir(outside); await f.write(join(outside, 'mods/next.jar'), 'LEGACY ORIGINAL')
    await writeJson(join(f.instancePath, '.install-profile'), { ...profile.state, workspace: outside, finishedPath: [file.path] })
    await rm(profile.path)
    expect(await pathExists(join(f.instancePath, file.path))).toBe(false)
    mockedDownload.mockClear(); mockedDownload.mockImplementation(f.downloadAll)
    await f.createService().resumeInstanceInstall(f.instancePath)
    expect(mockedDownload).toHaveBeenCalledTimes(1)
    expect(await readFile(join(outside, 'mods/next.jar'), 'utf8')).toBe('LEGACY ORIGINAL')
    expect(await readFile(join(f.instancePath, file.path), 'utf8')).toBe(file.path)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it('rejects a workspace path changed during preparation before publishing or cleaning its target', async () => {
    const f = await fixture(), outside = join(f.root, 'outside'), file = f.file('mods/next.jar')
    await ensureDir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads[0], finished)
      const [profile] = await readPendingInstalls(f.instancePath)
      await writeJson(profile.path, { ...profile.state, workspace: outside })
    })
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [file] })).rejects.toThrow('Unsafe install state paths')
    expect(await pathExists(join(f.instancePath, file.path))).toBe(false)
    expect(await readdir(outside)).toEqual(['keep'])
    expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
  })

  it.each(['mods/next.jar', 'config/deep/next.txt'])('refuses a linked destination ancestor for %s before reading or creating a task', async path => {
    const f = await fixture(), outside = join(f.root, 'outside'), parent = dirname(join(f.instancePath, path)), file = f.file(path)
    await ensureDir(outside); await writeFile(join(outside, basename(path)), 'KEEP')
    await ensureDir(dirname(parent)); await symlink(outside, parent, 'junction')
    const options = { path: f.instancePath, oldFiles: [], files: [file] }
    await expect(f.service.previewInstanceFiles(options)).rejects.toThrow(/link|Unsafe/)
    await expect(f.service.installInstanceFiles(options)).rejects.toThrow(/link|Unsafe/)
    expect(f.worker.checksum).not.toHaveBeenCalled(); expect(f.tasks.create).not.toHaveBeenCalled()
    expect(await readFile(join(outside, basename(path)), 'utf8')).toBe('KEEP')
  })

  it.each(['resourcepacks', 'shaderpacks', 'saves'])('preserves the native shared %s root while rejecting its nested links', async name => {
    const f = await fixture(), shared = join(f.root, name), outside = join(f.root, 'outside'), file = f.file(`${name}/next.zip`)
    await ensureDir(shared); await writeFile(join(shared, 'keep'), 'KEEP')
    await symlink(shared, join(f.instancePath, name), 'junction')
    await expect(f.service.previewInstanceFiles({ path: f.instancePath, oldFiles: [], files: [f.file(name)] })).rejects.toThrow('Unsafe instance file')
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [file] })
    expect(await readFile(join(shared, 'next.zip'), 'utf8')).toBe(file.path)
    expect(await readFile(join(shared, 'keep'), 'utf8')).toBe('KEEP')
    await ensureDir(outside); await writeFile(join(outside, 'keep'), 'OUTSIDE')
    await symlink(outside, join(shared, 'nested'), 'junction')
    await expect(f.service.previewInstanceFiles({ path: f.instancePath, oldFiles: [], files: [f.file(`${name}/nested/keep`)] })).rejects.toThrow('Unsafe instance file')
    expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('OUTSIDE')
  })

  it('rejects a destination redirected after download without publishing into its target', async () => {
    const f = await fixture(), outside = join(f.root, 'outside'), file = f.file('mods/next.jar')
    await ensureDir(outside); await writeFile(join(outside, 'next.jar'), 'KEEP')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads[0], finished)
      await symlink(outside, join(f.instancePath, 'mods'), 'junction')
    })
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [file] })).rejects.toThrow('Untrusted instance link')
    expect(await readFile(join(outside, 'next.jar'), 'utf8')).toBe('KEEP')
  })

  it('rejects a backup child redirected after preparation, preserving both current and outside files', async () => {
    const f = await fixture(), outside = join(f.root, 'outside'), old = f.file('config/next.txt', 'CURRENT'), file = f.file(old.path, 'NEW')
    await f.write(join(f.instancePath, old.path), 'CURRENT'); await ensureDir(outside); await writeFile(join(outside, 'next.txt'), 'KEEP')
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads[0], finished)
      const [profile] = await readPendingInstalls(f.instancePath)
      await ensureDir(profile.state.backup); await symlink(outside, join(profile.state.backup, 'config'), 'junction')
    })
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [old], files: [file] })).rejects.toThrow('Unsafe install directory')
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('CURRENT')
    expect(await readFile(join(outside, 'next.txt'), 'utf8')).toBe('KEEP')
  })

  it('applies exactly reviewed disabled-mod replacements and preserves the upstream lock', async () => {
    const f = await fixture(), old = f.file('mods/old.jar.disabled', 'OLD'), next = f.file('mods/new.jar.disabled', 'NEW')
    const lock = JSON.stringify({ version: 1, mtime: 1, upstream: { type: 'peer', id: 'keep' }, files: [] })
    await f.write(join(f.instancePath, old.path), 'OLD'); await writeFile(join(f.instancePath, 'instance-lock.json'), lock)
    const options = await f.review([old], [next])
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.installInstanceFiles(options)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe('NEW')
    expect(await pathExists(join(f.instancePath, old.path))).toBe(false)
    expect(await readFile(join(f.instancePath, 'instance-lock.json'), 'utf8')).toBe(lock)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })

  it.each(['file', 'configuration', 'collision'])('rejects %s changes during a reviewed download and preserves user bytes', async change => {
    const f = await fixture(), old = f.file('mods/old.jar', 'OLD'), next = f.file(change === 'collision' ? 'mods/new.jar' : old.path, 'NEW')
    await f.write(join(f.instancePath, old.path), 'OLD')
    const options = await f.review([old], [next])
    mockedDownload.mockImplementation(async (downloads, finished) => {
      await f.materialize(downloads[0], finished)
      if (change === 'configuration') f.instanceService.state.all[f.instancePath].runtime.fabricLoader = '0.16.0'
      else await f.write(join(f.instancePath, change === 'file' ? old.path : next.path), 'USER')
    })
    await expect(f.service.installInstanceFiles(options)).rejects.toHaveProperty('name', 'ModFilesChangedError')
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe(change === 'file' ? 'USER' : 'OLD')
    if (change === 'collision') expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe('USER')
    expect((await readPendingInstalls(f.instancePath))[0].state.review?.configuration).toBeDefined()
  })

  it.each(['snapshot', 'changes'])('rejects a stale reviewed %s before publishing a profile', async condition => {
    const f = await fixture(), old = f.file('mods/old.jar', 'OLD'), next = f.file('mods/new.jar', 'NEW')
    await f.write(join(f.instancePath, old.path), 'OLD')
    const options = await f.review([old], [next])
    if (condition === 'snapshot') f.instanceService.state.all[f.instancePath].version = 'different'
    else options.review.changes = []
    await expect(f.service.installInstanceFiles(options)).rejects.toHaveProperty('name', 'ModFilesChangedError')
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
    expect(mockedDownload).not.toHaveBeenCalled()
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('OLD')
  })

  it.each([false, true])('recovers its own reviewed publication with a lost progress marker but refuses edited published bytes (%s)', async edited => {
    const f = await fixture(), a = f.file('mods/a-old.jar', 'A'), b = f.file('mods/b-old.jar', 'B'), nextA = f.file('mods/a-new.jar', 'NEW A'), nextB = f.file('mods/b-new.jar', 'NEW B')
    await f.write(join(f.instancePath, a.path), 'A'); await f.write(join(f.instancePath, b.path), 'B')
    const options = await f.review([a, b], [nextA, nextB])
    mockedDownload.mockImplementation(async (downloads, finished) => { await f.materialize(downloads.find(download => download.file.path === nextA.path)!, finished); throw new Error('interrupted') })
    await expect(f.service.installInstanceFiles(options)).rejects.toThrow('interrupted')
    const [profile] = await readPendingInstalls(f.instancePath)
    await writeJson(profile.path, { ...profile.state, committedPath: [], finishedPath: [] })
    if (edited) await writeFile(join(f.instancePath, nextA.path), 'USER')
    mockedDownload.mockClear(); mockedDownload.mockImplementation(f.downloadAll)
    if (edited) {
      await expect(f.createService().resumeInstanceInstall(f.instancePath)).rejects.toHaveProperty('name', 'ModFilesChangedError')
      expect(await readFile(join(f.instancePath, nextA.path), 'utf8')).toBe('USER')
      expect(mockedDownload).not.toHaveBeenCalled()
    } else {
      await f.createService().resumeInstanceInstall(f.instancePath)
      expect(mockedDownload.mock.calls.flatMap(([downloads]) => downloads.map(download => download.file.path))).toEqual([nextB.path])
      expect(await readFile(join(f.instancePath, nextA.path), 'utf8')).toBe('NEW A')
      expect(await readFile(join(f.instancePath, nextB.path), 'utf8')).toBe('NEW B')
      expect(await pathExists(join(f.instancePath, a.path))).toBe(false)
      expect(await pathExists(join(f.instancePath, b.path))).toBe(false)
      expect(await readPendingInstalls(f.instancePath)).toEqual([])
    }
  })

  it('previews transferred old filenames and confirms only that reviewed project while retaining another pending project', async () => {
    const f = await fixture(), old = { ...f.file('mods/a-old.jar', 'OLD'), curseforge: { projectId: 1, fileId: 1 } }
    const partial = { ...f.file('mods/a-partial.jar', 'PARTIAL'), curseforge: { projectId: 1, fileId: 2 } }
    const next = { ...f.file('mods/a-latest.jar', 'LATEST'), curseforge: { projectId: 1, fileId: 3 } }
    const missing = { ...f.file('mods/b.jar', 'B'), curseforge: { projectId: 2, fileId: 4 } }
    await f.write(join(f.instancePath, old.path), 'OLD')
    mockedDownload.mockImplementation(async (downloads, finished) => { await f.materialize(downloads.find(download => download.file.path === partial.path)!, finished); throw new Error('B failed') })
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [old], files: [partial, missing] })).rejects.toThrow('B failed')
    const options = await f.review([partial], [next])
    expect(options.review.changes.filter(change => change.operation.includes('remove')).map(change => change.path).sort()).toEqual([old.path, partial.path])
    mockedDownload.mockClear(); mockedDownload.mockImplementation(f.downloadAll)
    await f.service.installInstanceFiles(options)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe('LATEST')
    expect(await pathExists(join(f.instancePath, old.path))).toBe(false)
    expect(await pathExists(join(f.instancePath, partial.path))).toBe(false)
    expect(await pathExists(join(f.instancePath, missing.path))).toBe(false)
    expect((await readPendingInstalls(f.instancePath))).toHaveLength(1)
  })

  it.skipIf(process.platform !== 'win32')('keeps a reviewed case-only replacement without removing the new bytes', async () => {
    const f = await fixture(), old = f.file('mods/Old.jar', 'OLD'), next = f.file('mods/old.jar', 'NEW')
    await f.write(join(f.instancePath, old.path), 'OLD')
    const options = await f.review([old], [next])
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.installInstanceFiles(options)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe('NEW')
    expect(await readdir(join(f.instancePath, 'mods'))).toHaveLength(1)
    expect(await readPendingInstalls(f.instancePath)).toEqual([])
  })
  it('lists reviewed active operations without private state and resumes only the explicitly selected one', async () => {
    const f = await fixture(), old = f.file('mods/old.jar', 'OLD'), next = f.file('mods/new.jar', 'NEW'), other = f.file('mods/other.jar', 'OTHER')
    await f.write(join(f.instancePath, old.path), 'OLD')
    mockedDownload.mockRejectedValue(new Error('offline'))
    await expect(f.service.installInstanceFiles(await f.review([old], [next]))).rejects.toThrow('offline')
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [other] })).rejects.toThrow('offline')
    const service = f.createService(), plans = await service.getReviewedModInstalls(f.instancePath)
    expect(plans).toHaveLength(1)
    expect(Object.keys(plans[0]).sort()).toEqual(['files', 'oldFiles', 'operationId'])
    expect(plans[0].files).toEqual([next]); expect(plans[0].oldFiles).toEqual([old])
    await expect(service.resumeInstanceInstall(f.instancePath, undefined, '../invalid')).rejects.toThrow('Invalid reviewed install')
    await expect(service.resumeInstanceInstall(f.instancePath, [], plans[0].operationId)).rejects.toThrow('Invalid reviewed install')
    const attempts = mockedDownload.mock.calls.length
    await expect(service.resumeInstanceInstall(f.instancePath, [{ ...next, hashes: { sha1: 'c'.repeat(40) } }])).rejects.toThrow('requires a new review')
    expect(mockedDownload).toHaveBeenCalledTimes(attempts)
    mockedDownload.mockImplementation(f.downloadAll)
    await service.resumeInstanceInstall(f.instancePath, undefined, plans[0].operationId)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe('NEW')
    expect(await pathExists(join(f.instancePath, other.path))).toBe(false)
    expect(await service.getReviewedModInstalls(f.instancePath)).toEqual([])
    expect(await readPendingInstalls(f.instancePath)).toHaveLength(1)
    await expect(service.resumeInstanceInstall(f.instancePath, undefined, plans[0].operationId)).rejects.toThrow('no longer pending')
  })

  it('requires a fresh recovery review for edited published files, preserves their backup and another pending plan', async () => {
    const f = await fixture(), a = f.file('mods/a-old.jar', 'A'), b = f.file('mods/b-old.jar', 'B'), nextA = f.file('mods/a-new.jar', 'NEW A'), nextB = f.file('mods/b-new.jar', 'NEW B'), other = f.file('mods/other.jar', 'OTHER')
    await f.write(join(f.instancePath, a.path), 'A'); await f.write(join(f.instancePath, b.path), 'B')
    mockedDownload.mockImplementationOnce(async (downloads, finished) => { await f.materialize(downloads.find(download => download.file.path === nextA.path)!, finished); throw new Error('interrupted') })
    await expect(f.service.installInstanceFiles(await f.review([a, b], [nextA, nextB]))).rejects.toThrow('interrupted')
    const [profile] = await readPendingInstalls(f.instancePath)
    await writeFile(join(f.instancePath, nextA.path), 'USER EDIT')
    mockedDownload.mockRejectedValueOnce(new Error('other offline'))
    await expect(f.service.installInstanceFiles({ path: f.instancePath, oldFiles: [], files: [other] })).rejects.toThrow('other offline')
    const service = f.createService()
    await expect(service.resumeInstanceInstall(f.instancePath, undefined, profile.state.operationId)).rejects.toHaveProperty('name', 'ModFilesChangedError')
    const saved = await readFile(profile.path), recovery = await service.previewModInstallRecovery(f.instancePath, profile.state.operationId!)
    expect(await readFile(profile.path)).toEqual(saved)
    expect(recovery.configurationChanged).toBe(false)
    expect(recovery.changes).toContainEqual(expect.objectContaining({ operation: 'backup-add', file: expect.objectContaining({ path: nextA.path }) }))
    expect(await readFile(join(f.instancePath, nextA.path), 'utf8')).toBe('USER EDIT')
    mockedDownload.mockImplementation(f.downloadAll)
    await service.resumeInstanceInstall(f.instancePath, undefined, profile.state.operationId, recovery.review)
    expect(await readFile(join(f.instancePath, nextA.path), 'utf8')).toBe('NEW A')
    expect(await readFile(join(f.instancePath, nextB.path), 'utf8')).toBe('NEW B')
    expect(await readFile(join(profile.state.backup, nextA.path), 'utf8')).toBe('USER EDIT')
    expect(await pathExists(join(f.instancePath, a.path))).toBe(false); expect(await pathExists(join(f.instancePath, b.path))).toBe(false)
    expect(await pathExists(join(f.instancePath, other.path))).toBe(false); expect(await readPendingInstalls(f.instancePath)).toHaveLength(1)
  })

  it.each(['file', 'configuration', 'plan', 'changes'])('rejects a recovery review made stale by %s changes without publishing or renewing confirmation', async change => {
    const f = await fixture(), old = f.file('mods/old.jar', 'OLD'), next = f.file('mods/new.jar', 'NEW')
    await f.write(join(f.instancePath, old.path), 'OLD')
    mockedDownload.mockRejectedValueOnce(new Error('offline'))
    await expect(f.service.installInstanceFiles(await f.review([old], [next]))).rejects.toThrow('offline')
    const [profile] = await readPendingInstalls(f.instancePath), recovery = await f.service.previewModInstallRecovery(f.instancePath, profile.state.operationId!)
    if (change === 'file') await writeFile(join(f.instancePath, old.path), 'USER')
    else if (change === 'configuration') f.instanceService.state.all[f.instancePath].runtime.minecraft = '1.20.4'
    else if (change === 'plan') await writeJson(profile.path, { ...profile.state, files: [f.file(next.path, 'DIFFERENT')] })
    else recovery.review.changes = []
    const saved = await readFile(profile.path), attempts = mockedDownload.mock.calls.length
    await expect(f.service.resumeInstanceInstall(f.instancePath, undefined, profile.state.operationId, recovery.review)).rejects.toHaveProperty('name', 'ModFilesChangedError')
    expect(mockedDownload).toHaveBeenCalledTimes(attempts); expect(await readFile(profile.path)).toEqual(saved)
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe(change === 'file' ? 'USER' : 'OLD')
    expect(await pathExists(join(f.instancePath, next.path))).toBe(false)
  })

  it('reviews a configuration changed since interruption and still rejects changes during the renewed download', async () => {
    const f = await fixture(), old = f.file('mods/old.jar', 'OLD'), next = f.file('mods/new.jar', 'NEW')
    await f.write(join(f.instancePath, old.path), 'OLD')
    mockedDownload.mockRejectedValueOnce(new Error('offline'))
    await expect(f.service.installInstanceFiles(await f.review([old], [next]))).rejects.toThrow('offline')
    const [profile] = await readPendingInstalls(f.instancePath)
    f.instanceService.state.all[f.instancePath].runtime.minecraft = '1.20.4'
    const recovery = await f.service.previewModInstallRecovery(f.instancePath, profile.state.operationId!)
    expect(recovery.configurationChanged).toBe(true)
    mockedDownload.mockImplementation(async (downloads, finished) => { await f.materialize(downloads[0], finished); await writeFile(join(f.instancePath, old.path), 'NEW USER EDIT') })
    await expect(f.service.resumeInstanceInstall(f.instancePath, undefined, profile.state.operationId, recovery.review)).rejects.toHaveProperty('name', 'ModFilesChangedError')
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('NEW USER EDIT')
    expect(await pathExists(join(f.instancePath, next.path))).toBe(false)
  })

  it.skipIf(process.platform !== 'win32')('backs up user edits during reviewed recovery of a case-only filename change', async () => {
    const f = await fixture(), old = f.file('mods/Old.jar', 'ORIGINAL'), next = f.file('mods/old.jar', 'NEW')
    await f.write(join(f.instancePath, old.path), 'ORIGINAL')
    mockedDownload.mockRejectedValueOnce(new Error('offline'))
    await expect(f.service.installInstanceFiles(await f.review([old], [next]))).rejects.toThrow('offline')
    const [profile] = await readPendingInstalls(f.instancePath)
    await writeFile(join(f.instancePath, old.path), 'USER')
    const recovery = await f.service.previewModInstallRecovery(f.instancePath, profile.state.operationId!)
    expect(recovery.changes).toContainEqual(expect.objectContaining({ file: expect.objectContaining({ path: next.path }), operation: 'backup-add' }))
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.resumeInstanceInstall(f.instancePath, undefined, profile.state.operationId, recovery.review)
    expect(await readFile(join(f.instancePath, next.path), 'utf8')).toBe('NEW')
    expect(await readFile(join(profile.state.backup, next.path), 'utf8')).toBe('USER')
    expect(await readdir(join(f.instancePath, 'mods'))).toHaveLength(1)
  })

  it.each([false, true])('updates a pack in place with backup and unchanged options/groups/worlds (shared=%s)', async shared => {
    const f = await fixture(), old = f.file('resourcepacks/My Pack.zip', 'OLD'), next = f.file(old.path, 'NEW')
    const global = join(f.root, 'resourcepacks')
    if (shared) { await ensureDir(global); await symlink(global, join(f.instancePath, 'resourcepacks'), 'junction') }
    await f.write(join(f.instancePath, old.path), 'OLD')
    const kept = ['options.txt', 'resourcepacks-groups.json', 'saves/world/level.dat']
    for (const path of kept) await f.write(join(f.instancePath, path), `KEEP ${path}\r\n`)
    const options = await f.review([old], [next], 'resourcepacks')
    expect(options.review).toMatchObject({ domain: 'resourcepacks', changes: [{ path: old.path, operation: 'backup-add' }] })
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.installInstanceFiles(options)
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('NEW')
    if (shared) expect(await readFile(join(global, 'My Pack.zip'), 'utf8')).toBe('NEW')
    const [backup] = await readdir(join(f.instancePath, '.backups'))
    expect(await readFile(join(f.instancePath, '.backups', backup, old.path), 'utf8')).toBe('OLD')
    for (const path of kept) expect(await readFile(join(f.instancePath, path), 'utf8')).toBe(`KEEP ${path}\r\n`)
    expect(await readdir(join(f.instancePath, 'resourcepacks'))).toEqual(['My Pack.zip'])
  })

  it.each(['renamed.zip', 'PACK.zip'])('rejects a reviewed pack rename to %s before downloading or publishing', async name => {
    const f = await fixture(), old = f.file('resourcepacks/pack.zip', 'OLD'), next = f.file(`resourcepacks/${name}`, 'NEW')
    await f.write(join(f.instancePath, old.path), 'OLD')
    await expect(f.service.installInstanceFiles(await f.review([old], [next], 'resourcepacks'))).rejects.toThrow('preserve archive names')
    expect(mockedDownload).not.toHaveBeenCalled()
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('OLD')
  })

  it('blocks reviewed and unreviewed shared pack installs while another tracked game uses the common folder', async () => {
    const f = await fixture(), global = join(f.root, 'resourcepacks'), other = join(f.root, 'other'), old = f.file('resourcepacks/a.zip', 'OLD'), next = f.file(old.path, 'NEW')
    await ensureDir(global); await ensureDir(other)
    for (const instance of [f.instancePath, other]) await symlink(global, join(instance, 'resourcepacks'), 'junction')
    await f.write(join(f.instancePath, old.path), 'OLD')
    const options = await f.review([old], [next], 'resourcepacks')
    f.processes.push({ options: { gameDirectory: other } })
    for (const input of [options, { path: f.instancePath, oldFiles: [], files: [f.file('resourcepacks/new.zip', 'OTHER')] }]) {
      await expect(f.service.installInstanceFiles(input)).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
    }
    expect(mockedDownload).not.toHaveBeenCalled()
    expect(await readFile(join(global, 'a.zip'), 'utf8')).toBe('OLD')
    expect(await pathExists(join(global, 'new.zip'))).toBe(false)
  })

  it('rechecks games started during a shared pack download before committing', async () => {
    const f = await fixture(), global = join(f.root, 'resourcepacks'), other = join(f.root, 'other'), old = f.file('resourcepacks/a.zip', 'OLD'), next = f.file(old.path, 'NEW')
    await ensureDir(global); await ensureDir(other)
    for (const instance of [f.instancePath, other]) await symlink(global, join(instance, 'resourcepacks'), 'junction')
    await f.write(join(f.instancePath, old.path), 'OLD')
    mockedDownload.mockImplementation(async (downloads, finished) => { await Promise.all(downloads.map(download => f.materialize(download, finished))); f.processes.push({ options: { gameDirectory: other } }) })
    await expect(f.service.installInstanceFiles(await f.review([old], [next], 'resourcepacks'))).rejects.toHaveProperty('name', 'SharedOptionsRunningError')
    expect(await readFile(join(global, 'a.zip'), 'utf8')).toBe('OLD')
  })

  it('leaves a private pack independent of another game using shared packs', async () => {
    const f = await fixture(), global = join(f.root, 'resourcepacks'), other = join(f.root, 'other'), old = f.file('resourcepacks/a.zip', 'OLD'), next = f.file(old.path, 'NEW')
    await ensureDir(global); await ensureDir(other); await symlink(global, join(other, 'resourcepacks'), 'junction')
    await f.write(join(f.instancePath, old.path), 'OLD'); await f.write(join(global, 'a.zip'), 'COMMON')
    f.processes.push({ options: { gameDirectory: other } }); mockedDownload.mockImplementation(f.downloadAll)
    await f.service.installInstanceFiles(await f.review([old], [next], 'resourcepacks'))
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('NEW'); expect(await readFile(join(global, 'a.zip'), 'utf8')).toBe('COMMON')
  })

  it('refuses an authority switch during download, then requires a fresh recovery review for the new directory', async () => {
    const f = await fixture(), global = join(f.root, 'resourcepacks'), old = f.file('resourcepacks/a.zip', 'OLD'), next = f.file(old.path, 'NEW')
    await ensureDir(global); await symlink(global, join(f.instancePath, 'resourcepacks'), 'junction'); await f.write(join(global, 'a.zip'), 'OLD')
    mockedDownload.mockImplementationOnce(async (downloads, finished) => {
      await Promise.all(downloads.map(download => f.materialize(download, finished)))
      await rm(join(f.instancePath, 'resourcepacks')); await f.write(join(f.instancePath, old.path), 'OLD')
    })
    await expect(f.service.installInstanceFiles(await f.review([old], [next], 'resourcepacks'))).rejects.toHaveProperty('name', 'ModFilesChangedError')
    expect(await readFile(join(global, 'a.zip'), 'utf8')).toBe('OLD'); expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('OLD')
    const plans = await f.service.getReviewedModInstalls(f.instancePath, 'resourcepacks')
    expect(plans).toHaveLength(1); expect(await f.service.getReviewedModInstalls(f.instancePath)).toEqual([])
    await expect(f.service.resumeInstanceInstall(f.instancePath, undefined, plans[0].operationId)).rejects.toHaveProperty('name', 'ModFilesChangedError')
    const recovery = await f.service.previewModInstallRecovery(f.instancePath, plans[0].operationId)
    expect(recovery).toMatchObject({ shared: false, configurationChanged: true, review: { domain: 'resourcepacks' } })
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.resumeInstanceInstall(f.instancePath, undefined, plans[0].operationId, recovery.review)
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('NEW'); expect(await readFile(join(global, 'a.zip'), 'utf8')).toBe('OLD')
  })

  it('resumes only the selected pack plan, requires review of user edits and retains their backup', async () => {
    const f = await fixture(), old = f.file('resourcepacks/a.zip', 'OLD'), next = f.file(old.path, 'NEW')
    await f.write(join(f.instancePath, old.path), 'OLD')
    mockedDownload.mockRejectedValueOnce(new Error('offline'))
    await expect(f.service.installInstanceFiles(await f.review([old], [next], 'resourcepacks'))).rejects.toThrow('offline')
    expect(await f.service.getReviewedModInstalls(f.instancePath)).toEqual([])
    const [plan] = await f.service.getReviewedModInstalls(f.instancePath, 'resourcepacks')
    const [saved] = await readPendingInstalls(f.instancePath)
    expect(saved.state.review?.directory).toBe((await readResourcePackFilesSnapshot(f.instancePath, f.root)).authority)
    await f.write(join(f.instancePath, old.path), 'USER EDIT')
    await expect(f.service.resumeInstanceInstall(f.instancePath, undefined, plan.operationId)).rejects.toHaveProperty('name', 'ModFilesChangedError')
    const recovery = await f.service.previewModInstallRecovery(f.instancePath, plan.operationId)
    expect(recovery).toMatchObject({ shared: false, configurationChanged: false, review: { domain: 'resourcepacks' } })
    const [profile] = await readPendingInstalls(f.instancePath)
    mockedDownload.mockImplementation(f.downloadAll)
    await f.service.resumeInstanceInstall(f.instancePath, undefined, plan.operationId, recovery.review)
    expect(await readFile(join(f.instancePath, old.path), 'utf8')).toBe('NEW')
    expect(await readFile(join(profile.state.backup, old.path), 'utf8')).toBe('USER EDIT')
    expect(await f.service.getReviewedModInstalls(f.instancePath, 'resourcepacks')).toEqual([])
  })

})
