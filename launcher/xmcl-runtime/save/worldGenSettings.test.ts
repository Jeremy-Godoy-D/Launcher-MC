import { afterEach, beforeEach, expect, it } from 'vitest'
import { serialize, TagType } from '@xmcl/nbt'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { deflateSync, gzipSync } from 'node:zlib'
import { readWorldGenSettings } from './save'
import { createHash } from 'node:crypto'

class Dimension { @TagType(TagType.String) type = 'minecraft:overworld' }
class Dimensions { @TagType(Dimension) 'minecraft:overworld' = new Dimension() }
class Generation { @TagType(TagType.Long) seed = 0n; @TagType(Dimensions) dimensions = new Dimensions() }
class Data { @TagType(TagType.Long) RandomSeed = 5n; @TagType(Generation) WorldGenSettings = new Generation() }
class World { @TagType(Data) Data = new Data() }
class LegacyData { @TagType(TagType.Long) RandomSeed = 5n }
class LegacyWorld { @TagType(LegacyData) Data = new LegacyData() }
let root: string
beforeEach(async () => { root = await mkdtemp(join(process.cwd(), '.world-generation-test-')) })
afterEach(async () => { expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.world-generation-test-'); await rm(root, { recursive: true, force: true }) })

it('reads bounded gzip, zlib and raw worldgen without mutating data or replacing a zero seed', async () => {
  const raw = Buffer.from(await serialize(new World()))
  for (const bytes of [raw, gzipSync(raw), deflateSync(raw)]) {
    const file = join(root, 'level.dat'); await writeFile(file, bytes)
    expect(await readWorldGenSettings(root)).toEqual({ seed: 0n, dimensions: { 'minecraft:overworld': { type: 'minecraft:overworld' } } })
    expect(await readFile(file)).toEqual(bytes)
  }
})

it('rejects oversized, compressed-bomb and malformed worldgen instead of returning empty success', async () => {
  const file = join(root, 'level.dat')
  for (const bytes of [Buffer.alloc(4 * 1024 * 1024 + 1), gzipSync(Buffer.alloc(17 * 1024 * 1024)), Buffer.from([10, 0, 0, 9, 0, 1, 97, 10, 127, 255, 255, 255])]) {
    await writeFile(file, bytes); await expect(readWorldGenSettings(root)).rejects.toThrow()
    const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex')
    expect(hash(await readFile(file))).toBe(hash(bytes))
  }
})

it('refuses linked metadata and distinguishes a missing worldgen section from invalid NBT', async () => {
  expect(await readWorldGenSettings(root)).toBeUndefined()
  await writeFile(join(root, 'level.dat'), await serialize(new LegacyWorld(), { compressed: 'gzip' })); expect(await readWorldGenSettings(root)).toBeUndefined(); await rm(join(root, 'level.dat'))
  const target = join(root, 'elsewhere'); await mkdir(target); await symlink(target, join(root, 'level.dat'), 'junction')
  await expect(readWorldGenSettings(root)).rejects.toThrow('Unsafe world metadata')
})
