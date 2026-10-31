import {
  CreateInstanceOptions,
  InstanceDataWithTime,
  InstanceSchema,
  computeInstanceEditChanges,
  createInstance,
  DuplicateInstanceTrackerEvents,
} from '@xmcl/instance'
import {
  InstanceModpackMetadataSchema,
  InstanceServiceKey,
  InstanceState,
  InstancesSchema,
  InstanceGroupDataOrStringArray,
  LockKey,
  DuplicateInstanceTask,
  type InstanceService as IInstanceService,
  type SharedState,
  type InstanceCopyState,
} from '@xmcl/runtime-api'
import { AnyError, isSystemError } from '@xmcl/utils'
import filenamify from 'filenamify'
import { fileTypeFromBuffer } from 'file-type'
import { createHash } from 'node:crypto'
import { existsSync } from 'fs'
import { ensureDir, lstat, mkdir, realpath, readdir, readlink, readJson, rename, rm, writeJson } from 'fs-extra'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path'
import { Inject, LauncherAppKey, kGameDataPath, type PathResolver } from '~/app'
import { ImageStorage, kTasks, Tasks } from '~/infra'
import { VersionMetadataService } from '~/install/VersionMetadataService'
import { ExposeServiceKey, ServiceStateManager, Singleton, StatefulService } from '~/service'
import { validateDirectory } from '~/util/validate'
import { LauncherApp } from '../app/LauncherApp'
import { ENOENT_ERROR, exists, isDirectory, isPathDiskRootPath, readdirEnsured } from '../util/fs'
import { readBoundedLocalFile } from '../util/readBoundedLocalFile'
import { getMediaIconPath, resolveInstanceIcon, serializeInstanceIcon, toMediaIconUrl } from './instanceIcon'
import { requireObject, requireString } from '../util/object'
import { getTracker } from '~/util/taskHelper'
import { setTimeout } from 'timers/promises'
import { writeFile as writeAtomically } from 'atomically'
import { assertInstanceCopyComplete, prepareInstanceCopy, readInstanceCopy, runInstanceCopy } from './instanceCopy'
import { saveInstanceCopy, type InstanceCopyJob } from './instanceCopy'
import type { TaskInstance } from '../infra/task'

const INSTANCES_FOLDER = 'instances'

/**
 * Provide instance splitting service. It can split the game into multiple environment and dynamically deploy the resource to run.
 */
@ExposeServiceKey(InstanceServiceKey)
export class InstanceService extends StatefulService<InstanceState> implements IInstanceService {
  // Strong references so the handler stays alive until removal or
  // explicit unregister; previously these were `WeakRef`s, which made
  // inline arrow handlers (e.g. abort-on-delete callbacks registered
  // by InstanceInstallService) eligible for GC mid-install and break
  // the install/delete cancellation handshake.
  #removeHandlers: Record<string, Array<() => Promise<void> | void>> = {}
  #onRenamedInstancePath?: (oldPath: string, newPath: string) => void
  #groupsWrite: Promise<void> = Promise.resolve()
  #instanceWrites = new Map<string, Promise<void>>()

  constructor(
    @Inject(LauncherAppKey) app: LauncherApp,
    @Inject(ServiceStateManager) store: ServiceStateManager,
    @Inject(VersionMetadataService) private versionMetadataService: VersionMetadataService,
    @Inject(kGameDataPath) private getPath: PathResolver,
    @Inject(ImageStorage) private imageStore: ImageStorage,
    @Inject(kTasks) private tasks: Tasks,
  ) {
    super(
      app,
      () => store.registerStatic(new InstanceState(), InstanceServiceKey),
      async () => {
        // instances.json is launcher-level state and stays in appData: it must
        // not travel with the game data root on a migration. Managed instances
        // are stored relative to the (movable) instances folder, so they still
        // resolve after a root change. Fall back once to the legacy game-root
        // copy so groups/selection survive the move of this file into appData.
        const instancesPath = join(this.app.appDataPath, 'instances.json')
        const legacyInstancesPath = this.getPath('instances.json')
        const instanceConfig = await readJson(instancesPath)
          .catch(() => readJson(legacyInstancesPath))
          .then(InstancesSchema.parse)
          .catch(() => InstancesSchema.parse({}))
        const managed = (await readdirEnsured(this.getPathUnder())).map((p) => this.getPathUnder(p))

        this.log(
          `Found ${managed.length} managed instances and ${instanceConfig.instances.length} external instances.`,
        )

        const all = [...new Set([...instanceConfig.instances, ...managed])]
        const staleInstances = new Set<string>()

        const rename: [string, string][] = []
        await Promise.all(
          all.map(async (path) => {
            if (basename(path).startsWith('.')) {
              return
            }
            if (!isAbsolute(path)) {
              path = this.getPathUnder(path)
            }
            if (!(await this.loadInstance(path, (old, newPath) => rename.push([old, newPath])))) {
              staleInstances.add(path)
            }
          }),
        )

        const normalizeInstancePath = (path: string) => {
          if (this.isUnderManaged(path)) {
            const relativePath = relative(this.getPathUnder(), path)
            return relativePath
          }
          return path
        }

        const selectedInstance = instanceConfig.selectedInstance || ''

        const groups = instanceConfig.groups.map((g) =>
          typeof g === 'string'
            ? this.getPathUnder(g)
            : {
                ...g,
                instances: g.instances.map((s) => this.getPathUnder(s)),
              },
        )

        if (rename.length > 0) {
          // fix the group paths
          for (const [oldPath, newPath] of rename) {
            for (const group of groups) {
              if (typeof group === 'string') {
                if (group === oldPath) {
                  const idx = groups.indexOf(group)
                  groups[idx] = newPath
                }
              } else {
                const idx = group.instances.indexOf(oldPath)
                if (idx !== -1) {
                  group.instances[idx] = newPath
                }
              }
            }
          }
        }

        this.state.instanceGroupsSet(groups)

        this.#onRenamedInstancePath = (oldPath: string, newPath: string) => {
          const groups = this.state.groups
          for (const group of groups) {
            if (typeof group === 'string') {
              if (group === oldPath) {
                const idx = groups.indexOf(group)
                groups[idx] = newPath
              }
            } else {
              const idx = group.instances.indexOf(oldPath)
              if (idx !== -1) {
                group.instances[idx] = newPath
              }
            }
          }
          this.state.instanceGroupsSet(groups)
        }

        if (staleInstances.size > 0 || rename.length > 0) {
          await writeJson(instancesPath, {
            selectedInstance: normalizeInstancePath(selectedInstance),
            instances: instanceConfig.instances
              .filter((p) => !staleInstances.has(p))
              .map(normalizeInstancePath),
            groups,
          })
        }

        this.state.subscribe('instanceGroupsSet', () => {
          const data = JSON.stringify({
            selectedInstance,
            instances: this.state.instances.map((s) => s.path).map(normalizeInstancePath),
            groups: this.state.groups.map((g) =>
              typeof g === 'string'
                ? normalizeInstancePath(g)
                : { ...g, instances: g.instances.map(normalizeInstancePath) },
            ),
          })
          this.#groupsWrite = this.#groupsWrite.catch(() => {}).then(() => writeAtomically(instancesPath, data))
          void this.#groupsWrite.catch(error => this.error(error))
        })

        this.state.subscribe('instanceEdit', ({ path }) => {
          const inst = this.state.all[path]
          const persisted = { ...inst, icon: serializeInstanceIcon(inst.icon, path) }
          const data = JSON.stringify(persisted, null, 2)
          const write = (this.#instanceWrites.get(path) || Promise.resolve()).catch(() => {}).then(() => writeAtomically(join(path, 'instance.json'), data))
          this.#instanceWrites.set(path, write)
          void write.catch(error => this.error(error))
        })
      },
    )
  }

  getInstanceModpackMetadata(path: string): Promise<InstanceModpackMetadataSchema | undefined> {
    const metadataPath = join(path, 'modpack-metadata.json')
    return readJson(metadataPath)
      .then(InstanceModpackMetadataSchema.parse)
      .catch(() => undefined)
  }

  setInstanceModpackMetadata(
    path: string,
    metadata: InstanceModpackMetadataSchema | undefined,
  ): Promise<void> {
    const metadataPath = join(path, 'modpack-metadata.json')
    if (metadata) {
      return writeJson(metadataPath, InstanceModpackMetadataSchema.parse(metadata))
    } else {
      return rm(metadataPath, { force: true }).catch(() => undefined)
    }
  }

  async getSharedInstancesState(): Promise<SharedState<InstanceState>> {
    await this.initialize()
    return this.state
  }

  async updateInstanceGroups(previous: InstanceState['groups'], next: InstanceState['groups']) {
    await this.initialize()
    if (!Array.isArray(previous) || !Array.isArray(next) || previous.length > 10000 || next.length > 10000) throw new TypeError('Invalid instance groups')
    const expected = InstanceGroupDataOrStringArray.parse(previous)
    const groups = InstanceGroupDataOrStringArray.parse(next)
    if (JSON.stringify(this.state.groups) !== JSON.stringify(expected)) throw Object.assign(new Error('Instance groups changed'), { name: 'InstanceGroupsChanged' })
    this.state.instanceGroupsSet(groups)
    await this.#groupsWrite
  }

  protected getPathUnder(...ps: string[]) {
    return this.getPath(INSTANCES_FOLDER, ...ps)
  }

  private getCandidatePath(name: string) {
    const candidate = this.getPathUnder(filenamify(name, { replacement: '_' }))
    if (!existsSync(candidate)) {
      return candidate
    } else {
      // find the first available path
      let i = 1
      while (existsSync(candidate + i)) {
        i++
      }
      return candidate + i
    }
  }

  registerRemoveHandler(path: string, handler: () => Promise<void> | void): () => void {
    if (!this.#removeHandlers[path]) {
      this.#removeHandlers[path] = []
    }
    const list = this.#removeHandlers[path]
    list.push(handler)
    return () => {
      const idx = list.indexOf(handler)
      if (idx >= 0) list.splice(idx, 1)
    }
  }

  @Singleton((v) => v)
  async loadInstance(
    path: string,
    onRename: ((old: string, newPath: string) => void) | undefined = this.#onRenamedInstancePath,
  ): Promise<boolean> {
    requireString(path)

    // Fix the wrong path if user set the name start/end with space
    path = path.trim()

    if (!isAbsolute(path)) {
      path = this.getPathUnder(path)
    }

    let option: InstanceDataWithTime
    let hasStoredPath = false

    if (!(await isDirectory(path))) {
      return false
    }

    this.log(`Start load instance under ${path}`)
    try {
      option = await readJson(join(path, 'instance.json')).then(InstanceSchema.parse)
      hasStoredPath = !!option.path
      delete option.path
    } catch (e) {
      this.warn(`Cannot load instance json ${path}`)
      this.warn(e)
      return false
    }

    // Fix the wrong path if user set the name start/end with space
    const instance = createInstance(
      option,
      () => path,
      this.versionMetadataService.getLatestRelease,
      false,
    )
    instance.path = path

    const name = instance.name
    const expectPath = this.getPathUnder(filenamify(name, { replacement: '_' }))

    try {
      // Persisted paths are stable identities; editing the display name must not move them on restart.
      if (!hasStoredPath && this.isUnderManaged(path) && expectPath !== path && !existsSync(expectPath)) {
        this.log(`Migrate instance ${path} -> ${expectPath}`)
        await rename(path, expectPath)
        // const failed = await Promise.race([
        //   await setTimeout(5_500).then(() => true),
        // ])
        // if (!failed) {
        onRename?.(path, expectPath)
        instance.path = expectPath
        // }
      }
    } catch (e) {
      this.warn(`Fail to rename instance ${path} -> ${expectPath}`)
      this.warn(e)
    }

    // Icons stored inside the instance folder are persisted as a relative path
    // for portability. Resolve them against the instance's current absolute
    // path so the renderer can display them.
    instance.icon = resolveInstanceIcon(instance.icon, instance.path)

    this.state.instanceAdd(instance)
    await this.#updateCopyState(instance.path)

    this.log(`Loaded instance ${instance.path}`)

    return true
  }

  async createInstance(payload: CreateInstanceOptions): Promise<string> {
    requireObject(payload)

    if (!payload.name) {
      throw new TypeError('payload.name should not be empty!')
    }

    const instance = createInstance(
      payload,
      (v) => this.getCandidatePath(v),
      this.versionMetadataService.getLatestRelease,
    )

    if (!isPathDiskRootPath(instance.path)) {
      await ensureDir(instance.path).catch(() => undefined)
    }

    const isBedrock = instance.edition === 'bedrock'
    if (!isBedrock) {
      const forceFolder = true
      if (forceFolder || payload.resourcepacks) {
        await ensureDir(join(instance.path, 'resourcepacks')).catch(() => undefined)
      }
      if (forceFolder || payload.shaderpacks) {
        await ensureDir(join(instance.path, 'shaderpacks')).catch(() => undefined)
      }
    }

    // Store the icon inside the instance folder so it is portable and shared
    // with the instance.
    instance.icon = await this.#resolveIncomingInstanceIcon(instance.path, instance.icon).catch((e) => {
      this.error(e)
      return ''
    })

    await writeJson(join(instance.path, 'instance.json'), {
      ...instance,
      icon: serializeInstanceIcon(instance.icon, instance.path),
    })
    this.state.instanceAdd(instance)

    await this.#groupsWrite
    this.log(`Created instance ${instance.path}`)

    return instance.path
  }

  /**
   * Import absolute image sources as independent instance files, while retaining
   * portable relative references used by pending modpack installations.
   */
  async #resolveIncomingInstanceIcon(instancePath: string, icon: string | undefined): Promise<string> {
    if (!icon) return ''
    const mediaPath = getMediaIconPath(icon)
    if (mediaPath) {
      return this.#storeInstanceIcon(instancePath, mediaPath)
    }
    if (icon.startsWith('http://launcher/image/')) {
      const imageName = basename(new URL(icon).pathname)
      if (!/^[a-f0-9]{40}$/i.test(imageName)) {
        throw new Error('Invalid shared image URL')
      }
      const source = this.getAppDataPath('resource-images', imageName)
      if (!existsSync(source)) {
        throw new Error('Shared image does not exist')
      }
      return this.#storeInstanceIcon(instancePath, source)
    }
    if (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('data:image/')) {
      const response = await this.app.fetch(icon)
      if (!response.ok) {
        throw new Error(`Fail to fetch instance icon: ${response.status}`)
      }
      const contentLength = Number(response.headers.get('content-length') || 0)
      if (contentLength > 8 * 1024 * 1024) {
        throw new Error('Instance icon exceeds maximum size of 8 MB')
      }
      if (!response.body) throw new Error('Empty instance icon response')
      const reader = response.body.getReader(), chunks: Uint8Array[] = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 8 * 1024 * 1024) throw new Error('Instance icon exceeds maximum size of 8 MB')
          chunks.push(value)
        }
      } finally { await reader.cancel().catch(() => {}) }
      const data = Buffer.concat(chunks)
      return this.#storeInstanceIconData(instancePath, data, response.headers.get('content-type') || '')
    }
    // No scheme: a relative reference resolved against the instance folder.
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(icon)) {
      const inside = relative(instancePath, resolve(instancePath, icon))
      if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error('Instance icon escapes its folder')
      return resolveInstanceIcon(icon, instancePath)
    }
    throw new Error('Unsupported instance icon URL')
  }

  async #storeInstanceIconData(instancePath: string, data: Buffer, contentType: string): Promise<string> {
    const fileType = await fileTypeFromBuffer(data).catch(() => undefined)
    const isSvg = contentType.startsWith('image/svg+xml')
    if (!fileType?.mime.startsWith('image/') && !isSvg) {
      throw new Error('Instance icon is not an image')
    }
    const ext = isSvg ? 'svg' : (fileType?.ext || 'png')
    const iconPath = join(instancePath, `icon-${createHash('sha256').update(data).digest('hex')}.${ext}`)
    await ensureDir(instancePath)
    await writeAtomically(iconPath, data)
    return toMediaIconUrl(iconPath)
  }

  /**
   * Own the validated bytes under a content hash, so edits cannot overwrite
   * a legacy link or change the image belonging to an older review.
   */
  async #storeInstanceIcon(instancePath: string, source: string): Promise<string> {
    const data = await readBoundedLocalFile(source, 8 * 1024 * 1024)
    const svg = extname(source).toLowerCase() === '.svg' && data.subarray(0, 512).toString().includes('<svg')
    return this.#storeInstanceIconData(instancePath, data, svg ? 'image/svg+xml' : '')
  }

  #copyOperations = new Map<string, Promise<string>>()

  async #updateCopyState(path: string): Promise<InstanceCopyState | undefined> {
    let copy: InstanceCopyState | undefined
    try {
      const job = await readInstanceCopy(path)
      if (job) copy = { sourcePath: job.source, totalFiles: job.files.length }
    } catch { copy = { sourcePath: '', totalFiles: 0, invalid: true } }
    if (JSON.stringify(this.state.pendingCopies[path]) !== JSON.stringify(copy)) this.state.instanceCopyState({ path, copy })
    return copy
  }

  async getInstanceCopyState(path: string) {
    await this.initialize()
    requireString(path)
    if (!this.state.instances.some(instance => instance.path === path && instance.edition === 'java')) throw new AnyError('InstanceNotFoundError')
    return this.#updateCopyState(path)
  }

  async #copyIdle(...paths: string[]) {
    const { LaunchService } = await import('../launch/LaunchService')
    const processes = await (await this.app.registry.get(LaunchService)).getGameProcesses()
    if (processes.some(process => paths.includes(process.options.gameDirectory))) throw new AnyError('InstanceCopyGameRunning')
  }

  #copyRequest(requestId?: string) {
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(requestId))) throw new TypeError('Invalid copy request')
  }

  async #managedCopyPath(path: string) {
    if (!this.isUnderManaged(path) || (await lstat(path)).isSymbolicLink()) throw new AnyError('InstanceCopyUnsafePath')
    const root = await realpath(this.getPath(INSTANCES_FOLDER)), actual = await realpath(path), inside = relative(root, actual)
    if (!inside || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new AnyError('InstanceCopyUnsafePath')
  }

  async #runCopy(path: string, job: InstanceCopyJob, task: TaskInstance<DuplicateInstanceTask>) {
    const operation = this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      if (!this.state.instances.some(instance => instance.path === path)) throw new AnyError('InstanceNotFoundError')
      await this.#copyIdle(job.source, path)
      await runInstanceCopy(job, path, task.controller.signal, getTracker<DuplicateInstanceTrackerEvents>(task), this.getPath())
      this.state.instanceCopyState({ path })
      return path
    })
    this.#copyOperations.set(path, operation)
    try {
      const result = await operation
      task.complete()
      return result
    } catch (error) {
      task.fail(error)
      throw Object.assign(error instanceof Error ? error : new Error('Instance copy failed', { cause: error }), { destinationPath: path, sourcePath: job.source })
    } finally {
      this.#copyOperations.delete(path)
      if (this.state.instances.some(instance => instance.path === path)) await this.#updateCopyState(path)
    }
  }

  async duplicateInstance(path: string, requestId?: string) {
    await this.initialize()
    requireString(path); this.#copyRequest(requestId)
    const instance = this.state.instances.find(instance => instance.path === path && instance.edition === 'java')
    if (!instance) return ''
    return this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      await this.#copyIdle(path)
      await assertInstanceCopyComplete(path)
      const snapshot = JSON.parse(JSON.stringify(instance))
      const newPath = this.getCandidatePath(instance.name || basename(path))
      const task = this.tasks.create<DuplicateInstanceTask>({ type: 'duplicateInstance', key: `duplicate-instance-${newPath}`, from: path, to: newPath, requestId })
      try {
        const job = await prepareInstanceCopy(path, task.controller.signal, this.getPath())
        await ensureDir(this.getPath(INSTANCES_FOLDER))
        await mkdir(newPath)
        await this.#managedCopyPath(newPath)
        await saveInstanceCopy(newPath, job)
        await this.createInstance({ ...snapshot, icon: serializeInstanceIcon(snapshot.icon, path), path: newPath, name: basename(newPath) })
        await this.#updateCopyState(newPath)
        return await this.#runCopy(newPath, job, task)
      } catch (error) {
        task.fail(error)
        throw Object.assign(error instanceof Error ? error : new Error('Instance copy failed', { cause: error }), { destinationPath: newPath, sourcePath: path })
      }
    })
  }

  async resumeInstanceCopy(path: string, requestId?: string) {
    await this.initialize()
    requireString(path); this.#copyRequest(requestId)
    const existing = this.#copyOperations.get(path)
    if (existing) return existing
    if (!this.state.instances.some(instance => instance.path === path && instance.edition === 'java')) throw new AnyError('InstanceCopyUnsafePath')
    await this.#managedCopyPath(path)
    const job = await readInstanceCopy(path)
    if (!job) { this.state.instanceCopyState({ path }); return path }
    if (!this.state.instances.some(instance => instance.path === job.source && instance.edition === 'java')) throw new AnyError('InstanceCopySourceMissing')
    return this.mutex.of(LockKey.instance(job.source)).runExclusive(async () => {
      if (!await readInstanceCopy(path)) { this.state.instanceCopyState({ path }); return path }
      await assertInstanceCopyComplete(job.source)
      const task = this.tasks.create<DuplicateInstanceTask>({ type: 'duplicateInstance', key: `duplicate-instance-${path}`, from: job.source, to: path, requestId })
      return this.#runCopy(path, job, task)
    })
  }

  /**
   * Move all the saves of an instance to the shared saves folder before the
   * instance is deleted, so the user can re-enable them on another instance
   * instead of losing them. If the instance `saves` folder is a symlink to the
   * shared folder, nothing needs to be moved.
   */
  private async moveSavesToShared(path: string) {
    const instanceSaves = join(path, 'saves')
    if (!existsSync(instanceSaves)) {
      return
    }
    // If linked to shared, saves already live in the shared folder.
    if (await readlink(instanceSaves).catch(() => '')) {
      return
    }
    const sharedSaves = this.getPath('saves')
    try {
      await ensureDir(sharedSaves)
      const saves = await readdir(instanceSaves)
      for (const saveName of saves) {
        const savePath = join(instanceSaves, saveName)
        // Skip individually linked saves
        if (await readlink(savePath).catch(() => '')) continue
        let dest = join(sharedSaves, saveName)
        if (existsSync(dest)) {
          dest = join(sharedSaves, `${saveName}-${Date.now()}`)
        }
        await rename(savePath, dest)
      }
    } catch (e) {
      throw new Error('Cannot preserve instance worlds before deletion', { cause: e })
    }
  }

  /**
   * Delete the managed instance from the disk
   * @param path The instance path
   */
  async deleteInstance(path: string, deleteData = true) {
    await this.initialize()
    requireString(path)
    if (typeof deleteData !== 'boolean') throw new TypeError('deleteData must be a boolean')

    const instance = this.state.instances.find(i => i.path === path)
    if (!instance) throw new AnyError('InstanceNotFoundError')
    const isBedrock = instance?.edition === 'bedrock'

    const isManaged = this.isUnderManaged(path)
    const lock = this.mutex.of(LockKey.instanceRemove(path))
    const instanceLock = this.mutex.of(LockKey.instance(path))
    if (isManaged && (await exists(path))) {
      if ((await lstat(path)).isSymbolicLink() || !this.isUnderManaged(await realpath(path))) throw new Error('Unsafe managed instance directory')
      await lock.runExclusive(async () => {
        // Reject any install requests currently waiting for the instance
        // lock so they don't start work that we are about to wipe out.
        // NOTE: `cancel()` only rejects pending acquires; it does NOT
        // abort the active holder. The active holder is signalled via
        // the remove handlers below, and our own `runExclusive` call
        // (queued synchronously before any `await`) will resolve only
        // after that holder releases.
        instanceLock.cancel()

        // Snapshot handlers and start them BEFORE awaiting, so they get
        // a chance to flip an AbortSignal on the currently-running
        // install. We do not await them out of band here — we await
        // them inside `runExclusive` so a new caller cannot squeeze
        // into the lock between handlers finishing and rm starting.
        const oldHandlers = this.#removeHandlers[path] || []
        const handlerPromises = oldHandlers.map((fn) => {
          try {
            return Promise.resolve(fn())
          } catch (e) {
            return Promise.reject(e)
          }
        })

        await instanceLock.runExclusive(async () => {
          // Wait for in-flight cleanup (e.g. install unwinding after
          // abort) to complete. allSettled so a buggy handler can't
          // block deletion.
          await Promise.allSettled(handlerPromises)
          await this.#instanceWrites.get(path)

          if (isBedrock && process.platform === 'win32') {
            try {
              const { execFile } = require('child_process')
              await new Promise<void>((resolve, reject) => {
                execFile('powershell', ['-Command', 'Get-AppxPackage Microsoft.MinecraftUWP | Remove-AppxPackage'], { windowsHide: true }, (err: any) => {
                  if (err) reject(err)
                  else resolve()
                })
              })
              this.log(`Successfully uninstalled Bedrock UWP package for instance ${path}`)
            } catch (e) {
              this.warn(`Failed to uninstall Bedrock UWP package: ${e}`)
            }
          }

          if (deleteData) {
            await this.moveSavesToShared(path)
            try {
              await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
            } catch (e) {
              if (isSystemError(e) && e.code === ENOENT_ERROR) {
                this.warn(`Fail to remove instance ${path}: ${e}`)
              } else {
                if (e instanceof Error && e.name === 'Error') {
                  e.name = 'InstanceDeleteError'
                }
                throw e
              }
            }
          } else {
            // Rename to hidden
            const name = basename(path)
            const newPath = join(dirname(path), '.' + name)
              if (await exists(newPath)) throw new Error('Retired instance destination already exists')
              await rename(path, newPath)
          }

          this.#removeHandlers[path] = []
        })
      })
    }

    this.state.instanceRemove(path)
    this.#instanceWrites.delete(path)
    this.state.instanceGroupsSet(this.state.groups.filter(group => group !== path).map(group => typeof group === 'string' ? group : { ...group, instances: group.instances.filter(member => member !== path) }))
    await this.#groupsWrite
  }

  /**
   * Edit the instance. If the `path` is not present, it will edit the current selected instance.
   * Otherwise, it will edit the instance on the provided path
   */
  async editInstance(options: Parameters<IInstanceService['editInstance']>[0]) {
    await this.initialize()
    requireObject(options)
    if (options.expectedMetadata) {
      requireString(options.instancePath)
      return this.mutex.of(LockKey.instance(options.instancePath)).runExclusive(() => this.#editInstanceFields(options))
    }
    return this.#editInstanceFields(options)
  }

  async #editInstanceFields(options: Parameters<IInstanceService['editInstance']>[0]) {
    const instancePath = options.instancePath

    if (!instancePath) {
      return
    }
    let state =
      this.state.all[instancePath] || this.state.instances.find((i) => i.path === instancePath)

    if (options.expectedMetadata && (!state || state.edition === 'bedrock')) throw new AnyError('InstanceNotFoundError')

    if (!state) {
      // Try to force load the instance
      await this.loadInstance(instancePath).catch(() => false)
      state =
        this.state.all[instancePath] || this.state.instances.find((i) => i.path === instancePath)

      if (!state) {
        this.error(
          new AnyError(
            'InstanceNotFoundError',
            `Fail to find ${instancePath}. Existed: ${Object.keys(this.state.all).join(', ')}.`,
          ),
        )
        return
      }
    }

    if (options.name) {
      if (this.isUnderManaged(instancePath)) {
        const newPath = join(dirname(instancePath), options.name)
        if (newPath !== instancePath) {
          if (this.state.instances.some((i) => i.path === newPath)) {
            if (options.expectedMetadata) throw Object.assign(new Error('Instance name already exists'), { name: 'InstanceNameDuplicatedError' })
            options.name = undefined
            this.error(new AnyError('InstanceNameDuplicatedError'))
          }
        }
      }
    }

    const checkMetadata = () => {
      const expected = options.expectedMetadata
      if (expected && !['name', 'description', 'author', ...(Object.hasOwn(expected, 'icon') ? ['icon'] : [])].every(key => typeof Reflect.get(expected, key) === 'string' && Reflect.get(expected, key) === (Reflect.get(state, key) || ''))) throw Object.assign(new Error('Instance metadata changed'), { name: 'InstanceMetadataChanged' })
    }
    checkMetadata()
    const result = await computeInstanceEditChanges(state, options, async (path: string) => toMediaIconUrl(path))
    if (result.icon) {
      result.icon = await this.#resolveIncomingInstanceIcon(instancePath, result.icon)
    }

    if (Object.keys(result).length > 0) {
      checkMetadata()
    this.log(`Modified instance ${instancePath}`)
      // A reset-to-global field is represented as `undefined` in `result`.
      // The mutation payload is broadcast to renderer processes over Electron
      // IPC, whose structured clone serialization silently drops `undefined`
      // properties — so the renderer would never learn the override was
      // removed and its in-memory state would stay stale. Send `null` instead;
      // `applyInstanceChanges` maps it back to `undefined` when applying.
      const payload: Record<string, any> = { path: instancePath }
      for (const key of Object.keys(result)) {
        const value = (result as any)[key]
        payload[key] = value === undefined ? null : value
      }
      this.state.instanceEdit(payload as any)
      await this.#instanceWrites.get(instancePath)
    }
  }

  isUnderManaged(path: string) {
    const child = relative(resolve(this.getPathUnder()), resolve(path))
    return !!child && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child)
  }

  async acquireInstanceById(id: string): Promise<string> {
    id = filenamify(id)
    this.log(`Acquire instance by id ${id}`)
    const instancePath = this.getPathUnder(id)
    if (this.state.all[instancePath]) {
      this.log(`Acquire existed instance ${id} -> ${instancePath}`)
      return instancePath
    }
    const path = await this.createInstance({
      path: instancePath,
      name: id,
    })
    this.log(`Create new instance ${id} -> ${instancePath}`)
    return path
  }

  async validateInstancePath(path: string) {
    requireString(path)
    if (!isAbsolute(path) || !(await isDirectory(path))) return 'bad'
    const err = await validateDirectory(this.app.platform, path, true)
    if (err && err !== 'exists') {
      return err
    }
    await this.initialize()
    if (this.state.all[path]) {
      return undefined
    }
    return (await this.loadInstance(path).catch(() => 'bad')) ? undefined : 'bad'
  }
}
