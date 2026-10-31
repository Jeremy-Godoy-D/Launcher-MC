import type { StateData } from '@launcher/renderer-client'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import type { SavedInstance } from '../library/model'

export function modIdentity(resource: StateData<ResourceState>['files'][number], runtime: SavedInstance['runtime']) {
  const metadata = resource.metadata, fabric = Array.isArray(metadata.fabric) ? metadata.fabric[0] : metadata.fabric, quilt = metadata.quilt?.quilt_loader
  const values = {
    fabric: fabric && { name: fabric.name || fabric.id, version: fabric.version },
    quilt: quilt && { name: quilt.metadata?.name || quilt.id, version: quilt.version },
    forge: metadata.forge && { name: metadata.forge.name || metadata.forge.modid, version: metadata.forge.version },
    neoforge: metadata.neoforge && { name: metadata.neoforge.displayName || metadata.neoforge.modid, version: metadata.neoforge.version },
    liteloader: metadata.liteloader && { name: metadata.liteloader.name, version: metadata.liteloader.version },
  }
  const order = runtime.fabricLoader ? ['fabric', 'quilt', 'forge', 'neoforge', 'liteloader'] as const
    : runtime.quiltLoader ? ['quilt', 'fabric', 'forge', 'neoforge', 'liteloader'] as const
      : runtime.forge ? ['forge', 'neoforge', 'fabric', 'quilt', 'liteloader'] as const
        : runtime.neoForged ? ['neoforge', 'forge', 'fabric', 'quilt', 'liteloader'] as const
        : ['forge', 'fabric', 'quilt', 'neoforge', 'liteloader'] as const
  const value = order.map(key => values[key]).find(Boolean)
  const name = metadata.name || value?.name || resource.name || resource.fileName
  return { name: typeof name === 'string' ? name : resource.fileName, version: typeof value?.version === 'string' ? value.version : '' }
}
