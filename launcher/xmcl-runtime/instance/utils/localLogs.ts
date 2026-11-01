import { AnyError } from '@xmcl/utils'
import { constants, type Stats } from 'node:fs'
import { lstat, open, opendir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { gunzip } from 'node:zlib'
import { importPathParts } from '../../util/importFile'

export const MAX_LOG_BYTES = 16 * 1024 * 1024
const MAX_LOG_ENTRIES = 10000
export type LogArea = 'logs' | 'server/logs' | 'crash-reports' | 'server/crash-reports'
const unzip = promisify(gunzip)
const inspect = (path: string) => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
const unsafe = () => new AnyError('InstanceLogUnsafePath')
const changed = () => new AnyError('InstanceLogChanged')
const same = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino
function fail(error: unknown): never {
  if (error instanceof Error && error.name.startsWith('InstanceLog')) throw error
  throw new AnyError((error as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE' ? 'InstanceLogTooLarge' : 'InstanceLogReadError')
}
function logName(name: string, area: LogArea) {
  try {
    if (typeof name !== 'string' || name.length > 255 || importPathParts(name).length !== 1 || !(area.endsWith('crash-reports') ? /\.(txt|gz)$/i : /\.(log|txt|gz)$/i).test(name)) throw unsafe()
  } catch { throw unsafe() }
}
type Location = { path: string; info: Stats }[]
async function directory(root: string, area: LogArea): Promise<Location | undefined> {
  const entries: Location = []
  let path = root
  for (const part of ['', ...area.split('/')]) {
    if (part) path = join(path, part)
    const info = await inspect(path)
    if (!info) return undefined
    if (!info.isDirectory() || info.isSymbolicLink()) throw unsafe()
    entries.push({ path, info })
  }
  return entries
}
async function verify(entries: Location) {
  for (const { path, info } of entries) {
    const now = await inspect(path)
    if (!now || now.isSymbolicLink() || !same(now, info) || now.isDirectory() !== info.isDirectory() || (now.isFile() && (now.nlink !== 1 || now.size < info.size))) throw changed()
  }
}
async function file(root: string, area: LogArea, name: string) {
  logName(name, area)
  const entries = await directory(root, area)
  if (!entries) return undefined
  const path = join(entries[entries.length - 1].path, name), info = await inspect(path)
  if (!info) return undefined
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw unsafe()
  entries.push({ path, info })
  return { path, info, entries }
}

export async function listLocalLogs(root: string, area: LogArea) {
  try {
    const entries = await directory(root, area)
    if (!entries) return []
    const names: string[] = []
    let count = 0
    for await (const entry of await opendir(entries[entries.length - 1].path)) {
      if (++count > MAX_LOG_ENTRIES) throw new AnyError('InstanceLogTooLarge')
      if (!entry.isFile()) continue
      try { logName(entry.name, area) } catch { continue }
      names.push(entry.name)
    }
    await verify(entries)
    return names.sort()
  } catch (error) { return fail(error) }
}

export async function readLocalLog(root: string, area: LogArea, name: string) {
  try {
    const target = await file(root, area, name)
    if (!target) return undefined
    if (target.info.size > MAX_LOG_BYTES) throw new AnyError('InstanceLogTooLarge')
    const handle = await open(target.path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0))
    let data: Buffer
    try {
      const info = await handle.stat()
      if (!info.isFile() || info.nlink !== 1 || !same(info, target.info) || info.size < target.info.size) throw changed()
      // A live log may append; read only its initial, bounded snapshot.
      data = Buffer.alloc(target.info.size)
      let offset = 0
      while (offset < data.length) {
        const { bytesRead } = await handle.read(data, offset, data.length - offset, offset)
        if (!bytesRead) throw changed()
        offset += bytesRead
      }
    } finally { await handle.close() }
    await verify(target.entries)
    return /\.gz$/i.test(name) ? await unzip(data, { maxOutputLength: MAX_LOG_BYTES }) : data
  } catch (error) { return fail(error) }
}

export async function removeLocalLog(root: string, area: LogArea, name: string) {
  try {
    const target = await file(root, area, name)
    if (!target) return
    await verify(target.entries)
    await unlink(target.path).catch(error => { if (error.code !== 'ENOENT') throw error })
  } catch (error) { return fail(error) }
}

export async function localLogPath(root: string, area: LogArea, name: string) {
  try {
    const target = await file(root, area, name)
    if (!target) throw new AnyError('InstanceLogReadError')
    await verify(target.entries)
    return target.path
  } catch (error) { return fail(error) }
}
