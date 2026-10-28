import type { Resource } from '@xmcl/resource'
import type { Instance } from '@xmcl/instance'
import { InstanceResourcesService, UpdateInstanceResourcesOptions } from './InstanceResourcesService'
import { ServiceKey } from './Service'

export function getInstanceModStateKey(path: string) {
  return `instance-mods://${path}`
}

export interface ModFilesSnapshot {
  fingerprint: string
  configuration?: ModReviewConfiguration
  entries: Array<{ path: string; fileName: string; size: number; mtime: number; ctime: number; ino: number; dev: number; directory: boolean }>
}
export type ModReviewConfiguration = Pick<Instance, 'runtime' | 'java' | 'version'>

export type ReviewedModChanges = UpdateInstanceResourcesOptions & {
  expectedHashes?: Record<string, string>
  expectedSnapshot?: string
}

/**
 * Provide the abilities to import/export mods files to instance
 */
export interface InstanceModsService extends InstanceResourcesService {
  /** Import regular mod archives without replacing an existing destination. */
  install(options: UpdateInstanceResourcesOptions): Promise<string[]>
  /** Remove direct mod files; reviewed hashes reject files changed after confirmation. */
  uninstall(options: ReviewedModChanges): Promise<void>
  /** Capture directory identities for a reviewed operation, without reading every archive. */
  getModFilesSnapshot(path: string): Promise<ModFilesSnapshot>
  /**
   * Mark mods enabled
   */
  enable(options: ReviewedModChanges): Promise<void>
  /**
   * Mark mods disabled
   */
  disable(options: ReviewedModChanges): Promise<void>
  /**
   * Install mods to the server instance.
   */
  installToServerInstance(options: UpdateInstanceResourcesOptions): Promise<void>

  getServerInstanceMods(path: string): Promise<Array<{ fileName: string; ino: number }>>
  /**
   * Search the installed mods cache.
   */
  searchInstalled(keyword: string): Promise<Resource[]>
}

export const InstanceModsServiceKey: ServiceKey<InstanceModsService> = 'InstanceModsService'
