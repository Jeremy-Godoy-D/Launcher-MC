import { checksum } from '@xmcl/core'
import { open, openEntryReadStream, walkEntriesGenerator } from '@xmcl/unzip'
import type { Entry } from '@xmcl/yauzl'
import { Crc32 } from '@aws-crypto/crc32'
import { createWriteStream } from 'node:fs'
import { lstat, mkdir, realpath, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { assertInstallDirectory } from '../../instanceIO/utils/pendingInstall'
import { importPathParts } from '../../util/importFile'
import { linkOrCopyFile } from '../../util/fs'

type ArchiveFile = { path: string; directory: boolean; size: number; entry?: Entry }
const fail = (name = 'WorldArchiveInvalidError') => Object.assign(new Error(name), { name })
const changed = () => fail('WorldFilesChangedError')
const MAX_ARCHIVE = 32 * 1024 ** 3, MAX_EXPANDED = 64 * 1024 ** 3, MAX_FILE = 1024 ** 3
async function archiveIdentity(path: string) {
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink()) throw fail()
  if (info.size > MAX_ARCHIVE) throw fail('WorldImportLimitError')
  return [await realpath(path), info.ino, info.dev, info.size, info.mtimeMs, info.ctimeMs]
}
export async function inspectWorldArchive(path: string) {
  const identity = await archiveIdentity(path), hash = await checksum(path, 'sha256'), zip = await open(path), files: ArchiveFile[] = []
  let metadata = 0, bytes = 0
  try {
    if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw changed()
    if (!Number.isSafeInteger(zip.entryCount) || zip.entryCount > 100000) throw fail('WorldImportLimitError')
    const all: ArchiveFile[] = [], seen = new Set<string>()
    for await (const entry of walkEntriesGenerator(zip)) {
      const directory = entry.fileName.endsWith('/'), name = directory ? entry.fileName.slice(0, -1) : entry.fileName, parts = importPathParts(name)
      if (parts.length > 64 || parts.some(part => part.length > 255) || name.length > 4096 || all.length >= 100000) throw fail('WorldImportLimitError')
      metadata += entry.fileNameLength + entry.fileCommentLength + entry.extraFieldLength
      if (metadata > 32 * 1024 ** 2) throw fail('WorldImportLimitError')
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000
      if (mode && mode !== 0o100000 && mode !== 0o040000 || mode === 0o040000 && !directory || entry.generalPurposeBitFlag & 1 || ![0, 8].includes(entry.compressionMethod)) throw fail()
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > MAX_FILE || directory && entry.uncompressedSize) throw fail('WorldImportLimitError')
      if (seen.has(name.toLowerCase())) throw fail()
      seen.add(name.toLowerCase()); bytes += entry.uncompressedSize
      if (bytes > MAX_EXPANDED) throw fail('WorldImportLimitError')
      all.push({ path: name, directory, size: entry.uncompressedSize, entry })
    }
    const candidates = all.filter(file => !file.directory && (file.path === 'level.dat' || file.path.endsWith('/level.dat'))).map(file => file.path.slice(0, -'level.dat'.length))
    candidates.sort((a, b) => a.split('/').length - b.split('/').length)
    const prefix = candidates[0]
    if (prefix === undefined || candidates.some(root => !root.startsWith(prefix))) throw fail()
    const selected = new Map<string, ArchiveFile>()
    function add(file: ArchiveFile) {
      const key = file.path.toLowerCase(), old = selected.get(key)
      if (old) { if (old.path !== file.path || !old.directory || !file.directory) throw fail(); return }
      if (selected.size >= 100000) throw fail('WorldImportLimitError')
      selected.set(key, file)
    }
    for (const file of all) {
      if (!file.path.startsWith(prefix) || file.path === prefix.slice(0, -1)) continue
      const name = file.path.slice(prefix.length), parts = importPathParts(name)
      for (let index = 1; index < parts.length; index++) add({ path: parts.slice(0, index).join('/'), directory: true, size: 0 })
      add({ ...file, path: name })
    }
    files.push(...selected.values())
    if (JSON.stringify(await archiveIdentity(path)) !== JSON.stringify(identity) || await checksum(path, 'sha256') !== hash) throw changed()
    return { path, identity, hash, files }
  } finally { zip.close() }
}
export type WorldArchive = Awaited<ReturnType<typeof inspectWorldArchive>>
export async function assertWorldArchiveUnchanged(archive: WorldArchive) {
  if (JSON.stringify(await archiveIdentity(archive.path)) !== JSON.stringify(archive.identity) || await checksum(archive.path, 'sha256') !== archive.hash) throw changed()
}
export async function extractWorldArchive(archive: WorldArchive, target: string, verifyTarget: () => Promise<void>) {
  const zip = await open(archive.path)
  try {
    const ordered = [...archive.files].sort((a, b) => Number(b.directory) - Number(a.directory) || (a.directory ? a.path.split('/').length - b.path.split('/').length : Number(a.path === 'level.dat') - Number(b.path === 'level.dat')))
    for (const file of ordered) {
      await verifyTarget()
      const destination = join(target, ...importPathParts(file.path))
      await assertInstallDirectory(target, dirname(destination))
      if (file.directory) { await mkdir(destination); continue }
      const temporary = join(dirname(destination), `.world-import-${randomUUID()}`), crc = new Crc32(); let bytes = 0
      try {
        const stream = await openEntryReadStream(zip, file.entry!)
        const bounded = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; if (bytes > file.size || bytes > MAX_FILE) { callback(fail('WorldImportLimitError')); return }; crc.update(chunk); callback(null, chunk) } })
        await pipeline(stream, bounded, createWriteStream(temporary, { flags: 'wx' }))
        if (bytes !== file.size || crc.digest() !== file.entry!.crc32) throw fail('WorldArchiveChecksumError')
        await verifyTarget(); await assertInstallDirectory(target, dirname(destination))
        await linkOrCopyFile(temporary, destination, true)
      } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
    }
    await assertWorldArchiveUnchanged(archive)
  } finally { zip.close() }
}
