import { ResourceManager, isValidCurseforgeRef, isValidModrinthRef } from '@xmcl/resource'
import { checksum } from '@xmcl/core'
import {
  InstanceSavesServiceKey,
  LockKey,
  MarketType,
  SaveDatapacks,
  Saves,
  getInstanceSaveDatapacksKey,
  getInstanceSaveKey,
  type CloneSaveOptions, type DeleteSaveOptions, type DeleteSaveChunksOptions, type CopySaveChunksOptions, type PasteSaveChunksOptions, type ExportSaveOptions,
  type DeleteDatapackOptions,
  type ImportDatapackOptions,
  type InstallDatapackMarketOptions,
  type InstanceSavesService as IInstanceSavesService,
  type ImportSaveOptions,
  type InstallMarketOptionWithInstance,
  type InstallMarketOptions,
  type InstanceDatapack,
  type LaunchOptions,
  type LinkSaveAsServerWorldOptions,
  type ShareSaveOptions,
  type WorldFileOperation, type WorldFileReview, type SaveChunkChange,
  type UpdateSaveOptions,
} from '@xmcl/runtime-api'
import { AnyError, isSystemError } from '@xmcl/utils'
import { FSWatcher } from 'chokidar'
import filenamify from 'filenamify'
import { existsSync } from 'fs'
import { lstat, mkdir, mkdtemp, realpath, symlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { ensureDir, readdir, rename, rm, rmdir, stat, unlink } from 'fs-extra'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import { Inject, LauncherAppKey, kGameDataPath, type PathResolver } from '~/app'
import { InstanceService } from '~/instance'
import { LaunchService } from '~/launch'
import { kMarketProvider, type InstallResult } from '~/market'
import { kResourceManager } from '~/resource'
import { readInstanceSaveMetadata, readWorldGenSettings, listSaveDimensions, getSaveRegions, readSaveChunks, readSaveProgress, getRegionDir, kSaveWorker, type SaveWorker } from '~/save'
import { AbstractService, ExposeServiceKey, ServiceStateManager } from '~/service'
import { LauncherApp, type WorldLock } from '../app/LauncherApp'
import { linkDirectory, missing, readdirIfPresent } from '../util/fs'
import { isNonnull, requireObject, requireString } from '../util/object'
import { readlinkSafe } from './utils/readLinkSafe'
import { datapackFileName, readWorldDatapacks } from './utils/worldDatapacks'
import { readBoundedFile, readWorlds, readWorldMetadata, worldLocation, worldName, worldsLocation } from './utils/worldFiles'
import { assertInstallDirectory } from '../instanceIO/utils/pendingInstall'
import { applyWorldFiles, previewWorldFiles } from './utils/worldOperations'
import { applySaveChunkPlan, listSaveChunkBackups, planSaveChunkChanges } from './utils/worldChunks'

/**
 * Provide the ability to preview saves data of an instance
 */
@ExposeServiceKey(InstanceSavesServiceKey)
export class InstanceSavesService extends AbstractService implements IInstanceSavesService {
  #saveWatchers = new Map<string, Set<{ pause(): Promise<void>; resume(): Promise<void> }>>()
  constructor(@Inject(LauncherAppKey) app: LauncherApp,
    @Inject(InstanceService) private instanceService: InstanceService,
    @Inject(kResourceManager) resourceManager: ResourceManager,
    @Inject(kGameDataPath) private getPath: PathResolver,
    @Inject(kSaveWorker) private saveWorker: SaveWorker,
  ) {
    super(app, async () => {
      try {
        const snapshopts = await resourceManager.getSnapshotsUnderDomainedPath('saves')
        const valid = await Promise.all(snapshopts.map(v => resourceManager.validateSnapshotFile(v)))
        for (const file of valid) {
          if (!file) continue
          // unlink if the file last access time is 3 days ago
          if (file.atime < Date.now() - 1000 * 60 * 60 * 24 * 3) {
            await unlink(file.path)
          }
        }
        await ensureDir(this.getPath('saves'))
        if (existsSync(this.getPath('shared-saves'))) {
          // move all shared saves to saves
          const sharedSaves = await readdir(this.getPath('shared-saves'))
          for (const save of sharedSaves) {
            await rename(this.getPath('shared-saves', save), this.getPath('saves', save))
          }
          await rmdir(this.getPath('shared-saves'))
        }
      } catch (e) {
        this.error(e as any)
      }
    })
  }

  async getLinkedSaveWorld(instancePath: string): Promise<string | undefined> {
    const serverWorldPath = join(instancePath, 'server', 'world')
    if (await missing(serverWorldPath)) {
      return undefined
    }
    // check if is a link, if so, then read the link and return the link path
    const linked = await readlinkSafe(serverWorldPath).catch(() => '')
    if (linked) {
      return linked
    }

    return serverWorldPath
  }

  async linkSaveAsServerWorld(options: LinkSaveAsServerWorldOptions): Promise<void> {
    const { instancePath, saveName } = options
    this.log(`Link save ${saveName} as server world in instance ${instancePath}.`)

    requireString(saveName)

    const savePath = isAbsolute(saveName) ? saveName : join(instancePath, 'saves', saveName)

    if (await missing(savePath)) {
      throw new AnyError('InstanceLinkSaveNotFoundError', 'The save is not found.', undefined, { saveName })
    }

    const serverWorldPath = join(instancePath, 'server', 'world')

    if (existsSync(serverWorldPath)) {
      const linkedTarget = await this.getLinkedSaveWorld(instancePath)
      if (linkedTarget === savePath) {
        this.log(`The save ${saveName} is already linked as server world in instance ${instancePath}.`)
        return
      }
      if (linkedTarget === serverWorldPath) {
        // Try to rename the world folder to world-backup
        let backupPath = join(instancePath, 'world-backup')
        while (await missing(backupPath)) {
          try {
            this.log(`Rename the world folder to world-backup in instance ${instancePath}.`)
            await rename(serverWorldPath, backupPath)
          } catch (e) {
            if (isSystemError(e) && e.code === 'EEXIST') {
              backupPath += '-backup'
            } else {
              throw e
            }
          }
        }
      } else if (linkedTarget) {
        // remove the linked world
        this.log(`Remove the linked world in instance ${instancePath}.`)
        await rm(serverWorldPath)
      }
    }

    this.log(`Link save ${saveName} as server world in instance ${instancePath}.`)
    await linkDirectory(savePath, serverWorldPath, this)
  }

  async showDirectory(instancePath: string): Promise<void> {
    await this.#javaInstance(instancePath)
    const directory = await worldsLocation(instancePath, this.getPath())
    if (!await this.app.shell.openDirectory(directory.root)) throw new Error('Worlds folder unavailable')
  }

  async getInstanceSaves(path: string) {
    await this.#javaInstance(path)
    return this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      await this.#javaInstance(path)
      return readWorlds(path, this.getPath())
    })
  }

  async getWorldDatapacks(instancePath: string, saveName: string) {
    await this.#javaInstance(instancePath)
    return this.mutex.of(LockKey.instance(instancePath)).runExclusive(async () => {
      await this.#javaInstance(instancePath)
      return readWorldDatapacks(instancePath, saveName, this.getPath())
    })
  }

  async #javaInstance(path: string) {
    await this.instanceService.initialize()
    if (!this.instanceService.state.instances.some(instance => instance.path === path && instance.edition === 'java')) throw new AnyError('InstanceNotFoundError')
  }

  async #worldFiles<T>(operation: WorldFileOperation, action: () => Promise<T>, allowDepot = false): Promise<T> {
    if (!operation || !['copy', 'export', 'remove', 'import', 'metadata', 'import-datapack', 'remove-datapack'].includes(operation.type)) throw new Error('Invalid world operation')
    return this.#worldPaths([operation.instancePath, ...(operation.type === 'copy' ? [operation.destinationInstancePath] : [])], action, allowDepot)
  }

  async #worldPaths<T>(input: string[], action: () => Promise<T>, allowDepot = false): Promise<T> {
    const paths = [...new Set(input)].sort()
    for (const path of paths) if (!allowDepot || path !== this.getPath()) await this.#javaInstance(path)
    const lock = async (index: number): Promise<T> => {
      if (index < paths.length) return this.mutex.of(LockKey.instance(paths[index])).runExclusive(() => lock(index + 1))
      for (const path of paths) if (!allowDepot || path !== this.getPath()) await this.#javaInstance(path)
      return action()
    }
    return this.mutex.of('resource-pack-options').runExclusive(async () => {
      return lock(0)
    })
  }

  async #worldsIdle(paths: string[], shared: boolean, linkOnly: boolean, allowDepot = false) {
    for (const path of paths) if (!allowDepot || path !== this.getPath()) await this.#javaInstance(path)
    const launch = await this.app.registry.get(LaunchService), processes = await launch.getGameProcesses()
    if (allowDepot && paths.includes(this.getPath()) && processes.length) throw new AnyError('SharedWorldRunningError')
    if (processes.some(process => paths.includes(process.options.gameDirectory))) throw new AnyError('InstanceRunningError')
    if (processes.length) {
      const touched = await Promise.all(paths.map(path => realpath(path).catch(() => path)))
      const active = await Promise.all(processes.map(process => realpath(process.options.gameDirectory).catch(() => process.options.gameDirectory)))
      if (touched.some(path => active.some(game => relative(path, game) === ''))) throw new AnyError('InstanceRunningError')
    }
    if (shared && !linkOnly && processes.length) throw new AnyError('SharedWorldRunningError')
    return processes
  }

  async #worldFilesIdle(review: WorldFileReview, allowDepot = false) {
    const operation = review.operation, paths = [operation.instancePath, ...(operation.type === 'copy' ? [operation.destinationInstancePath] : [])]
    const processes = await this.#worldsIdle(paths, review.shared, review.linkOnly, allowDepot)
    if ((operation.type === 'import' || operation.type === 'import-datapack') && processes.length) {
      const source = await realpath(operation.sourcePath), shared = join(await realpath(this.getPath()), 'saves'), inShared = relative(shared, source)
      if (!inShared || inShared !== '..' && !inShared.startsWith('..' + sep) && !isAbsolute(inShared)) throw new AnyError('SharedWorldRunningError')
      for (const process of processes) {
        const directory = await worldsLocation(process.options.gameDirectory, this.getPath())
        const inside = relative(directory.root, source), reverse = relative(source, directory.root)
        if (!inside || inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside) || !reverse || reverse !== '..' && !reverse.startsWith('..' + sep) && !isAbsolute(reverse)) throw new AnyError('InstanceRunningError')
      }
    }
    if (operation.type === 'export') {
      const parent = await realpath(operation.destinationDirectory)
      for (const instance of this.instanceService.state.instances) {
        const root = await realpath(instance.path).catch(() => instance.path), inside = relative(root, parent)
        if (!inside || inside !== '..' && !inside.startsWith('..' + sep) && !isAbsolute(inside)) throw new Error('Export must be outside instances')
      }
    }
  }

  async previewWorldFiles(operation: WorldFileOperation) {
    return this.#previewWorldFiles(operation)
  }

  // Depot authorization stays private; extra IPC arguments cannot enable it.
  async #previewWorldFiles(operation: WorldFileOperation, allowDepot = false) {
    return this.#worldFiles(operation, () => this.#previewWorldFilesLocked(operation, allowDepot), allowDepot)
  }

  async #previewWorldFilesLocked(operation: WorldFileOperation, allowDepot = false) {
    const review = await previewWorldFiles(operation, this.getPath())
    await this.#worldFilesIdle(review, allowDepot)
    const lock = await this.#worldFileLock(review, false)
    try { await lock?.verify(); return review } finally { lock?.release() }
  }

  async applyWorldFiles(review: WorldFileReview) {
    return this.#applyWorldFiles(review)
  }

  async #applyWorldFiles(review: WorldFileReview, allowDepot = false, linkSharedWorld = false) {
    return this.#worldFiles(review?.operation, () => this.#applyWorldFilesLocked(review, allowDepot, linkSharedWorld), allowDepot)
  }

  async #applyWorldFilesLocked(review: WorldFileReview, allowDepot = false, linkSharedWorld = false) {
    let lock: WorldLock | undefined
    try {
      return await applyWorldFiles(review, this.getPath(), async (value, beforeWorldRename) => {
        await this.#worldFilesIdle(value, allowDepot)
        lock ||= await this.#worldFileLock(value, true)
        await lock?.verify()
        // Windows directory rename rejects live child-file handles, including a game opened after release.
        if (beforeWorldRename) { lock?.release(); lock = undefined }
      }, linkSharedWorld)
    } finally { lock?.release() }
  }

  async #worldFileLock(review: WorldFileReview, create: boolean) {
    if (review.linkOnly) return undefined
    const operation = review.operation
    if (operation.type === 'import') {
      if (!(await lstat(operation.sourcePath)).isDirectory()) return undefined
      // Import sources are read-only; a missing lock is rechecked at every snapshot verification.
      return this.app.acquireWorldLock(await realpath(operation.sourcePath), false)
    }
    const source = await worldLocation(operation.instancePath, operation.saveName, this.getPath())
    const lock = await this.app.acquireWorldLock(source.root, create)
    if (create && !lock) throw new AnyError('WorldLockUnavailableError')
    return lock
  }

  /**
   * Mount and load instances saves
   * @param path
   */
  async watch(path: string) {
    await this.#javaInstance(path)
    await worldsLocation(path, this.getPath())
    const lock = this.mutex.of(LockKey.instance(path))

    const stateManager = await this.app.registry.get(ServiceStateManager)
    const launchService = await this.app.registry.get(LaunchService)

    return stateManager.registerOrGet(getInstanceSaveKey(path), async ({ defineAsyncOperation }) => {
      const pending: Set<string> = new Set()
      const baseName = basename(path)
      const savesDir = join(path, 'saves')
      const state = new Saves()

      const onExit = (op: LaunchOptions) => {
        if (op.gameDirectory !== path) return
        for (const p of pending) {
          updateSave(p)
        }
        pending.clear()
      }
      launchService.on('minecraft-exit', onExit)

      const updateSave = defineAsyncOperation(async (filePath: string) => {
        await lock.runExclusive(() => readInstanceSaveMetadata(filePath, baseName).then((save) => {
          state.instanceSaveUpdate(save)
        }).catch((e) => {
          this.warn(`Parse save in ${filePath} failed. Skip it.`)
          this.warn(e)
        }))
      })

      let watcher: FSWatcher | undefined, disposed = false
      const startWatcher = () => new FSWatcher({
        awaitWriteFinish: true,
        ignorePermissionErrors: true,
        followSymlinks: true,
        cwd: path,
        depth: 2,
        ignored: (path, stat) => {
          if (resolve(path) === savesDir) return false
          const depth = relative(savesDir, path).split(sep).length
          if (depth === 2) {
            const fileName = basename(path)
            return fileName !== 'level.dat'
          }
          if (depth > 2) {
            return true
          }
          return false
        },
      })
        .on('error', (e) => {
          if ((e as any).code === 'EBUSY') {
            return
          }
          if ((e as any).code === 'EPERM') {
            return
          }
          if ((e as any).name === 'Error') {
            (e as any).name = 'FSSaveWatcherError'
          }
          this.error(e as any)
        })
        .on('all', (event, file, stat) => {
          const absPath = resolve(path, file)
          if (file.endsWith('level.dat')) {
            const savePath = dirname(absPath)
            if (event === 'add' || event === 'change') {
              if (launchService.isParked(path)) {
                pending.add(savePath)
              } else {
                updateSave(savePath)
              }
            } else if (event === 'unlink') {
              state.instanceSaveRemove(savePath)
            }
          } else if (event === 'unlinkDir' && (file === path || !file)) {
            dispose()
          }
        })
        .add(savesDir)

      const revalidate = async () => {
        const saves = await readdirIfPresent(savesDir).then(a => a.filter(s => !s.startsWith('.')))
        const metadatas = await Promise.all(saves
          .map(s => resolve(savesDir, s))
          .map((p) => readInstanceSaveMetadata(p, baseName).catch(() => undefined)))
        state.instanceSaves(metadatas.filter(isNonnull))
      }

      const control = {
        pause: async () => { const old = watcher; await old?.close(); if (watcher === old) watcher = undefined },
        resume: async () => {
          if (disposed || watcher) return
          watcher = startWatcher()
          void revalidate().catch(error => this.warn(error))
        },
      }
      const dispose = () => {
        disposed = true
        launchService.off('minecraft-exit', onExit)
        const observers = this.#saveWatchers.get(path)
        observers?.delete(control)
        if (!observers?.size) this.#saveWatchers.delete(path)
        void control.pause().catch(error => this.warn(error))
      }
      try {
        await lock.runExclusive(async () => {
          await this.#javaInstance(path)
          await worldsLocation(path, this.getPath())
          const observers = this.#saveWatchers.get(path) || new Set()
          observers.add(control); this.#saveWatchers.set(path, observers)
          await control.resume()
        })
      } catch (error) { dispose(); throw error }

      return [state, dispose, revalidate]
    })
  }

  /**
   * Clone a save under an instance to one or multiple instances.
   *
   * @param options
   */
  async cloneSave(options: CloneSaveOptions) {
    requireObject(options)
    const { srcInstancePath, destInstancePath, saveName, newSaveName } = options
    requireString(srcInstancePath, 'Invalid world source'); worldName(saveName)
    const destinationName = worldName(newSaveName ?? saveName)
    const destinations = typeof destInstancePath === 'string' ? [destInstancePath] : destInstancePath
    if (!Array.isArray(destinations) || !destinations.length || destinations.length > 1000 || destinations.some(path => typeof path !== 'string')) throw new Error('Invalid world destinations')
    const reviews: WorldFileReview[] = []
    for (const destinationInstancePath of new Set(destinations)) reviews.push(await this.previewWorldFiles({ type: 'copy', instancePath: srcInstancePath, saveName, destinationInstancePath, destinationName }))
    for (const review of reviews) await this.applyWorldFiles(review)
  }

  /** Remove the world from its list while retaining the exact original in a backup. */
  async deleteSave(options: DeleteSaveOptions) {
    requireObject(options)
    const saveName = worldName(options.saveName), depot = options.instancePath === undefined
    const instancePath = depot ? this.getPath() : options.instancePath!
    requireString(instancePath, 'Invalid world instance')
    if (!depot) await this.#javaInstance(instancePath)
    const directory = await worldsLocation(instancePath, this.getPath())
    const entry = await lstat(join(directory.root, saveName)).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!entry) return
    const review = await this.#previewWorldFiles({ type: 'remove', instancePath, saveName }, depot)
    await this.#applyWorldFiles(review, depot)
    if (!depot) {
      const stateManager = await this.app.registry.get(ServiceStateManager)
      const state = stateManager.get<Saves>(getInstanceSaveKey(instancePath))
      state?.instanceSaveRemove(join(instancePath, 'saves', saveName))
    }
  }

  async shareSave(options: ShareSaveOptions): Promise<void> {
    requireObject(options)
    const { instancePath } = options, saveName = worldName(options.saveName)
    await this.#javaInstance(instancePath)
    await this.#worldPaths([instancePath, this.getPath()], async () => {
      await this.#sharedSavesIdle(instancePath)
      const source = await worldLocation(instancePath, saveName, this.getPath())
      if (source.shared && !source.linked) throw new Error('Disconnect the shared worlds folder before sharing an individual world')
      const remove = await this.#previewWorldFilesLocked({ type: 'remove', instancePath, saveName })
      if (!source.linked) {
        const destinationName = await this.#availableWorldName(this.getPath(), saveName)
        const copy = await this.#previewWorldFilesLocked({ type: 'copy', instancePath, saveName, destinationInstancePath: this.getPath(), destinationName }, true)
        await this.#applyWorldFilesLocked(copy, true)
      }
      await this.#applyWorldFilesLocked(remove)
    }, true)
  }

  async updateSave(options: UpdateSaveOptions): Promise<void> {
    requireObject(options)
    const { instancePath, metadata } = options, saveName = worldName(options.saveName)
    requireObject(metadata)
    const keys = ['levelName', 'seed', 'difficulty', 'cheat'] as const
    if (Object.keys(metadata).some(key => !keys.some(allowed => allowed === key))) throw new Error('Invalid world metadata')
    await this.#javaInstance(instancePath)
    const source = await worldLocation(instancePath, saveName, this.getPath()), current = await readWorldMetadata(source.root)
    const before = { levelName: current.levelName, seed: current.seed, difficulty: (current.difficulty >= 0 && current.difficulty <= 3 ? current.difficulty : 2) as 0 | 1 | 2 | 3, cheat: current.cheat }
    const target = {
      levelName: metadata.levelName === undefined ? before.levelName : metadata.levelName,
      seed: metadata.seed === undefined ? before.seed : metadata.seed,
      difficulty: metadata.difficulty === undefined ? before.difficulty : metadata.difficulty as 0 | 1 | 2 | 3,
      cheat: metadata.cheat === undefined ? before.cheat : metadata.cheat,
    }
    const review = await this.previewWorldFiles({ type: 'metadata', instancePath, saveName, metadata: target })
    if ((await worldLocation(instancePath, saveName, this.getPath())).identity !== source.identity || keys.some(key => review.metadata?.before[key] !== before[key])) throw new AnyError('WorldFilesChangedError')
    await this.applyWorldFiles(review)
  }

  async importSave(options: ImportSaveOptions) {
    requireObject(options)
    const { instancePath, path, curseforge } = options
    requireString(path, 'Invalid world import source')
    if (!isAbsolute(path)) throw new Error('Invalid world import source')
    await this.#javaInstance(instancePath)
    const info = await lstat(path), canonical = await realpath(path)
    const saveName = await this.#availableWorldName(instancePath, worldName(options.saveName ?? filenamify(info.isDirectory() ? basename(path) : basename(path, extname(path)))))
    const depot = info.isDirectory() && !info.isSymbolicLink() && relative(dirname(canonical), join(await realpath(this.getPath()), 'saves')) === ''
    let dest: string
    if (depot) {
      if (curseforge !== undefined) throw new Error('Provider metadata cannot change a shared world')
      const review = await this.#previewWorldFiles({ type: 'copy', instancePath: this.getPath(), saveName: worldName(basename(canonical)), destinationInstancePath: instancePath, destinationName: saveName }, true)
      dest = (await this.#applyWorldFiles(review, true, true)).path
    } else {
      const review = await this.previewWorldFiles({ type: 'import', instancePath, saveName, sourcePath: path, ...(curseforge === undefined ? {} : { curseforge }) })
      dest = (await this.applyWorldFiles(review)).path
    }
    const state = (await this.app.registry.get(ServiceStateManager)).get<Saves>(getInstanceSaveKey(instancePath))
    if (state) {
      const location = await worldLocation(instancePath, saveName, this.getPath()), metadata = await readWorldMetadata(location.root).catch(() => undefined)
      if (metadata && (await worldLocation(instancePath, saveName, this.getPath())).identity === location.identity) state.instanceSaveUpdate({ ...metadata, advancements: 0, name: saveName, path: dest, instanceName: basename(instancePath), icon: '', ...(location.shared ? { linkTo: location.root } : {}), ...(curseforge ? { curseforge } : {}) })
    }
    return dest
  }

  /**
   * Export a save from a managed instance to an external location.
   *
   * You can choose export the save to zip or a folder.
   *
   * @param options
   */
  async exportSave(options: ExportSaveOptions) {
    requireObject(options)
    const { instancePath, destination, zip = true } = options
    requireString(destination, 'Invalid world export destination')
    if (!isAbsolute(destination) || typeof zip !== 'boolean') throw new Error('Invalid world export destination')
    const review = await this.previewWorldFiles({ type: 'export', instancePath, saveName: worldName(options.saveName), destinationDirectory: dirname(destination), fileName: basename(destination), ...(zip ? {} : { format: 'folder' }) })
    await this.applyWorldFiles(review)
  }

  async #availableWorldName(instancePath: string, base: string, reserved = new Set<string>()) {
    const directory = await worldsLocation(instancePath, this.getPath())
    let name = worldName(base), index = 1
    while (reserved.has(name.toLowerCase()) || await lstat(join(directory.root, name)).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false })) {
      if (index > 1000) throw new Error('Too many conflicting world names')
      name = worldName(`${base} (${index++})`)
    }
    reserved.add(name.toLowerCase())
    return name
  }

  async #sharedSavesIdle(instancePath: string) {
    await this.#javaInstance(instancePath)
    if ((await (await this.app.registry.get(LaunchService)).getGameProcesses()).length) throw new AnyError('SharedWorldRunningError')
  }

  async #worldFolderLocks(instancePath: string, create: boolean) {
    const directories: { instance: string; identity: string; names: string[] }[] = [], bindings: { instance: string; name: string; identity: string }[] = []
    const held = new Map<string, WorldLock>()
    const release = (root: string) => { const lock = held.get(root); if (lock) { held.delete(root); lock.release() } }
    try {
      for (const instance of new Set([instancePath, this.getPath()])) {
        const directory = await worldsLocation(instance, this.getPath()), names = (await readdirIfPresent(directory.root)).sort()
        if (names.length > 1000) throw new Error('Too many worlds to share')
        directories.push({ instance, identity: directory.identity, names })
        for (const name of names) {
          const info = await lstat(join(directory.root, name), { bigint: true })
          if (!info.isDirectory() && !info.isSymbolicLink()) continue
          const location = await worldLocation(instance, name, this.getPath()), level = await lstat(join(location.root, 'level.dat'), { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
          if (!level) continue
          if (!level.isFile() || level.isSymbolicLink()) throw new Error('Unsafe world metadata')
          bindings.push({ instance, name, identity: location.identity })
          if (held.has(location.root)) continue
          const lock = await this.app.acquireWorldLock(location.root, create)
          if (create && !lock) throw new AnyError('WorldLockUnavailableError')
          if (lock) held.set(location.root, lock)
        }
      }
      return {
        verify: async () => {
          await this.#sharedSavesIdle(instancePath)
          for (const lock of held.values()) await lock.verify()
          for (const directory of directories) {
            const current = await worldsLocation(directory.instance, this.getPath())
            if (current.identity !== directory.identity || JSON.stringify((await readdirIfPresent(current.root)).sort()) !== JSON.stringify(directory.names)) throw new AnyError('WorldFilesChangedError')
          }
          for (const binding of bindings) if ((await worldLocation(binding.instance, binding.name, this.getPath())).identity !== binding.identity) throw new AnyError('WorldFilesChangedError')
        },
        releaseLocal: (directory: string) => { for (const root of [...held.keys()]) if (relative(dirname(root), directory) === '') release(root) },
        release: () => { for (const root of [...held.keys()]) release(root) },
      }
    } catch (error) { for (const root of [...held.keys()]) release(root); throw error }
  }

  async #replaceWorldsFolder(instancePath: string, linked: boolean, originals: WorldFileReview[] = []) {
    const instance = await realpath(instancePath), directory = await worldsLocation(instancePath, this.getPath()), local = join(instance, 'saves')
    const global = (await worldsLocation(this.getPath(), this.getPath())).root
    const original = await lstat(local, { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!linked && !original?.isSymbolicLink()) return
    const observers = [...(this.#saveWatchers.get(instancePath) || [])]
    let guards: (WorldLock & { releaseLocal(directory: string): void }) | undefined
    try {
      for (const observer of observers) await observer.pause()
      guards = await this.#worldFolderLocks(instancePath, true)
      await guards.verify()
      for (const original of originals) if ((await previewWorldFiles(original.operation, this.getPath())).snapshot !== original.snapshot) throw new AnyError('WorldFilesChangedError')
      await assertInstallDirectory(await realpath(this.getPath()), global)
      if (await realpath(instancePath) !== instance || (await worldsLocation(instancePath, this.getPath())).identity !== directory.identity) throw new AnyError('WorldFilesChangedError')
      let backup: string | undefined
      if (original) {
        const parent = join(instance, '.backups', `world-sharing-${randomUUID()}`)
        await assertInstallDirectory(instance, parent); await mkdir(parent, { recursive: true }); await assertInstallDirectory(instance, parent)
        backup = join(parent, 'saves')
        await guards.verify()
        const current = await lstat(local, { bigint: true })
        if (current.ino !== original.ino || current.dev !== original.dev || current.isSymbolicLink() !== original.isSymbolicLink()) throw new AnyError('WorldFilesChangedError')
        // Release local child handles immediately before Windows rename; keep depot worlds locked.
        guards.releaseLocal(local)
        await rename(local, backup)
      }
      try {
        if (linked) await symlink(global, local, process.platform === 'win32' ? 'junction' : 'dir')
        else await mkdir(local)
      } catch (cause) {
        if (backup) {
          const occupied = await lstat(local).catch(error => { if (error.code !== 'ENOENT') throw error })
          const saved = await lstat(backup, { bigint: true })
          if (!occupied && saved.ino === original!.ino && saved.dev === original!.dev) await rename(backup, local)
        }
        throw Object.assign(new Error('World sharing incomplete; original folder retained', { cause }), { name: 'WorldSharingIncompleteError', backup })
      }
    } finally {
      guards?.release()
      for (const observer of observers) await observer.resume().catch(error => this.warn(error))
    }
  }

  async isSaveLinked(instancePath: string) {
    await this.#javaInstance(instancePath)
    return (await worldsLocation(instancePath, this.getPath())).shared
  }

  async linkSharedSave(instancePath: string) {
    await this.#javaInstance(instancePath)
    return this.#worldPaths([instancePath, this.getPath()], async () => {
      await this.#sharedSavesIdle(instancePath)
      const directory = await worldsLocation(instancePath, this.getPath())
      if (directory.shared) return
      const instance = await realpath(instancePath)
      await assertInstallDirectory(instance, join(instance, '.backups'))
      const depot = (await worldsLocation(this.getPath(), this.getPath())).root
      await assertInstallDirectory(await realpath(this.getPath()), depot); await mkdir(depot, { recursive: true }); await assertInstallDirectory(await realpath(this.getPath()), depot)
      const preflight = await this.#worldFolderLocks(instancePath, false)
      try { await preflight.verify() } finally { preflight.release() }
      const names = (await readdirIfPresent(directory.root)).sort(), reserved = new Set<string>(), copies: WorldFileReview[] = [], originals: WorldFileReview[] = []
      for (const name of names) {
        const info = await lstat(join(directory.root, name), { bigint: true })
        if (!info.isDirectory() && !info.isSymbolicLink()) continue
        const location = await worldLocation(instancePath, name, this.getPath())
        if (location.linked) continue
        originals.push(await this.#previewWorldFilesLocked({ type: 'remove', instancePath, saveName: name }))
        const destinationName = await this.#availableWorldName(this.getPath(), name, reserved)
        copies.push(await this.#previewWorldFilesLocked({ type: 'copy', instancePath, saveName: name, destinationInstancePath: this.getPath(), destinationName }, true))
      }
      for (const copy of copies) await this.#applyWorldFilesLocked(copy, true)
      if ((await worldsLocation(instancePath, this.getPath())).identity !== directory.identity || JSON.stringify((await readdirIfPresent(directory.root)).sort()) !== JSON.stringify([...names].sort())) throw new AnyError('WorldFilesChangedError')
      await this.#replaceWorldsFolder(instancePath, true, originals)
    }, true)
  }

  async unlinkSharedSave(instancePath: string) {
    await this.#javaInstance(instancePath)
    return this.#worldPaths([instancePath, this.getPath()], async () => {
      await this.#sharedSavesIdle(instancePath)
      if (!(await worldsLocation(instancePath, this.getPath())).shared) return
      await this.#replaceWorldsFolder(instancePath, false)
    }, true)
  }

  async getSharedSaves() {
    const sharedSave = this.getPath('saves')
    const saves = await readdirIfPresent(sharedSave).then(a => a.filter(s => !s.startsWith('.')))
    const results = await Promise.allSettled(saves
      .map(s => resolve(sharedSave, s))
      .map(async (p) => {
        const fstat = await stat(p)
        if (fstat.isDirectory()) {
          return await readInstanceSaveMetadata(p, '')
        }
      }))
    return results.map(r => r.status === 'fulfilled' ? r.value : undefined).filter(isNonnull)
  }

  async installFromMarket(options: InstallMarketOptionWithInstance): Promise<string> {
    requireObject(options)
    if (options.market !== MarketType.CurseForge) throw new TypeError('Unsupported world market')
    await this.#javaInstance(options.instancePath)
    return this.#withMarketFiles(this.#marketRequest(options), async (results) => {
      if (results.length !== 1 || !results[0].metadata?.curseforge) throw new Error('Expected one downloaded world')
      return this.importSave({ path: results[0].path, curseforge: results[0].metadata.curseforge, instancePath: options.instancePath })
    })
  }

  async getWorldGenSettings(savePath: string) {
    return this.#readSave(savePath, root => readWorldGenSettings(root))
  }

  async listSaveDimensions(savePath: string) {
    return this.#readSave(savePath, root => listSaveDimensions(root))
  }

  async getSaveRegions(savePath: string, dimension: string) {
    requireString(dimension)
    return this.#readSave(savePath, root => getSaveRegions(root, dimension))
  }

  async renderSaveRegion(savePath: string, dimension: string, regionX: number, regionZ: number, maxHeight?: number) {
    requireString(dimension)
    return this.#readSave(savePath, async root => {
      await assertInstallDirectory(root, getRegionDir(root, dimension))
      return this.saveWorker.renderSaveRegion(root, dimension, regionX, regionZ, maxHeight)
    })
  }

  async #chunkChanges<T>(change: SaveChunkChange, action: (source: { root: string; identity: string; shared: boolean }, verify: () => Promise<void>) => Promise<T>, write = false) {
    if (!change || typeof change.savePath !== 'string') throw new Error('Invalid chunk operation')
    const first = await this.#assertSaveWritable(change.savePath)
    return this.mutex.of('resource-pack-options').runExclusive(async () => {
      const run = async () => {
        const source = await this.#assertSaveWritable(change.savePath)
        if (source.identity !== first.identity) throw new AnyError('WorldChangedError')
        let lock = await this.app.acquireWorldLock(source.root, false)
        try {
          const verify = async () => {
            if ((await this.#assertSaveWritable(change.savePath)).identity !== first.identity) throw new AnyError('WorldChangedError')
            if (!lock && write) {
              lock = await this.app.acquireWorldLock(source.root, true)
              if (!lock) throw new AnyError('WorldLockUnavailableError')
            }
            if (lock) await lock.verify()
            else {
              const probe = await this.app.acquireWorldLock(source.root, false)
              try { await probe?.verify() } finally { probe?.release() }
            }
          }
          return await action(source, verify)
        } finally { lock?.release() }
      }
      return first.matchedInstance ? this.mutex.of(LockKey.instance(first.matchedInstance.path)).runExclusive(run) : run()
    })
  }

  async previewSaveChunkChanges(change: SaveChunkChange) {
    return this.#chunkChanges(change, async (source, verify) => {
      const plan = await planSaveChunkChanges(source.root, change, source)
      await verify()
      return plan.review
    })
  }

  async applySaveChunkChanges(change: SaveChunkChange, snapshot: string) {
    if (typeof snapshot !== 'string' || !/^[0-9a-f]{64}$/.test(snapshot)) throw new Error('Invalid chunk review')
    return this.#chunkChanges(change, async (source, verify) => {
      const plan = await planSaveChunkChanges(source.root, change, source)
      if (plan.review.snapshot !== snapshot) throw new AnyError('WorldChunksChangedError')
      return applySaveChunkPlan(plan, verify)
    }, true)
  }

  async getSaveChunkBackups(savePath: string) {
    return this.#readSave(savePath, root => listSaveChunkBackups(root))
  }

  async deleteSaveChunks(options: DeleteSaveChunksOptions) {
    const change: SaveChunkChange = { ...options, type: 'delete' }
    const review = await this.previewSaveChunkChanges(change)
    await this.applySaveChunkChanges(change, review.snapshot)
  }

  async copySaveChunks(options: CopySaveChunksOptions) {
    const { savePath, dimension, chunks } = options
    return this.#readSave(savePath, async root => {
      await assertInstallDirectory(root, getRegionDir(root, dimension))
      return readSaveChunks(root, dimension, chunks)
    })
  }

  async pasteSaveChunks(options: PasteSaveChunksOptions) {
    const change: SaveChunkChange = { ...options, type: 'paste' }
    const review = await this.previewSaveChunkChanges(change)
    await this.applySaveChunkChanges(change, review.snapshot)
  }

  async #readSave<T>(savePath: string, action: (root: string, instance: InstanceService['state']['instances'][number] | undefined) => Promise<T>, instancePath?: string) {
    const first = await this.#saveLocation(savePath, instancePath)
    const key = first.matchedInstance ? LockKey.instance(first.matchedInstance.path) : 'resource-pack-options'
    return this.mutex.of(key).runExclusive(async () => {
      const source = await this.#saveLocation(savePath, instancePath)
      if (source.identity !== first.identity) throw new AnyError('WorldChangedError')
      const result = await action(source.root, source.matchedInstance)
      if ((await this.#saveLocation(savePath, instancePath)).identity !== first.identity) throw new AnyError('WorldChangedError')
      return result
    })
  }

  async #saveLocation(savePath: string, instancePath?: string) {
    requireString(savePath)
    if (!isAbsolute(savePath)) throw new AnyError('WorldNotFoundError')
    await this.instanceService.initialize()
    if (instancePath !== undefined) { requireString(instancePath); if (!isAbsolute(instancePath)) throw new AnyError('WorldNotFoundError') }
    const requested = instancePath === undefined ? undefined : await realpath(instancePath).catch(() => { throw new AnyError('WorldNotFoundError') })
    const root = await realpath(savePath).catch(() => { throw new AnyError('WorldNotFoundError') })
    let matchedInstance: typeof this.instanceService.state.instances[number] | undefined
    let identity = '', isShared = false
    for (const instance of this.instanceService.state.instances) {
      if (instance.edition !== 'java') continue
      const instanceRoot = await realpath(instance.path).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (!instanceRoot) continue
      if (requested && relative(instanceRoot, requested) !== '') continue
      const name = requested ? basename(root) : relative(join(instanceRoot, 'saves'), root)
      if (!name || name === '..' || isAbsolute(name) || name.includes(sep)) continue
      const source = await worldLocation(instance.path, worldName(name), this.getPath()).catch(error => { if (requested) throw new AnyError('WorldNotFoundError'); throw error })
      if (relative(source.root, root) !== '') throw new AnyError(requested ? 'WorldNotFoundError' : 'WorldChangedError')
      matchedInstance = instance; identity = source.identity; isShared = source.shared
      break
    }
    if (!matchedInstance) {
      if (requested) throw new AnyError('WorldNotFoundError')
      const sharedRoot = join(await realpath(this.getPath()), 'saves'), name = relative(sharedRoot, root)
      if (!name || name === '..' || isAbsolute(name) || name.includes(sep)) throw new AnyError('WorldNotFoundError')
      worldName(name)
      const depot = await lstat(sharedRoot, { bigint: true }), info = await lstat(root, { bigint: true })
      if (!depot.isDirectory() || depot.isSymbolicLink() || !info.isDirectory() || info.isSymbolicLink()) throw new AnyError('WorldNotFoundError')
      identity = JSON.stringify([sharedRoot, depot.ino.toString(), depot.dev.toString(), root, info.ino.toString(), info.dev.toString()]); isShared = true
    }
    await readBoundedFile(join(root, 'level.dat'), 4 * 1024 * 1024).catch(() => { throw new AnyError('WorldNotFoundError') })
    return { root, identity, isShared, shared: isShared, matchedInstance }
  }

  async #assertSaveWritable(savePath: string) {
    const source = await this.#saveLocation(savePath)
    const { isShared, matchedInstance } = source
    const launch = await this.app.registry.get(LaunchService), processes = await launch.getGameProcesses()
    if (processes.length && isShared) throw new AnyError('SharedWorldRunningError')
    if (matchedInstance && processes.length) {
      const ownRoot = await realpath(matchedInstance.path)
      const active = await Promise.all(processes.map(process => realpath(process.options.gameDirectory).catch(error => { if (error.code !== 'ENOENT') throw error; return process.options.gameDirectory })))
      if (active.some(path => relative(ownRoot, path) === '')) throw new AnyError('InstanceRunningError')
    }
    return source
  }

  async #legacyDatapacks(savePath: string) {
    return this.#readSave(savePath, async root => {
      const source = await this.#legacySaveContext(savePath)
      if (source.root !== root) throw new AnyError('WorldChangedError')
      const rows = await readWorldDatapacks(source.instancePath, source.saveName, this.getPath())
      const resources = await this.app.registry.get(kResourceManager)
      const result: InstanceDatapack[] = []
      for (const row of rows) {
        if (row.error) continue
        let curseforge = row.curseforge && isValidCurseforgeRef(row.curseforge) ? { projectId: row.curseforge.projectId, fileId: row.curseforge.fileId } : undefined
        let modrinth = row.modrinth && isValidModrinthRef(row.modrinth) ? { projectId: row.modrinth.projectId, versionId: row.modrinth.versionId } : undefined
        if (!curseforge && !modrinth) {
          const snapshot = await resources.getSnapshot(join(root, 'datapacks', row.fileName)).catch(() => undefined)
          const metadata = snapshot?.sha1 ? await resources.getMetadataByHash(snapshot.sha1).catch(() => undefined) : undefined
          if (isValidCurseforgeRef(metadata?.curseforge)) curseforge = { projectId: metadata.curseforge.projectId, fileId: metadata.curseforge.fileId }
          if (isValidModrinthRef(metadata?.modrinth)) modrinth = { projectId: metadata.modrinth.projectId, versionId: metadata.modrinth.versionId }
        }
        result.push({ ...row, path: join(savePath, 'datapacks', row.fileName), savePath, curseforge, modrinth })
      }
      return result
    })
  }

  async watchSaveDatapacks(savePath: string) {
    const source = await this.#legacySaveContext(savePath)
    const owner = this.instanceService.state.instances.find(instance => {
      const name = relative(join(resolve(instance.path), 'saves'), resolve(savePath))
      return instance.edition === 'java' && !!name && name !== '..' && !isAbsolute(name) && !name.includes(sep)
    })?.path || source.instancePath
    const stateManager = await this.app.registry.get(ServiceStateManager)
    return stateManager.registerOrGet(getInstanceSaveDatapacksKey(savePath), async ({ defineAsyncOperation }) => {
      const state = new SaveDatapacks()
      let watcher: FSWatcher | undefined, disposed = false, refresh: Promise<void> | undefined, dirty = false
      const revalidate = defineAsyncOperation(async () => {
        if (disposed) return
        dirty = true
        if (refresh) return refresh
        refresh = (async () => {
          while (dirty && !disposed) {
            dirty = false
            try { const rows = await this.#legacyDatapacks(savePath); if (!disposed) state.saveDatapacks(rows) }
            catch (error) { if (!disposed) state.saveDatapacks([]); throw error }
          }
        })()
        try { await refresh } finally { refresh = undefined }
      })
      const control = {
        pause: async () => { const old = watcher; await old?.close(); if (watcher === old) watcher = undefined },
        resume: async () => {
          if (disposed || watcher) return
          const current = await this.#saveLocation(savePath).catch(error => { state.saveDatapacks([]); throw error }), directory = join(current.root, 'datapacks')
          await assertInstallDirectory(current.root, directory).catch(error => { state.saveDatapacks([]); throw error })
          if (disposed || watcher) return
          watcher = new FSWatcher({ awaitWriteFinish: true, ignorePermissionErrors: true, followSymlinks: false, depth: 1 })
            .on('error', error => { if (!['EBUSY', 'EPERM'].includes((error as any).code)) this.error(error instanceof Error ? error : new Error('Datapack observer failed', { cause: error })) })
            .on('all', () => { void revalidate().catch(error => this.warn(error)) })
            .add(directory)
          void revalidate().catch(error => this.warn(error))
        },
      }
      const dispose = () => {
        disposed = true
        const observers = this.#saveWatchers.get(owner)
        observers?.delete(control)
        if (!observers?.size) this.#saveWatchers.delete(owner)
        void control.pause().catch(error => this.warn(error))
      }
      try {
        await revalidate()
        const key = source.depot && owner === source.instancePath ? 'resource-pack-options' : LockKey.instance(owner)
        await this.mutex.of(key).runExclusive(async () => {
          await this.#legacySaveContext(savePath)
          const observers = this.#saveWatchers.get(owner) || new Set()
          observers.add(control); this.#saveWatchers.set(owner, observers)
          await control.resume()
        })
      } catch (error) { dispose(); throw error }
      return [state, dispose, revalidate]
    })
  }

  async #legacySaveContext(savePath: string) {
    requireString(savePath, 'Invalid world path')
    const source = await this.#saveLocation(savePath)
    return { instancePath: source.matchedInstance?.path ?? this.getPath(), saveName: worldName(basename(source.root)), root: source.root, depot: !source.matchedInstance }
  }

  async importDatapack(options: ImportDatapackOptions) {
    requireObject(options)
    requireString(options.path, 'Invalid datapack source')
    const source = await this.#legacySaveContext(options.savePath)
    const review = await this.#previewWorldFiles({ type: 'import-datapack', instancePath: source.instancePath, saveName: source.saveName, sourcePath: options.path }, source.depot)
    return (await this.#applyWorldFiles(review, source.depot)).path
  }

  async getInstanceSaveDatapacks(instancePath: string) {
    await this.#javaInstance(instancePath)
    const worlds = await this.getInstanceSaves(instancePath), result: InstanceDatapack[] = []
    for (const world of worlds) {
      if (world.error) continue
      const rows = await this.#legacyDatapacks(world.path)
      if (result.length + rows.length > 10000) throw new Error('Too many instance datapacks')
      result.push(...rows)
    }
    await this.#javaInstance(instancePath)
    return result
  }

  async deleteDatapack(options: DeleteDatapackOptions) {
    requireObject(options)
    const fileName = datapackFileName(options.fileName), source = await this.#legacySaveContext(options.savePath)
    const directory = join(source.root, 'datapacks')
    await assertInstallDirectory(source.root, directory)
    const entry = await lstat(join(directory, fileName)).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!entry) return
    const review = await this.#previewWorldFiles({ type: 'remove-datapack', instancePath: source.instancePath, saveName: source.saveName, fileName }, source.depot)
    await this.#applyWorldFiles(review, source.depot)
    const stateManager = await this.app.registry.get(ServiceStateManager)
    const state = stateManager.get<SaveDatapacks>(getInstanceSaveDatapacksKey(options.savePath))
    state?.saveDatapackRemove(join(options.savePath, 'datapacks', fileName))
  }

  async #withMarketFiles<T>(request: InstallMarketOptions, action: (results: InstallResult[], staging: string) => Promise<T>) {
    const root = await realpath(this.getPath()), prefix = join(root, '.datapack-download-'), staging = await mkdtemp(prefix), identity = await lstat(staging, { bigint: true })
    try {
      const provider = await this.app.registry.get(kMarketProvider)
      const results = await provider.installFile({ ...request, directory: staging })
      if (!Array.isArray(results) || results.length === 0 || results.length > 1000) throw new Error('Invalid datapack download batch')
      const workspace = await lstat(staging, { bigint: true })
      if (!workspace.isDirectory() || workspace.isSymbolicLink() || workspace.ino !== identity.ino || workspace.dev !== identity.dev || await realpath(staging) !== staging) throw new AnyError('WorldFilesChangedError')
      for (const result of results) {
        const actual = await realpath(result.path), info = await lstat(result.path, { bigint: true })
        if (!info.isFile() || info.isSymbolicLink() || relative(dirname(actual), staging) !== '') throw new Error('Invalid staged market file')
        await assertInstallDirectory(staging, dirname(result.path))
      }
      return await action(results, staging)
    } finally {
      // Only this owned download workspace may be removed; never follow a rebound root.
      const current = await lstat(staging, { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (dirname(staging) === root && staging.startsWith(prefix) && current?.isDirectory() && !current.isSymbolicLink() && current.ino === identity.ino && current.dev === identity.dev && await realpath(this.getPath()) === root) await rm(staging, { recursive: true, force: true })
    }
  }

  #marketRequest(options: InstallMarketOptions): InstallMarketOptions {
    const icon = (value: unknown) => { if (value !== undefined && (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(value))) throw new Error('Invalid datapack icon'); return value as string | undefined }
    let request: InstallMarketOptions
    if (options.market === MarketType.CurseForge) {
      const refs = Array.isArray(options.file) ? options.file : [options.file]
      if (refs.length === 0 || refs.length > 1000 || refs.some(ref => !ref || !Number.isSafeInteger(ref.fileId) || ref.fileId <= 0)) throw new Error('Invalid CurseForge datapack references')
      request = { market: MarketType.CurseForge, file: refs.map(ref => ({ fileId: ref.fileId, icon: icon(ref.icon) })) }
    } else {
      const refs = Array.isArray(options.version) ? options.version : [options.version]
      if (refs.length === 0 || refs.length > 1000 || refs.some(ref => !ref || typeof ref.versionId !== 'string' || !/^[0-9A-Za-z]{8}$/.test(ref.versionId))) throw new Error('Invalid Modrinth datapack references')
      request = { market: MarketType.Modrinth, version: refs.map(ref => ({ versionId: ref.versionId, ...(ref.filename === undefined ? {} : { filename: datapackFileName(ref.filename, true) }), icon: icon(ref.icon) })) }
    }
    return request
  }

  async installDatapackFromMarket(options: InstallDatapackMarketOptions) {
    requireObject(options)
    const { savePath } = options, source = await this.#legacySaveContext(savePath)
    if (![MarketType.CurseForge, MarketType.Modrinth].includes(options.market)) throw new Error('Unsupported datapack market')
    const request = this.#marketRequest(options)
    const binding = await this.#worldPaths([source.instancePath], async () => {
      const location = await worldLocation(source.instancePath, source.saveName, this.getPath())
      await assertInstallDirectory(location.root, join(location.root, 'datapacks'))
      await this.#worldsIdle([source.instancePath], location.shared, false, source.depot)
      const lock = await this.app.acquireWorldLock(location.root, false)
      try { await lock?.verify(); return location } finally { lock?.release() }
    }, source.depot)
    return this.#withMarketFiles(request, async (results, staging) => {
      if ((await worldLocation(source.instancePath, source.saveName, this.getPath())).identity !== binding.identity) throw new AnyError('WorldFilesChangedError')
      const reviews: { review: WorldFileReview; hash: string }[] = [], names = new Set<string>(), directory = join(binding.root, 'datapacks')
      const originalParent = await lstat(directory, { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
      for (const result of results) {
        const path = await realpath(result.path), fileName = datapackFileName(basename(result.path))
        if (relative(dirname(path), staging) !== '' || names.has(fileName.toLowerCase())) throw new Error('Invalid staged datapack')
        await assertInstallDirectory(staging, dirname(result.path)); names.add(fileName.toLowerCase())
        const providers = { ...(result.metadata?.curseforge ? { curseforge: result.metadata.curseforge } : {}), ...(result.metadata?.modrinth ? { modrinth: result.metadata.modrinth } : {}) }
        const hash = await checksum(result.path, 'sha256')
        if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw new AnyError('WorldFilesChangedError')
        const review = await this.#previewWorldFiles({ type: 'import-datapack', instancePath: source.instancePath, saveName: source.saveName, sourcePath: result.path, fileName, providers }, source.depot)
        if (await checksum(result.path, 'sha256') !== hash) throw new AnyError('WorldFilesChangedError')
        reviews.push({ review, hash })
      }
      await this.#worldPaths([source.instancePath], async () => {
        let parent = originalParent
        for (const { review, hash } of reviews) {
          if ((await worldLocation(source.instancePath, source.saveName, this.getPath())).identity !== binding.identity) throw new AnyError('WorldFilesChangedError')
          const current = await lstat(directory, { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
          if (Boolean(parent) !== Boolean(current) || parent && current && (parent.ino !== current.ino || parent.dev !== current.dev || current.isSymbolicLink())) throw new AnyError('WorldFilesChangedError')
          const fresh = await this.#previewWorldFilesLocked(review.operation, source.depot)
          if (review.operation.type !== 'import-datapack' || await checksum(review.operation.sourcePath, 'sha256') !== hash) throw new AnyError('WorldFilesChangedError')
          await this.#applyWorldFilesLocked(fresh, source.depot)
          parent = await lstat(directory, { bigint: true })
        }
      }, source.depot)
      const paths = reviews.map(({ review }) => join(savePath, 'datapacks', (review.operation as Extract<WorldFileOperation, { type: 'import-datapack' }>).fileName!))
      const state = (await this.app.registry.get(ServiceStateManager)).get<SaveDatapacks>(getInstanceSaveDatapacksKey(savePath))
      if (state) {
        const rows = await readWorldDatapacks(source.instancePath, source.saveName, this.getPath())
        for (const path of paths) { const row = rows.find(row => row.fileName === basename(path)); if (row) state.saveDatapackUpdate({ ...row, path, savePath }) }
      }
      return paths
    })
  }

  async getInstanceSaveProgress(options: { savePath: string; instancePath?: string; locale?: string }) {
    const { savePath, instancePath, locale } = options
    if (locale !== undefined && (typeof locale !== 'string' || !/^[a-zA-Z]{2,8}(?:[-_][a-zA-Z0-9]{2,8}){0,3}$/.test(locale))) throw new Error('Invalid progress locale')
    return this.#readSave(savePath, async (root, instance) => {
      const directory = await realpath(instance?.path || this.getPath())
      return readSaveProgress(root, directory, this.getPath(), undefined, locale, instance?.version || instance?.runtime?.minecraft)
    }, instancePath)
  }
}

function flattenPackDescription(description: unknown): string {
  if (!description) return ''
  if (typeof description === 'string') return description
  if (typeof description === 'number' || typeof description === 'boolean') return String(description)
  if (Array.isArray(description)) return description.map(flattenPackDescription).join('')
  if (typeof description === 'object') {
    const obj = description as Record<string, unknown>
    const text = typeof obj.text === 'string' ? obj.text : ''
    const extra = Array.isArray(obj.extra) ? obj.extra.map(flattenPackDescription).join('') : ''
    return text + extra
  }
  return ''
}
