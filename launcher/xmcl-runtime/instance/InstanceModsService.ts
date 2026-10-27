import { Resource, ResourceDomain, ResourceManager } from '@xmcl/resource'
import { InstanceModsService as IInstanceModsService, InstanceModsServiceKey, UpdateInstanceResourcesOptions } from '@xmcl/runtime-api'
import { emptyDir, ensureDir, stat } from 'fs-extra'
import { join } from 'path'
import { Inject, LauncherAppKey } from '~/app'
import { kResourceManager } from '~/resource'
import { ExposeServiceKey } from '~/service'
import { LauncherApp } from '../app/LauncherApp'
import { readdirIfPresent } from '../util/fs'
import { AbstractInstanceDomainService } from './AbstractInstanceDomainService'
import { setModsEnabled } from './utils/setModsEnabled'

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

  async enable({ files, path }: UpdateInstanceResourcesOptions): Promise<void> {
    await setModsEnabled(path, files, true)
  }

  async disable({ files, path }: UpdateInstanceResourcesOptions): Promise<void> {
    await setModsEnabled(path, files, false)
  }

  async installToServerInstance(options: UpdateInstanceResourcesOptions): Promise<void> {
    this.log(`Install ${options.files.length} mods to server instance at ${options.path}`)
    const modsDir = join(options.path, 'server', 'mods')
    await ensureDir(modsDir)
    await emptyDir(modsDir)
    await this.install({ ...options, path: join(options.path, 'server') })
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
