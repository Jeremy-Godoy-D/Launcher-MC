import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checksum } from '@xmcl/core'
import { installLocalMods, uninstallLocalMods } from './localMods'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'grimo-local-mods-')); roots.push(root)
  const path = join(root, 'instance'), source = join(root, 'example.jar')
  await mkdir(path); await writeFile(source, 'original')
  return { root, path, source, installed: join(path, 'mods/example.jar') }
}
it('copies archives without moving or hard-linking the source and supports a same-path no-op', async () => {
  const { path, source, installed } = await fixture()
  expect(await installLocalMods(path, [source, source])).toEqual([installed])
  await writeFile(source, 'edited source')
  expect(await readFile(installed, 'utf8')).toBe('original')
  expect(await installLocalMods(path, [installed])).toEqual([installed])
})
it('preflights all destinations and preserves colliding originals and sources', async () => {
  const { root, path, source, installed } = await fixture(), second = join(root, 'other.zip')
  await writeFile(second, 'other'); await installLocalMods(path, [source]); await writeFile(source, 'replacement')
  await expect(installLocalMods(path, [second, source])).rejects.toThrow('already exists')
  await expect(readFile(join(path, 'mods/other.zip'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(installed, 'utf8')).toBe('original')
  expect(await readFile(source, 'utf8')).toBe('replacement')
})
it('rejects duplicate basenames, links, folders and invalid selections before copying', async () => {
  const { root, path, source } = await fixture(), other = join(root, 'other')
  await mkdir(other); const same = join(other, 'example.jar'); await writeFile(same, 'other')
  await expect(installLocalMods(path, [source, same])).rejects.toThrow('Conflicting')
  const linked = join(root, 'linked.jar'); await symlink(other, linked, 'junction')
  for (const files of [[source, linked], [source, other], [undefined], ['relative.jar'], Array(1001).fill(source)]) await expect(installLocalMods(path, files as string[])).rejects.toThrow()
  await expect(readFile(join(path, 'mods/example.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('rejects a linked domain folder for import and removal', async () => {
  const { root, path, source } = await fixture(), outside = join(root, 'outside')
  await mkdir(outside); await symlink(outside, join(path, 'mods'), 'junction')
  await expect(installLocalMods(path, [source])).rejects.toThrow('Unmanaged')
  await expect(uninstallLocalMods(path, [])).rejects.toThrow('Unmanaged')
  expect(await readFile(source, 'utf8')).toBe('original')
})
it('removes only reviewed direct regular files and preserves outside sources', async () => {
  const { path, source, installed } = await fixture()
  await installLocalMods(path, [source])
  await uninstallLocalMods(path, [installed, installed], { [installed]: await checksum(installed, 'sha1') })
  await expect(readFile(installed)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(source, 'utf8')).toBe('original')
})
it('rejects the whole removal selection if one path is outside, missing, linked or changed', async () => {
  const { root, path, source, installed } = await fixture(); await installLocalMods(path, [source])
  const linked = join(path, 'mods/linked.jar'); await symlink(root, linked, 'junction')
  for (const files of [[installed, source], [installed, join(path, 'mods/missing.jar')], [installed, linked]]) await expect(uninstallLocalMods(path, files)).rejects.toThrow()
  const expected = { [installed]: await checksum(installed, 'sha1') }; await writeFile(installed, 'changed')
  await expect(uninstallLocalMods(path, [installed], expected)).rejects.toThrow('changed')
  await expect(uninstallLocalMods(path, [installed], {})).rejects.toThrow('changed')
  expect(await readFile(installed, 'utf8')).toBe('changed')
  expect(await readFile(source, 'utf8')).toBe('original')
})
