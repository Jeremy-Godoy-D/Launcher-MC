import { InstanceResourcesService } from './InstanceResourcesService'
import { ServiceKey } from './Service'
import type { ResourcePackSharingReview } from './InstanceResourcePacksService'

export type ShaderEngine = 'optifine' | 'iris' | 'oculus'
export interface ShaderPackSelection {
  snapshot: string
  engines: ShaderEngine[]
  engine: ShaderEngine | null
  pack: string
  enabled: boolean
  shared: boolean
  metadataPending: boolean
}
export interface ShaderSelectionChange {
  snapshot: string
  engine: ShaderEngine
  pack: string
  enabled: boolean
}
export interface ShaderRemovalReview {
  snapshot: string
  files: { fileName: string; directory: boolean; size: number; entries: number }[]
  sharedDirectory: boolean
  configurations: { engine: ShaderEngine; pack: string }[]
}

export interface InstanceShaderPacksService extends InstanceResourcesService {
  getSelection(instancePath: string): Promise<ShaderPackSelection>
  setSelection(instancePath: string, change: ShaderSelectionChange): Promise<ShaderPackSelection>
  previewRemoval(instancePath: string, fileNames: string[]): Promise<ShaderRemovalReview>
  /** Back up affected configurations, disable their selections, then move reviewed shaders to backups. */
  removeReviewed(instancePath: string, review: ShaderRemovalReview): Promise<{ backup: string }>
  previewSharing(instancePath: string, shared: boolean): Promise<ResourcePackSharingReview>
  applySharing(instancePath: string, review: ResourcePackSharingReview): Promise<{ backup?: string }>
  /**
   * Whether the instance's `shaderpacks` folder is linked to the global shared folder.
   */
  isLinked(instancePath: string): Promise<boolean>
  /**
   * Link the instance's `shaderpacks` folder to the global shared folder.
   *
   * Existing packs are merged into the shared folder first.
   */
  linkShared(instancePath: string): Promise<void>
  /**
   * Unlink the instance's `shaderpacks` folder, retaining an independent copy of all shared shaders.
   */
  unlinkShared(instancePath: string): Promise<void>
}

export const InstanceShaderPacksServiceKey: ServiceKey<InstanceShaderPacksService> = 'InstanceShaderPacksService'
