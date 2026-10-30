import { InstanceResourcesService } from './InstanceResourcesService'
import { ServiceKey } from './Service'

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

export interface InstanceShaderPacksService extends InstanceResourcesService {
  getSelection(instancePath: string): Promise<ShaderPackSelection>
  setSelection(instancePath: string, change: ShaderSelectionChange): Promise<ShaderPackSelection>
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
   * Unlink the instance's `shaderpacks` folder from the global shared folder.
   */
  unlinkShared(instancePath: string): Promise<void>
}

export const InstanceShaderPacksServiceKey: ServiceKey<InstanceShaderPacksService> = 'InstanceShaderPacksService'
