import { validInstanceName } from './creation'
import type { SavedInstance } from './model'
import type { InstanceState } from '@xmcl/runtime-api/src/services/InstanceService'

type Groups = InstanceState['groups']
export function changeGroup(groups: Groups, id: string, name?: string): Groups {
  const index = groups.findIndex(group => typeof group !== 'string' && group.id === id)
  const group = groups[index]
  if (!group || typeof group === 'string') throw new Error('changed')
  const result = structuredClone(groups)
  if (name === undefined) result.splice(index, 1, ...group.instances)
  else {
    const value = name.trim()
    if (!value || value.length > 100 || groups.some(other => typeof other !== 'string' && other.id !== id && other.name.toLocaleLowerCase() === value.toLocaleLowerCase())) throw new Error('invalidGroup')
    result[index] = { ...group, name: value }
  }
  return result
}
export function manualOrder(instances: readonly SavedInstance[], groups: readonly (string | { readonly instances: readonly string[] })[]) {
  const paths = [...new Set([...groups.flatMap(group => typeof group === 'string' ? [group] : [...group.instances]), ...instances.map(instance => instance.path)])]
  const byPath = new Map(instances.map(instance => [instance.path, instance]))
  return paths.flatMap(path => byPath.has(path) ? [byPath.get(path)!] : [])
}
export function assignGroup(groups: Groups, path: string, target: string, newName: string, id: string) {
  if (target === 'new' && (!newName.trim() || newName.length > 100 || groups.some(group => typeof group !== 'string' && group.name.toLocaleLowerCase() === newName.trim().toLocaleLowerCase()))) throw new Error('invalidGroup')
  const result = groups.filter(group => group !== path).map(group => typeof group === 'string' ? group : { ...group, instances: group.instances.filter(member => member !== path) })
  if (target === 'new') result.push({ id, name: newName.trim(), color: '', instances: [path] })
  else if (target) {
    const group = result.find(group => typeof group !== 'string' && target === `id:${group.id}`)
    if (!group || typeof group === 'string') throw new Error('changed')
    group.instances.push(path)
  } else result.push(path)
  return result
}
export function moveInGroups(groups: Groups, instances: readonly SavedInstance[], path: string, direction: -1 | 1) {
  const result = structuredClone(groups)
  const listed = new Set(result.flatMap(group => typeof group === 'string' ? [group] : group.instances))
  for (const instance of instances) if (!listed.has(instance.path)) result.push(instance.path)
  const parent = result.find(group => typeof group !== 'string' && group.instances.includes(path))
  const list = parent && typeof parent !== 'string' ? parent.instances : result
  const index = list.indexOf(path), next = index + direction
  if (index >= 0 && next >= 0 && next < list.length) [list[index], list[next]] = [list[next], list[index]]
  return result
}

export type MetadataDraft = { name: string; description: string; author: string }
export const metadataDraft = (instance: SavedInstance): MetadataDraft => ({ name: instance.name, description: instance.description || '', author: instance.author || '' })
export function metadataEdit(original: SavedInstance, latest: SavedInstance | undefined, draft: MetadataDraft, instances: readonly SavedInstance[]) {
  if (!latest || latest.edition === 'bedrock' || latest.path !== original.path) throw new Error('missing')
  if (JSON.stringify(metadataDraft(latest)) !== JSON.stringify(metadataDraft(original))) throw new Error('changed')
  const name = draft.name.trim()
  if (!validInstanceName(name) || draft.description.length > 1000 || draft.author.length > 100) throw new Error('invalid')
  if (instances.some(instance => instance.path !== original.path && instance.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('duplicateName')
  return { instancePath: original.path, name, description: draft.description, author: draft.author, expectedMetadata: metadataDraft(original) }
}
