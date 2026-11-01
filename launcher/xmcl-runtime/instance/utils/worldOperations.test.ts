import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { deserialize, serialize, TagType } from '@xmcl/nbt'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { applyWorldFiles, previewWorldFiles } from './worldOperations'
import { readWorlds } from './worldFiles'
import type { WorldFileOperation } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { ZipFile } from 'yazl'
import { writeZipFile } from '../../util/zip'

class Version { @TagType(TagType.String) Name = '1.21.1' }
class Gen { @TagType(TagType.Long) seed = 42n; @TagType(TagType.String) bonus = 'keep-gen' }
class Level {
  @TagType(TagType.String) LevelName = 'Alpha World'
  @TagType(TagType.Int) GameType = 1
  @TagType(TagType.Byte) Difficulty = 2
  @TagType(TagType.Byte) allowCommands = 0
  @TagType(TagType.Long) RandomSeed = 42n
  @TagType(TagType.String) CustomTag = 'preserve-me'
  @TagType(Version) Version = new Version()
  @TagType(Gen) WorldGenSettings = new Gen()
}
class World { @TagType(Level) Data = new Level() }

let root: string, instance: string, destination: string, exports: string, world: string
beforeEach(async () => {
  root = await mkdtemp(join(process.cwd(), '.world-operations-test-')); instance = join(root, 'data/instance'); destination = join(root, 'data/other'); exports = join(root, 'exports'); world = join(instance, 'saves/Alpha')
  await mkdir(join(world, 'region/empty'), { recursive: true }); await mkdir(destination, { recursive: true }); await mkdir(exports)
  await writeFile(join(world, 'level.dat'), 'LEVEL'); await writeFile(join(world, 'region/r.0.0.mca'), 'REGION'); await writeFile(join(world, '.keep'), 'HIDDEN')
})
afterEach(async () => { if (root) { expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.world-operations-test-'); await rm(root, { recursive: true, force: true }) } })
const operation = (type: 'copy' | 'export' | 'remove'): WorldFileOperation => type === 'copy' ? { type, instancePath: instance, saveName: 'Alpha', destinationInstancePath: destination, destinationName: 'Beta' } : type === 'export' ? { type, instancePath: instance, saveName: 'Alpha', destinationDirectory: exports, fileName: 'Alpha.zip' } : { type, instancePath: instance, saveName: 'Alpha' }
const preview = (type: 'copy' | 'export' | 'remove') => previewWorldFiles(operation(type), join(root, 'data'))
const apply = (review: Awaited<ReturnType<typeof preview>>, verify?: Parameters<typeof applyWorldFiles>[2]) => applyWorldFiles(review, join(root, 'data'), verify)

it('copies all reviewed bytes, hidden files and empty directories without replacing another world', async () => {
  const review = await preview('copy'); expect(review).toMatchObject({ files: 3, bytes: 17, shared: false, linkOnly: false })
  const result = await apply(review)
  expect(await readFile(join(result.path, 'level.dat'), 'utf8')).toBe('LEVEL'); expect(await readFile(join(result.path, '.keep'), 'utf8')).toBe('HIDDEN'); expect((await lstat(join(result.path, 'region/empty'))).isDirectory()).toBe(true)
  await expect(preview('copy')).rejects.toHaveProperty('name', 'WorldDestinationExistsError'); expect(await readFile(join(world, 'level.dat'), 'utf8')).toBe('LEVEL')
})
it('rejects stale files, forged operations, traversal, overlap and unsafe nested links before writing', async () => {
  const review = await preview('copy'); await writeFile(join(world, 'level.dat'), 'EXTERNAL')
  await expect(apply(review)).rejects.toHaveProperty('name', 'WorldFilesChangedError'); await expect(lstat(join(destination, 'saves/Beta'))).rejects.toMatchObject({ code: 'ENOENT' })
  for (const saveName of ['../Alpha', 'NUL', 'bad.']) await expect(previewWorldFiles({ ...operation('remove'), saveName }, join(root, 'data'))).rejects.toThrow()
  await expect(previewWorldFiles({ ...operation('copy'), type: 'copy', destinationInstancePath: instance, destinationName: 'Alpha' }, join(root, 'data'))).rejects.toThrow()
  await symlink(exports, join(world, 'foreign'), 'junction'); await expect(preview('copy')).rejects.toThrow()
})
it('exports a complete ZIP including empty directories and never overwrites an existing archive', async () => {
  const result = await apply(await preview('export')), zip = await open(result.path)
  try { const entries = await readAllEntries(zip); expect(entries.map(entry => entry.fileName)).toEqual(expect.arrayContaining(['level.dat', '.keep', 'region/empty/'])); expect((await readEntry(zip, entries.find(entry => entry.fileName === 'level.dat')!)).toString()).toBe('LEVEL') } finally { zip.close() }
  const bytes = await readFile(result.path); await expect(preview('export')).rejects.toHaveProperty('name', 'WorldDestinationExistsError'); expect(await readFile(result.path)).toEqual(bytes)
  expect((await readdir(exports)).some(name => name.startsWith('.grimo-world-export-'))).toBe(false)
})
it('moves a world into a private backup while removing an owned per-world link preserves its target', async () => {
  const result = await apply(await preview('remove')); expect(await readFile(join(result.backup!, 'Alpha/level.dat'), 'utf8')).toBe('LEVEL'); await expect(lstat(world)).rejects.toMatchObject({ code: 'ENOENT' })
  const common = join(root, 'data/saves/Shared'); await mkdir(common, { recursive: true }); await writeFile(join(common, 'level.dat'), 'SHARED'); await symlink(common, world, 'junction')
  const review = await preview('remove'); expect(review).toMatchObject({ shared: true, linkOnly: true, files: 0 }); const removed = await apply(review)
  expect((await lstat(join(removed.backup!, 'Alpha'))).isSymbolicLink()).toBe(true); expect(await readFile(join(common, 'level.dat'), 'utf8')).toBe('SHARED')
})
it('revalidates the source and destination authority and idle guard before writing', async () => {
  const review = await preview('copy'), verify = vi.fn(async () => { throw new Error('running') })
  await expect(apply(review, verify)).rejects.toThrow('running'); await expect(lstat(join(destination, 'saves'))).rejects.toMatchObject({ code: 'ENOENT' })
  await mkdir(join(destination, 'saves')); await expect(apply(review)).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  const changed = await preview('copy'); await rename(join(destination, 'saves'), join(destination, 'previous')); await mkdir(join(destination, 'saves')); await expect(apply(changed)).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  for (const directory of [world, join(root, 'data')]) await expect(previewWorldFiles({ type: 'export', instancePath: instance, saveName: 'Alpha', destinationDirectory: directory, fileName: 'world.zip' }, join(root, 'data'))).rejects.toThrow()
})
it('keeps the source and copied files on an interrupted operation and rejects a destination created after export review', async () => {
  const review = await preview('copy'); let checks = 0
  await expect(apply(review, async () => { if (++checks === 2) throw new Error('interrupted') })).rejects.toHaveProperty('name', 'WorldOperationIncompleteError')
  expect(await readFile(join(world, 'level.dat'), 'utf8')).toBe('LEVEL'); expect(await readFile(join(destination, 'saves/Beta/level.dat'), 'utf8')).toBe('LEVEL')
  const exporting = await preview('export'); checks = 0
  await expect(apply(exporting, async () => { if (++checks === 3) await writeFile(join(exports, 'Alpha.zip'), 'OTHER ARCHIVE') })).rejects.toMatchObject({ code: 'EEXIST' })
  expect(checks).toBe(3); expect(await readFile(join(exports, 'Alpha.zip'), 'utf8')).toBe('OTHER ARCHIVE')
})
it('does not publish or clean another directory when the export parent is rebound during staging', async () => {
  const review = await preview('export'); let checks = 0
  await expect(apply(review, async () => {
    if (++checks === 2) { await rename(exports, join(root, 'retained-export')); await mkdir(exports); await writeFile(join(exports, 'keep'), 'OTHER DIRECTORY') }
  })).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  expect(await readFile(join(exports, 'keep'), 'utf8')).toBe('OTHER DIRECTORY'); expect(await readFile(join(world, 'level.dat'), 'utf8')).toBe('LEVEL')
  expect((await readdir(join(root, 'retained-export'))).some(name => name.startsWith('.grimo-world-export-'))).toBe(true)
  await expect(lstat(join(exports, 'Alpha.zip'))).rejects.toMatchObject({ code: 'ENOENT' })
})
async function archive(files: Record<string, string>, name = 'import.zip') {
  const zip = new ZipFile()
  for (const [path, data] of Object.entries(files)) { if (path.endsWith('/')) zip.addEmptyDirectory(path); else zip.addBuffer(Buffer.from(data), path) }
  const path = join(exports, name); await writeZipFile(zip, path); return path
}
const importing = (sourcePath: string): WorldFileOperation => ({ type: 'import', sourcePath, instancePath: destination, saveName: 'Imported' })
it('imports a folder and a wrapped ZIP as independent worlds, preserving hidden files and empty directories', async () => {
  const folder = await previewWorldFiles(importing(world), join(root, 'data')); const copied = await apply(folder)
  expect(await readFile(join(copied.path, '.keep'), 'utf8')).toBe('HIDDEN'); expect((await lstat(join(copied.path, 'region/empty'))).isDirectory()).toBe(true)
  const path = await archive({ 'World/level.dat': 'ZIP LEVEL', 'World/.keep': 'ZIP HIDDEN', 'World/empty/': '', 'README.txt': 'OUTSIDE WORLD' }), bytes = await readFile(path)
  const review = await previewWorldFiles({ ...importing(path), saveName: 'ZipWorld' }, join(root, 'data')); expect(review).toMatchObject({ files: 2, bytes: 19 })
  const imported = await apply(review); expect(await readFile(join(imported.path, 'level.dat'), 'utf8')).toBe('ZIP LEVEL'); expect((await lstat(join(imported.path, 'empty'))).isDirectory()).toBe(true)
  await expect(lstat(join(imported.path, 'README.txt'))).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readFile(path)).toEqual(bytes)
  await expect(previewWorldFiles(importing(world), join(root, 'data'))).rejects.toHaveProperty('name', 'WorldDestinationExistsError')
})
it('rejects stale import sources and unsafe source links without creating a destination', async () => {
  const path = await archive({ 'level.dat': 'ORIGINAL' }), review = await previewWorldFiles(importing(path), join(root, 'data'))
  await archive({ 'level.dat': 'CHANGED' }); await expect(apply(review)).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  await expect(lstat(join(destination, 'saves/Imported'))).rejects.toMatchObject({ code: 'ENOENT' })
  await symlink(world, join(root, 'linked-world'), 'junction'); await expect(previewWorldFiles(importing(join(root, 'linked-world')), join(root, 'data'))).rejects.toThrow()
  await expect(previewWorldFiles({ ...importing(world), instancePath: world }, join(root, 'data'))).rejects.toThrow('overlaps')
})
it('rejects ambiguous worlds, file-directory conflicts and case-colliding archive paths', async () => {
  const cases: Record<string, string>[] = [{ 'One/level.dat': 'ONE', 'Two/level.dat': 'TWO' }, { 'level.dat': 'LEVEL', foo: 'FILE', 'foo/child': 'CHILD' }, { 'level.dat': 'LEVEL', Case: 'UPPER', case: 'LOWER' }]
  for (const entries of cases) {
    const path = await archive(entries); await expect(previewWorldFiles(importing(path), join(root, 'data'))).rejects.toThrow()
  }
  await expect(lstat(join(destination, 'saves'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('rejects archive traversal, Unix links and declared oversized output before creating a world', async () => {
  const path = await archive({ 'level.dat': 'LEVEL' }), original = await readFile(path), central = original.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  expect(central).toBeGreaterThan(0)
  const traversal = Buffer.from(original); traversal.write('../evil/x', central + 46)
  const linked = Buffer.from(original); linked.writeUInt32LE((0o120777 << 16) >>> 0, central + 38)
  const oversized = Buffer.from(original); oversized.writeUInt32LE(1024 ** 3 + 1, central + 24)
  for (const bytes of [traversal, linked, oversized]) { await writeFile(path, bytes); await expect(previewWorldFiles(importing(path), join(root, 'data'))).rejects.toThrow() }
  await expect(lstat(join(destination, 'saves'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('checks ZIP CRC before publishing level.dat and preserves the source on checksum failure', async () => {
  const path = await archive({ 'level.dat': 'LEVEL' }), bytes = await readFile(path), central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  bytes.writeUInt32LE((bytes.readUInt32LE(central + 16) ^ 0xffffffff) >>> 0, central + 16); await writeFile(path, bytes)
  const review = await previewWorldFiles(importing(path), join(root, 'data')); await expect(apply(review)).rejects.toHaveProperty('name', 'WorldArchiveChecksumError')
  expect(await readFile(path)).toEqual(bytes); await expect(lstat(join(destination, 'saves/Imported/level.dat'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readdir(join(destination, 'saves/Imported'))).toEqual([])
})
it('updates reviewed world metadata, preserves extra NBT fields and stores a private level.dat backup', async () => {
  const original = Buffer.from(await serialize(new World(), { compressed: 'gzip' })); await writeFile(join(world, 'level.dat'), original)
  const op: WorldFileOperation = { type: 'metadata', instancePath: instance, saveName: 'Alpha', metadata: { levelName: '  Alpha Edited  ', seed: '-9223372036854775808', difficulty: 3, cheat: true } }
  const review = await previewWorldFiles(op, join(root, 'data'))
  expect(review.metadata).toEqual({ before: { levelName: 'Alpha World', seed: '42', difficulty: 2, cheat: false }, after: { levelName: 'Alpha Edited', seed: '-9223372036854775808', difficulty: 3, cheat: true } })
  const result = await apply(review)
  expect(await readFile(join(result.backup!, 'Alpha/level.dat'))).toEqual(original)
  const [updated] = await readWorlds(instance, join(root, 'data'))
  expect(updated).toMatchObject({ name: 'Alpha', levelName: 'Alpha Edited', seed: '-9223372036854775808', difficulty: 3, cheat: true, mode: 1, gameVersion: '1.21.1' })
  const parsed = await deserialize<{ Data: Record<string, any> }>(await readFile(join(world, 'level.dat')), { compressed: 'gzip' })
  expect(parsed.Data.CustomTag).toBe('preserve-me'); expect(parsed.Data.WorldGenSettings.bonus).toBe('keep-gen'); expect(parsed.Data.WorldGenSettings.seed).toBe(-9223372036854775808n)
})
it('rejects invalid world metadata inputs and stale level.dat changes without modifying the world', async () => {
  const original = Buffer.from(await serialize(new World(), { compressed: 'gzip' })); await writeFile(join(world, 'level.dat'), original)
  const valid = { levelName: 'Valid', seed: '99', difficulty: 1 as const, cheat: false }
  for (const metadata of [{ ...valid, levelName: '   ' }, { ...valid, levelName: 'bad\u0000name' }, { ...valid, seed: '' }, { ...valid, seed: '9223372036854775808' }, { ...valid, difficulty: 4 as any }]) {
    await expect(previewWorldFiles({ type: 'metadata', instancePath: instance, saveName: 'Alpha', metadata }, join(root, 'data'))).rejects.toHaveProperty('name', 'WorldMetadataInvalidError')
  }
  const review = await previewWorldFiles({ type: 'metadata', instancePath: instance, saveName: 'Alpha', metadata: valid }, join(root, 'data'))
  const other = new World(); other.Data.LevelName = 'Concurrent'; await writeFile(join(world, 'level.dat'), await serialize(other, { compressed: 'gzip' }))
  const concurrentBytes = await readFile(join(world, 'level.dat'))
  await expect(apply(review)).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  expect(await readFile(join(world, 'level.dat'))).toEqual(concurrentBytes)
})
