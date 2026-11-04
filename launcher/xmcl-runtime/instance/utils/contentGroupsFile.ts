import { constants } from 'node:fs'
import { copyFile, link, lstat, open, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { getInstanceGroupFileName, normalizeModFileName, type InstanceContentGroupType, type ModGroupData } from '@xmcl/runtime-api/src/services/InstanceModsGroupService'

export type ContentGroups = Record<string, ModGroupData>
const MAX_BYTES = 1024 * 1024
const reserved = new Set(['__proto__', 'constructor', 'prototype'])

export function validateContentGroups(value: unknown): asserts value is ContentGroups {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 1000) throw new Error('InvalidContentGroups')
  for (const [name, group] of Object.entries(value)) {
    if (!name.trim() || name.length > 256 || reserved.has(name) || !group || typeof group !== 'object' || Array.isArray(group)
      || typeof group.color !== 'string' || group.color.length > 100 || !Array.isArray(group.files) || group.files.length > 10000
      || group.files.some((file: unknown) => typeof file !== 'string' || !file || file.length > 1024)) throw new Error('InvalidContentGroups')
  }
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_BYTES) throw new Error('ContentGroupsTooLarge')
}

async function groupPath(path: string, type: InstanceContentGroupType) {
  if (typeof path !== 'string' || !isAbsolute(path) || !['mods', 'resourcepacks', 'shaderpacks'].includes(type)) throw new Error('InvalidContentGroupPath')
  if (!(await lstat(path)).isDirectory()) throw new Error('UnsafeContentGroupPath')
  return join(path, getInstanceGroupFileName(type))
}

async function inspect(path: string) {
  return lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error })
}

export async function readContentGroups(path: string, type: InstanceContentGroupType): Promise<ContentGroups | undefined> {
  const file = await groupPath(path, type), info = await inspect(file)
  if (!info) return
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('UnsafeContentGroupFile')
  if (info.size > MAX_BYTES) throw new Error('ContentGroupsTooLarge')
  const handle = await open(file, 'r')
  try {
    const current = await handle.stat()
    if (!current.isFile() || current.ino !== info.ino || current.dev !== info.dev) throw new Error('ContentGroupsChanged')
    const buffer = Buffer.alloc(MAX_BYTES + 1)
    let size = 0
    for (;;) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null)
      size += bytesRead
      if (size > MAX_BYTES) throw new Error('ContentGroupsTooLarge')
      if (!bytesRead) break
    }
    const text = buffer.subarray(0, size).toString('utf8').trim(), value: unknown = text ? JSON.parse(text) : {}
    validateContentGroups(value)
    return value
  } finally { await handle.close() }
}

export function legacyContentGroups(value: unknown): ContentGroups {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('InvalidLegacyContentGroups')
  const entries = new Map<string, ModGroupData>()
  for (const [file, name] of Object.entries(value)) {
    if (typeof name !== 'string') throw new Error('InvalidLegacyContentGroups')
    const group = entries.get(name) || { color: '', files: [] }
    const normalized = normalizeModFileName(file)
    if (!group.files.includes(normalized)) group.files.push(normalized)
    entries.set(name, group)
  }
  const groups = Object.fromEntries(entries)
  validateContentGroups(groups)
  return groups
}

export async function writeContentGroups(path: string, type: InstanceContentGroupType, groups: ContentGroups, previous?: ContentGroups, onlyIfMissing = false): Promise<'existing' | 'saved'> {
  const file = await groupPath(path, type)
  validateContentGroups(groups)
  if (onlyIfMissing && await inspect(file)) return 'existing'
  const before = await readContentGroups(path, type)
  if (previous !== undefined && !isDeepStrictEqual(before || {}, previous)) throw new Error('ContentGroupsChanged')
  const temporary = join(path, `.grimo-groups-${randomUUID()}.tmp`)
  const handle = await open(temporary, 'wx')
  try {
    try { await handle.writeFile(JSON.stringify(groups, null, 2), 'utf8'); await handle.sync() }
    finally { await handle.close() }
    if (!isDeepStrictEqual(await readContentGroups(path, type), before)) throw new Error('ContentGroupsChanged')
    if (onlyIfMissing || before === undefined) {
      try { await link(temporary, file) }
      catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
        if (code === 'EEXIST' && onlyIfMissing) return 'existing'
        if (!['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EPERM'].includes(code)) throw error
        try { await copyFile(temporary, file, constants.COPYFILE_EXCL) }
        catch (failure) {
          if (onlyIfMissing && failure && typeof failure === 'object' && 'code' in failure && failure.code === 'EEXIST') return 'existing'
          throw failure
        }
      }
    } else await rename(temporary, file)
    return 'saved'
  } finally { await unlink(temporary).catch(() => {}) }
}
