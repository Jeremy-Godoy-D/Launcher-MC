import { markRaw } from 'vue'
import { getModDependencies as normalize } from '@xmcl/runtime-api/src/util/modDependencies'
export * from '@xmcl/runtime-api/src/util/modDependencies'

export function getModDependencies(...args: Parameters<typeof normalize>): ReturnType<typeof normalize> {
  const dependencies = normalize(...args)
  Object.values(dependencies).forEach(markRaw)
  return markRaw(dependencies)
}
