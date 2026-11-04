import type { ModGroupData } from '@xmcl/runtime-api/src/services/InstanceModsGroupService'
import { normalizeModFileName } from '@xmcl/runtime-api/src/services/InstanceModsGroupService'

export type ContentGroups = Readonly<Record<string, { readonly color: string; readonly files: readonly string[] }>>

export function editContentGroup(groups: ContentGroups, original: string | undefined, name: string, color: string, remove = false): Record<string, ModGroupData> {
  const next = structuredClone(groups) as Record<string, ModGroupData>, value = name.trim()
  if (original !== undefined && !Object.hasOwn(next, original)) throw new Error('changed')
  if (remove) { if (original !== undefined) delete next[original]; return next }
  if (!value || value.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new Error('invalid')
  if (value !== original && Object.hasOwn(next, value)) throw new Error('duplicate')
  const group = original === undefined ? { color, files: [] } : { ...next[original], color }
  if (original === undefined) return { ...next, [value]: group }
  return Object.fromEntries(Object.entries(next).map(([key, previous]) => key === original ? [value, group] : [key, previous]))
}

export function assignContentGroup(groups: ContentGroups, files: string[], target?: string): Record<string, ModGroupData> {
  if (target !== undefined && !Object.hasOwn(groups, target)) throw new Error('changed')
  const names = new Set(files.map(normalizeModFileName)), next = structuredClone(groups) as Record<string, ModGroupData>
  for (const group of Object.values(next)) group.files = group.files.filter(file => !names.has(normalizeModFileName(file)))
  if (target !== undefined) next[target].files.push(...names)
  return next
}

export function contentGroupMemberships(groups: ContentGroups) {
  const result = new Map<string, string[]>()
  for (const [name, group] of Object.entries(groups)) for (const file of group.files) {
    const key = normalizeModFileName(file), names = result.get(key) || []
    if (!names.includes(name)) names.push(name)
    result.set(key, names)
  }
  return result
}
