import { checksum } from '@xmcl/core'
import type { InstanceDatapack } from '@xmcl/runtime-api/src/entities/save'
import type { WorldDatapackReview } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { open as openZip, openEntryReadStream, walkEntriesGenerator } from '@xmcl/unzip'
import { Crc32 } from '@aws-crypto/crc32'
import { createHash } from 'node:crypto'
import { lstat, opendir, realpath } from 'node:fs/promises'
import { basename, join, parse } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { importPathParts } from '../../util/importFile'
import { readFolderSnapshot } from './sharedResourcePacks'
import { readBoundedFile, staticPngDataUrl, worldLocation } from './worldFiles'

const inspect = (path: string) => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const invalid = () => Object.assign(new Error('Invalid world datapack'), { name: 'WorldDatapackInvalidError' })
const changed = () => Object.assign(new Error('World files changed since review'), { name: 'WorldFilesChangedError' })
const MAX_DATAPACK_ZIP = 512 * 1024 ** 2, MAX_DATAPACK_EXPANDED = 2 * 1024 ** 3, MAX_MCMETA = 256 * 1024, MAX_ICON = 64 * 1024

export function datapackFileName(name: string, requireZip = false) {
  if (typeof name !== 'string' || !name || name.length > 255 || name.startsWith('.') || importPathParts(name).length !== 1 || importPathParts(name)[0] !== name || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw invalid()
  if (requireZip && !/\.zip$/i.test(name)) throw invalid()
  return name
}

function flattenDescription(value: unknown) {
  let text = '', visited = 0
  function visit(node: unknown, depth = 0) {
    if (depth > 32 || ++visited > 2048 || text.length >= 4096) return
    if (typeof node === 'string' || typeof node === 'number' || typeof node === 'boolean') {
      const cleaned = [...String(node).replace(/§[0-9a-fk-or]/gi, '')].filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127 || char === '\n' || char === '\t').join('')
      text += cleaned.slice(0, 4096 - text.length)
    } else if (Array.isArray(node)) {
      for (const child of node) { visit(child, depth + 1); if (text.length >= 4096) break }
    } else if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>
      visit(typeof record.text === 'string' ? record.text : typeof record.translate === 'string' ? record.translate : '', depth + 1)
      if (Array.isArray(record.extra)) visit(record.extra, depth + 1)
    }
  }
  visit(value)
  return text.trim()
}

export function parsePackMcmeta(data: Buffer) {
  let parsed: unknown
  try { parsed = JSON.parse(data.toString('utf8').replace(/^\uFEFF/, '')) } catch { throw invalid() }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalid()
  const pack = (parsed as Record<string, unknown>).pack
  if (!pack || typeof pack !== 'object' || Array.isArray(pack)) throw invalid()
  const record = pack as Record<string, unknown>, supported = record.supported_formats
  const candidate = Number.isSafeInteger(record.pack_format) ? record.pack_format : Number.isSafeInteger(record.min_format) ? record.min_format : Array.isArray(supported) && Number.isSafeInteger(supported[0]) ? supported[0] : supported && typeof supported === 'object' && Number.isSafeInteger((supported as Record<string, unknown>).min_inclusive) ? (supported as Record<string, unknown>).min_inclusive : undefined
  if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0 || candidate > 10000) throw invalid()
  return { packFormat: candidate, description: flattenDescription(record.description) }
}

async function readZipEntryBuffer(zip: Awaited<ReturnType<typeof openZip>>, entry: any, limit: number) {
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > limit) throw invalid()
  const chunks: Buffer[] = [], crc = new Crc32(); let bytes = 0
  const stream = await openEntryReadStream(zip, entry)
  const collector = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      if (bytes > entry.uncompressedSize || bytes > limit) { callback(invalid()); return }
      crc.update(chunk); chunks.push(chunk); callback()
    },
  })
  await pipeline(stream, collector)
  if (bytes !== entry.uncompressedSize || crc.digest() !== entry.crc32) throw invalid()
  return Buffer.concat(chunks, bytes)
}

async function inspectDatapackZip(filePath: string) {
  const info = await lstat(filePath)
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_DATAPACK_ZIP) throw invalid()
  const root = await realpath(filePath), actual = await lstat(root)
  if (actual.ino !== info.ino || actual.dev !== info.dev || actual.isSymbolicLink()) throw changed()
  const identity = [root, info.ino, info.dev, info.size, info.mtimeMs, info.ctimeMs], hash = await checksum(root, 'sha256')
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw changed()
  const zip = await openZip(root).catch(() => { throw invalid() })
  try {
    if (!Number.isSafeInteger(zip.entryCount) || zip.entryCount > 100000) throw invalid()
    const seen = new Set<string>()
    let metadataBytes = 0, totalBytes = 0, mcmetaEntry: any, iconEntry: any
    for await (const entry of walkEntriesGenerator(zip)) {
      const directory = entry.fileName.endsWith('/'), name = directory ? entry.fileName.slice(0, -1) : entry.fileName, parts = importPathParts(name)
      if (parts.length > 64 || parts.some(part => part.length > 255) || name.length > 4096) throw invalid()
      metadataBytes += entry.fileNameLength + entry.fileCommentLength + entry.extraFieldLength
      if (metadataBytes > 32 * 1024 ** 2) throw invalid()
      const mode = (entry.externalFileAttributes >>> 16) & 0o170000
      if (mode && mode !== 0o100000 && mode !== 0o040000 || mode === 0o040000 && !directory || entry.generalPurposeBitFlag & 1 || ![0, 8].includes(entry.compressionMethod)) throw invalid()
      if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > MAX_DATAPACK_ZIP || directory && entry.uncompressedSize) throw invalid()
      if (seen.has(name.toLowerCase())) throw invalid()
      seen.add(name.toLowerCase()); totalBytes += entry.uncompressedSize
      if (totalBytes > MAX_DATAPACK_EXPANDED) throw invalid()
      if (!directory && name === 'pack.mcmeta') mcmetaEntry = entry
      if (!directory && name === 'pack.png') iconEntry = entry
    }
    if (!mcmetaEntry) throw invalid()
    const meta = parsePackMcmeta(await readZipEntryBuffer(zip, mcmetaEntry, MAX_MCMETA))
    const icon = iconEntry && iconEntry.uncompressedSize <= MAX_ICON ? await readZipEntryBuffer(zip, iconEntry, MAX_ICON).then(staticPngDataUrl).catch(() => '') : ''
    const after = await lstat(filePath)
    if (after.isSymbolicLink() || after.ino !== info.ino || after.dev !== info.dev || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || await checksum(root, 'sha256') !== hash) throw changed()
    return { kind: 'zip' as const, root, identity, hash, size: info.size, files: 1, mtime: info.mtimeMs, ...meta, icon }
  } finally { zip.close() }
}

async function inspectDatapackFolder(dirPath: string) {
  const info = await lstat(dirPath)
  if (!info.isDirectory() || info.isSymbolicLink()) throw invalid()
  const root = await realpath(dirPath), actual = await lstat(root)
  if (actual.ino !== info.ino || actual.dev !== info.dev || actual.isSymbolicLink() || parse(root).root === root) throw invalid()
  const snapshot = await readFolderSnapshot(root)
  if (!snapshot.identity) throw changed()
  if (!snapshot.entries.some(entry => entry.path === 'pack.mcmeta' && !entry.directory)) throw invalid()
  const meta = parsePackMcmeta(await readBoundedFile(join(root, 'pack.mcmeta'), MAX_MCMETA).catch(error => { if (error?.name === 'WorldChangedError') throw changed(); throw invalid() }))
  const icon = await readBoundedFile(join(root, 'pack.png'), MAX_ICON).then(staticPngDataUrl).catch(() => '')
  if (digest(await readFolderSnapshot(root)) !== digest(snapshot)) throw changed()
  const files = snapshot.entries.filter(entry => !entry.directory).length, size = snapshot.entries.reduce((sum, entry) => sum + entry.size, 0)
  if (!Number.isSafeInteger(size) || size > MAX_DATAPACK_EXPANDED) throw invalid()
  return { kind: 'folder' as const, root, identity: [root, info.ino, info.dev, snapshot.identity], hash: digest(snapshot), snapshot, size, files, mtime: info.mtimeMs, ...meta, icon }
}

export async function inspectDatapackSource(sourcePath: string, requestedName?: string) {
  const info = await lstat(sourcePath).catch(() => { throw invalid() })
  if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory()) throw invalid()
  const fileName = datapackFileName(requestedName || basename(sourcePath), info.isFile())
  if (info.isDirectory() && /\.zip$/i.test(fileName)) throw invalid()
  const inspected = info.isFile() ? await inspectDatapackZip(sourcePath) : await inspectDatapackFolder(sourcePath)
  return { ...inspected, fileName, name: fileName.replace(/\.zip$/i, '') }
}

export type InspectedDatapackSource = Awaited<ReturnType<typeof inspectDatapackSource>>

export async function assertDatapackSourceUnchanged(source: InspectedDatapackSource) {
  const current = await inspectDatapackSource(source.root, source.fileName).catch(error => { if (error?.name === 'WorldDatapackInvalidError') throw changed(); throw error })
  if (digest(current.identity) !== digest(source.identity) || current.hash !== source.hash) throw changed()
}

async function readSidecar<T>(filePath: string, valid: (value: any) => value is T): Promise<{ value?: T; hash?: string }> {
  const info = await inspect(filePath)
  if (!info) return {}
  if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_ICON) return {}
  try {
    const data = await readBoundedFile(filePath, MAX_ICON), hash = createHash('sha256').update(data).digest('hex'), parsed = JSON.parse(data.toString('utf8'))
    return valid(parsed) ? { value: parsed, hash } : { hash }
  } catch { return {} }
}

export async function inspectInstalledDatapack(datapacksRoot: string, rawName: string) {
  const fileName = datapackFileName(rawName), target = join(datapacksRoot, fileName), info = await lstat(target)
  const name = fileName.replace(/\.zip$/i, '')
  if (info.isSymbolicLink()) {
    return { fileName, linkOnly: true, files: 1, bytes: 0, identity: ['link', info.ino, info.dev, info.mtimeMs, info.ctimeMs], sidecars: [] as string[], datapack: { name, fileName, directory: false, description: '' } satisfies WorldDatapackReview }
  }
  const sidecars: string[] = [], sidecarHashes: Array<[string, string]> = []
  for (const suffix of ['modrinth', 'curseforge'] as const) {
    const sidecarName = `.${fileName}.${suffix}`, sidecarInfo = await inspect(join(datapacksRoot, sidecarName))
    if (sidecarInfo) {
      if (!sidecarInfo.isFile() || sidecarInfo.isSymbolicLink()) throw new Error('Unsafe datapack sidecar')
      const data = await readBoundedFile(join(datapacksRoot, sidecarName), MAX_ICON).catch(() => { throw changed() })
      sidecars.push(sidecarName); sidecarHashes.push([sidecarName, createHash('sha256').update(data).digest('hex')])
    }
  }
  if (info.isFile()) {
    const hash = await checksum(target, 'sha256'), meta = /\.zip$/i.test(fileName) ? await inspectDatapackZip(target).catch(error => { if (error?.name === 'WorldFilesChangedError') throw error; return undefined }) : undefined
    const after = await lstat(target)
    if (after.isSymbolicLink() || after.ino !== info.ino || after.dev !== info.dev || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw changed()
    const datapack: WorldDatapackReview = { name, fileName, directory: false, ...(meta ? { packFormat: meta.packFormat, description: meta.description } : { description: '' }) }
    return { fileName, linkOnly: false, files: 1, bytes: info.size, identity: ['file', info.ino, info.dev, info.size, info.mtimeMs, info.ctimeMs, hash, sidecarHashes], sidecars, datapack }
  }
  if (info.isDirectory()) {
    const snapshot = await readFolderSnapshot(target)
    if (!snapshot.identity) throw changed()
    const meta = await inspectDatapackFolder(target).catch(error => { if (error?.name === 'WorldFilesChangedError') throw error; return undefined })
    if (digest(await readFolderSnapshot(target)) !== digest(snapshot)) throw changed()
    const files = snapshot.entries.filter(entry => !entry.directory).length || 1, bytes = snapshot.entries.reduce((sum, entry) => sum + entry.size, 0)
    const datapack: WorldDatapackReview = { name, fileName, directory: true, ...(meta ? { packFormat: meta.packFormat, description: meta.description } : { description: '' }) }
    return { fileName, linkOnly: false, files, bytes, identity: ['folder', info.ino, info.dev, snapshot, sidecarHashes], sidecars, datapack }
  }
  throw new Error('Unsafe datapack entry')
}

export async function readWorldDatapacks(instance: string, saveName: string, sharedRoot: string): Promise<InstanceDatapack[]> {
  const world = await worldLocation(instance, saveName, sharedRoot)
  const levelInfo = await inspect(join(world.root, 'level.dat'))
  if (!levelInfo || !levelInfo.isFile() || levelInfo.isSymbolicLink()) throw new Error('Invalid world directory')
  const datapacksRoot = join(world.root, 'datapacks'), dirInfo = await inspect(datapacksRoot)
  if (!dirInfo) {
    if ((await worldLocation(instance, saveName, sharedRoot)).identity !== world.identity) throw changed()
    return []
  }
  if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) throw new Error('Unsafe datapacks directory')
  const folder = await opendir(datapacksRoot), result: InstanceDatapack[] = [], savePath = join(instance, 'saves', saveName)
  let count = 0
  for await (const entry of folder) {
    if (++count > 1000) throw new Error('Too many datapacks to preview')
    if (entry.name.startsWith('.')) continue
    const fileName = entry.name, path = join(savePath, 'datapacks', fileName), fullPath = join(datapacksRoot, fileName), name = fileName.replace(/\.zip$/i, '')
    const info = await inspect(fullPath)
    if (!info) continue
    if (info.isSymbolicLink() || importPathParts(fileName).length !== 1 || fileName.length > 255) {
      result.push({ path, savePath, fileName, name, icon: '', description: '', packFormat: -1, mtime: info.mtimeMs, directory: false, size: 0, entries: 1, error: 'unsafe' })
      continue
    }
    const mr = await readSidecar(join(datapacksRoot, `.${fileName}.modrinth`), (v): v is { projectId: string; versionId: string } => Boolean(v && typeof v.projectId === 'string' && typeof v.versionId === 'string'))
    const cf = await readSidecar(join(datapacksRoot, `.${fileName}.curseforge`), (v): v is { projectId: number; fileId: number } => Boolean(v && Number.isSafeInteger(v.projectId) && Number.isSafeInteger(v.fileId)))
    if (info.isDirectory()) {
      try {
        const inspected = await inspectDatapackFolder(fullPath)
        result.push({ path, savePath, fileName, name, icon: inspected.icon, description: inspected.description, packFormat: inspected.packFormat, mtime: inspected.mtime, directory: true, size: inspected.size, entries: inspected.files, modrinth: mr.value, curseforge: cf.value })
      } catch (error) {
        const unsafe = error instanceof Error && error.message === 'Unsafe shared resource pack entry'
        result.push({ path, savePath, fileName, name, icon: '', description: '', packFormat: -1, mtime: info.mtimeMs, directory: true, size: 0, entries: 1, error: unsafe ? 'unsafe' : 'invalid' })
      }
    } else if (info.isFile() && /\.zip$/i.test(fileName)) {
      try {
        const inspected = await inspectDatapackZip(fullPath)
        result.push({ path, savePath, fileName, name, icon: inspected.icon, description: inspected.description, packFormat: inspected.packFormat, mtime: inspected.mtime, directory: false, size: inspected.size, entries: 1, modrinth: mr.value, curseforge: cf.value })
      } catch {
        result.push({ path, savePath, fileName, name, icon: '', description: '', packFormat: -1, mtime: info.mtimeMs, directory: false, size: info.size, entries: 1, error: 'invalid' })
      }
    } else {
      result.push({ path, savePath, fileName, name, icon: '', description: '', packFormat: -1, mtime: info.mtimeMs, directory: false, size: info.isFile() ? info.size : 0, entries: 1, error: 'invalid' })
    }
  }
  const afterDir = await inspect(datapacksRoot)
  if (!afterDir || !afterDir.isDirectory() || afterDir.isSymbolicLink() || afterDir.ino !== dirInfo.ino || afterDir.dev !== dirInfo.dev || (await worldLocation(instance, saveName, sharedRoot)).identity !== world.identity) throw changed()
  return result.sort((a, b) => a.fileName.localeCompare(b.fileName))
}
