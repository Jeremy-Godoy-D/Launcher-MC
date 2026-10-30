import type { RuntimeVersions } from '@xmcl/instance'
import type { Resource } from '@xmcl/resource'
import type { ShaderEngine } from '../services/InstanceShaderPacksService'
import { createModContext } from './modDiagnostics'
import { getModFileFromResource } from './mod'

export function getShaderEngines(runtime: RuntimeVersions, resources: readonly Resource[]): ShaderEngine[] {
  const mods = resources.filter(file => !/\.disabled$/i.test(file.path)).map(file => getModFileFromResource(structuredClone(file), runtime))
  const context = createModContext(mods, runtime), engines = new Set<ShaderEngine>()
  if (context.ambiguousRuntime) return []
  if (runtime.optifine || context.providers.has('optifine')) engines.add('optifine')
  if (context.providers.has('optifabric') && mods.some(mod => mod.enabled && mod.forge?.modid?.toLowerCase() === 'optifine')) engines.add('optifine')
  if (context.providers.has('iris')) engines.add('iris')
  if (context.providers.has('oculus')) engines.add('oculus')
  return [...engines]
}
