import {
  ServerFSExporter,
  ServerSSHExporter,
  parseInstanceFiles,
  parseLauncherData,
  getInstanceConfigFromMmcModpack,
  type InstanceFile,
} from '@xmcl/instance'
import {
  InstanceIOServiceKey,
  type ExportInstanceAsServerOptions,
  type InstanceIOService as IInstanceIOService,
  type InstanceType,
  type ThirdPartyLauncherManifest,
} from '@xmcl/runtime-api'
import { AnyError, isSystemError } from '@xmcl/utils'
import { join } from 'path'
import { Inject, LauncherAppKey, kGameDataPath, type PathResolver } from '~/app'
import { SSHManager } from '~/infra'
import { InstanceService } from '~/instance'
import { LaunchService } from '~/launch'
import { AbstractService, ExposeServiceKey } from '~/service'
import { VersionService } from '~/launch'
import { LauncherApp } from '../app/LauncherApp'
import { copyPassively, isPathDiskRootPath } from '../util/fs'
import { uploadSSH } from './utils/uploadSSH'
import { importLauncherInstance } from './utils/importLauncherInstance'
import { previewFolderFiles } from './utils/previewFolderFiles'
import { inspectPrismFolderVersion, preparePrismFolderVersion } from './utils/prismFolderVersion'
import { inspectVanillaFolderVersion, prepareVanillaFolderVersion } from './utils/vanillaFolderVersion'
import { VersionMetadataService } from '../install/VersionMetadataService'
import { readImportFile, importPathParts } from '../util/importFile'
import { fetchPrismMinecraftBase } from './utils/prismMinecraftBase'

@ExposeServiceKey(InstanceIOServiceKey)
export class InstanceIOService extends AbstractService implements IInstanceIOService {
  constructor(
    @Inject(LauncherAppKey) app: LauncherApp,
    @Inject(InstanceService) private instanceService: InstanceService,
    @Inject(kGameDataPath) protected getPath: PathResolver,
    @Inject(VersionService) protected versionService: VersionService,
  ) {
    super(app)
  }

  async exportInstanceAsServer(options: ExportInstanceAsServerOptions): Promise<void> {
    const launchService = await this.app.registry.get(LaunchService)
    const versionService = await this.app.registry.get(VersionService)
    const serverVersion = await versionService.resolveServerVersion(options.options.version)
    const ops = await launchService.generateServerOptions(options.options, serverVersion)
    if (options.output.type === 'folder') {
      await new ServerFSExporter(this.getPath(), options.output.path).exportInstance(
        options.options.gameDirectory,
        ops,
        options.files.map((f) => f.path),
      )
    } else if (options.output.type === 'ssh') {
      const manager = await this.app.registry.getOrCreate(SSHManager)
      const ssh = await manager.open({
        host: options.output.host,
        port: options.output.port,
        username: options.output.username,
        credentials: options.output.credentials,
      })
      const sftp = await manager.openSFTP(ssh)
      if (!sftp) {
        throw new Error('Failed to open sftp')
      }
      const exporter = new ServerSSHExporter(this.getPath(), options.output.path, ssh, sftp)

      await uploadSSH(
        exporter,
        options.options.gameDirectory,
        ops,
        options.files.map((f) => f.path),
      )

      sftp.end()
      ssh.end()
    }
  }

  async getGameDefaultPath(type?: 'modrinth' | 'modrinth-instances' | 'vanilla' | 'curseforge') {
    if (type === 'modrinth' || type === 'modrinth-instances') {
      const dir = join(this.app.host.getPath('appData'), 'com.modrinth.theseus')
      if (type === 'modrinth-instances') {
        return join(dir, 'profiles')
      }
      return dir
    }
    if (type === 'curseforge') {
      return join(this.app.host.getPath('home'), 'curseforge', 'minecraft')
    }
    return join(this.app.host.getPath('appData'), '.minecraft')
  }

  async parseInstanceFiles(path: string, type?: InstanceType): Promise<InstanceFile[]> {
    const result = await parseInstanceFiles(path, type === 'prism' ? 'mmc' : type)
    return result
  }
  async previewFolderFiles(path: string, type?: InstanceType) {
    return previewFolderFiles(path, type)
  }
  async previewPrismVersion(path: string) {
    const inspected = await inspectPrismFolderVersion(path, id => this.resolvePrismBase(id))
    return inspected ? { fingerprint: inspected.fingerprint, runtime: getInstanceConfigFromMmcModpack(inspected.manifest).runtime } : undefined
  }
  async preparePrismVersion(path: string, name: string, fingerprint: string) {
    try {
      const version = await preparePrismFolderVersion(path, name, fingerprint, this.getPath(), async id => {
        await this.versionService.refreshVersion(id)
        return this.versionService.resolveLocalVersion(id)
      }, id => this.resolvePrismBase(id))
      return { version }
    } catch (error) {
      if (error instanceof Error && error.name === 'PrismSourceChanged') return { error: 'sourceChanged' as const }
      if (error instanceof Error && error.name === 'ImportFileConflict') return { error: 'conflict' as const }
      throw error
    }
  }
  private async resolvePrismBase(id: string) {
    if (id.length > 200 || importPathParts(id).length !== 1) throw new Error('Invalid Prism Minecraft version')
    const cached = await readImportFile(this.getPath(), `versions/${id}/${id}.json`, 1024 * 1024)
    if (cached) return cached
    const metadata = await this.app.registry.get(VersionMetadataService)
    return fetchPrismMinecraftBase(id, await metadata.getMinecraftVersions(), this.app.fetch.bind(this.app))
  }
  async previewVanillaVersion(root: string, version: string) {
    const inspected = await inspectVanillaFolderVersion(root, version)
    return inspected ? { fingerprint: inspected.fingerprint, runtime: inspected.runtime } : undefined
  }
  async prepareVanillaVersion(root: string, version: string, fingerprint: string) {
    try {
      const id = await prepareVanillaFolderVersion(root, version, fingerprint, this.getPath(), async id => {
        await this.versionService.refreshVersion(id)
        return this.versionService.resolveLocalVersion(id)
      })
      return { version: id }
    } catch (error) {
      if (error instanceof Error && error.name === 'PrismSourceChanged') return { error: 'sourceChanged' as const }
      if (error instanceof Error && error.name === 'ImportFileConflict') return { error: 'conflict' as const }
      throw error
    }
  }

  async parseLauncherData(path: string, type?: InstanceType): Promise<ThirdPartyLauncherManifest> {
    // Refuse drive-root paths up front. The recursive scanners below would
    // otherwise descend into kernel-locked Windows entries (pagefile.sys,
    // System Volume Information, …) and surface noisy EBUSY exceptions
    // during the first-launch migrate wizard.
    if (isPathDiskRootPath(path)) {
      throw new AnyError('BadInstance', `Refusing to scan drive root: ${path}`, undefined, { path })
    }
    try {
      const result = await parseLauncherData(path, type === 'prism' ? 'mmc' : type)
      return result
    } catch (e) {
      if (isSystemError(e)) {
        if (e.code === 'ENOENT') {
          throw new AnyError('BadInstance', undefined, { cause: e }, { path })
        }
      }
      throw e
    }
  }

  async importLauncherData(data: ThirdPartyLauncherManifest): Promise<void> {
    const { instances, folder } = data

    if (folder.assets) {
      await copyPassively(folder.assets, this.getPath('assets'))
    }
    if (folder.libraries) {
      await copyPassively(folder.libraries, this.getPath('libraries'))
    }
    if (folder.versions) {
      await copyPassively(folder.versions, this.getPath('versions'))
    }
    if (folder.jre) {
      await copyPassively(folder.jre, this.getPath('jre'))
    }

    for (const instance of instances) {
      await importLauncherInstance(
        instance,
        this.getPath(),
        (options) => this.instanceService.createInstance(options),
        (id) => this.versionService.refreshVersion(id),
      )
    }
  }
}
