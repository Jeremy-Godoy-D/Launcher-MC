import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import * as core from '@xmcl/core'
import { installLocalResourcePacks, previewResourcePackRemoval, removeReviewedResourcePacks } from './localResourcePacks'

let root: string, path: string, source: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-local-packs-')); path = join(root, 'instance'); source = join(root, 'source')
  await mkdir(path); await mkdir(source); await writeFile(join(source, 'a.zip'), 'archive-a')
  await mkdir(join(source, 'folder/assets/example'), { recursive: true })
  await writeFile(join(source, 'folder/pack.mcmeta'), '{"pack":{"pack_format":34,"description":"fixture"}}')
  await writeFile(join(source, 'folder/assets/example/texture.png'), 'texture-bytes')
})
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })
const install = (files: string[]) => installLocalResourcePacks(path, files, root)
const preview = (names: string[]) => previewResourcePackRemoval(path, names, root)
const remove = (review: Awaited<ReturnType<typeof preview>>) => removeReviewedResourcePacks(path, review, root)

it('copies archives and unpacked packs including assets, preserving sources and avoiding shared inodes', async () => {
  expect(await install([join(source, 'a.zip'), join(source, 'folder')])).toEqual([join(path, 'resourcepacks/a.zip'), join(path, 'resourcepacks/folder')])
  expect(await readFile(join(path, 'resourcepacks/folder/assets/example/texture.png'), 'utf8')).toBe('texture-bytes')
  expect((await lstat(join(path, 'resourcepacks/a.zip'))).ino).not.toBe((await lstat(join(source, 'a.zip'))).ino)
  await writeFile(join(source, 'a.zip'), 'edited-source'); await writeFile(join(source, 'folder/assets/example/texture.png'), 'edited-texture')
  expect(await readFile(join(path, 'resourcepacks/a.zip'), 'utf8')).toBe('archive-a')
  expect(await readFile(join(path, 'resourcepacks/folder/assets/example/texture.png'), 'utf8')).toBe('texture-bytes')
  expect(await install([join(path, 'resourcepacks/a.zip'), join(path, 'resourcepacks/folder')])).toHaveLength(2)
  expect(await install([])).toEqual([])
})
it('preflights the entire batch for collisions before copying a different file', async () => {
  await install([join(source, 'a.zip')]); await writeFile(join(source, 'b.zip'), 'archive-b'); await writeFile(join(source, 'a.zip'), 'replacement')
  await expect(install([join(source, 'b.zip'), join(source, 'a.zip')])).rejects.toHaveProperty('name', 'ResourcePackCollisionError')
  await expect(lstat(join(path, 'resourcepacks/b.zip'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(path, 'resourcepacks/a.zip'), 'utf8')).toBe('archive-a'); expect(await readFile(join(source, 'a.zip'), 'utf8')).toBe('replacement')
})
it('rejects duplicate basenames and invalid folders without publishing files', async () => {
  await mkdir(join(source, 'other')); await writeFile(join(source, 'other/a.zip'), 'other'); await mkdir(join(source, 'not-a-pack'))
  for (const files of [[join(source, 'a.zip'), join(source, 'other/a.zip')], [join(source, 'a.zip'), join(source, 'not-a-pack')], ['relative.zip'], [undefined]]) await expect(install(files as string[])).rejects.toThrow()
  await expect(lstat(join(path, 'resourcepacks/a.zip'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('rejects links inside a source pack instead of following them into another directory', async () => {
  await symlink(source, join(source, 'folder/linked'), 'junction')
  await expect(install([join(source, 'a.zip'), join(source, 'folder')])).rejects.toThrow()
  await expect(lstat(join(path, 'resourcepacks/a.zip'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('moves reviewed packs into backups, disables only those entries and preserves other options and worlds', async () => {
  await install([join(source, 'a.zip'), join(source, 'folder')])
  const options = 'lang:es_es\r\nresourcePacks:["vanilla","fabric","file/a.zip","file/folder","file/missing.zip"]\r\nunknown:KEEP\r\n'
  await writeFile(join(path, 'options.txt'), options); await mkdir(join(path, 'saves/keep'), { recursive: true }); await writeFile(join(path, 'saves/keep/level.dat'), 'WORLD')
  const review = await preview(['a.zip', 'folder'])
  expect(review.files.map(file => file.entries)).toEqual([1, 2]); expect(review.sharedDirectory).toBe(false)
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe(options)
  const { backup } = await remove(review)
  expect(await readFile(join(backup, 'a.zip'), 'utf8')).toBe('archive-a'); expect(await readFile(join(backup, 'folder/assets/example/texture.png'), 'utf8')).toBe('texture-bytes')
  await expect(lstat(join(path, 'resourcepacks/a.zip'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe(options.replace(',"file/a.zip","file/folder"', ''))
  expect(await readFile(join(source, 'a.zip'), 'utf8')).toBe('archive-a'); expect(await readFile(join(path, 'saves/keep/level.dat'), 'utf8')).toBe('WORLD')
})
it.each(['archive', 'folder', 'options'])('rejects a stale %s review before moving or disabling anything', async kind => {
  await install([join(source, 'a.zip'), join(source, 'folder')]); await writeFile(join(path, 'options.txt'), 'resourcePacks:["file/a.zip"]\n')
  const review = await preview(['a.zip', 'folder'])
  if (kind === 'archive') await writeFile(join(path, 'resourcepacks/a.zip'), 'USER EDIT')
  if (kind === 'folder') await writeFile(join(path, 'resourcepacks/folder/assets/example/texture.png'), 'USER TEXTURE')
  if (kind === 'options') await writeFile(join(path, 'options.txt'), 'resourcePacks:["file/a.zip"]\nlang:en_us\n')
  await expect(remove(review)).rejects.toHaveProperty('name', 'ResourcePacksChangedError')
  expect((await lstat(join(path, 'resourcepacks/a.zip'))).isFile()).toBe(true); expect((await lstat(join(path, 'resourcepacks/folder'))).isDirectory()).toBe(true)
  await expect(lstat(join(path, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('supports the authorized shared directory and discloses it before moving packs', async () => {
  await mkdir(join(root, 'resourcepacks')); await symlink(join(root, 'resourcepacks'), join(path, 'resourcepacks'), 'junction')
  await install([join(source, 'a.zip')]); const review = await preview(['a.zip'])
  expect(review.sharedDirectory).toBe(true)
  const { backup } = await remove(review)
  await expect(lstat(join(root, 'resourcepacks/a.zip'))).rejects.toHaveProperty('code', 'ENOENT'); expect(await readFile(join(backup, 'a.zip'), 'utf8')).toBe('archive-a')
})
it('backs up an empty directory accurately without inventing files', async () => {
  await mkdir(join(path, 'resourcepacks/empty'), { recursive: true })
  const review = await preview(['empty'])
  expect(review.files).toEqual([{ fileName: 'empty', directory: true, size: 0, entries: 0 }])
  const { backup } = await remove(review)
  expect((await lstat(join(backup, 'empty'))).isDirectory()).toBe(true)
})
it('keeps archive and folder bytes when the move requires the cross-device copy fallback', async () => {
  await install([join(source, 'a.zip'), join(source, 'folder')])
  const review = await preview(['a.zip', 'folder']), require = createRequire(import.meta.url)
  const fs = createRequire(require.resolve('fs-extra'))('graceful-fs') as Pick<typeof import('node:fs'), 'rename'>, original = fs.rename
  vi.spyOn(fs, 'rename').mockImplementation((from, to, done) => {
    if ([join(path, 'resourcepacks/a.zip'), join(path, 'resourcepacks/folder')].includes(String(from))) done(Object.assign(new Error('Cross-device fixture'), { code: 'EXDEV' }))
    else original(from, to, done)
  })
  const { backup } = await remove(review)
  expect(await readFile(join(backup, 'a.zip'), 'utf8')).toBe('archive-a')
  expect(await readFile(join(backup, 'folder/assets/example/texture.png'), 'utf8')).toBe('texture-bytes')
  await expect(lstat(join(path, 'resourcepacks/a.zip'))).rejects.toHaveProperty('code', 'ENOENT')
  await expect(lstat(join(path, 'resourcepacks/folder'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('rejects traversal, unapproved directory links and unsafe private backup directories', async () => {
  await install([join(source, 'a.zip')])
  for (const selected of [['../a.zip'], ['C:\\a.zip'], [], Array(201).fill('a.zip')]) await expect(preview(selected)).rejects.toThrow()
  const review = await preview(['a.zip']); await symlink(source, join(path, '.backups'), 'junction')
  await expect(remove(review)).rejects.toThrow(); expect(await readFile(join(path, 'resourcepacks/a.zip'), 'utf8')).toBe('archive-a')
  const other = join(root, 'other'); await mkdir(other); await symlink(source, join(other, 'resourcepacks'), 'junction')
  await expect(installLocalResourcePacks(other, [join(source, 'a.zip')], root)).rejects.toThrow()
})

it('copies shader ZIPs and unpacked shaders with independent bytes and no resource-pack metadata requirement', async () => {
  const folder = join(source, 'shader-folder'); await mkdir(join(folder, 'shaders'), { recursive: true }); await writeFile(join(folder, 'shaders/final.fsh'), 'SHADER SOURCE')
  const installed = await installLocalResourcePacks(path, [join(source, 'a.zip'), folder], root, 'shaderpacks')
  expect(installed).toEqual([join(path, 'shaderpacks/a.zip'), join(path, 'shaderpacks/shader-folder')])
  expect(await readFile(join(path, 'shaderpacks/shader-folder/shaders/final.fsh'), 'utf8')).toBe('SHADER SOURCE')
  expect((await lstat(installed[0])).ino).not.toBe((await lstat(join(source, 'a.zip'))).ino)
  await writeFile(join(folder, 'shaders/final.fsh'), 'SOURCE EDIT')
  expect(await readFile(join(path, 'shaderpacks/shader-folder/shaders/final.fsh'), 'utf8')).toBe('SHADER SOURCE')
  await expect(lstat(join(path, 'resourcepacks'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('keeps shader collisions and invalid-folder batches from replacing or publishing files', async () => {
  const shaderInstall = (files: string[]) => installLocalResourcePacks(path, files, root, 'shaderpacks')
  await shaderInstall([join(source, 'a.zip')]); await writeFile(join(source, 'a.zip'), 'REPLACEMENT'); await writeFile(join(source, 'b.zip'), 'B')
  await expect(shaderInstall([join(source, 'b.zip'), join(source, 'a.zip')])).rejects.toHaveProperty('name', 'ResourcePackCollisionError')
  await expect(shaderInstall([join(source, 'b.zip'), join(source, 'folder')])).rejects.toThrow()
  expect(await readFile(join(path, 'shaderpacks/a.zip'), 'utf8')).toBe('archive-a')
  await expect(lstat(join(path, 'shaderpacks/b.zip'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('copies shaders only into the authorized shared directory and rejects foreign destination links', async () => {
  await mkdir(join(root, 'shaderpacks')); await symlink(join(root, 'shaderpacks'), join(path, 'shaderpacks'), 'junction')
  await installLocalResourcePacks(path, [join(source, 'a.zip')], root, 'shaderpacks')
  expect(await readFile(join(root, 'shaderpacks/a.zip'), 'utf8')).toBe('archive-a')
  const other = join(root, 'other'); await mkdir(other); await symlink(source, join(other, 'shaderpacks'), 'junction')
  await expect(installLocalResourcePacks(other, [join(source, 'a.zip')], root, 'shaderpacks')).rejects.toThrow()
})
it('rejects a shader source folder with nested links before copying its batch', async () => {
  const folder = join(source, 'shaders-folder'); await mkdir(join(folder, 'shaders'), { recursive: true }); await writeFile(join(folder, 'shaders/final.fsh'), 'SHADER')
  await symlink(source, join(folder, 'shaders/foreign'), 'junction')
  await expect(installLocalResourcePacks(path, [join(source, 'a.zip'), folder], root, 'shaderpacks')).rejects.toThrow()
  await expect(lstat(join(path, 'shaderpacks/a.zip'))).rejects.toHaveProperty('code', 'ENOENT')
})

it.each(['resourcepacks', 'shaderpacks'] as const)('rejects a %s destination replaced while a source checksum is being read', async domain => {
  const foreign = join(root, 'foreign'), directory = join(path, domain), archive = join(source, 'a.zip'), original = core.checksum
  await mkdir(foreign); await writeFile(join(foreign, 'keep'), 'FOREIGN'); await mkdir(directory)
  let swapped = false
  vi.spyOn(core, 'checksum').mockImplementation(async (file, algorithm) => {
    const hash = await original(file, algorithm)
    if (file === archive && !swapped) { swapped = true; await rename(directory, directory + '-previous'); await symlink(foreign, directory, 'junction') }
    return hash
  })
  await expect(installLocalResourcePacks(path, [archive], root, domain)).rejects.toThrow()
  expect(swapped).toBe(true); expect(await readFile(join(foreign, 'keep'), 'utf8')).toBe('FOREIGN')
  await expect(lstat(join(foreign, 'a.zip'))).rejects.toHaveProperty('code', 'ENOENT')
})
