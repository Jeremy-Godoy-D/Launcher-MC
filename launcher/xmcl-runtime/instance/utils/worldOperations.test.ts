import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { open, readAllEntries, readEntry } from '@xmcl/unzip'
import { applyWorldFiles, previewWorldFiles } from './worldOperations'
import type { WorldFileOperation } from '@xmcl/runtime-api/src/services/InstanceSavesService'

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
