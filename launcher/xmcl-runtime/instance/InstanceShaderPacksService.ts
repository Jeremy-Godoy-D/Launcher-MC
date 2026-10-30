import { InstanceShaderPacksService as IInstanceShaderPacksService, InstanceShaderPacksServiceKey, LockKey, type ShaderSelectionChange, type UpdateInstanceResourcesOptions } from '@xmcl/runtime-api'
import { Inject, LauncherAppKey, kGameDataPath } from '~/app'
import { ExposeServiceKey } from '~/service'
import { LauncherApp } from '../app/LauncherApp'
import { AbstractInstanceDomainService } from './AbstractInstanceDomainService'
import { ResourceDomain } from '@xmcl/resource'
import { AnyError } from '@xmcl/utils'
import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { getShaderEngines } from '@xmcl/runtime-api/src/util/shaderEngine'
import { kResourceManager } from '~/resource'
import { InstanceService } from './InstanceService'
import { LaunchService } from '../launch/LaunchService'
import { instanceFileSource } from '../instanceIO/utils/instanceFileSource'
import { readModFilesSnapshot } from './utils/localMods'
import { readShaderSelection, writeShaderSelection } from './utils/shaderSelection'
import { installLocalResourcePacks } from './utils/localResourcePacks'

@ExposeServiceKey(InstanceShaderPacksServiceKey)
export class InstanceShaderPacksService extends AbstractInstanceDomainService implements IInstanceShaderPacksService {
  constructor(@Inject(LauncherAppKey) app: LauncherApp) {
    super(app, ResourceDomain.ShaderPacks)
  }
  async #javaInstance(path: string) {
    const instances = await this.app.registry.get(InstanceService); await instances.initialize()
    const instance = instances.state.instances.find(instance => instance.path === path && instance.edition === 'java')
    if (!instance) throw new AnyError('InstanceNotFoundError')
    return instance
  }
  async #read<T>(path: string, action: (root: string) => Promise<T>) {
    await this.#javaInstance(path)
    return this.mutex.of('resource-pack-options').runExclusive(() => this.mutex.of(LockKey.instance(path)).runExclusive(async () => {
      await this.#javaInstance(path)
      const getPath = await this.app.registry.get(kGameDataPath)
      return action(getPath())
    }))
  }
  async #context(path: string) {
    const instance = await this.#javaInstance(path), configuration = { runtime: { ...instance.runtime }, java: instance.java, version: instance.version }
    await instanceFileSource(path, 'mods', undefined, true)
    const directory = await lstat(join(path, 'mods')).catch(error => { if (error.code !== 'ENOENT') throw error })
    const inventory = directory ? await readModFilesSnapshot(path, configuration) : { entries: [], fingerprint: '' }
    const manager = await this.app.registry.get(kResourceManager), state = manager.getWatched(join(path, 'mods'))?.state
    const active = inventory.entries.filter(entry => !entry.directory && /\.(jar|zip|litemod)$/i.test(entry.fileName))
    const files = (state?.files || []).filter(file => active.some(entry => entry.path === file.path && entry.ino === file.ino && entry.ctime === file.ctime && entry.mtime === file.mtime && entry.size === file.size))
    return { engines: getShaderEngines(instance.runtime, files), metadataPending: files.length !== active.length,
      fingerprint: createHash('sha256').update(JSON.stringify([configuration, inventory.fingerprint, files.map(file => [file.path, file.hash])])).digest('hex') }
  }
  async install({ path, files }: UpdateInstanceResourcesOptions) {
    const installed = await this.#read(path, async root => {
      const launch = await this.app.registry.get(LaunchService), processes = await launch.getGameProcesses()
      if (processes.some(process => process.options.gameDirectory === path)) throw new AnyError('InstanceRunningError')
      if (processes.length && await this.isLinked(path) && (await Promise.all(processes.map(process => this.isLinked(process.options.gameDirectory)))).some(Boolean)) throw new AnyError('SharedOptionsRunningError')
      return installLocalResourcePacks(path, files, root, 'shaderpacks')
    })
    const manager = await this.app.registry.get(kResourceManager)
    if (!manager.getWatched(join(path, 'shaderpacks'))) this.resolveMarketMetadata(installed).catch(error => this.warn(error))
    return installed
  }
  async showDirectory(path: string) {
    return this.#read(path, async root => { await instanceFileSource(path, 'shaderpacks', root, true); return super.showDirectory(path) })
  }
  async watch(path: string) {
    return this.#read(path, async root => { await instanceFileSource(path, 'shaderpacks', root, true); return super.watch(path) })
  }
  async getSelection(path: string) {
    return this.#read(path, async root => readShaderSelection(path, root, await this.#context(path)))
  }
  async setSelection(path: string, change: ShaderSelectionChange) {
    return this.#read(path, async root => {
      const launch = await this.app.registry.get(LaunchService)
      if ((await launch.getGameProcesses()).some(process => process.options.gameDirectory === path)) throw new AnyError('InstanceRunningError')
      return writeShaderSelection(path, root, change, () => this.#context(path))
    })
  }
}
