import { assertInstallDirectory } from '../util/assertDirectory'
import { lstat, opendir } from 'node:fs/promises'
import { ensureDir, pathExistsSync, unlink } from 'fs-extra'
import { join } from 'path'
import { deflateSync, gunzipSync, gzipSync, inflateSync } from 'zlib'
import { getBlockColor, TRANSPARENT_BLOCKS } from './blockColors'
import { validateNbt } from './nbtValidation'
import { readBoundedFile } from '../util/readBoundedFile'
import { writeFile as writeAtomically } from 'atomically'

export interface SaveRegionInfo {
  regionX: number
  regionZ: number
}

export interface RenderedRegion {
  regionX: number
  regionZ: number
  /**
   * RGBA pixel buffer of the 512x512 region image (top-down surface colors).
   */
  data: Uint8Array
  /**
   * Length 1024. Whether a chunk exists at local index `(x & 31) + (z & 31) * 32`.
   */
  chunks: boolean[]
}

const REGION_FILE = /^r\.(-?\d+)\.(-?\d+)\.mca$/
export const MAX_REGION_BYTES = 256 * 1024 * 1024

async function readRegionFile(path: string) {
  const bytes = await readBoundedFile(path, MAX_REGION_BYTES).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
  if (bytes) validateRegionFile(bytes)
  return bytes
}

const DIMENSION_DIRS: Record<string, string> = {
  'minecraft:overworld': '.',
  'minecraft:the_nether': 'DIM-1',
  'minecraft:the_end': 'DIM1',
}

function getDimensionDir(savePath: string, dimension: string): string {
  if (typeof dimension !== 'string' || dimension.trim() !== dimension || dimension.length > 1024 || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(dimension)) throw new Error('Invalid dimension id')
  const [namespace, path] = dimension.split(':')
  if ([namespace, ...path.split('/')].some(part => !part || part === '.' || part === '..')) throw new Error('Invalid dimension id')
  const dimensionPath = namespace && path
    ? join(savePath, 'dimensions', namespace, ...path.split('/'))
    : undefined
  if (dimensionPath && pathExistsSync(join(dimensionPath, 'region'))) {
    return dimensionPath
  }

  const known = DIMENSION_DIRS[dimension]
  if (known) {
    return known === '.' ? savePath : join(savePath, known)
  }
  // Custom dimension: namespace:path -> dimensions/namespace/path
  return dimensionPath ?? savePath
}

export function getRegionDir(savePath: string, dimension: string): string {
  return join(getDimensionDir(savePath, dimension), 'region')
}

/**
 * List the dimensions that contain region data for a save.
 */
export async function listSaveDimensions(savePath: string): Promise<string[]> {
  const result = new Set<string>()
  for (const dimension of Object.keys(DIMENSION_DIRS)) {
    const directory = getRegionDir(savePath, dimension)
    await assertInstallDirectory(savePath, directory)
    if (await lstat(directory).catch(error => { if (error.code !== 'ENOENT') throw error })) result.add(dimension)
  }
  const root = join(savePath, 'dimensions'); await assertInstallDirectory(savePath, root)
  let count = 0
  const walk = async (directory: string, parts: string[]) => {
    if (parts.length > 16) throw new Error('Dimension path is too deep')
    await assertInstallDirectory(savePath, directory)
    const folder = await opendir(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
    if (!folder) return
    for await (const entry of folder) {
      if (++count > 100000) throw new Error('Too many dimension entries')
      if (entry.isSymbolicLink()) throw new Error('Unsafe dimension link')
      if (!entry.isDirectory() || !/^[a-z0-9_.-]+$/.test(entry.name) || entry.name === '.' || entry.name === '..') continue
      if (entry.name === 'region' && parts.length >= 2) result.add(`${parts[0]}:${parts.slice(1).join('/')}`)
      await walk(join(directory, entry.name), [...parts, entry.name])
    }
  }
  await walk(root, [])
  return [...result]
}

/** List canonical region filenames without following any directory or file links. */
export async function getSaveRegions(savePath: string, dimension: string): Promise<SaveRegionInfo[]> {
  const directory = getRegionDir(savePath, dimension); await assertInstallDirectory(savePath, directory)
  const folder = await opendir(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return undefined })
  const result: SaveRegionInfo[] = []; let count = 0
  if (folder) for await (const entry of folder) {
    if (++count > 10000) throw new Error('Too many region entries')
    const match = REGION_FILE.exec(entry.name)
    if (!match) continue
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('Unsafe region entry')
    if (![match[1], match[2]].every(value => String(Number(value)) === value && Number.isInteger(Number(value)) && Number(value) >= -67108864 && Number(value) <= 67108863)) continue
    result.push({ regionX: Number(match[1]), regionZ: Number(match[2]) })
  }
  return result
}

/**
 * Read a packed value from a Minecraft long array (read lazily from the raw
 * decompressed chunk buffer) using the post-1.16 non value-spanning scheme.
 *
 * Uses two 32-bit reads and integer bit math instead of BigInt — values are at
 * most 12 bits and never span a long, so this stays well within 32-bit range
 * and avoids the heavy BigInt allocations in the hot per-block path.
 */
function readPacked(raw: Buffer, byteOffset: number, longCount: number, bits: number, index: number): number {
  if (bits <= 0 || longCount === 0) return 0
  const valuesPerLong = Math.floor(64 / bits)
  const longIndex = Math.floor(index / valuesPerLong)
  if (longIndex >= longCount) return 0
  const bitStart = (index % valuesPerLong) * bits
  const byteBase = byteOffset + longIndex * 8
  const hi = raw.readUInt32BE(byteBase) // bits 63..32
  const lo = raw.readUInt32BE(byteBase + 4) // bits 31..0
  const mask = (1 << bits) - 1
  if (bitStart + bits <= 32) {
    return (lo >>> bitStart) & mask
  }
  if (bitStart >= 32) {
    return (hi >>> (bitStart - 32)) & mask
  }
  // The value straddles the 32-bit boundary between the two halves.
  const lowBits = 32 - bitStart
  const lowPart = lo >>> bitStart
  const highPart = (hi & ((1 << (bits - lowBits)) - 1)) << lowBits
  return (highPart | lowPart) & mask
}

interface DecodedSection {
  paletteNames: string[]
  /** Byte offset of the block-state long array in `raw`, or -1 if absent. */
  dataOffset: number
  /** Number of longs in the block-state array. */
  dataLen: number
  bits: number
  /** True when the whole section is a single block id (no per-block data). */
  uniform: boolean
  /** True when a uniform section's single block is transparent (e.g. air). */
  uniformTransparent: boolean
}

interface DecodedChunk {
  /** The decompressed chunk NBT buffer; long arrays are read lazily from it. */
  raw: Buffer
  sections: Map<number, DecodedSection>
  minSectionY: number
  maxSectionY: number
  /** Byte offset of MOTION_BLOCKING long array in `raw`, or -1 if absent. */
  heightmapOffset: number
  heightmapLen: number
  heightmapBits: number
}

// NBT tag ids.
const TAG_END = 0
const TAG_BYTE = 1
const TAG_INT = 3
const TAG_STRING = 8
const TAG_LIST = 9
const TAG_COMPOUND = 10
const TAG_LONG_ARRAY = 12

/**
 * A minimal cursor over a decompressed chunk NBT buffer. Instead of building a
 * full JS object tree (the dominant cost of a generic deserializer), it walks
 * the buffer and only materializes the handful of tags the map renderer needs;
 * everything else (entities, block entities, biomes, extra heightmaps) is
 * skipped by simply advancing the cursor.
 */
class ChunkNbtReader {
  pos = 0
  constructor(public readonly buf: Buffer) {}

  u8(): number { return this.buf[this.pos++] }
  i8(): number { const v = this.buf.readInt8(this.pos); this.pos += 1; return v }
  u16(): number { const v = this.buf.readUInt16BE(this.pos); this.pos += 2; return v }
  i32(): number { const v = this.buf.readInt32BE(this.pos); this.pos += 4; return v }

  str(): string {
    const len = this.u16()
    const s = this.buf.toString('utf8', this.pos, this.pos + len)
    this.pos += len
    return s
  }

  skipStr(): void { const len = this.u16(); this.pos += len }

  /** Advance the cursor past a payload of the given tag type without decoding it. */
  skip(type: number): void {
    switch (type) {
      case 1: this.pos += 1; break // byte
      case 2: this.pos += 2; break // short
      case 3: this.pos += 4; break // int
      case 4: this.pos += 8; break // long
      case 5: this.pos += 4; break // float
      case 6: this.pos += 8; break // double
      case 7: { const n = this.i32(); this.pos += n; break } // byte array
      case 8: { const n = this.u16(); this.pos += n; break } // string
      case 9: { // list
        const et = this.u8()
        const n = this.i32()
        for (let i = 0; i < n; i++) this.skip(et)
        break
      }
      case 10: this.skipCompound(); break // compound
      case 11: { const n = this.i32(); this.pos += n * 4; break } // int array
      case 12: { const n = this.i32(); this.pos += n * 8; break } // long array
      default: break
    }
  }

  skipCompound(): void {
    for (;;) {
      const t = this.u8()
      if (t === TAG_END) break
      this.skipStr()
      this.skip(t)
    }
  }

  /** Read a long-array header and skip its body; returns its offset and length. */
  readLongArrayRef(): { offset: number; len: number } {
    const len = this.i32()
    const offset = this.pos
    this.pos += len * 8
    return { offset, len }
  }
}

function parsePaletteEntry(r: ChunkNbtReader): string {
  let name = 'air'
  for (;;) {
    const t = r.u8()
    if (t === TAG_END) break
    const key = r.str()
    if (t === TAG_STRING && key === 'Name') {
      name = r.str()
    } else {
      r.skip(t)
    }
  }
  return name
}

function parsePalette(r: ChunkNbtReader): string[] {
  const et = r.u8()
  const n = r.i32()
  const names: string[] = []
  for (let i = 0; i < n; i++) {
    if (et === TAG_COMPOUND) {
      names.push(parsePaletteEntry(r))
    } else {
      r.skip(et)
    }
  }
  return names
}

function parseSection(r: ChunkNbtReader, out: DecodedChunk): void {
  let y = NaN
  let paletteNames: string[] | undefined
  let dataOffset = -1
  let dataLen = 0
  for (;;) {
    const t = r.u8()
    if (t === TAG_END) break
    const key = r.str()
    if (t === TAG_BYTE && key === 'Y') {
      y = r.i8()
    } else if (t === TAG_COMPOUND && key === 'block_states') {
      // Modern (1.18+) format.
      for (;;) {
        const tt = r.u8()
        if (tt === TAG_END) break
        const k2 = r.str()
        if (tt === TAG_LIST && k2 === 'palette') {
          paletteNames = parsePalette(r)
        } else if (tt === TAG_LONG_ARRAY && k2 === 'data') {
          const ref = r.readLongArrayRef()
          dataOffset = ref.offset
          dataLen = ref.len
        } else {
          r.skip(tt)
        }
      }
    } else if (t === TAG_LIST && key === 'Palette') {
      // 1.13-1.17 format.
      paletteNames = parsePalette(r)
    } else if (t === TAG_LONG_ARRAY && key === 'BlockStates') {
      const ref = r.readLongArrayRef()
      dataOffset = ref.offset
      dataLen = ref.len
    } else {
      r.skip(t)
    }
  }

  if (!paletteNames || paletteNames.length === 0 || Number.isNaN(y)) return
  if (y < out.minSectionY) out.minSectionY = y
  if (y > out.maxSectionY) out.maxSectionY = y
  const bits = Math.max(4, Math.ceil(Math.log2(paletteNames.length)))
  const uniform = dataOffset < 0 || paletteNames.length === 1
  const uniformTransparent = uniform && isTransparent(paletteNames[0] ?? 'air')
  out.sections.set(y, { paletteNames, dataOffset, dataLen, bits, uniform, uniformTransparent })
}

function parseSectionsList(r: ChunkNbtReader, out: DecodedChunk): void {
  const et = r.u8()
  const n = r.i32()
  for (let i = 0; i < n; i++) {
    if (et === TAG_COMPOUND) {
      parseSection(r, out)
    } else {
      r.skip(et)
    }
  }
}

function parseHeightmaps(r: ChunkNbtReader, out: DecodedChunk): void {
  for (;;) {
    const t = r.u8()
    if (t === TAG_END) break
    const key = r.str()
    if (t === TAG_LONG_ARRAY && key === 'MOTION_BLOCKING') {
      const ref = r.readLongArrayRef()
      out.heightmapOffset = ref.offset
      out.heightmapLen = ref.len
    } else {
      r.skip(t)
    }
  }
}

/** Walk a chunk-root compound body, extracting sections and the heightmap. */
function parseChunkBody(r: ChunkNbtReader, out: DecodedChunk): void {
  for (;;) {
    const t = r.u8()
    if (t === TAG_END) break
    const key = r.str()
    if (t === TAG_COMPOUND && key === 'Level') {
      // Pre-1.18 worlds nest chunk data under a `Level` compound.
      parseChunkBody(r, out)
    } else if (t === TAG_LIST && (key === 'sections' || key === 'Sections')) {
      parseSectionsList(r, out)
    } else if (t === TAG_COMPOUND && key === 'Heightmaps') {
      parseHeightmaps(r, out)
    } else {
      r.skip(t)
    }
  }
}

/**
 * Parse a decompressed chunk NBT buffer into the minimal structure the map
 * renderer needs, skipping all unused tags.
 */
function decodeChunk(raw: Buffer): DecodedChunk | undefined {
  const r = new ChunkNbtReader(raw)
  const rootType = r.u8()
  if (rootType !== TAG_COMPOUND) return undefined
  r.skipStr() // root compound name

  const out: DecodedChunk = {
    raw,
    sections: new Map(),
    minSectionY: Number.POSITIVE_INFINITY,
    maxSectionY: Number.NEGATIVE_INFINITY,
    heightmapOffset: -1,
    heightmapLen: 0,
    heightmapBits: 0,
  }
  parseChunkBody(r, out)

  if (out.sections.size === 0) return undefined
  if (out.heightmapLen > 0) {
    const valuesPerLong = Math.ceil(256 / out.heightmapLen)
    out.heightmapBits = Math.floor(64 / valuesPerLong)
  }
  return out
}

function isTransparent(name: string): boolean {
  const id = name.startsWith('minecraft:') ? name.slice('minecraft:'.length) : name
  return TRANSPARENT_BLOCKS.has(id)
}

/**
 * Resolve the surface block color and height for a single column of a chunk.
 *
 * Empty and uniformly-transparent (e.g. all-air) sections are skipped in O(1)
 * by jumping straight to the section below, so columns without a usable
 * heightmap no longer pay for scanning every air block from the world ceiling.
 * @returns `[r, g, b, worldY]` or `undefined` if the column is empty.
 */
function getColumnSurface(chunk: DecodedChunk, x: number, z: number, maxHeight: number): [number, number, number, number] | undefined {
  const minY = chunk.minSectionY * 16
  const maxY = chunk.maxSectionY * 16 + 15

  let worldY = maxY
  if (chunk.heightmapOffset >= 0 && chunk.heightmapBits > 0) {
    const hm = readPacked(chunk.raw, chunk.heightmapOffset, chunk.heightmapLen, chunk.heightmapBits, z * 16 + x)
    if (hm > 0) {
      worldY = Math.min(maxY, minY + hm - 1)
    }
  }
  // Cap the scan at the requested height to peel away layers above it.
  if (worldY > maxHeight) worldY = maxHeight

  while (worldY >= minY) {
    const sectionY = Math.floor(worldY / 16)
    const section = chunk.sections.get(sectionY)
    if (!section) {
      // No data for this whole 16-block slice: jump below it.
      worldY = sectionY * 16 - 1
      continue
    }
    if (section.uniform) {
      if (!section.uniformTransparent) {
        const [r, g, b] = getBlockColor(section.paletteNames[0] ?? 'air')
        return [r, g, b, worldY]
      }
      // Whole section is a transparent block (e.g. air): skip it entirely.
      worldY = sectionY * 16 - 1
      continue
    }
    const localY = worldY - sectionY * 16
    const index = localY * 256 + z * 16 + x
    const paletteIndex = readPacked(chunk.raw, section.dataOffset, section.dataLen, section.bits, index)
    const name = section.paletteNames[paletteIndex] ?? 'air'
    if (name && !isTransparent(name)) {
      const [r, g, b] = getBlockColor(name)
      return [r, g, b, worldY]
    }
    worldY--
  }
  return undefined
}

/**
 * Render a region file into a 512x512 RGBA top-down surface map.
 * @param maxHeight The highest world Y to consider; blocks above are peeled
 * away. Defaults to no cap (the visible surface).
 */
export async function renderSaveRegion(
  savePath: string,
  dimension: string,
  regionX: number,
  regionZ: number,
  maxHeight = Number.POSITIVE_INFINITY,
): Promise<RenderedRegion> {
  if (![regionX, regionZ].every(value => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) || maxHeight !== Infinity && !Number.isFinite(maxHeight)) throw new Error('Invalid region coordinates or height')
  const file = join(getRegionDir(savePath, dimension), `r.${regionX}.${regionZ}.mca`)
  const data = new Uint8Array(512 * 512 * 4)
  const chunks: boolean[] = new Array(1024).fill(false)
  const heights = new Int32Array(512 * 512).fill(-2147483648)

  const buffer = await readRegionFile(file)
  if (!buffer || buffer.length < 8192) {
    return { regionX, regionZ, data, chunks }
  }

  let expanded = 0
  for (let localZ = 0; localZ < 32; localZ++) {
    for (let localX = 0; localX < 32; localX++) {
      const headerOffset = 4 * (localX + localZ * 32)
      const sectorOffset = (buffer[headerOffset] << 16) | (buffer[headerOffset + 1] << 8) | buffer[headerOffset + 2]
      if (sectorOffset === 0) continue

      const start = sectorOffset * 4096
      if (start + 5 > buffer.length) continue
      const length = (buffer[start] << 24) | (buffer[start + 1] << 16) | (buffer[start + 2] << 8) | buffer[start + 3]
      const compression = buffer[start + 4]
      if (length <= 0 || start + 5 + length - 1 > buffer.length) continue

      const payload = buffer.subarray(start + 5, start + 4 + length)
      let decoded: DecodedChunk | undefined
      let raw: Buffer | undefined
      try {
        raw = compression === 1 ? gunzipSync(payload, { maxOutputLength: 16 * 1024 * 1024 }) : compression === 2 ? inflateSync(payload, { maxOutputLength: 16 * 1024 * 1024 }) : compression === 3 ? Buffer.from(payload) : undefined
      } catch {
        if ((expanded += 16 * 1024 * 1024) > MAX_REGION_BYTES) throw new Error('Region has too many invalid compressed chunks')
        continue
      }
      if (!raw) continue
      if ((expanded += raw.length) > MAX_REGION_BYTES) throw new Error('Expanded region too large to render')
      try { validateNbt(raw); decoded = decodeChunk(raw) } catch { continue }

      chunks[localX + localZ * 32] = true
      if (!decoded) continue

      const baseX = localX * 16
      const baseZ = localZ * 16
      for (let cz = 0; cz < 16; cz++) {
        for (let cx = 0; cx < 16; cx++) {
          const surface = getColumnSurface(decoded, cx, cz, maxHeight)
          if (!surface) continue
          const px = baseX + cx
          const pz = baseZ + cz
          const pixel = pz * 512 + px
          const offset = pixel * 4
          data[offset] = surface[0]
          data[offset + 1] = surface[1]
          data[offset + 2] = surface[2]
          data[offset + 3] = 255
          heights[pixel] = surface[3]
        }
      }
    }
  }

  // North-facing relief shading based on height differences.
  for (let pz = 1; pz < 512; pz++) {
    for (let px = 0; px < 512; px++) {
      const pixel = pz * 512 + px
      if (heights[pixel] === -2147483648) continue
      const north = heights[(pz - 1) * 512 + px]
      if (north === -2147483648) continue
      const dy = heights[pixel] - north
      const factor = Math.max(0.65, Math.min(1.35, 1 + dy * 0.05))
      const offset = pixel * 4
      data[offset] = Math.max(0, Math.min(255, Math.round(data[offset] * factor)))
      data[offset + 1] = Math.max(0, Math.min(255, Math.round(data[offset + 1] * factor)))
      data[offset + 2] = Math.max(0, Math.min(255, Math.round(data[offset + 2] * factor)))
    }
  }

  return { regionX, regionZ, data, chunks }
}

/**
 * Delete the given chunks from a dimension by clearing their region-file header
 * entries. Empty region files are removed entirely.
 */
export async function deleteSaveChunks(
  savePath: string,
  dimension: string,
  chunks: Array<{ chunkX: number; chunkZ: number }>,
): Promise<void> {
  validateSaveChunkCoordinates(chunks)
  const dir = getRegionDir(savePath, dimension)

  // Group chunks by their region file.
  const byRegion = new Map<string, Array<{ chunkX: number; chunkZ: number }>>()
  for (const chunk of chunks) {
    const regionX = chunk.chunkX >> 5
    const regionZ = chunk.chunkZ >> 5
    const key = `${regionX}.${regionZ}`
    const list = byRegion.get(key) ?? []
    list.push(chunk)
    byRegion.set(key, list)
  }

  for (const [key, list] of byRegion) {
    const file = join(dir, `r.${key}.mca`)
    const buffer = await readRegionFile(file)
    if (!buffer) continue
    const output = prepareRegionChunks(buffer, list, [])

    // If no chunk remains in the region, delete the file.
    let hasChunk = false
    for (let i = 0; i < 1024; i++) {
      if (output.readUInt32BE(i * 4) !== 0) {
        hasChunk = true
        break
      }
    }

    if (hasChunk) {
      await writeAtomically(file, output, { fsync: true })
    } else {
      await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }
}

/**
 * The raw, still-compressed payload of a single chunk extracted from a region
 * file. This is exactly the bytes a region file stores for a chunk (minus the
 * 4-byte length and 1-byte compression prefix), so it can be written back
 * verbatim into another region file without re-encoding the NBT.
 */
export interface SaveChunkData {
  /** Absolute chunk x coordinate. */
  chunkX: number
  /** Absolute chunk z coordinate. */
  chunkZ: number
  /** Region-file compression type (1 = gzip, 2 = zlib, 3 = uncompressed). */
  compression: number
  /** The compressed chunk payload. */
  data: Uint8Array
}

export function validateSaveChunkCoordinates(chunks: Array<{ chunkX: number; chunkZ: number }>, offsetX = 0, offsetZ = 0) {
  const integer = (value: number) => Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
  if (!Array.isArray(chunks) || chunks.length > 4096 || !integer(offsetX) || !integer(offsetZ)) throw new Error('Invalid chunk coordinates')
  const seen = new Set<string>()
  for (const chunk of chunks) {
    if (!chunk || !integer(chunk.chunkX) || !integer(chunk.chunkZ) || !integer(chunk.chunkX + offsetX) || !integer(chunk.chunkZ + offsetZ)) throw new Error('Invalid chunk coordinates')
    const key = `${chunk.chunkX},${chunk.chunkZ}`
    if (seen.has(key)) throw new Error('Duplicate chunk coordinates')
    seen.add(key)
  }
}

export function validateRegionFile(original: Buffer) {
  if (original.length < 8192 || original.length > MAX_REGION_BYTES) throw new Error('Invalid region file size')
  const occupied = new Uint8Array(Math.ceil(original.length / 4096))
  occupied[0] = 1; occupied[1] = 1
  for (let index = 0; index < 1024; index++) {
    const location = original.readUInt32BE(index * 4), start = location >>> 8, count = location & 255
    if (!location) continue
    if (start < 2 || !count || start + count > occupied.length) throw new Error('Invalid region sector location')
    for (let sector = start; sector < start + count; sector++) {
      if (occupied[sector]) throw new Error('Overlapping region sectors')
      occupied[sector] = 1
    }
    if (start * 4096 + 5 > original.length) throw new Error('Invalid region chunk record')
    const size = original.readUInt32BE(start * 4096)
    if (!size || size > count * 4096 - 4 || start * 4096 + size + 4 > original.length || !original[start * 4096 + 4]) throw new Error('Invalid region chunk record')
  }
}

/** Preserve every unselected sector, including chunk formats this editor does not decode. */
export function prepareRegionChunks(buffer: Buffer | undefined, remove: Array<{ chunkX: number; chunkZ: number }>, paste: SaveChunkData[]) {
  validateSaveChunkCoordinates(remove); validateSaveChunkCoordinates(paste)
  const original = buffer || Buffer.alloc(8192)
  validateRegionFile(original)
  const header = Buffer.from(original.subarray(0, 8192)), added: Buffer[] = [], now = Math.floor(Date.now() / 1000)
  for (const chunk of remove) {
    const index = (chunk.chunkX & 31) + (chunk.chunkZ & 31) * 32
    header.writeUInt32BE(0, index * 4); header.writeUInt32BE(0, 4096 + index * 4)
  }
  let sector = Math.ceil(original.length / 4096)
  const padding = Buffer.alloc(sector * 4096 - original.length)
  for (const chunk of paste) {
    if (![1, 2, 3].includes(chunk.compression) || !(chunk.data instanceof Uint8Array) || !chunk.data.byteLength) throw new Error('Invalid inline chunk payload')
    const count = Math.ceil((chunk.data.byteLength + 5) / 4096)
    if (!count || count > 255 || (sector + count) * 4096 > MAX_REGION_BYTES) throw new Error('Region edit exceeds the inline format or size limit')
    const record = Buffer.alloc(count * 4096), index = (chunk.chunkX & 31) + (chunk.chunkZ & 31) * 32
    record.writeUInt32BE(chunk.data.byteLength + 1, 0); record[4] = chunk.compression
    Buffer.from(chunk.data.buffer, chunk.data.byteOffset, chunk.data.byteLength).copy(record, 5)
    header.writeUInt32BE((sector << 8) | count, index * 4); header.writeUInt32BE(now >>> 0, 4096 + index * 4)
    added.push(record); sector += count
  }
  return Buffer.concat([header, original.subarray(8192), padding, ...added])
}

function groupChunksByRegion<T extends { chunkX: number; chunkZ: number }>(chunks: T[]): Map<string, T[]> {
  const byRegion = new Map<string, T[]>()
  for (const chunk of chunks) {
    const key = `${chunk.chunkX >> 5}.${chunk.chunkZ >> 5}`
    const list = byRegion.get(key) ?? []
    list.push(chunk)
    byRegion.set(key, list)
  }
  return byRegion
}

/**
 * Read the raw compressed payload of the given chunks so they can be copied
 * into another save. Missing chunks are silently skipped.
 */
export async function readSaveChunks(
  savePath: string,
  dimension: string,
  chunks: Array<{ chunkX: number; chunkZ: number }>,
): Promise<SaveChunkData[]> {
  validateSaveChunkCoordinates(chunks)
  const dir = getRegionDir(savePath, dimension)
  const result: SaveChunkData[] = []
  const groups = groupChunksByRegion(chunks)
  if (groups.size > 64) throw new Error('Too many regions in one chunk operation')
  let readBytes = 0, copiedBytes = 0
  for (const [key, list] of groups) {
    const file = join(dir, `r.${key}.mca`)
    const buffer = await readRegionFile(file)
    if (!buffer || buffer.length < 8192) continue
    if ((readBytes += buffer.length) > MAX_REGION_BYTES) throw new Error('Chunk operation regions exceed the size limit')
    for (const { chunkX, chunkZ } of list) {
      const index = (chunkX & 31) + (chunkZ & 31) * 32
      const headerOffset = index * 4
      const sectorOffset = (buffer[headerOffset] << 16) | (buffer[headerOffset + 1] << 8) | buffer[headerOffset + 2]
      if (sectorOffset === 0) continue
      const start = sectorOffset * 4096
      if (start + 5 > buffer.length) continue
      const length = buffer.readUInt32BE(start)
      if (length <= 0 || start + 4 + length > buffer.length) continue
      const compression = buffer[start + 4]
      if ((copiedBytes += length - 1) > 64 * 1024 * 1024) throw new Error('Copied chunk batch too large')
      const data = Uint8Array.from(buffer.subarray(start + 5, start + 4 + length))
      result.push({ chunkX, chunkZ, compression, data })
    }
  }
  return relocateSaveChunks(result, 0, 0)
}

/**
 * Write the given chunks into a dimension, overwriting any chunk that already
 * exists at the same coordinates. Region files are created when needed.
 */
export async function writeSaveChunks(
  savePath: string,
  dimension: string,
  chunks: SaveChunkData[],
): Promise<void> {
  if (chunks.length === 0) return
  relocateSaveChunks(chunks, 0, 0)
  const dir = getRegionDir(savePath, dimension)
  await ensureDir(dir)
  for (const [key, list] of groupChunksByRegion(chunks)) {
    const file = join(dir, `r.${key}.mca`)
    const buffer = await readRegionFile(file)
    await writeAtomically(file, prepareRegionChunks(buffer, [], list), { fsync: true })
  }
}

/**
 * Overwrite the `xPos`/`zPos` integer tags of a chunk root compound (and the
 * legacy `Level.xPos`/`Level.zPos`) in place, so a relocated chunk reports the
 * coordinates of its new home. Without this Minecraft detects a mismatch
 * between the region-file slot and the stored position and regenerates it.
 */
function patchBlockPositions(r: ChunkNbtReader, offsetX: number, offsetZ: number) {
  for (let type = r.u8(); type !== TAG_END; type = r.u8()) {
    const key = r.str()
    if (type === TAG_INT && (key === 'x' || key === 'z')) {
      const value = r.buf.readInt32BE(r.pos) + (key === 'x' ? offsetX : offsetZ) * 16
      if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) throw new Error('Relocated block position is outside NBT integer range')
      r.buf.writeInt32BE(value, r.pos); r.pos += 4
    } else r.skip(type)
  }
}

function patchChunkPositionInCompound(r: ChunkNbtReader, chunkX: number, chunkZ: number, offsetX: number, offsetZ: number): void {
  for (;;) {
    const t = r.u8()
    if (t === TAG_END) break
    const key = r.str()
    if (t === TAG_INT && key === 'xPos') {
      r.buf.writeInt32BE(chunkX | 0, r.pos)
      r.pos += 4
    } else if (t === TAG_INT && key === 'zPos') {
      r.buf.writeInt32BE(chunkZ | 0, r.pos)
      r.pos += 4
    } else if (t === TAG_COMPOUND && key === 'Level') {
      // Pre-1.18 worlds nest xPos/zPos inside a `Level` compound.
      patchChunkPositionInCompound(r, chunkX, chunkZ, offsetX, offsetZ)
    } else if (t === TAG_LIST && ['block_entities', 'TileEntities', 'block_ticks', 'fluid_ticks', 'TileTicks', 'LiquidTicks'].includes(key)) {
      const item = r.u8(), count = r.i32()
      if (item !== TAG_COMPOUND && count) throw new Error('Invalid block entity or tick list')
      for (let index = 0; index < count; index++) patchBlockPositions(r, offsetX, offsetZ)
    } else {
      r.skip(t)
    }
  }
}

function patchChunkPosition(raw: Buffer, chunkX: number, chunkZ: number, offsetX: number, offsetZ: number): void {
  const r = new ChunkNbtReader(raw)
  if (r.u8() !== TAG_COMPOUND) return
  r.skipStr() // root compound name
  patchChunkPositionInCompound(r, chunkX, chunkZ, offsetX, offsetZ)
}

/**
 * Return a copy of `chunks` moved by `(offsetX, offsetZ)` chunks. Each chunk's
 * NBT position is rewritten to match its new coordinates so the game loads it
 * at the chosen location.
 *
 * Block entities and scheduled ticks move with the terrain. Separate entity/POI
 * region files and custom mod references are outside this terrain payload.
 */
export function relocateSaveChunks(chunks: SaveChunkData[], offsetX: number, offsetZ: number): SaveChunkData[] {
  validateSaveChunkCoordinates(chunks, offsetX, offsetZ)
  let compressed = 0, expanded = 0
  const relocated = chunks.map((c) => {
    const chunkX = c.chunkX + offsetX
    const chunkZ = c.chunkZ + offsetZ
    if (![1, 2, 3].includes(c.compression) || !(c.data instanceof Uint8Array) || !c.data.byteLength || c.data.byteLength > 255 * 4096 - 5 || (compressed += c.data.byteLength) > 64 * 1024 * 1024) throw new Error('Invalid chunk payload')
    const raw = c.compression === 1 ? gunzipSync(c.data, { maxOutputLength: 16 * 1024 * 1024 }) : c.compression === 2 ? inflateSync(c.data, { maxOutputLength: 16 * 1024 * 1024 }) : Buffer.from(c.data)
    if ((expanded += raw.length) > 64 * 1024 * 1024) throw new Error('Expanded chunk batch too large')
    const tags = validateNbt(raw), level = tags.find(tag => tag.type === TAG_COMPOUND && tag.key === 'Level')?.children || tags
    const x = level.find(tag => tag.key === 'xPos'), z = level.find(tag => tag.key === 'zPos')
    if (x?.type !== TAG_INT || z?.type !== TAG_INT || raw.readInt32BE(x.valueStart) !== c.chunkX || raw.readInt32BE(z.valueStart) !== c.chunkZ) throw new Error('Chunk NBT position does not match its source')
    if (offsetX === 0 && offsetZ === 0) return c
    patchChunkPosition(raw, chunkX, chunkZ, offsetX, offsetZ)
    let data: Uint8Array
    if (c.compression === 1) data = gzipSync(raw)
    else if (c.compression === 2) data = deflateSync(raw)
    else data = raw
    if (data.byteLength > 255 * 4096 - 5) throw new Error('Relocated chunk exceeds inline region format')
    return { chunkX, chunkZ, compression: c.compression, data }
  })
  return offsetX === 0 && offsetZ === 0 ? chunks : relocated
}
