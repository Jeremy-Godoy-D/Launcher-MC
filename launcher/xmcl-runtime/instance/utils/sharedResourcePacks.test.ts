import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join, parse } from 'node:path'
import { tmpdir } from 'node:os'
import { checksum } from '@xmcl/core'
import { move } from 'fs-extra'
const publication = vi.hoisted(() => ({ source: '', target: '', failures: 0 }))
vi.mock('@xmcl/core', async original => { const actual = await original<typeof import('@xmcl/core')>(); return { ...actual, checksum: vi.fn(actual.checksum) } })
vi.mock('node:fs/promises', async original => { const actual = await original<typeof import('node:fs/promises')>(); return { ...actual, copyFile: vi.fn(actual.copyFile) } })
vi.mock('fs-extra', async original => {
  const actual = await original<typeof import('fs-extra')>()
  return { ...actual, move: vi.fn(async (source: string, target: string, options?: import('fs-extra').MoveOptions) => {
    if (source.endsWith(publication.source) && target === publication.target) { publication.failures++; throw Object.assign(new Error('Publish fixture failure'), { code: 'EIO' }) }
    return actual.move(source, target, options)
  }) }
})
import { applyResourcePackSharing, previewResourcePackSharing } from './sharedResourcePacks'

let root: string, path: string, local: string, global: string
beforeEach(async () => {
  publication.source = ''; publication.target = ''; publication.failures = 0
  root = await mkdtemp(join(tmpdir(), 'grimo-shared-packs-')); path = join(root, 'instance'); local = join(path, 'resourcepacks'); global = join(root, 'resourcepacks')
  await mkdir(local, { recursive: true }); await mkdir(global)
  await writeFile(join(local, 'a.zip'), 'LOCAL PACK'); await writeFile(join(global, 'b.zip'), 'SHARED PACK')
  await mkdir(join(local, 'folder/empty'), { recursive: true }); await writeFile(join(local, 'folder/pack.mcmeta'), 'pack metadata')
  await writeFile(join(path, 'options.txt'), 'resourcePacks:["vanilla","file/a.zip"]\r\nlang:es_es\r\n')
})
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })
const preview = (shared: boolean) => previewResourcePackSharing(path, shared, root)
const apply = (review: Awaited<ReturnType<typeof preview>>) => applyResourcePackSharing(path, review, root)

it('previews without writes, then merges independent copies with a backup and preserves names, options and empty folders', async () => {
  const options = await readFile(join(path, 'options.txt')), review = await preview(true)
  expect(review).toMatchObject({ shared: true, linked: false, localPacks: 2, sharedPacks: 1, files: 2, conflicts: [] })
  expect(await readdir(global)).toEqual(['b.zip']); await expect(lstat(join(path, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
  const result = await apply(review)
  expect((await lstat(local)).isSymbolicLink()).toBe(true)
  expect(await readFile(join(local, 'a.zip'), 'utf8')).toBe('LOCAL PACK'); expect(await readFile(join(local, 'b.zip'), 'utf8')).toBe('SHARED PACK')
  expect((await lstat(join(global, 'folder/empty'))).isDirectory()).toBe(true)
  expect(await readFile(join(result.backup!, 'previous/a.zip'), 'utf8')).toBe('LOCAL PACK')
  expect((await lstat(join(global, 'a.zip'))).ino).not.toBe((await lstat(join(result.backup!, 'previous/a.zip'))).ino)
  expect(await readFile(join(path, 'options.txt'))).toEqual(options)
  expect(await apply(await preview(true))).toEqual({})
})
it('unlinks into an independent full copy, preserves shared bytes, options and empty directories and is idempotent', async () => {
  await apply(await preview(true)); const options = await readFile(join(path, 'options.txt'))
  const review = await preview(false); expect(review).toMatchObject({ linked: true, shared: false, files: 3, conflicts: [] })
  await apply(review)
  expect((await lstat(local)).isSymbolicLink()).toBe(false); expect((await lstat(join(local, 'folder/empty'))).isDirectory()).toBe(true)
  expect((await lstat(join(local, 'b.zip'))).ino).not.toBe((await lstat(join(global, 'b.zip'))).ino)
  await writeFile(join(local, 'b.zip'), 'PRIVATE EDIT'); expect(await readFile(join(global, 'b.zip'), 'utf8')).toBe('SHARED PACK')
  expect(await readFile(join(path, 'options.txt'))).toEqual(options)
  expect(await apply(await preview(false))).toEqual({}); expect(await readFile(join(local, 'b.zip'), 'utf8')).toBe('PRIVATE EDIT')
})
it('rejects all conflicting names before copying anything, while reusing exact duplicate trees safely', async () => {
  await writeFile(join(global, 'a.zip'), 'CONFLICT')
  const review = await preview(true); expect(review.conflicts).toEqual(['a.zip'])
  await expect(apply(review)).rejects.toHaveProperty('name', 'ResourcePackCollisionError')
  expect(await readFile(join(local, 'a.zip'), 'utf8')).toBe('LOCAL PACK'); expect(await readFile(join(global, 'a.zip'), 'utf8')).toBe('CONFLICT')
  await expect(lstat(join(global, 'folder'))).rejects.toHaveProperty('code', 'ENOENT')
  await writeFile(join(global, 'a.zip'), 'LOCAL PACK')
  expect((await preview(true)).conflicts).toEqual([])
  await apply(await preview(true)); expect(await readFile(join(global, 'a.zip'), 'utf8')).toBe('LOCAL PACK')
})
it.each(['local', 'shared'])('rejects a stale %s review before publishing copies or changing the link', async where => {
  const review = await preview(true)
  await writeFile(join(where === 'local' ? local : global, where === 'local' ? 'a.zip' : 'b.zip'), 'EXTERNAL EDIT')
  await expect(apply(review)).rejects.toHaveProperty('name', 'ResourcePacksChangedError')
  expect((await lstat(local)).isSymbolicLink()).toBe(false)
  await expect(lstat(join(global, 'folder'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('rejects links in either tree and a linked private backup without following or changing their targets', async () => {
  const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
  await symlink(outside, join(local, 'foreign'), 'junction'); await expect(preview(true)).rejects.toThrow(); await rm(join(local, 'foreign'))
  await symlink(outside, join(global, 'foreign'), 'junction'); await expect(preview(true)).rejects.toThrow(); await rm(join(global, 'foreign'))
  const review = await preview(true); await symlink(outside, join(path, '.backups'), 'junction')
  await expect(apply(review)).rejects.toThrow(); expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
  expect(await readdir(global)).toEqual(['b.zip'])
})
it('keeps the local directory and partial copies on copy failure, and a fresh review can finish safely', async () => {
  vi.mocked(copyFile).mockRejectedValueOnce(new Error('Copy fixture failure'))
  await expect(apply(await preview(true))).rejects.toHaveProperty('name', 'ResourcePackSharingIncompleteError')
  expect((await lstat(local)).isSymbolicLink()).toBe(false); expect(await readFile(join(local, 'a.zip'), 'utf8')).toBe('LOCAL PACK')
  await apply(await preview(true)); expect((await lstat(local)).isSymbolicLink()).toBe(true)
})
it('restores the original local directory if publishing the staged link fails', async () => {
  publication.source = 'link'; publication.target = local
  await expect(apply(await preview(true))).rejects.toHaveProperty('name', 'ResourcePackSharingIncompleteError')
  expect(publication.failures).toBe(1)
  expect(move).toHaveBeenCalledWith(expect.stringMatching(/[\\/]previous$/), local, { overwrite: false })
  expect((await lstat(local)).isSymbolicLink()).toBe(false); expect(await readFile(join(local, 'a.zip'), 'utf8')).toBe('LOCAL PACK')
  expect(await readFile(join(global, 'a.zip'), 'utf8')).toBe('LOCAL PACK')
})
it('restores the common link and retains the private copy if publishing that copy fails', async () => {
  await apply(await preview(true))
  publication.source = 'private'; publication.target = local
  const error = await apply(await preview(false)).catch(error => error)
  expect(publication.failures).toBe(1)
  expect(error.name).toBe('ResourcePackSharingIncompleteError'); expect((await lstat(local)).isSymbolicLink()).toBe(true)
  expect(await readFile(join(error.backup, 'private/a.zip'), 'utf8')).toBe('LOCAL PACK')
  expect(await readFile(join(global, 'b.zip'), 'utf8')).toBe('SHARED PACK')
})
it('rejects overlapping roots and invalid or forged choices', async () => {
  await expect(previewResourcePackSharing(root, true, root)).rejects.toThrow('Overlapping')
  await expect(preview('yes' as any)).rejects.toThrow('Invalid sharing choice')
  await expect(apply({ ...await preview(true), shared: false })).rejects.toHaveProperty('name', 'ResourcePacksChangedError')
  await expect(previewResourcePackSharing(path, true, parse(root).root)).rejects.toThrow('Unsafe shared root')
})
it('fails closed when the checksum helper cannot read bytes', async () => {
  for (const value of [null, undefined]) {
    vi.mocked(checksum).mockResolvedValueOnce(value)
    await expect(preview(true)).rejects.toThrow('Pack checksum unavailable')
    expect(await readdir(global)).toEqual(['b.zip'])
    expect((await lstat(local)).isSymbolicLink()).toBe(false)
  }
})
