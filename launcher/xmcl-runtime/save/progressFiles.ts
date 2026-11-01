import { FileSystem } from '@xmcl/system'
import { open as openZip, walkEntriesGenerator } from '@xmcl/unzip'
import type { Entry } from '@xmcl/yauzl'
import { lstat, opendir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { assertInstallDirectory } from '../util/assertDirectory'
import { importPathParts } from '../util/importFile'
import { readBoundedFile } from '../util/readBoundedFile'
import { readBoundedZipEntry } from '../util/readBoundedZipEntry'

export const progressBudget = () => ({ bytes: 64 * 1024 * 1024, entries: 100000, expires: Date.now() + 15000 })
export type ProgressBudget = ReturnType<typeof progressBudget>
export function chargeProgress(budget: ProgressBudget, bytes = 0, entries = 1) {
  if (Date.now() > budget.expires || bytes > budget.bytes || entries > budget.entries) throw new Error('World progress read limit exceeded')
  budget.bytes -= bytes; budget.entries -= entries
}

export function progressIdentifier(value: unknown): string {
  if (typeof value !== 'string' || !value || value.length > 255 || importPathParts(value).length !== 1) throw new Error('Invalid progress identifier')
  return value
}

export function parseProgressJson(content: string) {
  if (content.length > 4 * 1024 * 1024) throw new Error('World progress JSON exceeds size limit')
  let value: any
  try { value = JSON.parse(content.replace(/^\uFEFF/, '')) } catch { throw new Error('Invalid world progress JSON') }
  const stack = [{ value, depth: 0 }]; let nodes = 0
  while (stack.length) {
    const { value, depth } = stack.pop()!
    if (++nodes > 200000 || depth > 64) throw new Error('World progress JSON exceeds structure limit')
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Invalid progress number')
    if (value && typeof value === 'object') for (const key of Object.keys(value)) {
      if (key === '__proto__' || stack.length > 200000) throw new Error('Unsafe progress JSON')
      stack.push({ value: value[key], depth: depth + 1 })
    }
  }
  return value
}

export async function progressInfo(root: string, path: string, budget: ProgressBudget) {
  chargeProgress(budget)
  await assertInstallDirectory(root, dirname(path))
  const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (info?.isSymbolicLink()) throw new Error('Unsafe progress link')
  return info
}

export async function readProgressFile(root: string, path: string, budget: ProgressBudget, maximum = 4 * 1024 * 1024) {
  chargeProgress(budget)
  await assertInstallDirectory(root, dirname(path))
  const bytes = await readBoundedFile(path, Math.min(maximum, budget.bytes))
  chargeProgress(budget, bytes.length, 0)
  return bytes
}

export async function listProgressFiles(root: string, path: string, budget: ProgressBudget) {
  chargeProgress(budget)
  await assertInstallDirectory(root, path)
  const directory = await opendir(path).catch(error => { if (error.code !== 'ENOENT') throw error })
  const entries: string[] = []
  if (directory) for await (const entry of directory) { chargeProgress(budget); entries.push(entry.name) }
  return entries
}

function archivePath(path: string) {
  if (typeof path !== 'string' || path.length > 2048 || path.includes('\\') || [...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || path.startsWith('/')) throw new Error('Unsafe progress resource path')
  const parts = path.replace(/\/$/, '').split('/')
  if (parts.length > 32 || parts.some(part => !part || part === '.' || part === '..')) throw new Error('Unsafe progress resource path')
  return parts.join('/')
}

class ProgressArchive extends FileSystem {
  readonly type = 'zip' as const; readonly sep = '/'; readonly writeable = false
  constructor(public readonly root: string, private zip: Awaited<ReturnType<typeof openZip>>, private entries: Map<string, Entry>, private directories: Map<string, Set<string>>, private budget: ProgressBudget) { super() }
  join(...parts: string[]) { return parts.filter(Boolean).join('/') }
  async isDirectory(path: string) { chargeProgress(this.budget); return this.directories.has(path ? archivePath(path) : '') }
  async existsFile(path: string) { chargeProgress(this.budget); const name = path ? archivePath(path) : ''; return this.entries.has(name) || this.directories.has(name) }
  async listFiles(path: string) {
    chargeProgress(this.budget); return [...this.directories.get(path ? archivePath(path) : '') || []]
  }
  async readFile(path: string, encoding?: any): Promise<any> {
    chargeProgress(this.budget)
    const entry = this.entries.get(archivePath(path))
    if (!entry) throw Object.assign(new Error('Progress resource not found'), { code: 'ENOENT' })
    chargeProgress(this.budget, entry.uncompressedSize + entry.compressedSize, 0)
    const data = await readBoundedZipEntry(this.zip, entry, path.endsWith('.png') ? 64 * 1024 : 4 * 1024 * 1024)
    return encoding ? data.toString(encoding) : data
  }
  cd() { throw new Error('Progress archive root is fixed') }
  isClosed() { return !this.zip.isOpen }
  close() { this.zip.close() }
}

export async function openProgressArchive(root: string, path: string, budget: ProgressBudget): Promise<FileSystem> {
  const before = await progressInfo(root, path, budget)
  if (!before?.isFile() || before.size > 512 * 1024 * 1024) throw new Error('Unsafe or oversized progress archive')
  const zip = await openZip(path)
  try {
    const after = await progressInfo(root, path, budget)
    if (!after || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('Progress archive changed')
    const entries = new Map<string, Entry>(), directories = new Map<string, Set<string>>([['', new Set()]])
    for await (const entry of walkEntriesGenerator(zip)) {
      // Extra fields can expand into many small JS records while the ZIP is indexed.
      chargeProgress(budget, entry.fileName.length * 2 + 128 + (entry.extraFieldLength + entry.fileCommentLength) * 16)
      const name = archivePath(entry.fileName), directory = entry.fileName.endsWith('/')
      if (entries.has(name) || !directory && directories.has(name) || (entry.externalFileAttributes >>> 16 & 0xf000) === 0xa000 || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || !Number.isSafeInteger(entry.compressedSize) || entry.compressedSize < 0) throw new Error('Unsafe progress archive entry')
      if (directory) { if (!directories.has(name)) directories.set(name, new Set()) }
      else entries.set(name, entry)
      const parts = name.split('/')
      for (let i = 0; i < parts.length; i++) {
        const parent = parts.slice(0, i).join('/')
        if (entries.has(parent)) throw new Error('Ambiguous progress archive path')
        if (!directories.has(parent)) { chargeProgress(budget, parent.length * 2 + 64); directories.set(parent, new Set()) }
        if (!directories.get(parent)!.has(parts[i])) { chargeProgress(budget, parts[i].length * 2 + 32, 0); directories.get(parent)!.add(parts[i]) }
      }
    }
    return new ProgressArchive(path, zip, entries, directories, budget)
  } catch (error) { zip.close(); throw error }
}
