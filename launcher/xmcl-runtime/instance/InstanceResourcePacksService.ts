import { InstanceResourcePacksService as IInstanceResourcePacksService, InstanceResourcePacksServiceKey, LockKey, type ResourcePackRemovalReview, type UpdateInstanceResourcesOptions } from '@xmcl/runtime-api'
import { Inject, LauncherAppKey, kGameDataPath } from '~/app'
import { ExposeServiceKey } from '~/service'
import { LauncherApp } from '../app/LauncherApp'
import { AbstractInstanceDomainService } from './AbstractInstanceDomainService'
import { ResourceDomain } from '@xmcl/resource'
import { InstanceService } from './InstanceService'
import { LaunchService } from '../launch/LaunchService'
import { InstanceOptionsService } from './InstanceOptionsService'
import { kResourceManager } from '~/resource'
import { AnyError } from '@xmcl/utils'
import { join } from 'node:path'
import { installLocalResourcePacks, previewResourcePackRemoval, removeReviewedResourcePacks } from './utils/localResourcePacks'

/**
 * Provide the abilities to import resource pack and resource packs files to instance
 */
@ExposeServiceKey(InstanceResourcePacksServiceKey)
export class InstanceResourcePackService extends AbstractInstanceDomainService implements IInstanceResourcePacksService {
  constructor(@Inject(LauncherAppKey) app: LauncherApp) {
    super(app, ResourceDomain.ResourcePacks)
  }

  async #javaInstance(path: string) {
    const instances = await this.app.registry.get(InstanceService)
    await instances.initialize()
    if (!instances.state.instances.some(instance => instance.path === path && instance.edition === 'java')) throw new AnyError('InstanceNotFoundError')
  }

  async #change<T>(path: string, kind: 'read' | 'files' | 'files-and-options', action: (root: string) => Promise<T>) {
    await this.#javaInstance(path)
    return this.mutex.of('resource-pack-options').runExclusive(() => this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      await this.#javaInstance(path)
      if (kind !== 'read') {
        const launch = await this.app.registry.get(LaunchService), processes = await launch.getGameProcesses()
        if (processes.some(process => process.options.gameDirectory === path)) throw new AnyError('InstanceRunningError')
        if (processes.length) {
          if (await this.isLinked(path) && (await Promise.all(processes.map(process => this.isLinked(process.options.gameDirectory)))).some(Boolean)) throw new AnyError('SharedOptionsRunningError')
          if (kind === 'files-and-options') {
            const options = await this.app.registry.get(InstanceOptionsService)
            if (await options.isGameOptionsLinked(path) && (await Promise.all(processes.map(process => options.isGameOptionsLinked(process.options.gameDirectory)))).some(Boolean)) throw new AnyError('SharedOptionsRunningError')
          }
        }
      }
      const getPath = await this.app.registry.get(kGameDataPath)
      return action(getPath())
    }))
  }

  async install({ path, files }: UpdateInstanceResourcesOptions) {
    const installed = await this.#change(path, 'files', root => installLocalResourcePacks(path, files, root))
    const manager = await this.app.registry.get(kResourceManager)
    if (!manager.getWatched(join(path, 'resourcepacks'))) this.resolveMarketMetadata(installed).catch(error => this.warn(error))
    return installed
  }

  async previewRemoval(path: string, fileNames: string[]) {
    return this.#change(path, 'read', root => previewResourcePackRemoval(path, fileNames, root))
  }

  async removeReviewed(path: string, review: ResourcePackRemovalReview) {
    return this.#change(path, 'files-and-options', root => removeReviewedResourcePacks(path, review, root))
  }
}
