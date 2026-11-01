import type { SaveChunkBackup, SaveChunkChange, SaveChunkReview } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, opendir, rename } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import { writeFile as writeAtomically } from 'atomically'
import { assertInstallDirectory } from '../../util/assertDirectory'
import { getRegionDir, MAX_REGION_BYTES, prepareRegionChunks, relocateSaveChunks, validateRegionFile, validateSaveChunkCoordinates } from '../../save/region'
import { readBoundedFile } from '../../util/readBoundedFile'
import { worldName } from './worldFiles'

const hash = (value: Buffer | Uint8Array | string) => createHash('sha256').update(value).digest('hex')
const digest = (value: unknown) => hash(JSON.stringify(value))
const inspect = (path: string) => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
const changed = () => Object.assign(new Error('Chunk regions changed since review'), { name: 'WorldChunksChangedError' })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const hex = /^[0-9a-f]{64}$/
const regionName = /^r\.(-?\d+)\.(-?\d+)\.mca$/
type FileRecord = { name: string; before: string | null; after: string | null }
type Manifest = { version: 1; saveName: string; dimension: string; createdAt: number; type: SaveChunkChange['type']; state: SaveChunkBackup['state']; files: FileRecord[] }

function input(change: SaveChunkChange): SaveChunkChange {
  if (!change || typeof change.savePath !== 'string' || !isAbsolute(change.savePath)) throw new Error('Invalid chunk operation')
  if (change.type === 'restore') {
    if (typeof change.backupId !== 'string' || !uuid.test(change.backupId)) throw new Error('Invalid chunk backup id')
    return { type: 'restore', savePath: change.savePath, backupId: change.backupId }
  }
  if (change.type !== 'delete' && change.type !== 'paste' || typeof change.dimension !== 'string') throw new Error('Invalid chunk operation')
  validateSaveChunkCoordinates(change.chunks, change.type === 'paste' ? change.offsetX : 0, change.type === 'paste' ? change.offsetZ : 0)
  if (change.type === 'delete') return { type: 'delete', savePath: change.savePath, dimension: change.dimension, chunks: change.chunks.map(({ chunkX, chunkZ }) => ({ chunkX, chunkZ })) }
  let bytes = 0
  const chunks = change.chunks.map(chunk => {
    if (![1, 2, 3].includes(chunk.compression) || !(chunk.data instanceof Uint8Array) || !chunk.data.byteLength || chunk.data.byteLength > 255 * 4096 - 5 || (bytes += chunk.data.byteLength) > 64 * 1024 * 1024) throw new Error('Invalid chunk payload')
    return { chunkX: chunk.chunkX, chunkZ: chunk.chunkZ, compression: chunk.compression, data: Uint8Array.from(chunk.data) }
  })
  return { type: 'paste', savePath: change.savePath, dimension: change.dimension, chunks, offsetX: change.offsetX ?? 0, offsetZ: change.offsetZ ?? 0 }
}

async function directoryIdentity(root: string, directory: string) {
  await assertInstallDirectory(root, directory)
  const path = relative(root, directory), entries: unknown[] = []
  if (path.split(sep).length > 32) throw new Error('Dimension path is too deep')
  let current = root
  for (const part of ['', ...path.split(sep).filter(Boolean)]) {
    current = join(current, part)
    const info = await inspect(current)
    entries.push([current, info && [info.ino, info.dev]])
    if (!info) break
  }
  return digest(entries)
}

async function fileState(directory: string, name: string) {
  const path = join(directory, name), info = await inspect(path)
  if (!info) return { name, bytes: undefined, hash: null, identity: null }
  const bytes = await readBoundedFile(path, MAX_REGION_BYTES)
  validateRegionFile(bytes)
  const after = await lstat(path)
  if (info.isSymbolicLink() || info.ino !== after.ino || info.dev !== after.dev || info.size !== after.size || info.mtimeMs !== after.mtimeMs || info.ctimeMs !== after.ctimeMs) throw changed()
  return { name, bytes, hash: hash(bytes), identity: [after.ino, after.dev, after.size, after.mtimeMs, after.ctimeMs] }
}

function validateManifest(value: Manifest): Manifest {
  if (!value || value.version !== 1 || !['delete', 'paste', 'restore'].includes(value.type) || !['prepared', 'complete', 'incomplete'].includes(value.state) || !Number.isSafeInteger(value.createdAt) || value.createdAt < 0 || value.createdAt > 8.64e15 || !Array.isArray(value.files) || !value.files.length || value.files.length > 64) throw new Error('Invalid chunk backup manifest')
  worldName(value.saveName); getRegionDir('/', value.dimension)
  const names = new Set<string>()
  for (const file of value.files) {
    const match = typeof file.name === 'string' && regionName.exec(file.name)
    if (!match || ![match[1], match[2]].every(part => Number.isInteger(Number(part)) && String(Number(part)) === part && Number(part) >= -67108864 && Number(part) <= 67108863) || names.has(file.name) || file.before !== null && !hex.test(file.before) || file.after !== null && !hex.test(file.after) || file.before === null && file.after === null) throw new Error('Invalid chunk backup file')
    names.add(file.name)
  }
  return value
}

async function readManifest(root: string, id: string) {
  if (!uuid.test(id)) throw new Error('Invalid chunk backup id')
  const folder = join(root, '.backups', 'world-chunks-' + id)
  await assertInstallDirectory(root, folder)
  const bytes = await readBoundedFile(join(folder, 'manifest.json'), 64 * 1024)
  const manifest = validateManifest(JSON.parse(bytes.toString('utf8')))
  return { folder, manifest, hash: hash(bytes) }
}

export async function planSaveChunkChanges(root: string, change: SaveChunkChange, authority: { identity: string; shared: boolean }) {
  await assertInstallDirectory(root, join(root, '.backups'))
  const operation = input(change), restored = operation.type === 'restore' ? await readManifest(root, operation.backupId) : undefined
  const dimension = restored ? restored.manifest.dimension : (operation as Exclude<SaveChunkChange, { type: 'restore' }>).dimension
  const directory = getRegionDir(root, dimension), directoryBefore = await directoryIdentity(root, directory)
  const level = hash(await readBoundedFile(join(root, 'level.dat'), 4 * 1024 * 1024))
  const grouped = new Map<string, Array<{ chunkX: number; chunkZ: number; compression?: number; data?: Uint8Array }>>()
  let chunks = 0
  if (operation.type !== 'restore') {
    const edits = operation.type === 'paste' ? relocateSaveChunks(operation.chunks, operation.offsetX ?? 0, operation.offsetZ ?? 0) : operation.chunks
    for (const chunk of edits) {
      const name = `r.${chunk.chunkX >> 5}.${chunk.chunkZ >> 5}.mca`
      if (!grouped.has(name)) grouped.set(name, [])
      grouped.get(name)!.push(chunk)
    }
  } else for (const file of restored!.manifest.files) grouped.set(file.name, [])
  if (grouped.size > 64) throw new Error('Too many regions in one chunk operation')
  let bytes = 0, outputBytes = 0
  const targets: Array<{ source: Awaited<ReturnType<typeof fileState>>; output: Buffer | undefined }> = []
  for (const [name, edits] of [...grouped].sort(([a], [b]) => a.localeCompare(b))) {
    const source = await fileState(directory, name)
    if ((bytes += source.bytes?.length ?? 0) > MAX_REGION_BYTES) throw new Error('Chunk operation regions exceed the size limit')
    let output: Buffer | undefined
    if (restored) {
      const original = restored.manifest.files.find(file => file.name === name)!
      if (source.hash !== original.before && source.hash !== original.after) throw Object.assign(new Error('Regions changed after this backup; restoration would overwrite other changes'), { name: 'WorldChunkRestoreConflictError' })
      if (original.before !== null) {
        const savedDirectory = join(restored.folder, restored.manifest.saveName, dimension.replace(/[^a-zA-Z0-9_-]/g, '_'))
        await assertInstallDirectory(root, savedDirectory)
        output = await readBoundedFile(join(savedDirectory, name), MAX_REGION_BYTES)
        if (hash(output) !== original.before) throw new Error('Chunk backup checksum mismatch')
        validateRegionFile(output)
      }
    } else {
      const affected = operation.type === 'paste' ? edits.length : edits.filter(chunk => source.bytes && source.bytes.readUInt32BE(((chunk.chunkX & 31) + (chunk.chunkZ & 31) * 32) * 4) !== 0).length
      chunks += affected
      if (!affected && operation.type === 'delete') continue
      output = prepareRegionChunks(source.bytes, operation.type === 'delete' ? edits : [], operation.type === 'paste' ? edits as Parameters<typeof relocateSaveChunks>[0] : [])
      if (!output.subarray(0, 4096).some(byte => byte !== 0)) output = undefined
    }
    if ((outputBytes += output?.length ?? 0) > MAX_REGION_BYTES) throw new Error('Prepared chunk operation exceeds the size limit')
    if ((output ? hash(output) : null) !== source.hash) targets.push({ source, output })
  }
  if (await directoryIdentity(root, directory) !== directoryBefore) throw changed()
  const operationIdentity = operation.type === 'paste' ? { ...operation, chunks: operation.chunks.map(chunk => ({ ...chunk, data: hash(chunk.data) })) } : operation
  const snapshot = digest([authority.identity, operationIdentity, directoryBefore, level, restored?.hash, targets.map(target => [target.source.name, target.source.identity, target.source.hash])])
  const backup: SaveChunkBackup | undefined = restored && operation.type === 'restore' ? { id: operation.backupId, createdAt: restored.manifest.createdAt, type: restored.manifest.type, dimension, files: restored.manifest.files.length, state: restored.manifest.state } : undefined
  const review: SaveChunkReview = { snapshot, type: operation.type, savePath: operation.savePath, dimension, chunks, files: targets.length, bytes, shared: authority.shared, ...(backup ? { backup } : {}) }
  return { operation, review, root, directory, directoryBefore, targets, level }
}

async function writeExclusive(path: string, bytes: Buffer) {
  const handle = await open(path, 'wx')
  try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
}

export async function applySaveChunkPlan(plan: Awaited<ReturnType<typeof planSaveChunkChanges>>, verify: () => Promise<void>) {
  if (!plan.targets.length) return {}
  const backupId = randomUUID(), backupPath = join(plan.root, '.backups', 'world-chunks-' + backupId)
  const saveName = worldName(basename(plan.root)), files = plan.targets.map(({ source, output }) => ({ name: source.name, before: source.hash, after: output ? hash(output) : null }))
  const manifest: Manifest = { version: 1, createdAt: Date.now(), type: plan.operation.type, state: 'prepared', saveName, dimension: plan.review.dimension, files }
  let applied = 0, recorded = false
  try {
    await verify()
    if (await directoryIdentity(plan.root, plan.directory) !== plan.directoryBefore || hash(await readBoundedFile(join(plan.root, 'level.dat'), 4 * 1024 * 1024)) !== plan.level) throw changed()
    await assertInstallDirectory(plan.root, backupPath)
    await mkdir(backupPath, { recursive: true }); await assertInstallDirectory(plan.root, backupPath)
    const originals = join(backupPath, saveName, plan.review.dimension.replace(/[^a-zA-Z0-9_-]/g, '_')), prepared = join(backupPath, '.prepared'), removed = join(backupPath, '.removed')
    for (const dir of [originals, prepared, removed, plan.directory]) { await assertInstallDirectory(plan.root, dir); await mkdir(dir, { recursive: true }); await assertInstallDirectory(plan.root, dir) }
    const directory = await directoryIdentity(plan.root, plan.directory)
    for (const { source, output } of plan.targets) {
      if (source.bytes) {
        await writeExclusive(join(originals, source.name), source.bytes)
        if (hash(await readBoundedFile(join(originals, source.name), MAX_REGION_BYTES)) !== source.hash) throw new Error('Chunk backup checksum mismatch')
      }
      if (output) await writeExclusive(join(prepared, source.name), output)
    }
    await writeExclusive(join(backupPath, 'manifest.json'), Buffer.from(JSON.stringify(manifest))); recorded = true
    for (const { source } of plan.targets) {
      const current = await fileState(plan.directory, source.name)
      if (digest(current.identity) !== digest(source.identity) || current.hash !== source.hash) throw changed()
    }
    for (const { source, output } of plan.targets) {
      await verify()
      if (await directoryIdentity(plan.root, plan.directory) !== directory || hash(await readBoundedFile(join(plan.root, 'level.dat'), 4 * 1024 * 1024)) !== plan.level) throw changed()
      for (const dir of [originals, prepared, removed]) await assertInstallDirectory(plan.root, dir)
      const current = await fileState(plan.directory, source.name)
      if (digest(current.identity) !== digest(source.identity) || current.hash !== source.hash) throw changed()
      if (source.hash && hash(await readBoundedFile(join(originals, source.name), MAX_REGION_BYTES)) !== source.hash) throw new Error('Chunk backup checksum mismatch')
      if (output && hash(await readBoundedFile(join(prepared, source.name), MAX_REGION_BYTES)) !== hash(output)) throw new Error('Prepared chunk checksum mismatch')
      if (output) await rename(join(prepared, source.name), join(plan.directory, source.name))
      else await rename(join(plan.directory, source.name), join(removed, source.name))
      applied++
    }
    for (const file of files) if ((await fileState(plan.directory, file.name)).hash !== file.after) throw changed()
    manifest.state = 'complete'
    await writeAtomically(join(backupPath, 'manifest.json'), JSON.stringify(manifest), { fsync: true })
    return { backupId, backupPath }
  } catch (error) {
    if (recorded) { manifest.state = 'incomplete'; await writeAtomically(join(backupPath, 'manifest.json'), JSON.stringify(manifest), { fsync: true }).catch(() => {}) }
    throw Object.assign(new Error('Chunk operation stopped; original regions and prepared files are retained in its backup', { cause: error }), { name: applied ? 'WorldChunkOperationIncompleteError' : (error as Error).name, backupId, backupPath, applied, canRestore: recorded })
  }
}

export async function listSaveChunkBackups(root: string) {
  const directory = join(root, '.backups')
  await assertInstallDirectory(root, directory)
  const folder = await opendir(directory).catch(error => { if (error.code !== 'ENOENT') throw error })
  const entries: SaveChunkBackup[] = []; let unreadable = 0, count = 0
  if (folder) for await (const entry of folder) {
    if (++count > 1000) throw new Error('Too many world backups to inspect')
    if (!entry.name.startsWith('world-chunks-')) continue
    const id = entry.name.slice('world-chunks-'.length)
    try {
      const { manifest } = await readManifest(root, id)
      entries.push({ id, createdAt: manifest.createdAt, type: manifest.type, dimension: manifest.dimension, files: manifest.files.length, state: manifest.state })
    } catch { unreadable++ }
  }
  return { entries: entries.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20), unreadable }
}
