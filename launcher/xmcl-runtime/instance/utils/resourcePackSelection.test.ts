import { afterEach, beforeEach, expect, it } from 'vitest'
import { link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readResourcePackSelection, writeResourcePackSelection } from './resourcePackSelection'

let root: string, path: string, shared: string, options: string
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-pack-selection-')); path = join(root, 'instance'); shared = join(root, 'resourcepacks'); options = join(root, 'options.txt')
  await mkdir(join(path, 'resourcepacks'), { recursive: true }); await mkdir(shared)
  await writeFile(join(path, 'resourcepacks/a.zip'), 'pack-a'); await writeFile(join(path, 'resourcepacks/b.zip'), 'pack-b')
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const save = (selection: Awaited<ReturnType<typeof readResourcePackSelection>>) => writeResourcePackSelection(path, selection, shared, options)

it('reads absent options without creating them and activates a real local file', async () => {
  const selection = await readResourcePackSelection(path)
  expect(selection.packs).toEqual([]); await expect(lstat(join(path, 'options.txt'))).rejects.toHaveProperty('code', 'ENOENT')
  const result = await save({ ...selection, packs: ['vanilla', 'file/a.zip'] })
  expect(result.packs).toEqual(['vanilla', 'file/a.zip']); expect(result.snapshot).not.toBe(selection.snapshot)
})
it('preserves exact unrelated lines, CRLF, built-in and missing entries while reordering or disabling', async () => {
  const original = 'lang:es_es\r\n# comment\r\nresourcePacks:["vanilla","fabric","file/missing.zip","file/a.zip"]\r\nsomeUnknown:{"value":1}\r\n'
  await writeFile(join(path, 'options.txt'), original)
  const selection = await readResourcePackSelection(path)
  await save({ ...selection, packs: ['vanilla', 'file/a.zip', 'fabric', 'file/missing.zip'] })
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe(original.replace('["vanilla","fabric","file/missing.zip","file/a.zip"]', '["vanilla","file/a.zip","fabric","file/missing.zip"]'))
  await save({ ...await readResourcePackSelection(path), packs: ['vanilla', 'fabric'] })
  expect(await readFile(join(path, 'resourcepacks/a.zip'), 'utf8')).toBe('pack-a')
})
it('rejects stale options without losing a concurrent setting', async () => {
  await writeFile(join(path, 'options.txt'), 'resourcePacks:[]\nlang:es_es\n')
  const selection = await readResourcePackSelection(path), edited = 'resourcePacks:[]\nlang:en_us\n'
  await writeFile(join(path, 'options.txt'), edited)
  await expect(save({ ...selection, packs: ['file/a.zip'] })).rejects.toHaveProperty('name', 'ResourcePackSelectionChangedError')
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe(edited)
})
it.each(['resourcePacks:[\n', 'resourcePacks:{}\n', 'resourcePacks:[]\nresourcePacks:[]\n'])('fails closed on malformed or ambiguous options: %s', async text => {
  await writeFile(join(path, 'options.txt'), text)
  await expect(readResourcePackSelection(path)).rejects.toThrow()
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe(text)
})
it.each(['file/../outside.zip', 'file/sub/a.zip', 'file/C:\\other.zip', 'file/not-present.zip', 'bad\nline'])('rejects invalid or absent newly enabled IDs: %s', async id => {
  const selection = await readResourcePackSelection(path)
  await expect(save({ ...selection, packs: [id] })).rejects.toThrow()
  await expect(lstat(join(path, 'options.txt'))).rejects.toHaveProperty('code', 'ENOENT')
})
it('accepts an unpacked pack using its actual folder name', async () => {
  await mkdir(join(path, 'resourcepacks/unpacked'))
  expect((await save({ ...await readResourcePackSelection(path), packs: ['file/unpacked'] })).packs).toEqual(['file/unpacked'])
})
it('writes dollar characters in pack names literally', async () => {
  await writeFile(join(path, 'options.txt'), 'resourcePacks:[]\n')
  await writeFile(join(path, 'resourcepacks/$&.zip'), 'literal')
  expect((await save({ ...await readResourcePackSelection(path), packs: ['file/$&.zip'] })).packs).toEqual(['file/$&.zip'])
})
it('preserves explicitly shared options and the shared pack directory', async () => {
  await writeFile(options, 'resourcePacks:[]\nlang:es_es\n'); await link(options, join(path, 'options.txt'))
  await rm(join(path, 'resourcepacks'), { recursive: true }); await symlink(shared, join(path, 'resourcepacks'), 'junction'); await writeFile(join(shared, 'shared.zip'), 'shared-pack')
  const ino = (await lstat(options)).ino
  expect((await readResourcePackSelection(path)).shared).toBe(true)
  await save({ ...await readResourcePackSelection(path), packs: ['file/shared.zip'] })
  expect((await lstat(join(path, 'options.txt'))).ino).toBe(ino)
  expect(await readFile(options, 'utf8')).toBe('resourcePacks:["file/shared.zip"]\nlang:es_es\n')
})
it('rejects a selection captured before options were linked even if their bytes did not change', async () => {
  await writeFile(join(path, 'options.txt'), 'resourcePacks:[]\n')
  const selection = await readResourcePackSelection(path)
  await link(join(path, 'options.txt'), options)
  await expect(save({ ...selection, packs: ['file/a.zip'] })).rejects.toHaveProperty('name', 'ResourcePackSelectionChangedError')
  expect(await readFile(options, 'utf8')).toBe('resourcePacks:[]\n')
})
it('rejects an arbitrary hard-linked options target and preserves its original content', async () => {
  const target = join(root, 'private-file'); await writeFile(target, 'resourcePacks:[]\n'); await link(target, join(path, 'options.txt'))
  await expect(save({ ...await readResourcePackSelection(path), packs: ['file/a.zip'] })).rejects.toThrow('Unmanaged shared options')
  expect(await readFile(target, 'utf8')).toBe('resourcePacks:[]\n')
})
it('rejects unapproved junctions without changing their contents', async () => {
  const external = join(root, 'external'); await mkdir(external); await writeFile(join(external, 'a.zip'), 'private')
  await rm(join(path, 'resourcepacks'), { recursive: true }); await symlink(external, join(path, 'resourcepacks'), 'junction')
  await expect(save({ ...await readResourcePackSelection(path), packs: ['file/a.zip'] })).rejects.toThrow('Unmanaged resource pack directory')
  expect(await readFile(join(external, 'a.zip'), 'utf8')).toBe('private')
})
