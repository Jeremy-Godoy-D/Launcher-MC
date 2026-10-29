import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RuntimeVersionsSchema } from '@xmcl/instance'
vi.mock('node:fs/promises', async original => { const actual = await original<typeof import('node:fs/promises')>(); return { ...actual, readdir: vi.fn(actual.readdir) } })
import { readResourcePackFilesSnapshot, resourcePackLocation } from './resourcePackSnapshot'

let root: string, path: string
const configuration = { runtime: RuntimeVersionsSchema.parse({ minecraft: '1.21.1' }), java: '', version: '' }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-pack-snapshot-')); path = join(root, 'instance')
  await mkdir(join(path, 'resourcepacks'), { recursive: true }); await writeFile(join(path, 'resourcepacks/a.zip'), 'PACK')
})
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })
it('reads a deterministic private inventory without altering files, with logical paths and configuration', async () => {
  const before = await lstat(join(path, 'resourcepacks/a.zip')), first = await readResourcePackFilesSnapshot(path, root, configuration)
  expect(first).toMatchObject({ shared: false, configuration, entries: [{ path: join(path, 'resourcepacks/a.zip'), fileName: 'a.zip', directory: false, size: 4 }] })
  expect(first.authority).toMatch(/^[a-f0-9]{64}$/); expect(await readResourcePackFilesSnapshot(path, root, configuration)).toEqual(first)
  expect((await lstat(join(path, 'resourcepacks/a.zip'))).mtimeMs).toBe(before.mtimeMs)
  expect(await readFile(join(path, 'resourcepacks/a.zip'), 'utf8')).toBe('PACK')
  expect((await readResourcePackFilesSnapshot(path, root, { ...configuration, version: 'changed' })).fingerprint).not.toBe(first.fingerprint)
})
it('binds shared and private authority even when both have the same archive bytes', async () => {
  const first = await readResourcePackFilesSnapshot(path, root, configuration), common = join(root, 'resourcepacks')
  await mkdir(common); await writeFile(join(common, 'a.zip'), 'PACK')
  await rm(join(path, 'resourcepacks'), { recursive: true }); await symlink(common, join(path, 'resourcepacks'), 'junction')
  const second = await readResourcePackFilesSnapshot(path, root, configuration)
  expect(second.shared).toBe(true); expect(second.authority).not.toBe(first.authority); expect(second.fingerprint).not.toBe(first.fingerprint)
  expect(second.entries[0].path).toBe(join(path, 'resourcepacks/a.zip')); expect((await resourcePackLocation(path, root)).root).toBe(common)
})
it('includes unpacked folders in inventory but refuses links inside the pack directory', async () => {
  await mkdir(join(path, 'resourcepacks/unpacked')); const first = await readResourcePackFilesSnapshot(path, root, configuration)
  expect(first.entries.find(entry => entry.fileName === 'unpacked')?.directory).toBe(true)
  const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
  await symlink(outside, join(path, 'resourcepacks/foreign'), 'junction')
  await expect(readResourcePackFilesSnapshot(path, root, configuration)).rejects.toThrow('Unsafe resource pack entry')
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
})
it('rejects an untrusted top-level junction without reading its contents', async () => {
  await mkdir(join(root, 'resourcepacks'))
  const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
  await rm(join(path, 'resourcepacks'), { recursive: true }); await symlink(outside, join(path, 'resourcepacks'), 'junction')
  await expect(readResourcePackFilesSnapshot(path, root, configuration)).rejects.toThrow('Untrusted instance link')
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
})
it('rejects non-directory pack roots and linked instance roots', async () => {
  await rm(join(path, 'resourcepacks'), { recursive: true }); await writeFile(join(path, 'resourcepacks'), 'FILE')
  await expect(readResourcePackFilesSnapshot(path, root, configuration)).rejects.toThrow('Unsafe resource pack directory')
  const linked = join(root, 'linked'); await symlink(path, linked, 'junction')
  await expect(readResourcePackFilesSnapshot(linked, root, configuration)).rejects.toThrow('Unsafe instance source')
})
it('rejects oversized inventory before inspecting individual entries', async () => {
  vi.mocked(readdir).mockResolvedValueOnce(Array(10001).fill('unused') as never)
  await expect(readResourcePackFilesSnapshot(path, root, configuration)).rejects.toThrow('Too many resource packs')
})

it('rejects a root replaced during inventory without adopting its new authority', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(readdir).mockImplementationOnce(async () => {
    await rename(join(path, 'resourcepacks'), join(path, 'previous'))
    await mkdir(join(path, 'resourcepacks')); await writeFile(join(path, 'resourcepacks/a.zip'), 'PACK')
    return actual.readdir(join(path, 'resourcepacks')) as never
  })
  await expect(readResourcePackFilesSnapshot(path, root, configuration)).rejects.toHaveProperty('name', 'ModFilesChangedError')
  expect(await readFile(join(path, 'previous/a.zip'), 'utf8')).toBe('PACK')
})
