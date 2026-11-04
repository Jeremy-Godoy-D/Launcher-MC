import { getInstanceGroupFileName, InstanceContentGroupType, InstanceModsGroupService as IInstanceModsGroupService, InstanceModsGroupState, InstanceGroupStateKey, InstanceModsGroupServiceKey, ModGroupRules, SharedState, ModGroupData } from '@xmcl/runtime-api'
import { FSWatcher } from 'chokidar'
import { ensureFile, pathExists, readFile, writeFile } from 'fs-extra'
import { join } from 'path'
import { Inject, LauncherAppKey } from '~/app'
import { AbstractService, ExposeServiceKey, ServiceStateManager } from '~/service'
import { AnyError } from '@xmcl/utils'
import { LauncherApp } from '../app/LauncherApp'
import { InstanceService } from './InstanceService'
import { legacyContentGroups, readContentGroups, writeContentGroups } from './utils/contentGroupsFile'

/**
 * Provide services to manage mod groups and shared group rules
 */
@ExposeServiceKey(InstanceModsGroupServiceKey)
export class InstanceModsGroupService extends AbstractService implements IInstanceModsGroupService {
  constructor(@Inject(LauncherAppKey) app: LauncherApp) {
    super(app)
  }

  /**
   * Get the shared state object for mod groups in an instance
   * @param instancePath The instance path
   */
  async #assertJavaInstance(path: string) {
    const instances = await this.app.registry.get(InstanceService)
    await instances.initialize()
    if (typeof path !== 'string' || !instances.state.instances.some(instance => instance.path === path && instance.edition === 'java')) throw new AnyError('InstanceNotFoundError')
  }

  async getGroupState(instancePath: string, type: InstanceContentGroupType = 'mods'): Promise<SharedState<InstanceModsGroupState>> {
    await this.#assertJavaInstance(instancePath)
    if (!['mods', 'resourcepacks', 'shaderpacks'].includes(type)) throw new AnyError('GetGroupStateError', 'Unsupported content group type')
    const key = InstanceGroupStateKey(instancePath, type), stateManager = await this.app.registry.get(ServiceStateManager)
    return stateManager.registerOrGet(key, async () => {
      const state = new InstanceModsGroupState()
      let disposed = false
      const loadGroups = async () => {
        try {
          const groups = await readContentGroups(instancePath, type)
          if (!disposed) { state.groupsSet(groups || {}); state.groupsErrorSet('') }
        } catch {
          if (!disposed) state.groupsErrorSet('read')
        }
      }
      const revalidate = () => this.mutex.of(key).runExclusive(loadGroups)
      const watcher = new FSWatcher()
      watcher.on('all', () => { void revalidate().catch(() => { if (!disposed) state.groupsErrorSet('read') }) })
      const ready = new Promise<void>(resolve => { watcher.once('ready', resolve); watcher.once('error', () => resolve()) })
      watcher.on('error', () => { if (!disposed) state.groupsErrorSet('read') })
      watcher.add(join(instancePath, getInstanceGroupFileName(type)))
      await ready
      await revalidate()
      return [state, () => { disposed = true; void watcher.close() }, revalidate]
    })
  }

  async updateModsGroups(instancePath: string, groups: Record<string, ModGroupData>, type: InstanceContentGroupType = 'mods', previous?: Record<string, ModGroupData>): Promise<void> {
    await this.#assertJavaInstance(instancePath)
    const key = InstanceGroupStateKey(instancePath, type), manager = await this.app.registry.get(ServiceStateManager)
    await this.mutex.of(key).runExclusive(async () => {
      await this.#assertJavaInstance(instancePath)
      try {
        await writeContentGroups(instancePath, type, groups, previous)
        const state = manager.get<SharedState<InstanceModsGroupState>>(key)
        state?.groupsSet(groups)
        state?.groupsErrorSet('')
      } catch (error) {
        manager.get<SharedState<InstanceModsGroupState>>(key)?.groupsErrorSet(error instanceof Error && error.message === 'ContentGroupsChanged' ? 'changed' : 'write')
        throw error
      }
    })
  }

  async migrateLegacyModsGroups(instancePath: string, mapping: Record<string, string>): Promise<'existing' | 'imported'> {
    await this.#assertJavaInstance(instancePath)
    const key = InstanceGroupStateKey(instancePath), manager = await this.app.registry.get(ServiceStateManager)
    return this.mutex.of(key).runExclusive(async () => {
      await this.#assertJavaInstance(instancePath)
      if (await readContentGroups(instancePath, 'mods') !== undefined) return 'existing'
      const groups = legacyContentGroups(mapping)
      const result = await writeContentGroups(instancePath, 'mods', groups, undefined, true)
      if (result === 'existing') return 'existing'
      const state = manager.get<SharedState<InstanceModsGroupState>>(key)
      state?.groupsSet(groups)
      state?.groupsErrorSet('')
      return 'imported'
    })
  }

  /**
   * Get the shared group rules that map mod IDs to group names
   * These rules can be applied across all instances
   */
  async getSharedGroupRules(): Promise<ModGroupRules> {
    const appDataPath = this.app.appDataPath
    const rulesPath = join(appDataPath, 'shared-mod-group-rules.json')

    try {
      if (await pathExists(rulesPath)) {
        const data = await readFile(rulesPath, 'utf-8')
        const rules = JSON.parse(data)
        return rules
      }
    } catch (e) {
      this.warn(`Failed to load shared group rules from ${rulesPath}`, e)
    }

    return {}
  }

  /**
   * Update shared group rules by extracting mod ID to group mappings from an instance
   * @param instancePath Path to the instance to extract rules from
   */
  async updateSharedGroupRules(groupRules: Record<string, string[]>, replaceGroups: string[] = []): Promise<void> {
    const appDataPath = this.app.appDataPath
    const rulesPath = join(appDataPath, 'shared-mod-group-rules.json')

    // Get existing shared rules
    const sharedRules = await this.getSharedGroupRules()
    const newRules = {} as ModGroupRules

    const visited = new Set<string>()
    const replaceSet = new Set(replaceGroups)

    for (const [key, modIds] of Object.entries(groupRules)) {
      if (!newRules[key]) {
        newRules[key] = []
      }

      for (const modId of modIds) {
        if (!newRules[key].includes(modId)) {
          newRules[key].push(modId)
        }
        visited.add(modId)
      }
    }

    for (const [key, modIds] of Object.entries(sharedRules)) {
      // Discard the existing shared items for groups explicitly marked to be replaced
      if (replaceSet.has(key)) {
        continue
      }
      if (!newRules[key]) {
        newRules[key] = []
      }

      for (const modId of modIds) {
        if (visited.has(modId)) {
          continue
        }
        if (!newRules[key].includes(modId)) {
          newRules[key].push(modId)
        }
        visited.add(modId)
      }
    }

    // Save to file
    try {
      await ensureFile(rulesPath)
      await writeFile(rulesPath, JSON.stringify(newRules, null, 2), 'utf-8')
      this.log(`Updated shared group rules with ${Object.keys(newRules).length} new or changed mod ID mappings`)
    } catch (e) {
      this.warn(`Failed to save shared group rules to ${rulesPath}`, e)
      throw new AnyError('UpdateSharedGroupRulesError', `Failed to save shared group rules: ${e}`)
    }
  }
}