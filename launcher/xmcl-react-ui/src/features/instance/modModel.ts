import type { StateData } from '@launcher/renderer-client'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { getModFileFromResource } from '@xmcl/runtime-api/src/util/mod'
import type { SavedInstance } from '../library/model'

export type ModResource = StateData<ResourceState>['files'][number]
export function modModel(file: ModResource, runtime: SavedInstance['runtime']) {
  // Legacy normalization receives a private copy, never the frozen native snapshot.
  try { return getModFileFromResource(structuredClone(file) as ResourceState['files'][number], runtime) } catch { return undefined }
}
