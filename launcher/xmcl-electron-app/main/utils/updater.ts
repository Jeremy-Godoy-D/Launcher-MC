import { HAS_DEV_SERVER } from '@/constant'
import {
  DownloadBaseOptions,
  ProgressTracker,
  download,
  getDownloadBaseOptions,
} from '@xmcl/file-transfer'
import { Tracker, onDownloadSingle } from '@xmcl/installer'
import {
  DownloadUpdateTrackerEvents,
  ElectronUpdateOperation,
  ReleaseInfo,
} from '@xmcl/runtime-api'
import { DownloadUpdateOptions, LauncherAppUpdater } from '@xmcl/runtime/app'
import { AnyError, isSystemError } from '@xmcl/utils'
import { spawn } from 'child_process'
import { shell } from 'electron'
import * as updater from 'electron-updater'
import { AppUpdater, CancellationToken, UpdaterSignal } from 'electron-updater'
import { createReadStream, createWriteStream } from 'fs'
import { readFile, rename as renameAsync, unlink as unlinkAsync, writeFile } from 'fs-extra'
import { closeSync, existsSync, open, rename, unlink } from 'original-fs'
import { platform } from 'os'
import { basename, dirname, join } from 'path'
import semver from 'semver'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'
import { createGunzip } from 'zlib'
import { Logger } from '~/infra'
import { kSettings } from '~/settings'
import { checksum } from '~/util/fs'
import ElectronLauncherApp from '../ElectronLauncherApp'
import { ensureElevateExe } from './elevate'
import { validateUpdateAsset, verifyUpdate } from './verifyUpdate'
import { getWindowsUpdateArgs } from './windowsUpdate'

export const DEFAULT_GITHUB_REPO = process.env.LAUNCHER_GITHUB_REPO || 'Jeremy-Godoy-D/Launcher-MC'

async function resolveUpdateToken(appDataPath: string): Promise<string> {
  const envToken = (process.env.LAUNCHER_UPDATE_TOKEN || process.env.GITHUB_TOKEN || '').trim()
  if (envToken) return envToken
  try {
    const fileToken = await readFile(join(appDataPath, 'update-token.txt'), 'utf-8')
    return fileToken.trim()
  } catch {
    return ''
  }
}

function buildGitHubHeaders(token: string, accept = 'application/vnd.github+json'): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: accept,
    'User-Agent': 'Launcher-MC-Updater',
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

/**
 * Only download asar file update from GitHub Releases (Jeremy-Godoy-D/Launcher-MC).
 */
async function downloadAsarUpdate(
  app: ElectronLauncherApp,
  destination: string,
  version: string,
  files: Array<{ name: string; url: string }> = [],
  options?: {
    abortSignal?: AbortSignal
    tracker?: Tracker<DownloadUpdateTrackerEvents>
  } & DownloadBaseOptions,
): Promise<void> {
  version = version.startsWith('v') ? version.substring(1) : version
  if (!semver.valid(version)) throw new AnyError('UpdateAsarError', 'La versión de actualización no es válida.')
  const pl = platform()
  let platformFlag = pl === 'win32' ? 'win' : pl === 'darwin' ? 'mac' : 'linux'
  if (process.arch === 'arm64') {
    platformFlag += '-arm64'
  } else if (process.arch === 'ia32') {
    platformFlag += '-ia32'
  }
  const baseName = `app-${version}-${platformFlag}.asar`
  const gzName = `${baseName}.gz`
  const shaName = `${baseName}.sha256`
  const token = await resolveUpdateToken(app.appDataPath)

  const gzAsset = files.find((f) => f.name === gzName)
  const rawAsset = files.find((f) => f.name === baseName)
  const shaAsset = files.find((f) => f.name === shaName)

  const defaultBaseUrl = `https://github.com/${DEFAULT_GITHUB_REPO}/releases/download/v${version}/${baseName}`
  const shaUrl = shaAsset?.url || `${defaultBaseUrl}.sha256`
  validateUpdateAsset(shaUrl, shaName, DEFAULT_GITHUB_REPO, version)

  const sha256Response = await app.fetch(shaUrl, {
    headers: buildGitHubHeaders(token, 'application/octet-stream'),
    signal: options?.abortSignal,
  })
  if (!sha256Response.ok) throw new AnyError('UpdateAsarError', 'No se pudo verificar la integridad SHA-256 de la actualización.')
  const sha256 = (await sha256Response.text()).trim().split(/\s+/)[0]
  if (!/^[a-f\d]{64}$/i.test(sha256)) throw new AnyError('UpdateAsarError', 'El archivo SHA-256 de la actualización no es válido.')
  const actual = await checksum(destination, 'sha256').catch(() => '')
  if (actual.toLowerCase() === sha256.toLowerCase()) {
    await writeFile(destination + '.sha256', sha256)
    return
  }

  const targetAsset = gzAsset || rawAsset
  const isGz = Boolean(gzAsset) || !rawAsset
  const downloadUrl = targetAsset?.url || (isGz ? `${defaultBaseUrl}.gz` : defaultBaseUrl)
  validateUpdateAsset(downloadUrl, isGz ? gzName : baseName, DEFAULT_GITHUB_REPO, version)

  const tempFile = destination + '.tmp'
  const verifiedFile = destination + '.verified'
  try {
  if (token && downloadUrl.includes('api.github.com/')) {
    const response = await app.fetch(downloadUrl, {
      headers: buildGitHubHeaders(token, 'application/octet-stream'),
      signal: options?.abortSignal,
    })
    if (!response.ok || !response.body) {
      throw new AnyError('UpdateAsarError', `No se pudo descargar la actualización desde ${downloadUrl} (HTTP ${response.status})`)
    }
    await writeFile(tempFile, Buffer.from(await response.arrayBuffer()))
  } else {
    await download({
      url: downloadUrl,
      destination: tempFile,
      headers: token ? buildGitHubHeaders(token, 'application/octet-stream') : undefined,
      tracker: onDownloadSingle(options?.tracker, 'download-update.asar', { url: downloadUrl }),
      signal: options?.abortSignal,
      ...getDownloadBaseOptions(options),
    })
  }

  if (isGz) {
    await pipeline(createReadStream(tempFile), createGunzip(), createWriteStream(verifiedFile))
    await unlinkAsync(tempFile).catch(() => {})
  } else {
    await renameAsync(tempFile, verifiedFile)
  }
    await verifyUpdate(verifiedFile, sha256)
    options?.abortSignal?.throwIfAborted()
    await renameAsync(verifiedFile, destination)
    await writeFile(destination + '.sha256', sha256)
  } finally {
    await Promise.all([unlinkAsync(tempFile).catch(() => {}), unlinkAsync(verifiedFile).catch(() => {})])
  }

}

async function hintUserDownload(): Promise<void> {
  shell.openExternal(`https://github.com/${DEFAULT_GITHUB_REPO}/releases`)
}

/**
 * Download the full update via electron-updater when configured.
 */
async function downloadFullUpdate(
  app: ElectronLauncherApp,
  appUpdater: AppUpdater,
  options?: {
    tracker?: Tracker<DownloadUpdateTrackerEvents>
    abortSignal?: AbortSignal
  },
): Promise<void> {
  const tracker: ProgressTracker = {
    progress: 0,
    total: 0,
    url: '',
  }
  options?.tracker?.({
    phase: 'download-update.full',
    payload: { progress: tracker },
  })

  const signal = new UpdaterSignal(appUpdater)
  signal.progress((info) => {
    tracker.progress = info.transferred
    tracker.total = info.total
  })

  const cancellationToken = new CancellationToken()
  options?.abortSignal?.addEventListener('abort', () => {
    cancellationToken.cancel()
  })
  await appUpdater.downloadUpdate(cancellationToken)
}

export function isSameVersion(a: string, b: string) {
  if (a.startsWith('v')) {
    a = a.substring(1)
  }
  if (b.startsWith('v')) {
    b = b.substring(1)
  }
  return a === b
}

export class ElectronUpdater implements LauncherAppUpdater {
  private logger: Logger

  constructor(private app: ElectronLauncherApp) {
    this.logger = app.getLogger('ElectronUpdater')
  }

  async #getUpdateFromGitHub(): Promise<ReleaseInfo> {
    const app = this.app
    this.logger.log(`Checking updates from GitHub repo ${DEFAULT_GITHUB_REPO}`)
    const settings = await app.registry.get(kSettings).catch(() => undefined)
    const allowPrerelease = settings?.allowPrerelease || app.version.includes('-')
    const token = await resolveUpdateToken(app.appDataPath)
    const response = await this.app
      .fetch(`https://api.github.com/repos/${DEFAULT_GITHUB_REPO}/releases?per_page=10`, {
        headers: buildGitHubHeaders(token),
      })
      .catch(() => undefined)

    if (!response || !response.ok) {
      this.logger.warn(`GitHub releases check returned ${response?.status ?? 'network error'} for ${DEFAULT_GITHUB_REPO}`)
      return {
        name: app.version,
        body: 'No hay actualizaciones pendientes en GitHub Releases.',
        date: '',
        files: [],
        newUpdate: false,
        operation: ElectronUpdateOperation.Manual,
      }
    }

    const releases = (await response.json()) as any[]
    const latest = Array.isArray(releases)
      ? releases.find((r) => !r.draft && (allowPrerelease || !r.prerelease))
      : undefined

    if (!latest || !latest.tag_name) {
      return {
        name: app.version,
        body: 'No se encontraron versiones publicadas en el repositorio.',
        date: '',
        files: [],
        newUpdate: false,
        operation: ElectronUpdateOperation.Manual,
      }
    }

    const files = (latest.assets ?? []).map((a: any) => ({
      url: token ? (a.url || a.browser_download_url) : a.browser_download_url,
      name: a.name,
    })) as Array<{ url: string; name: string }>
    const platformString =
      app.platform.os === 'windows' ? 'win' : app.platform.os === 'osx' ? 'mac' : 'linux'
    const version = latest.tag_name.startsWith('v') ? latest.tag_name.substring(1) : latest.tag_name
    const hasAsar = files.some(
      (f) => f.name === `app-${version}-${platformString}.asar` || f.name === `app-${version}-${platformString}.asar.gz`,
    )
    const currentClean = app.version.startsWith('v') ? app.version.substring(1) : app.version
    const isNewer = semver.valid(version) && semver.valid(currentClean)
      ? semver.gt(version, currentClean)
      : !isSameVersion(app.version, latest.tag_name)
    const updateInfo: ReleaseInfo = {
      name: latest.tag_name,
      body: latest.body || '',
      date: latest.published_at || '',
      files,
      newUpdate: isNewer,
      operation: hasAsar ? ElectronUpdateOperation.Asar : ElectronUpdateOperation.Manual,
    }

    this.logger.log(`Got operation=${updateInfo.operation} newUpdate=${updateInfo.newUpdate} (${latest.tag_name}) from GitHub`)

    return updateInfo
  }

  async #getUpdateFromAutoUpdater(): Promise<ReleaseInfo> {
    const autoUpdater = updater.autoUpdater

    this.logger.log(`Check update via ${autoUpdater.getFeedURL()}`)
    const info = await autoUpdater.checkForUpdates()
    if (!info) throw new Error('No update info found')

    const files = info.updateInfo.files.map((f) => ({ name: basename(f.url), url: f.url }))
    const release: ReleaseInfo = {
      name: info.updateInfo.version,
      body: info.updateInfo.releaseNotes as string,
      date: info.updateInfo.releaseDate,
      files,
      newUpdate: !isSameVersion(info.updateInfo.version, this.app.version),
      operation: ElectronUpdateOperation.AutoUpdater,
    }

    return release
  }

  private async quitAndInstallAsar() {
    const appAsarPath = join(dirname(__dirname), 'app.asar')
    const updateAsarPath = join(this.app.appDataPath, 'pending_update')

    const sha256 = (await readFile(updateAsarPath + '.sha256', 'utf8')).trim()
    await verifyUpdate(updateAsarPath, sha256)

    this.logger.log(`Install asar on ${this.app.platform.os} ${appAsarPath}`)
    if (this.app.platform.os === 'windows') {
      const elevatePath = await ensureElevateExe(this.app.appDataPath)

      const appAsarPath = join(dirname(__dirname), 'app.asar')
      const updateAsarPath = join(this.app.appDataPath, 'pending_update')

      if (!existsSync(updateAsarPath)) {
        throw new Error(`No update found: ${updateAsarPath}`)
      }

      const hasWriteAccess = await new Promise<boolean>((resolve) => {
        open(appAsarPath, 'a', (e, fd) => {
          if (e) {
            resolve(false)
          } else {
            closeSync(fd)
            resolve(true)
          }
        })
      })

      this.logger.log(
        hasWriteAccess
          ? `Process has write access to ${appAsarPath}`
          : `Process does not have write access to ${appAsarPath}`,
      )

      const command = getWindowsUpdateArgs({
        target: appAsarPath, source: updateAsarPath, sha256, pid: process.pid,
        executable: process.execPath, args: process.argv.slice(1), cwd: process.cwd(),
        errorLog: join(this.app.appDataPath, 'update-error.log'),
      })
      const args = hasWriteAccess ? command : [elevatePath, ...command]
      this.logger.log('Starting verified Windows update helper')
      const x = spawn(args[0], args.slice(1), {
        cwd: this.app.appDataPath,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      await new Promise<void>((resolve, reject) => {
        x.once('spawn', resolve)
        x.once('error', reject)
      })
      x.unref()
      this.app.quit()
    } else {
      await promisify(rename)(appAsarPath, appAsarPath + '.bk').catch(() => {})
      try {
        try {
          await promisify(rename)(updateAsarPath, appAsarPath)
        } catch (e) {
          if (isSystemError(e) && e.code === 'EXDEV') {
            await writeFile(appAsarPath, await readFile(updateAsarPath))
          } else {
            throw e
          }
        }
        await promisify(unlink)(appAsarPath + '.bk').catch(() => {})
        this.app.relaunch()
      } catch (e) {
        this.logger.error(
          new AnyError('UpdateError', `Fail to rename update the file: ${appAsarPath}`, {
            cause: e,
          }),
        )
        await promisify(rename)(appAsarPath + '.bk', appAsarPath)
      }
    }
  }

  async checkUpdateTask(): Promise<ReleaseInfo> {
    if (this.app.platform.os === 'windows' || this.app.platform.os === 'osx') {
      return this.#getUpdateFromGitHub()
    }
    try {
      return await this.#getUpdateFromAutoUpdater()
    } catch (e) {
      if (isSystemError(e) && e.code === 'ENOENT') {
        return this.#getUpdateFromGitHub()
      }
      this.logger.warn(e as Error)
      throw e
    }
  }

  async downloadUpdate(updateInfo: ReleaseInfo, options?: DownloadUpdateOptions): Promise<void> {
    const tracker = options?.tracker
    const abortSignal = options?.abortSignal

    if (updateInfo.operation === ElectronUpdateOperation.AutoUpdater) {
      await downloadFullUpdate(this.app, updater.autoUpdater, {
        tracker,
        abortSignal,
      })
    } else if (updateInfo.operation === ElectronUpdateOperation.Asar) {
      const updatePath = join(this.app.appDataPath, 'pending_update')
      await downloadAsarUpdate(this.app, updatePath, updateInfo.name, updateInfo.files, {
        tracker,
        abortSignal,
      })
    } else {
      tracker?.({
        phase: 'download-update.manual',
        payload: {},
      })
      await hintUserDownload()
    }
  }

  async installUpdateAndQuit(updateInfo: ReleaseInfo): Promise<void> {
    if (HAS_DEV_SERVER) {
      this.logger.log('Currently is development environment. Skip to install update')
      return
    }
    if (updateInfo.operation === ElectronUpdateOperation.Asar) {
      await this.quitAndInstallAsar()
    } else {
      updater.autoUpdater.quitAndInstall()
    }
  }
}
