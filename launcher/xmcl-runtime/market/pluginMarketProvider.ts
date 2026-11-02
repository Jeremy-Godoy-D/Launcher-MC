import { isNotNull } from '@xmcl/core/utils'
import {
  File as CurseforgeFile,
  CurseforgeV1Client,
  HashAlgo,
  getCurseforgeFileDownloadUrls,
} from '@xmcl/curseforge'
import { DownloadBaseOptions } from '@xmcl/file-transfer'
import { diagnoseFile, onDownloadSingle, Tracker } from '@xmcl/installer'
import { InstanceFile as _InstanceFile } from '@xmcl/instance'
import { ModrinthV2Client, ProjectVersion } from '@xmcl/modrinth'
import { File, isValidCurseforgeRef, isValidModrinthRef } from '@xmcl/resource'
import {
  InstallCurseforgeFileTask,
  InstallCurseforgeFileTrackerEvents,
  InstallModrinthFileTask,
  InstallModrinthFileTrackerEvents,
  ResolveMarketFilesTask,
  getCurseforgeFileUri,
  getModrinthPrimaryFile,
  getModrinthVersionFileUri,
} from '@xmcl/runtime-api'
import { basename, dirname, join } from 'path'
import { LauncherAppPlugin } from '~/app'
import { createCurseforgeProxyClient } from '~/app/curseforgeProxy'
import { kTasks } from '~/infra'
import { InstanceInstallService } from '~/instanceIO'
import { kDownloadOptions } from '~/network'
import { kResourceManager, kResourceWorker } from '~/resource'
import { hardLinkFiles } from '~/util/fs'
import { getTracker } from '~/util/taskHelper'
import { createModrinthAuthenticatedFetch } from '~/user/utils/loginModrinth'
import { downloadStaged } from './downloadStaged'
import {
  InstallMarketDirectoryOptions,
  InstallMarketInstanceOptions,
  InstallResult,
  kMarketProvider,
} from './marketProvider'
import { getMarketFilePath } from './marketFilePath'
import { modpackRequest } from './modpackRequest'

type InstanceFile = _InstanceFile & { downloads: string[]; icon?: string }

export const pluginMarketProvider: LauncherAppPlugin = async (app) => {
  const modrinth = new ModrinthV2Client({ fetch: createModrinthAuthenticatedFetch(app) })
  app.registry.register(ModrinthV2Client, modrinth)
  const curseforge = createCurseforgeProxyClient((...args) => app.fetch(...args))
  app.registry.register(CurseforgeV1Client, curseforge)

  const resourceManager = await app.registry.get(kResourceManager)
  const tasks = await app.registry.get(kTasks)
  const hashWorker = await app.registry.get(kResourceWorker)

  async function getSnapshotByUris(file: InstanceFile, preferDir: string) {
    const sha1 = file.hashes.sha1
      ? file.hashes.sha1
      : await resourceManager.getHashByUri(
          file.downloads[0] ??
            (file.curseforge
              ? getCurseforgeFileUri({
                  modId: file.curseforge.projectId,
                  id: file.curseforge.fileId,
                })
              : getModrinthVersionFileUri({
                  project_id: file.modrinth!.projectId,
                  id: file.modrinth!.versionId,
                  filename: basename(file.path),
                })),
        )

    if (sha1) {
      const snapshots = await resourceManager.getSnapshotsByHash([sha1])
      const all = await Promise.all(
        snapshots.map(async (snapshot) => {
          const cachedFile = await resourceManager.validateSnapshotFile(snapshot)
          if (!cachedFile) {
            return undefined
          }
          if ((await hashWorker.hash(cachedFile.path, cachedFile.size)) !== sha1) {
            return undefined
          }
          return [cachedFile, snapshot] as const
        }),
      )

      const existed = all.filter(isNotNull)

      const matched = existed.find(([file]) => dirname(file.path) === preferDir) || existed[0]

      if (!matched) {
        return undefined
      }

      const metadata = await resourceManager.getMetadataByHash(sha1)
      return [...matched, metadata || {}] as const
    }

    return undefined
  }

  async function ensureTheFile(destination: string, file: File) {
    if (file.path === destination) {
      return
    }
    if (dirname(file.path) === destination) {
      return
    }
    // try to link the file
    file.path = await hardLinkFiles(file.path, destination)
  }

  async function downloadFile(
    instFile: InstanceFile,
    domainDir: string,
    downloadOptions: DownloadBaseOptions,
    control: Pick<InstallMarketDirectoryOptions, 'signal' | 'tracker'>,
  ) {
    const expectedHash = instFile.hashes.sha1 || instFile.hashes.md5
    const algorithm = instFile.hashes.sha1 ? 'sha1' : instFile.hashes.md5 ? 'md5' : undefined
    if (!algorithm || typeof expectedHash !== 'string' || !(algorithm === 'sha1' ? /^[a-f0-9]{40}$/i : /^[a-f0-9]{32}$/i).test(expectedHash)) throw new Error('Market file has no valid checksum')
    if (!Number.isSafeInteger(instFile.size) || instFile.size! <= 0) throw new Error('Market file has no valid size')
    // Defend against corrupted refs (paths leaked into versionId etc.).
    if (instFile.modrinth && !isValidModrinthRef(instFile.modrinth)) {
      instFile.modrinth = undefined
    }
    if (instFile.curseforge && !isValidCurseforgeRef(instFile.curseforge)) {
      instFile.curseforge = undefined
    }
    const snapshoted = await getSnapshotByUris(instFile, domainDir)
    const filePath = join(domainDir, instFile.path)
    const uris = instFile.downloads

    if (snapshoted && (algorithm === 'sha1' || (await hashWorker.checksum(snapshoted[0].path, algorithm)).toLowerCase() === expectedHash.toLowerCase())) {
      const [file, snapshot, metadata] = snapshoted
      await ensureTheFile(filePath, file)

      return {
        file,
        snapshot,
        uris,
        path: file.path,
        metadata: {
          ...metadata,
          modrinth: instFile.modrinth,
          curseforge: instFile.curseforge,
        },
      }
    }

    // Check if file already exists and is valid
    if (expectedHash && algorithm) {
      const issue = await diagnoseFile(
        {
          file: filePath,
          expectedChecksum: expectedHash,
          algorithm,
          role: 'marketFile',
          hint: `Market file ${basename(instFile.path)}`,
        },
        { checksum: (file, algo) => hashWorker.checksum(file, algo) },
      )
      if (!issue) {
        // File exists and is valid, no need to download
        return {
          uris,
          path: filePath,
          metadata: {
            modrinth: instFile.modrinth,
            curseforge: instFile.curseforge,
          },
        }
      }
    }

    if (instFile.modrinth) {
      const task = tasks.create<InstallModrinthFileTask>({
        type: 'installModrinthFile',
        key: `installModrinthFile-${instFile.modrinth.projectId}-${instFile.modrinth.versionId}`,
        projectId: instFile.modrinth.projectId,
        versionId: instFile.modrinth.versionId,
        filename: basename(instFile.path),
        icon: instFile.icon,
      })

      const tracker = getTracker<InstallModrinthFileTrackerEvents>(task)
      const progress = onDownloadSingle(tracker, 'download', {})
      control.tracker?.trackers.push(progress)
      const signal = control.signal ? AbortSignal.any([control.signal, task.controller.signal]) : task.controller.signal

      try {
        await downloadStaged({
          ...downloadOptions,
          url: instFile.downloads,
          destination: filePath,
          tracker: progress,
          signal,
          expectedTotal: instFile.size,
          validate: async path => { if ((await hashWorker.checksum(path, algorithm)).toLowerCase() !== expectedHash.toLowerCase()) throw Object.assign(new Error('Market file checksum mismatch'), { name: 'ChecksumNotMatchError' }) },
        })
        signal.throwIfAborted()
        task.complete()
      } catch (error) {
        if (control.signal?.aborted) task.controller.abort(control.signal.reason)
        task.fail(error)
        throw error
      }
    } else {
      const task = tasks.create<InstallCurseforgeFileTask>({
        type: 'installCurseforgeFile',
        key: `installCurseforgeFile-${instFile.curseforge!.projectId}-${instFile.curseforge!.fileId}`,
        projectId: instFile.curseforge!.projectId,
        fileId: instFile.curseforge!.fileId,
        filename: basename(instFile.path),
        icon: instFile.icon,
      })

      const tracker: Tracker<InstallCurseforgeFileTrackerEvents> = getTracker(task)
      const progress = onDownloadSingle(tracker, 'download', {})
      control.tracker?.trackers.push(progress)
      const signal = control.signal ? AbortSignal.any([control.signal, task.controller.signal]) : task.controller.signal

      try {
        await downloadStaged({
          ...downloadOptions,
          url: instFile.downloads,
          destination: filePath,
          tracker: progress,
          signal,
          expectedTotal: instFile.size,
          validate: async path => { if ((await hashWorker.checksum(path, algorithm)).toLowerCase() !== expectedHash.toLowerCase()) throw Object.assign(new Error('Market file checksum mismatch'), { name: 'ChecksumNotMatchError' }) },
        })
        signal.throwIfAborted()
        task.complete()
      } catch (error) {
        if (control.signal?.aborted) task.controller.abort(control.signal.reason)
        task.fail(error)
        throw error
      }
    }

    return {
      uris,
      path: filePath,
      metadata: {
        modrinth: instFile.modrinth,
        curseforge: instFile.curseforge,
      },
    }
  }

  async function postprocess(result: InstallResult, directory: string, icon: string | undefined) {
    const watched = resourceManager.getWatched(directory)
    if (watched) {
      watched.enqueue({
        filePath: result.path,
        metadata: result.metadata,
        uris: result.uris,
        icons: icon ? [icon] : undefined,
      })
    } else {
      const snapshot = await resourceManager.getSnapshot(result.path)
      if (snapshot) {
        await resourceManager.updateMetadata([
          {
            hash: snapshot.sha1,
            metadata: result.metadata,
            uris: result.uris,
            icons: icon ? [icon] : undefined,
          },
        ])
      }
    }
  }

  function getModrinthFile(
    domain: string,
    version: ProjectVersion,
    filename?: string,
    icon?: string,
  ): InstanceFile {
    const file = version.files.find((f) => f.filename === filename)
    if (filename && !file) throw new Error('Requested Modrinth file is unavailable')
    const modrinthFile = file || getModrinthPrimaryFile(version)
    const filePath = getMarketFilePath(domain, modrinthFile.filename)

    const uris = [modrinthFile.url] as string[]

    return {
      path: filePath,
      hashes: modrinthFile.hashes,
      downloads: uris,
      size: modrinthFile.size,
      modrinth: {
        projectId: version.project_id,
        versionId: version.id,
      },
      icon,
    }
  }

  function getCurseforgeFile(
    domain: string,
    curseforgeFile: CurseforgeFile,
    icon?: string,
  ): InstanceFile {
    if (curseforgeFile.isAvailable === false || !curseforgeFile.downloadUrl) throw new Error('CurseForge file download is unavailable')
    const filePath = getMarketFilePath(domain, curseforgeFile.fileName)

    const uris = [] as string[]

    const downloadUrls = getCurseforgeFileDownloadUrls(
      curseforgeFile.id,
      curseforgeFile.fileName,
      curseforgeFile.downloadUrl,
    )

    uris.push(...downloadUrls)

    const hashes: Record<string, string> = {}
    for (const hash of curseforgeFile.hashes) {
      if (hash.algo === HashAlgo.Sha1) {
        hashes.sha1 = hash.value
      } else if (hash.algo === HashAlgo.Md5) {
        hashes.md5 = hash.value
      }
    }

    return {
      path: filePath,
      hashes,
      downloads: uris,
      size: curseforgeFile.fileLength,
      curseforge: {
        projectId: curseforgeFile.modId,
        fileId: curseforgeFile.id,
      },
      icon,
    }
  }

  async function getFiles(
    options: InstallMarketDirectoryOptions | InstallMarketInstanceOptions,
    signal?: AbortSignal,
  ): Promise<InstanceFile[]> {
    signal = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)
    const domain = 'domain' in options ? options.domain : ''
    if (options.market === 0) {
      const versions = Array.isArray(options.version) ? options.version : [options.version]
      const versionsDict = Object.fromEntries(versions.map((v) => [v.versionId, v]))
      const modrinthVersions = await modrinth.getProjectVersionsById(
        versions.map((v) => v.versionId),
        signal,
      )
      if (!Array.isArray(modrinthVersions) || modrinthVersions.length !== new Set(versions.map(v => v.versionId)).size || new Set(modrinthVersions.map(v => v.id)).size !== modrinthVersions.length || modrinthVersions.some(version => typeof version.id !== 'string' || !Object.hasOwn(versionsDict, version.id) || versionsDict[version.id].projectId !== undefined && versionsDict[version.id].projectId !== version.project_id || typeof version.project_id !== 'string' || !/^[A-Za-z0-9]{8}$/.test(version.project_id))) throw new Error('Invalid Modrinth file selection')
      const result = modrinthVersions.map((version) =>
        getModrinthFile(
          domain,
          version,
          versionsDict[version.id].filename,
          versionsDict[version.id].icon,
        ),
      )
      return result
    } else {
      const curseforgeFiles = Array.isArray(options.file) ? options.file : [options.file]
      const files = await curseforge.getFiles(curseforgeFiles.map((f) => f.fileId), signal)
      const fileDict = Object.fromEntries(curseforgeFiles.map((f) => [f.fileId, f]))
      if (!Array.isArray(files) || files.length !== new Set(curseforgeFiles.map(f => f.fileId)).size || new Set(files.map(f => f.id)).size !== files.length || files.some(file => !Number.isSafeInteger(file.id) || !Object.hasOwn(fileDict, file.id) || fileDict[file.id].projectId !== undefined && fileDict[file.id].projectId !== file.modId || file.gameId !== 432 || !Number.isSafeInteger(file.modId) || file.modId <= 0)) throw new Error('Invalid CurseForge file selection')
      const result = files.map((file) => getCurseforgeFile(domain, file, fileDict[file.id].icon))
      return result
    }
  }

  app.registry.register(kMarketProvider, {
    resolveInstanceFiles: async options => {
      const request = modpackRequest(options)
      if (options.id !== undefined && (typeof options.id !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(options.id))) throw new Error('Invalid market metadata operation')
      const task = options.id ? tasks.create<ResolveMarketFilesTask>({ type: 'resolveMarketFiles', key: `resolveMarketFiles-${options.id}`, operationId: options.id, market: request.market }) : undefined
      try {
        const files = await getFiles({ ...request, domain: options.domain, instancePath: options.instancePath }, task?.controller.signal)
        task?.controller.signal.throwIfAborted()
        task?.complete()
        return files
      } catch (error) { task?.fail(error); throw error }
    },
    installFile: async (options) => {
      const downloadOptions = await app.registry.get(kDownloadOptions)

      const files = await getFiles(options, options.signal)
      options.signal?.throwIfAborted()
      if (files.some(file => !file.path || basename(file.path) !== file.path) || new Set(files.map(file => file.path.toLowerCase())).size !== files.length || files.some(file => files.some(other => other.path.toLowerCase() === (file.path + '.pending').toLowerCase()))) throw new Error('Invalid or conflicting market filenames')

      const downloads = files.map(async (file) => {
        const result = await downloadFile(file, options.directory, downloadOptions, options)
        await postprocess(result, options.directory, file.icon)
        return result
      })
      try { return await Promise.all(downloads) }
      catch (error) { await Promise.allSettled(downloads); throw error }
    },
    installInstanceFile: async (options: InstallMarketInstanceOptions) => {
      const installService = await app.registry.getOrCreate(InstanceInstallService)
      const files = await getFiles(options)

      await installService.installInstanceFiles({
        path: options.instancePath,
        files: files,
        oldFiles: [],
      })

      const result: InstallResult[] = files.map((file) => ({
        path: join(options.instancePath, file.path),
        uris: file.downloads,
        metadata: {
          modrinth: file.modrinth,
          curseforge: file.curseforge,
        },
      }))

      return result
    },
  })
}
