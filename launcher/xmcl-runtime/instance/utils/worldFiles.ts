import { deserialize } from '@xmcl/nbt'
import type { InstanceSavePreview, SaveMetadata } from '@xmcl/runtime-api/src/entities/save'
import type { WorldMetadataInput } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { createHash } from 'node:crypto'
import { lstat, open, opendir, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, relative } from 'node:path'
import { promisify } from 'node:util'
import { deflate, gunzip, gzip, inflate } from 'node:zlib'
import { instanceFileSource } from '../../instanceIO/utils/instanceFileSource'
import { importPathParts } from '../../util/importFile'

const inspect = (path: string) => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
const changed = () => Object.assign(new Error('World changed during read'), { name: 'WorldChangedError' })
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function worldName(name: string) {
  if (typeof name !== 'string' || name.length > 255 || importPathParts(name).length !== 1) throw new Error('Invalid world name')
  return name
}

export async function worldsLocation(instance: string, sharedRoot: string) {
  const source = await instanceFileSource(instance, 'saves', sharedRoot, true), root = join(source.root, source.path), info = await inspect(root)
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw new Error('Unsafe worlds directory')
  return { root, shared: source.root !== await realpath(instance), identity: digest([root, info && [info.ino, info.dev]]) }
}

/** Only the launcher's own depot may be the target of a legacy per-world link. */
export async function worldLocation(instance: string, name: string, sharedRoot: string) {
  worldName(name)
  const directory = await worldsLocation(instance, sharedRoot), logical = join(instance, 'saves', name), entry = join(directory.root, name), link = await lstat(entry)
  let root = entry
  if (link.isSymbolicLink()) {
    if (directory.shared) throw new Error('Nested world link')
    const depot = join(await realpath(sharedRoot), 'saves'), info = await lstat(depot)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe worlds depot')
    root = await realpath(entry)
    const parts = relative(depot, root).split(/[\\/]/)
    if (isAbsolute(relative(depot, root)) || parts.length !== 1 || worldName(parts[0]) !== parts[0]) throw new Error('Untrusted world link')
  }
  const info = await lstat(root)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe world directory')
  return { root, logical, shared: directory.shared || link.isSymbolicLink(), linked: link.isSymbolicLink(),
    identity: digest([directory.identity, entry, link.ino, link.dev, root, info.ino, info.dev]) }
}

export async function readBoundedFile(file: string, limit: number) {
  const before = await lstat(file)
  if (!before.isFile() || before.isSymbolicLink() || before.size > limit) throw new Error('Unsafe world metadata')
  const handle = await open(file, 'r')
  let data: Buffer
  try {
    const info = await handle.stat()
    if (info.ino !== before.ino || info.dev !== before.dev || !info.isFile()) throw changed()
    const buffer = Buffer.alloc(Math.min(limit, before.size) + 1); let size = 0
    while (size < buffer.length) { const read = await handle.read(buffer, size, buffer.length - size, size); if (!read.bytesRead) break; size += read.bytesRead }
    if (size > limit) throw new Error('Oversized world metadata')
    data = buffer.subarray(0, size)
  } finally { await handle.close() }
  const after = await lstat(file)
  if (after.isSymbolicLink() || before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw changed()
  return data
}

export function staticPngDataUrl(data: Buffer) {
  if (data.length < 33 || data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || data.toString('ascii', 12, 16) !== 'IHDR' || !data.readUInt32BE(16) || !data.readUInt32BE(20) || data.readUInt32BE(16) > 512 || data.readUInt32BE(20) > 512) return ''
  for (let offset = 8; offset + 12 <= data.length;) {
    const size = data.readUInt32BE(offset), type = data.toString('ascii', offset + 4, offset + 8)
    if (size > data.length - offset - 12 || type === 'acTL') return ''
    if (type === 'IEND') return 'data:image/png;base64,' + data.toString('base64')
    offset += size + 12
  }
  return ''
}

async function worldIcon(root: string) {
  try {
    return staticPngDataUrl(await readBoundedFile(join(root, 'icon.png'), 64 * 1024))
  } catch { /* A missing or invalid icon uses the renderer's fallback. */ }
  return ''
}

type NbtChild = { start: number; type: number; key: string; valueStart: number; end: number; children?: NbtChild[]; closeOffset?: number }
// The shared decoder allocates from NBT counts; bound structure before giving it untrusted saves.
function validateLevelNbt(data: Buffer) {
  let offset = 0, nodes = 0
  const skip = (size: number) => { if (!Number.isSafeInteger(size) || size < 0 || size > data.length - offset) throw new Error('Invalid NBT length'); offset += size }
  const byte = () => { skip(1); return data[offset - 1] }
  const length = () => { skip(4); const size = data.readInt32BE(offset - 4); if (size < 0 || size > 100000) throw new Error('NBT collection too large'); return size }
  const string = (name = false) => {
    skip(2); const size = data.readUInt16BE(offset - 2), start = offset; skip(size)
    const text = name ? data.toString('utf8', start, offset) : ''
    if (name && text === '__proto__') throw new Error('Unsafe NBT key')
    return text
  }
  function value(type: number, depth: number): { children?: NbtChild[]; closeOffset?: number } {
    if (++nodes > 200000 || depth > 64) throw new Error('NBT structure too large')
    if (type >= 1 && type <= 6) { skip([0, 1, 2, 4, 8, 4, 8][type]); return {} }
    if (type === 8) { string(); return {} }
    if (type === 7 || type === 11 || type === 12) { skip(length() * (type === 7 ? 1 : type === 11 ? 4 : 8)); return {} }
    if (type === 9) {
      const item = byte(), count = length()
      if (item > 12 || !item && count) throw new Error('Invalid NBT list type')
      for (let index = 0; index < count; index++) value(item, depth + 1)
      return {}
    }
    if (type === 10) {
      const children: NbtChild[] = []
      for (let start = offset, child = byte(); child; start = offset, child = byte()) {
        const key = string(true), valueStart = offset, nested = depth <= 2 ? value(child, depth + 1) : (value(child, depth + 1), {})
        if (depth <= 2) children.push({ start, type: child, key, valueStart, end: offset, ...nested })
      }
      return depth <= 2 ? { children, closeOffset: offset - 1 } : {}
    }
    throw new Error('Invalid NBT type')
  }
  if (byte() !== 10) throw new Error('Invalid NBT root')
  string(true)
  const root = value(10, 0)
  if (offset !== data.length) throw new Error('Trailing NBT data')
  return root.children || []
}

async function parseLevel(raw: Buffer): Promise<Omit<SaveMetadata, 'advancements'>> {
  validateLevelNbt(raw)
  const parsed = await deserialize<{ Data?: Record<string, any> }>(raw), level = parsed.Data
  if (!level || typeof level !== 'object' || typeof level.LevelName !== 'string' || !Number.isInteger(level.GameType) || level.GameType < 0 || level.GameType > 3) throw new Error('Invalid world metadata')
  const number = (value: unknown) => { const result = Number(value); return Number.isSafeInteger(result) && result >= 0 ? result : 0 }
  const seed = level.RandomSeed ?? level.WorldGenSettings?.seed
  return { levelName: level.LevelName.slice(0, 256), mode: level.GameType, cheat: level.allowCommands === 1 || level.allowCommands === true,
    gameVersion: typeof level.Version?.Name === 'string' ? level.Version.Name.slice(0, 64) : '', difficulty: Number.isInteger(level.Difficulty) && level.Difficulty >= 0 && level.Difficulty <= 3 ? level.Difficulty : -1,
    lastPlayed: Math.abs(number(level.LastPlayed)) <= 8.64e15 ? number(level.LastPlayed) : 0, time: number(level.Time), seed: typeof seed === 'bigint' || typeof seed === 'number' && Number.isSafeInteger(seed) ? String(seed) : '' }
}

async function readLevel(root: string): Promise<Omit<SaveMetadata, 'advancements'>> {
  const data = await readBoundedFile(join(root, 'level.dat'), 4 * 1024 * 1024)
  const raw = data[0] === 10 ? data : await promisify(data[0] === 31 && data[1] === 139 ? gunzip : inflate)(data, { maxOutputLength: 16 * 1024 * 1024 })
  return parseLevel(raw)
}

const encodeTag = (type: number, key: string, payload: Buffer) => {
  const name = Buffer.from(key, 'utf8'), header = Buffer.alloc(3 + name.length)
  header[0] = type; header.writeUInt16BE(name.length, 1); name.copy(header, 3)
  return Buffer.concat([header, payload])
}
const tagByte = (key: string, value: number) => encodeTag(1, key, Buffer.from([value & 0xff]))
const tagLong = (key: string, value: bigint) => { const buf = Buffer.alloc(8); buf.writeBigInt64BE(value); return encodeTag(4, key, buf) }
const tagString = (key: string, value: string) => { const text = Buffer.from(value, 'utf8'), len = Buffer.alloc(2); len.writeUInt16BE(text.length); return encodeTag(8, key, Buffer.concat([len, text])) }

export function validateWorldMetadata(input: WorldMetadataInput): WorldMetadataInput {
  const fail = () => Object.assign(new Error('Invalid world metadata input'), { name: 'WorldMetadataInvalidError' })
  if (!input || typeof input !== 'object' || typeof input.levelName !== 'string' || typeof input.seed !== 'string' || typeof input.cheat !== 'boolean') throw fail()
  const levelName = input.levelName.trim(), seed = input.seed.trim(), difficulty = input.difficulty
  if (!levelName || levelName.length > 256 || [...levelName].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || !Number.isInteger(difficulty) || difficulty < 0 || difficulty > 3) throw fail()
  if (seed) {
    if (!/^-?\d+$/.test(seed)) throw fail()
    const value = BigInt(seed)
    if (value < -9223372036854775808n || value > 9223372036854775807n || String(value) !== seed) throw fail()
  }
  return { levelName, seed, difficulty: difficulty as 0 | 1 | 2 | 3, cheat: input.cheat }
}

export async function prepareWorldMetadata(root: string, input: WorldMetadataInput) {
  const target = validateWorldMetadata(input)
  const data = await readBoundedFile(join(root, 'level.dat'), 4 * 1024 * 1024), hash = createHash('sha256').update(data).digest('hex')
  const compression = data[0] === 10 ? 'none' : data[0] === 31 && data[1] === 139 ? 'gzip' : 'deflate'
  const raw = compression === 'none' ? data : await promisify(compression === 'gzip' ? gunzip : inflate)(data, { maxOutputLength: 16 * 1024 * 1024 })
  const current = await parseLevel(raw)
  if (current.seed && !target.seed) throw Object.assign(new Error('Invalid world metadata input'), { name: 'WorldMetadataInvalidError' })
  const rootChildren = validateLevelNbt(raw), dataTag = rootChildren.find(child => child.key === 'Data' && child.type === 10)
  if (!dataTag?.children || dataTag.closeOffset === undefined) throw new Error('Invalid world metadata')
  let hasName = false, hasDifficulty = false, hasCheats = false, hasSeed = false
  const parts: Buffer[] = []
  for (const child of dataTag.children) {
    if (child.key === 'LevelName') { if (child.type !== 8) throw new Error('Invalid world metadata'); hasName = true; parts.push(tagString('LevelName', target.levelName)); continue }
    if (child.key === 'Difficulty') { if (child.type !== 1) throw new Error('Invalid world metadata'); hasDifficulty = true; parts.push(tagByte('Difficulty', target.difficulty)); continue }
    if (child.key === 'allowCommands') { if (child.type !== 1) throw new Error('Invalid world metadata'); hasCheats = true; parts.push(tagByte('allowCommands', target.cheat ? 1 : 0)); continue }
    if (child.key === 'RandomSeed') { if (child.type !== 4) throw new Error('Invalid world metadata'); hasSeed = true; parts.push(target.seed ? tagLong('RandomSeed', BigInt(target.seed)) : raw.subarray(child.start, child.end)); continue }
    if (child.key === 'WorldGenSettings' && child.type === 10 && child.children && child.closeOffset !== undefined && target.seed && child.children.some(nested => nested.key === 'seed')) {
      const nestedParts: Buffer[] = []
      for (const nested of child.children) {
        if (nested.key === 'seed') { if (nested.type !== 4) throw new Error('Invalid world metadata'); hasSeed = true; nestedParts.push(tagLong('seed', BigInt(target.seed))) }
        else nestedParts.push(raw.subarray(nested.start, nested.end))
      }
      parts.push(Buffer.concat([raw.subarray(child.start, child.valueStart), ...nestedParts, Buffer.from([0])]))
      continue
    }
    parts.push(raw.subarray(child.start, child.end))
  }
  if (!hasName) parts.push(tagString('LevelName', target.levelName))
  if (!hasDifficulty) parts.push(tagByte('Difficulty', target.difficulty))
  if (!hasCheats) parts.push(tagByte('allowCommands', target.cheat ? 1 : 0))
  if (target.seed && !hasSeed) parts.push(tagLong('RandomSeed', BigInt(target.seed)))
  const patched = Buffer.concat([raw.subarray(0, dataTag.valueStart), ...parts, Buffer.from([0]), raw.subarray(dataTag.end)])
  const updated = await parseLevel(patched)
  const bytes = compression === 'none' ? patched : await promisify(compression === 'gzip' ? gzip : deflate)(patched)
  const before: WorldMetadataInput = { levelName: current.levelName, seed: current.seed, difficulty: (current.difficulty >= 0 && current.difficulty <= 3 ? current.difficulty : 2) as 0 | 1 | 2 | 3, cheat: current.cheat }
  const after: WorldMetadataInput = { levelName: updated.levelName, seed: updated.seed, difficulty: updated.difficulty as 0 | 1 | 2 | 3, cheat: updated.cheat }
  return { hash, size: data.length, bytes, before, after }
}

export async function readWorlds(instance: string, sharedRoot: string): Promise<InstanceSavePreview[]> {
  const directory = await worldsLocation(instance, sharedRoot), result: InstanceSavePreview[] = []
  const folder = await opendir(directory.root).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!folder) return result
  let entries = 0
  for await (const entry of folder) {
    if (++entries > 1000) throw new Error('Too many worlds to preview')
    if (entry.name.startsWith('.') || !entry.isDirectory() && !entry.isSymbolicLink()) continue
    const header: InstanceSavePreview = { name: entry.name, path: join(instance, 'saves', entry.name), instanceName: basename(instance), icon: '' }
    let location: Awaited<ReturnType<typeof worldLocation>>
    try { location = await worldLocation(instance, entry.name, sharedRoot) }
    catch { result.push({ ...header, error: 'unsafe' }); continue }
    try {
      const metadata = await readLevel(location.root)
      const icon = await worldIcon(location.root)
      if ((await worldLocation(instance, entry.name, sharedRoot)).identity !== location.identity) throw changed()
      result.push({ ...header, ...metadata, ...(location.shared ? { linkTo: location.root } : {}), icon })
    } catch { result.push({ ...header, error: 'metadata' }) }
  }
  if ((await worldsLocation(instance, sharedRoot)).identity !== directory.identity) throw changed()
  return result.sort((a, b) => a.name.localeCompare(b.name))
}
