import { afterEach, beforeEach, expect, it } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { ZipFile } from 'yazl'
import { writeZipFile } from '../../util/zip'
import { inspectDatapackSource, parsePackMcmeta, readWorldDatapacks } from './worldDatapacks'
import { applyWorldFiles, previewWorldFiles } from './worldOperations'
import type { WorldFileOperation } from '@xmcl/runtime-api/src/services/InstanceSavesService'

let root: string, instance: string, world: string, external: string
beforeEach(async () => {
  root = await mkdtemp(join(process.cwd(), '.world-datapacks-test-'))
  instance = join(root, 'data/instance'); world = join(instance, 'saves/Alpha'); external = join(root, 'external')
  await mkdir(world, { recursive: true }); await mkdir(external, { recursive: true })
  await writeFile(join(world, 'level.dat'), 'LEVEL')
})
afterEach(async () => {
  if (root) {
    expect(dirname(root)).toBe(process.cwd())
    expect(root).toContain('.world-datapacks-test-')
    await rm(root, { recursive: true, force: true })
  }
})

it('binds provider IDs to the datapack review and publishes exclusive sidecars for folders', async () => {
  const incoming = join(external, 'ProviderPack'); await mkdir(incoming)
  await writeFile(join(incoming, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'Provider folder' } }))
  const op: WorldFileOperation = { type: 'import-datapack', instancePath: instance, saveName: 'Alpha', sourcePath: incoming, providers: { curseforge: { projectId: 1, fileId: 2 }, modrinth: { projectId: 'project1', versionId: 'version2' } } }
  const review = await previewWorldFiles(op, join(root, 'data'))
  if (review.operation.type !== 'import-datapack') throw new Error('Wrong review')
  review.operation.providers!.curseforge!.fileId = 3
  await expect(applyWorldFiles(review, join(root, 'data'))).rejects.toHaveProperty('name', 'WorldFilesChangedError')
  await expect(lstat(join(world, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
  const result = await applyWorldFiles(await previewWorldFiles(op, join(root, 'data')), join(root, 'data'))
  expect(JSON.parse(await readFile(join(world, 'datapacks/.ProviderPack.curseforge'), 'utf8'))).toEqual({ projectId: 1, fileId: 2 })
  expect(JSON.parse(await readFile(join(world, 'datapacks/.ProviderPack.modrinth'), 'utf8'))).toEqual({ projectId: 'project1', versionId: 'version2' })
  expect((await readWorldDatapacks(instance, 'Alpha', join(root, 'data')))[0]).toMatchObject({ path: result.path, curseforge: { projectId: 1, fileId: 2 } })
})

it('rejects malformed provider metadata without creating a datapacks directory', async () => {
  const incoming = join(external, 'Pack'); await mkdir(incoming)
  await writeFile(join(incoming, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: '' } }))
  for (const providers of [null, [], { curseforge: { projectId: 0, fileId: 1 } }, { modrinth: { projectId: 'a/b', versionId: 'v1' } }]) {
    await expect(previewWorldFiles({ type: 'import-datapack', instancePath: instance, saveName: 'Alpha', sourcePath: incoming, providers } as any, join(root, 'data'))).rejects.toThrow()
  }
  await expect(lstat(join(world, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
})

it('preserves a competing sidecar created after the archive was published', async () => {
  const path = join(external, 'pack.zip'); await createZip({ 'pack.mcmeta': JSON.stringify({ pack: { pack_format: 48, description: '' } }) }, path)
  const review = await previewWorldFiles({ type: 'import-datapack', instancePath: instance, saveName: 'Alpha', sourcePath: path, providers: { curseforge: { projectId: 1, fileId: 2 } } }, join(root, 'data'))
  const sidecar = join(world, 'datapacks/.pack.zip.curseforge'); let written = false
  await expect(applyWorldFiles(review, join(root, 'data'), async () => {
    if (!written && await lstat(join(world, 'datapacks/pack.zip')).catch(() => undefined)) { written = true; await writeFile(sidecar, 'OTHER METADATA', { flag: 'wx' }) }
  })).rejects.toHaveProperty('code', 'EEXIST')
  expect(await readFile(sidecar, 'utf8')).toBe('OTHER METADATA')
  expect(await readFile(join(world, 'datapacks/pack.zip'))).toEqual(await readFile(path))
})

async function createZip(files: Record<string, string>, target: string) {
  const zip = new ZipFile()
  for (const [path, data] of Object.entries(files)) {
    if (path.endsWith('/')) zip.addEmptyDirectory(path)
    else zip.addBuffer(Buffer.from(data), path)
  }
  await writeZipFile(zip, target)
  return target
}

it('parses pack.mcmeta formats and flattens formatted descriptions', () => {
  const simple = parsePackMcmeta(Buffer.from(JSON.stringify({ pack: { pack_format: 48, description: '§aA §bsimple §rpack' } })))
  expect(simple).toEqual({ packFormat: 48, description: 'A simple pack' })

  const complex = parsePackMcmeta(Buffer.from(JSON.stringify({
    pack: {
      pack_format: 15,
      description: { text: 'Base text ', extra: ['part 1', { text: ' part 2' }] },
      supported_formats: [15, 26],
    },
  })))
  expect(complex.packFormat).toBe(15)
  expect(complex.description).toBe('Base text part 1 part 2')

  expect(() => parsePackMcmeta(Buffer.from('not json'))).toThrow()
  expect(() => parsePackMcmeta(Buffer.from(JSON.stringify({ pack: {} })))).toThrow()
  expect(() => parsePackMcmeta(Buffer.from(JSON.stringify({ pack: { pack_format: -5 } })))).toThrow()
})

it('inspects valid ZIP and folder datapacks and rejects missing pack.mcmeta', async () => {
  const zipPath = join(external, 'sample.zip')
  await createZip({ 'pack.mcmeta': JSON.stringify({ pack: { pack_format: 48, description: 'Sample' } }), 'data/sample/tags/blocks/test.json': '{}' }, zipPath)
  const zipInspected = await inspectDatapackSource(zipPath)
  expect(zipInspected).toMatchObject({ kind: 'zip', fileName: 'sample.zip', name: 'sample', packFormat: 48, description: 'Sample', files: 1 })

  const folderPath = join(external, 'folder-pack')
  await mkdir(join(folderPath, 'data'), { recursive: true })
  await writeFile(join(folderPath, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'Folder pack' } }))
  await writeFile(join(folderPath, 'data/main.mcfunction'), 'say hello')
  const folderInspected = await inspectDatapackSource(folderPath)
  expect(folderInspected).toMatchObject({ kind: 'folder', fileName: 'folder-pack', name: 'folder-pack', packFormat: 48, description: 'Folder pack', files: 2 })

  const invalidZip = join(external, 'invalid.zip')
  await createZip({ 'something_else.txt': 'no mcmeta' }, invalidZip)
  await expect(inspectDatapackSource(invalidZip)).rejects.toHaveProperty('name', 'WorldDatapackInvalidError')
})

it('reads world datapacks with sidecars, handles missing folders and flags invalid entries without throwing', async () => {
  expect(await readWorldDatapacks(instance, 'Alpha', join(root, 'data'))).toEqual([])

  const dpDir = join(world, 'datapacks')
  await mkdir(dpDir, { recursive: true })
  const validZip = join(dpDir, 'alpha_dp.zip')
  await createZip({ 'pack.mcmeta': JSON.stringify({ pack: { pack_format: 48, description: 'Alpha DP' } }) }, validZip)
  await writeFile(join(dpDir, '.alpha_dp.zip.curseforge'), JSON.stringify({ projectId: 12345, fileId: 67890 }))
  await writeFile(join(dpDir, '.alpha_dp.zip.modrinth'), JSON.stringify({ projectId: 'mr_id', versionId: 'ver_id' }))

  const folderDp = join(dpDir, 'beta_folder')
  await mkdir(join(folderDp, 'data'), { recursive: true })
  await writeFile(join(folderDp, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'Beta folder' } }))

  await writeFile(join(dpDir, 'corrupt.zip'), 'not a zip')

  const list = await readWorldDatapacks(instance, 'Alpha', join(root, 'data'))
  expect(list).toHaveLength(3)

  const alpha = list.find(d => d.fileName === 'alpha_dp.zip')!
  expect(alpha).toMatchObject({
    fileName: 'alpha_dp.zip',
    name: 'alpha_dp',
    packFormat: 48,
    description: 'Alpha DP',
    directory: false,
    curseforge: { projectId: 12345, fileId: 67890 },
    modrinth: { projectId: 'mr_id', versionId: 'ver_id' },
  })

  const beta = list.find(d => d.fileName === 'beta_folder')!
  expect(beta).toMatchObject({
    fileName: 'beta_folder',
    name: 'beta_folder',
    packFormat: 48,
    description: 'Beta folder',
    directory: true,
  })

  const corrupt = list.find(d => d.fileName === 'corrupt.zip')!
  expect(corrupt).toMatchObject({
    fileName: 'corrupt.zip',
    error: 'invalid',
  })
})

it('imports and removes datapacks with full review, backup and non-overwrite guarantees', async () => {
  const zipPath = join(external, 'pack.zip')
  await createZip({ 'pack.mcmeta': JSON.stringify({ pack: { pack_format: 48, description: 'Pack' } }), 'data/test.json': '{}' }, zipPath)
  const zipBytes = await readFile(zipPath)

  const importOp: WorldFileOperation = {
    type: 'import-datapack',
    instancePath: instance,
    saveName: 'Alpha',
    sourcePath: zipPath,
    fileName: 'pack.zip',
  }
  const review = await previewWorldFiles(importOp, join(root, 'data'))
  expect(review).toMatchObject({
    files: 1,
    shared: false,
    linkOnly: false,
    datapack: { name: 'pack', fileName: 'pack.zip', directory: false, packFormat: 48, description: 'Pack' },
  })

  const applied = await applyWorldFiles(review, join(root, 'data'))
  expect(applied.path).toBe(join(instance, 'saves/Alpha/datapacks/pack.zip'))
  expect(await readFile(join(world, 'datapacks/pack.zip'))).toEqual(zipBytes)

  // Cannot overwrite existing datapack
  await expect(previewWorldFiles(importOp, join(root, 'data'))).rejects.toHaveProperty('name', 'WorldDestinationExistsError')

  // Add sidecars to verify removal moves them together into backup
  await writeFile(join(world, 'datapacks/.pack.zip.modrinth'), JSON.stringify({ projectId: 'p1', versionId: 'v1' }))

  const removeOp: WorldFileOperation = {
    type: 'remove-datapack',
    instancePath: instance,
    saveName: 'Alpha',
    fileName: 'pack.zip',
  }
  const removeReview = await previewWorldFiles(removeOp, join(root, 'data'))
  expect(removeReview).toMatchObject({
    files: 1,
    bytes: zipBytes.length,
    datapack: { name: 'pack', fileName: 'pack.zip', directory: false },
  })

  const removeResult = await applyWorldFiles(removeReview, join(root, 'data'))
  expect(removeResult.backup).toBeDefined()
  await expect(lstat(join(world, 'datapacks/pack.zip'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(lstat(join(world, 'datapacks/.pack.zip.modrinth'))).rejects.toMatchObject({ code: 'ENOENT' })

  const backupFiles = await readdir(join(removeResult.backup!, 'Alpha'))
  expect(backupFiles).toContain('pack.zip')
  expect(backupFiles).toContain('.pack.zip.modrinth')
  expect(await readFile(join(removeResult.backup!, 'Alpha/pack.zip'))).toEqual(zipBytes)
})
