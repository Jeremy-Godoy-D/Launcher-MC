import { AnyError } from '@xmcl/utils'
import { randomUUID } from 'node:crypto'
import { constants, type Dirent, type Stats } from 'node:fs'
import { link, lstat, mkdir, open, opendir, unlink, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { importPathParts } from './importFile'

export const MAX_LOG_BYTES = 16 * 1024 * 1024
export type LogLocation = { path: string; info: Stats }[]
const inspect = (path: string) => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
const same = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino
export const unsafeLogPath = () => new AnyError('InstanceLogUnsafePath')
const changed = () => new AnyError('InstanceLogChanged')
export function logFailure(error: unknown): never {
  if (error instanceof Error && error.name.startsWith('InstanceLog')) throw error
  throw new AnyError((error as NodeJS.ErrnoException)?.code === 'ERR_BUFFER_TOO_LARGE' ? 'InstanceLogTooLarge' : 'InstanceLogReadError')
}

export async function logDirectory(root: string, path = '', create = false): Promise<LogLocation | undefined> {
  const parts = path ? importPathParts(path) : []
  const entries: LogLocation = []
  let current = root
  for (const part of ['', ...parts]) {
    if (part) current = join(current, part)
    let info = await inspect(current)
    if (!info && create) {
      await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error })
      info = await inspect(current)
    }
    if (!info) return undefined
    if (!info.isDirectory() || info.isSymbolicLink()) throw unsafeLogPath()
    entries.push({ path: current, info })
  }
  return entries
}

export async function verifyLogLocation(entries: LogLocation) {
  for (const { path, info } of entries) {
    const now = await inspect(path)
    if (!now || now.isSymbolicLink() || !same(now, info) || now.isDirectory() !== info.isDirectory() || (now.isFile() && (now.nlink !== 1 || now.size < info.size))) throw changed()
  }
}

export async function logFile(root: string, path: string) {
  const parts = importPathParts(path), name = parts.pop()!
  const entries = await logDirectory(root, parts.join('/'))
  if (!entries) return undefined
  const target = join(entries[entries.length - 1].path, name), info = await inspect(target)
  if (!info) return undefined
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw unsafeLogPath()
  entries.push({ path: target, info })
  return { path: target, info, entries }
}

async function openLogFile(target: NonNullable<Awaited<ReturnType<typeof logFile>>>) {
  const handle = await open(target.path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0))
  try {
    const info = await handle.stat()
    if (!info.isFile() || info.nlink !== 1 || !same(info, target.info) || info.size < target.info.size) throw changed()
    await verifyLogLocation(target.entries)
    return handle
  } catch (error) { await handle.close(); throw error }
}

export async function readLogFile(root: string, path: string, limit = MAX_LOG_BYTES) {
  try {
    const target = await logFile(root, path)
    if (!target) return undefined
    if (target.info.size > limit) throw new AnyError('InstanceLogTooLarge')
    const handle = await openLogFile(target)
    const data = Buffer.alloc(target.info.size)
    try {
      // A live log may append; read only its initial, bounded snapshot.
      let offset = 0
      while (offset < data.length) {
        const { bytesRead } = await handle.read(data, offset, data.length - offset, offset)
        if (!bytesRead) throw changed()
        offset += bytesRead
      }
    } finally { await handle.close() }
    await verifyLogLocation(target.entries)
    return data
  } catch (error) { return logFailure(error) }
}

export async function listLogDirectory(root: string, path: string, limit: number) {
  const entries = await logDirectory(root, path)
  if (!entries) return []
  const result: Dirent[] = []
  for await (const entry of await opendir(entries[entries.length - 1].path)) {
    if (result.length >= limit) throw new AnyError('InstanceLogTooLarge')
    result.push(entry)
  }
  await verifyLogLocation(entries)
  return result
}

async function publishSnapshot(root: string, path: string, write: (handle: FileHandle) => Promise<void>) {
  const parts = importPathParts(path), name = parts.pop()!
  const entries = await logDirectory(root, parts.join('/'))
  if (!entries) throw new AnyError('InstanceLogReadError')
  const directory = entries[entries.length - 1].path
  const temporary = join(directory, `.snapshot-${randomUUID()}`)
  const handle = await open(temporary, 'wx', 0o600)
  let info: Stats | undefined
  try {
    try { info = await handle.stat(); await write(handle); await handle.sync() } finally { await handle.close() }
    await verifyLogLocation(entries)
    const now = await inspect(temporary)
    if (!now || !same(now, info) || !now.isFile() || now.nlink !== 1) throw changed()
    // A completed snapshot is immutable; never replace an existing destination.
    await link(temporary, join(directory, name))
  } finally {
    await verifyLogLocation(entries)
    const now = await inspect(temporary)
    if (info && now && same(now, info) && !now.isSymbolicLink()) await unlink(temporary)
  }
}

export async function writeLogSnapshot(root: string, path: string, data: string) {
  if (Buffer.byteLength(data, 'utf8') > MAX_LOG_BYTES) throw new AnyError('InstanceLogTooLarge')
  await publishSnapshot(root, path, handle => handle.writeFile(data, 'utf8'))
}

export async function copyLogSnapshot(sourceRoot: string, sourcePath: string, root: string, path: string) {
  const target = await logFile(sourceRoot, sourcePath)
  if (!target) return false
  // Keep complete snapshots above the display limit, with a finite archive budget.
  if (target.info.size > 256 * 1024 * 1024) throw new AnyError('InstanceLogTooLarge')
  const source = await openLogFile(target)
  try {
    await publishSnapshot(root, path, async destination => {
      const buffer = Buffer.alloc(Math.min(target.info.size, 64 * 1024))
      let offset = 0
      while (offset < target.info.size) {
        const { bytesRead } = await source.read(buffer, 0, Math.min(buffer.length, target.info.size - offset), offset)
        if (!bytesRead) throw changed()
        await destination.writeFile(buffer.subarray(0, bytesRead))
        offset += bytesRead
      }
      await verifyLogLocation(target.entries)
    })
    return true
  } finally { await source.close() }
}
