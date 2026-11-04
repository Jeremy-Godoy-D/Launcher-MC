import { describe, expect, test } from 'vitest'
import { join } from 'path'
import { tmpdir } from 'os'
import { copyFile, ensureDir, mkdtemp, rm } from 'fs-extra'
import { getSaveRegions, listSaveDimensions, prepareRegionChunks, readSaveChunks, relocateSaveChunks, renderSaveRegion, validateRegionFile, writeSaveChunks } from './region'
import { deserialize, serialize, TagType } from '@xmcl/nbt'
import { gzipSync } from 'node:zlib'

const mockRoot = join(__dirname, '..', '..', 'mock', 'saves')

describe('region', () => {
  test('listSaveDimensions finds overworld', async () => {
    const dims = await listSaveDimensions(join(mockRoot, '1.19.3'))
    expect(dims).toContain('minecraft:overworld')
  })

  test('getSaveRegions lists r.0.0', async () => {
    const regions = await getSaveRegions(join(mockRoot, '1.19.3'), 'minecraft:overworld')
    expect(regions).toContainEqual({ regionX: 0, regionZ: 0 })
  })

  test('supports standard dimensions stored under the dimensions directory', async () => {
    const save = await mkdtemp(join(tmpdir(), 'xmcl-modern-dimensions-'))
    const regionDir = join(save, 'dimensions', 'minecraft', 'overworld', 'region')
    try {
      await ensureDir(regionDir)
      await copyFile(
        join(mockRoot, '1.19.3', 'region', 'r.0.0.mca'),
        join(regionDir, 'r.0.0.mca'),
      )

      await expect(listSaveDimensions(save)).resolves.toEqual(['minecraft:overworld'])
      await expect(getSaveRegions(save, 'minecraft:overworld')).resolves.toContainEqual({ regionX: 0, regionZ: 0 })
      const rendered = await renderSaveRegion(save, 'minecraft:overworld', 0, 0)
      expect(rendered.chunks.some(Boolean)).toBe(true)
    } finally {
      await rm(save, { recursive: true, force: true })
    }
  })

  test.each(['1.16.5', '1.19.3'])('renderSaveRegion produces non-empty image for %s', async (version) => {
    const result = await renderSaveRegion(join(mockRoot, version), 'minecraft:overworld', 0, 0)
    expect(result.data.length).toBe(512 * 512 * 4)
    // At least one chunk should exist.
    expect(result.chunks.some(Boolean)).toBe(true)
    // At least one pixel should be opaque (rendered surface).
    let opaque = 0
    for (let i = 3; i < result.data.length; i += 4) {
      if (result.data[i] === 255) opaque++
    }
    expect(opaque).toBeGreaterThan(0)
  })

  test('readSaveChunks / writeSaveChunks round-trips chunk data', async () => {
    const src = join(mockRoot, '1.19.3')
    // Find which chunks actually exist in region (0,0).
    const rendered = await renderSaveRegion(src, 'minecraft:overworld', 0, 0)
    const existing: Array<{ chunkX: number; chunkZ: number }> = []
    for (let i = 0; i < rendered.chunks.length; i++) {
      if (rendered.chunks[i]) {
        existing.push({ chunkX: i % 32, chunkZ: Math.floor(i / 32) })
      }
    }
    expect(existing.length).toBeGreaterThan(0)

    const copied = await readSaveChunks(src, 'minecraft:overworld', existing)
    expect(copied.length).toBe(existing.length)

    const dest = await mkdtemp(join(tmpdir(), 'xmcl-chunks-'))
    try {
      await writeSaveChunks(dest, 'minecraft:overworld', copied)
      const readBack = await readSaveChunks(dest, 'minecraft:overworld', existing)
      expect(readBack.length).toBe(copied.length)
      // The compressed payloads should be byte-identical after a round-trip.
      const byKey = new Map(readBack.map((c) => [`${c.chunkX},${c.chunkZ}`, c]))
      for (const original of copied) {
        const back = byKey.get(`${original.chunkX},${original.chunkZ}`)
        expect(back).toBeDefined()
        expect(back!.compression).toBe(original.compression)
        expect(Buffer.from(back!.data)).toEqual(Buffer.from(original.data))
      }
      // The pasted region must render to a non-empty image.
      const pasted = await renderSaveRegion(dest, 'minecraft:overworld', 0, 0)
      expect(pasted.chunks.some(Boolean)).toBe(true)
    } finally {
      await rm(dest, { recursive: true, force: true })
    }
  }, 30000)

  test('relocateSaveChunks moves chunks and keeps them renderable', async () => {
    const src = join(mockRoot, '1.19.3')
    const rendered = await renderSaveRegion(src, 'minecraft:overworld', 0, 0)
    const existing: Array<{ chunkX: number; chunkZ: number }> = []
    for (let i = 0; i < rendered.chunks.length; i++) {
      if (rendered.chunks[i]) {
        existing.push({ chunkX: i % 32, chunkZ: Math.floor(i / 32) })
      }
    }
    const copied = await readSaveChunks(src, 'minecraft:overworld', existing)
    expect(copied.length).toBeGreaterThan(0)

    // Shift by 100 chunks on both axes -> lands in region (3,3).
    const relocated = relocateSaveChunks(copied, 100, 100)
    expect(relocated.length).toBe(copied.length)
    for (let i = 0; i < copied.length; i++) {
      expect(relocated[i].chunkX).toBe(copied[i].chunkX + 100)
      expect(relocated[i].chunkZ).toBe(copied[i].chunkZ + 100)
    }
    // A zero offset must be a no-op that returns the same array reference.
    expect(relocateSaveChunks(copied, 0, 0)).toBe(copied)

    const dest = await mkdtemp(join(tmpdir(), 'xmcl-relocate-'))
    try {
      await writeSaveChunks(dest, 'minecraft:overworld', relocated)
      // The chunks now live in region (3,3) and must still render.
      const moved = await renderSaveRegion(dest, 'minecraft:overworld', 3, 3)
      expect(moved.chunks.some(Boolean)).toBe(true)
      // Nothing should have been written to the original region.
      const origin = await renderSaveRegion(dest, 'minecraft:overworld', 0, 0)
      expect(origin.chunks.some(Boolean)).toBe(false)
    } finally {
      await rm(dest, { recursive: true, force: true })
    }
  }, 30000)

  test('relocation retains chest data and moves block entities and scheduled ticks with the terrain', async () => {
    class BlockEntity {
      @TagType(TagType.Int) x = 33
      @TagType(TagType.Int) y = 64
      @TagType(TagType.Int) z = -47
      @TagType(TagType.String) id = 'minecraft:chest'
      @TagType(TagType.String) CustomName = 'Keep this chest'
    }
    class Chunk {
      @TagType(TagType.Int) xPos = 2
      @TagType(TagType.Int) zPos = -3
      @TagType([BlockEntity]) block_entities = [new BlockEntity()]
      @TagType([BlockEntity]) block_ticks = [new BlockEntity()]
      @TagType([BlockEntity]) fluid_ticks = [new BlockEntity()]
      @TagType(TagType.String) unknown_mod_data = 'Preserve byte content'
    }
    const bytes = await serialize(new Chunk(), { compressed: 'gzip' }), original = Buffer.from(bytes)
    const [moved] = relocateSaveChunks([{ chunkX: 2, chunkZ: -3, compression: 1, data: bytes }], 1, -2)
    const parsed = await deserialize<any>(moved.data, { compressed: 'gzip' })
    expect(parsed).toMatchObject({ xPos: 3, zPos: -5, unknown_mod_data: 'Preserve byte content' })
    for (const key of ['block_entities', 'block_ticks', 'fluid_ticks']) expect(parsed[key]).toEqual([{ x: 49, y: 64, z: -79, id: 'minecraft:chest', CustomName: 'Keep this chest' }])
    expect(Buffer.from(bytes)).toEqual(original)
  })

  test('chunk relocation rejects invalid NBT, unsupported compression and excessive decompression before writing', () => {
    const cases = [
      { compression: 1, data: gzipSync(Buffer.alloc(17 * 1024 * 1024)) },
      { compression: 3, data: Buffer.from('not NBT') },
      { compression: 128, data: Buffer.from([10, 0, 0, 0]) },
    ]
    for (const input of cases) for (const offset of [0, 1]) expect(() => relocateSaveChunks([{ chunkX: 0, chunkZ: 0, ...input }], offset, 0)).toThrow()
  })

  test('region edits retain unselected external records and tolerate a short final sector without accepting truncated payloads', () => {
    const bytes = Buffer.alloc(8192 + 5)
    bytes.writeUInt32BE((2 << 8) | 1, 0); bytes.writeUInt32BE(1, 8192); bytes[8196] = 130
    expect(() => validateRegionFile(bytes)).not.toThrow()
    const edited = prepareRegionChunks(bytes, [{ chunkX: 1, chunkZ: 0 }], [])
    expect(edited.subarray(0, bytes.length)).toEqual(bytes); expect(edited.length % 4096).toBe(0)
    const truncated = Buffer.from(bytes); truncated.writeUInt32BE(2, 8192)
    expect(() => validateRegionFile(truncated)).toThrow('Invalid region chunk record')
  })
})
