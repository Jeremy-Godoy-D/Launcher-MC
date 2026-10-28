import { Resource, ResourceDomain, ResourceManager } from '@xmcl/resource'
import { InstanceModsService as IInstanceModsService, InstanceModsServiceKey, LockKey, ModReviewConfiguration, ReviewedModChanges, UpdateInstanceResourcesOptions } from '@xmcl/runtime-api'
import { emptyDir, ensureDir, stat } from 'fs-extra'
import { join } from 'path'
import { Inject, LauncherAppKey } from '~/app'
import { kResourceManager } from '~/resource'
import { ExposeServiceKey } from '~/service'
import { LauncherApp } from '../app/LauncherApp'
import { readdirIfPresent } from '../util/fs'
import { AbstractInstanceDomainService } from './AbstractInstanceDomainService'
import { setModsEnabled } from './utils/setModsEnabled'
import { InstanceService } from './InstanceService'
import { AnyError } from '@xmcl/utils'
import { installLocalMods, readModFilesSnapshot, uninstallLocalMods, validateModFileChanges } from './utils/localMods'
import { LaunchService } from '../launch/LaunchService'

/**
 * Provide the abilities to import mods and resource packs files to instance
 */
@ExposeServiceKey(InstanceModsServiceKey)
export class InstanceModsService extends AbstractInstanceDomainService implements IInstanceModsService {
  constructor(@Inject(LauncherAppKey) app: LauncherApp,
    @Inject(kResourceManager) private resourceManager: ResourceManager,
  ) {
    super(app, ResourceDomain.Mods)
  }

  async enable({ files, path, expectedHashes, expectedSnapshot }: ReviewedModChanges): Promise<void> {
    await this.#changeMods(path, async configuration => { await validateModFileChanges(path, files, expectedHashes, expectedSnapshot, configuration); await setModsEnabled(path, files, true) })
  }

  async disable({ files, path, expectedHashes, expectedSnapshot }: ReviewedModChanges): Promise<void> {
    await this.#changeMods(path, async configuration => { await validateModFileChanges(path, files, expectedHashes, expectedSnapshot, configuration); await setModsEnabled(path, files, false) })
  }

  async getModFilesSnapshot(path: string) {
    await this.#assertJavaInstance(path)
    return this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      const instance = await this.#assertJavaInstance(path)
      return readModFilesSnapshot(path, { runtime: { ...instance.runtime }, java: instance.java, version: instance.version })
    })
  }

  async #changeMods<T>(path: string, operation: (configuration: ModReviewConfiguration) => Promise<T>): Promise<T> {
    await this.#assertJavaInstance(path)
    return this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      const instance = await this.#assertJavaInstance(path)
      const launch = await this.app.registry.get(LaunchService)
      if ((await launch.getGameProcesses()).some(process => process.options.gameDirectory === path)) throw new AnyError('InstanceRunningError')
      return operation({ runtime: { ...instance.runtime }, java: instance.java, version: instance.version })
    })
  }

  async install({ files, path }: UpdateInstanceResourcesOptions): Promise<string[]> {
    const destinations = await this.#changeMods(path, () => installLocalMods(path, files))
    if (!this.resourceManager.getWatched(join(path, 'mods'))) this.resolveMarketMetadata(destinations).catch(error => this.warn(error))
    return destinations
  }

  async uninstall({ files, path, expectedHashes, expectedSnapshot }: ReviewedModChanges): Promise<void> {
    await this.#changeMods(path, configuration => uninstallLocalMods(path, files, expectedHashes, expectedSnapshot, configuration))
  }

  async #assertJavaInstance(path: string) {
    const instances = await this.app.registry.get(InstanceService)
    await instances.initialize()
    const instance = typeof path === 'string' ? instances.state.instances.find(instance => instance.path === path && instance.edition === 'java') : undefined
    if (!instance) throw new AnyError('InstanceNotFoundError')
    return instance
  }

  async installToServerInstance(options: UpdateInstanceResourcesOptions): Promise<void> {
    this.log(`Install ${options.files.length} mods to server instance at ${options.path}`)
    const modsDir = join(options.path, 'server', 'mods')
    await ensureDir(modsDir)
    await emptyDir(modsDir)
    await super.install({ ...options, path: join(options.path, 'server') })
  }

  async getServerInstanceMods(path: string): Promise<Array<{ fileName: string; ino: number }>> {
    const result: Array<{ fileName: string; ino: number }> = []

    const modsDir = join(path, 'server', 'mods')
    const files = await readdirIfPresent(modsDir)
    for (const file of files) {
      const fstat = await stat(join(modsDir, file))
      result.push({ fileName: file, ino: fstat.ino })
    }

    return result
  }

  async searchInstalled(keyword: string): Promise<Resource[]> {
    return await this.resourceManager.getResourcesByKeyword(keyword, 'mods/')
  }
}
