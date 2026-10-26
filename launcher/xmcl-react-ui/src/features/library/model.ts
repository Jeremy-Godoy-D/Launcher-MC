import type { StateData } from '@launcher/renderer-client'
import type { InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'

export type SavedInstance = StateData<InstanceState>['instances'][number]

export function javaInstances(instances: readonly SavedInstance[]) {
  return instances.filter(instance => instance.edition !== 'bedrock')
}

export function selectedInstance(instances: readonly SavedInstance[], path: string) {
  if (path) return instances.find(instance => instance.path === path)
  return [...instances].sort((a, b) => b.lastAccessDate - a.lastAccessDate)[0]
}

export function loaderName({ runtime }: SavedInstance) {
  return [
    runtime.forge && 'Forge', runtime.neoForged && 'NeoForge',
    runtime.fabricLoader && 'Fabric', runtime.quiltLoader && 'Quilt',
    runtime.optifine && 'OptiFine', runtime.labyMod && 'LabyMod',
  ].filter(Boolean).join(' + ') || 'Vanilla'
}

export function matchesInstanceQuery(instance: SavedInstance, query: string) {
  const term = query.trim().toLowerCase()
  if (!term) return true
  const { runtime } = instance
  const loaders = [
    ['Forge', runtime.forge], ['NeoForge', runtime.neoForged], ['Fabric', runtime.fabricLoader],
    ['Quilt', runtime.quiltLoader], ['OptiFine', runtime.optifine], ['LabyMod', runtime.labyMod],
  ].filter(([, version]) => version).map(([name, version]) => `${name} ${version}`)
  return [instance.name, runtime.minecraft || instance.version, ...(loaders.length ? loaders : ['Vanilla'])]
    .some(value => value.toLowerCase().includes(term))
}

export function instanceIcon(icon: string) {
  try {
    const url = new URL(icon)
    if (url.username || url.password) return ''
    if (url.protocol === 'https:' || url.origin === 'http://launcher' && (url.pathname.startsWith('/image/') || url.pathname === '/media' && url.searchParams.has('path'))) return url.href
  } catch { /* Missing or unsupported stored images use the bundled fallback. */ }
  return ''
}
