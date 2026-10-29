import { InstanceResourcePacksService as IInstanceResourcePacksService, InstanceResourcePacksServiceKey, LockKey, type ResourcePackRemovalReview, type ResourcePackSharingReview, type UpdateInstanceResourcesOptions } from '@xmcl/runtime-api'
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
import { applyResourcePackSharing, previewResourcePackSharing } from './utils/sharedResourcePacks'
import { instanceFileSource } from '../instanceIO/utils/instanceFileSource'

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

  async #change<T>(path: string, kind: 'read' | 'files' | 'files-and-options' | 'sharing', action: (root: string) => Promise<T>) {
    await this.#javaInstance(path)
    return this.mutex.of('resource-pack-options').runExclusive(() => this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      await this.#javaInstance(path)
      if (kind !== 'read') {
        const launch = await this.app.registry.get(LaunchService), processes = await launch.getGameProcesses()
        if (processes.some(process => process.options.gameDirectory === path)) throw new AnyError('InstanceRunningError')
        if (processes.length) {
          if ((kind === 'sharing' || await this.isLinked(path)) && (await Promise.all(processes.map(process => this.isLinked(process.options.gameDirectory)))).some(Boolean)) throw new AnyError('SharedOptionsRunningError')
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

  async previewSharing(path: string, shared: boolean) {
    return this.#change(path, 'read', root => previewResourcePackSharing(path, shared, root))
  }

  async applySharing(path: string, review: ResourcePackSharingReview) {
    return this.#change(path, 'sharing', root => this.#applySharing(path, review, root))
  }

  async #applySharing(path: string, review: ResourcePackSharingReview, root: string) {
    const manager = await this.app.registry.get(kResourceManager), watched = manager.getWatched(join(path, 'resourcepacks'))
    // Windows can retain a directory handle while it is watched; keep the same state when rebinding.
    try { await watched?.pause(); return await applyResourcePackSharing(path, review, root) }
    finally { watched?.resume(); await watched?.revalidate().catch(error => this.warn(error)) }
  }

  async linkShared(path: string) {
    await this.#change(path, 'sharing', async root => this.#applySharing(path, await previewResourcePackSharing(path, true, root), root))
  }

  async unlinkShared(path: string) {
    await this.#change(path, 'sharing', async root => this.#applySharing(path, await previewResourcePackSharing(path, false, root), root))
  }

  async watch(path: string) {
    return this.#change(path, 'read', async root => {
      await instanceFileSource(path, 'resourcepacks', root, true)
      return super.watch(path)
    })
  }
}
