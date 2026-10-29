import { InstanceResourcesService } from './InstanceResourcesService'
import { ServiceKey } from './Service'

export interface ResourcePackRemovalReview {
  snapshot: string
  files: { fileName: string; directory: boolean; size: number; entries: number }[]
  sharedDirectory: boolean
  sharedOptions: boolean
}

export interface ResourcePackSharingReview {
  snapshot: string
  shared: boolean
  linked: boolean
  localPacks: number
  sharedPacks: number
  files: number
  bytes: number
  conflicts: string[]
}

/**
 * Provide the abilities to diagnose & link resource packs files to instance
 */
export interface InstanceResourcePacksService extends InstanceResourcesService {
  previewSharing(instancePath: string, shared: boolean): Promise<ResourcePackSharingReview>
  applySharing(instancePath: string, review: ResourcePackSharingReview): Promise<{ backup?: string }>
  previewRemoval(instancePath: string, fileNames: string[]): Promise<ResourcePackRemovalReview>
  /** Move reviewed packs into private backups and remove them from this selection. */
  removeReviewed(instancePath: string, review: ResourcePackRemovalReview): Promise<{ backup: string }>
  /**
   * Whether the instance's `resourcepacks` folder is linked to the global shared folder.
   */
  isLinked(instancePath: string): Promise<boolean>
  /**
   * Link the instance's `resourcepacks` folder to the global shared folder.
   *
   * Existing packs are merged into the shared folder first.
   */
  linkShared(instancePath: string): Promise<void>
  /**
   * Unlink the instance's `resourcepacks` folder from the global shared folder.
   * Retain an independent local copy of its packs.
   */
  unlinkShared(instancePath: string): Promise<void>
}

export const InstanceResourcePacksServiceKey: ServiceKey<InstanceResourcePacksService> = 'InstanceResourcePacksService'
