import { markRaw } from 'vue'
import { getModFileFromResource as normalize } from '@xmcl/runtime-api/src/util/mod'
export * from '@xmcl/runtime-api/src/util/mod'

export function getModFileFromResource(...args: Parameters<typeof normalize>): ReturnType<typeof normalize> {
  const mod = normalize(...args)
  markRaw(mod.modLoaders)
  markRaw(mod.provideRuntime)
  markRaw(mod.dependencies)
  Object.values(mod.dependencies).forEach(markRaw)
  if (mod.curseforge) markRaw(mod.curseforge)
  if (mod.modrinth) markRaw(mod.modrinth)
  return markRaw(mod)
}
