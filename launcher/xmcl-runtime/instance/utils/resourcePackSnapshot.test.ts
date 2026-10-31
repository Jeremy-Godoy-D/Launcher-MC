import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { RuntimeVersionsSchema } from '@xmcl/instance'
vi.mock('node:fs/promises', async original => { const actual = await original<typeof import('node:fs/promises')>(); return { ...actual, readdir: vi.fn(actual.readdir) } })
import { readResourcePackFilesSnapshot, resourcePackLocation } from './resourcePackSnapshot'

describe.each(['resourcepacks', 'shaderpacks'] as const)('%s inventory', domain => {
let root: string, path: string
const configuration = { runtime: RuntimeVersionsSchema.parse({ minecraft: '1.21.1' }), java: '', version: '' }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-pack-snapshot-')); path = join(root, 'instance')
  await mkdir(join(path, domain), { recursive: true }); await writeFile(join(path, `${domain}/a.zip`), 'PACK')
})
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }) })
it('reads a deterministic private inventory without altering files, with logical paths and configuration', async () => {
  const before = await lstat(join(path, `${domain}/a.zip`)), first = await readResourcePackFilesSnapshot(path, root, configuration, domain)
  expect(first).toMatchObject({ shared: false, configuration, entries: [{ path: join(path, `${domain}/a.zip`), fileName: 'a.zip', directory: false, size: 4 }] })
  expect(first.authority).toMatch(/^[a-f0-9]{64}$/); expect(await readResourcePackFilesSnapshot(path, root, configuration, domain)).toEqual(first)
  expect((await lstat(join(path, `${domain}/a.zip`))).mtimeMs).toBe(before.mtimeMs)
  expect(await readFile(join(path, `${domain}/a.zip`), 'utf8')).toBe('PACK')
  expect((await readResourcePackFilesSnapshot(path, root, { ...configuration, version: 'changed' }, domain)).fingerprint).not.toBe(first.fingerprint)
})
it('binds shared and private authority even when both have the same archive bytes', async () => {
  const first = await readResourcePackFilesSnapshot(path, root, configuration, domain), common = join(root, domain)
  await mkdir(common); await writeFile(join(common, 'a.zip'), 'PACK')
  await rm(join(path, domain), { recursive: true }); await symlink(common, join(path, domain), 'junction')
  const second = await readResourcePackFilesSnapshot(path, root, configuration, domain)
  expect(second.shared).toBe(true); expect(second.authority).not.toBe(first.authority); expect(second.fingerprint).not.toBe(first.fingerprint)
  expect(second.entries[0].path).toBe(join(path, `${domain}/a.zip`)); expect((await resourcePackLocation(path, root, domain)).root).toBe(await realpath(common))
})
it('includes unpacked folders in inventory but refuses links inside the pack directory', async () => {
  await mkdir(join(path, `${domain}/unpacked`)); const first = await readResourcePackFilesSnapshot(path, root, configuration, domain)
  expect(first.entries.find(entry => entry.fileName === 'unpacked')?.directory).toBe(true)
  const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
  await symlink(outside, join(path, `${domain}/foreign`), 'junction')
  await expect(readResourcePackFilesSnapshot(path, root, configuration, domain)).rejects.toThrow('Unsafe resource pack entry')
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
})
it('rejects an untrusted top-level junction without reading its contents', async () => {
  await mkdir(join(root, domain))
  const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
  await rm(join(path, domain), { recursive: true }); await symlink(outside, join(path, domain), 'junction')
  await expect(readResourcePackFilesSnapshot(path, root, configuration, domain)).rejects.toThrow('Untrusted instance link')
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
})
it('rejects non-directory pack roots and linked instance roots', async () => {
  await rm(join(path, domain), { recursive: true }); await writeFile(join(path, domain), 'FILE')
  await expect(readResourcePackFilesSnapshot(path, root, configuration, domain)).rejects.toThrow('Unsafe resource pack directory')
  const linked = join(root, 'linked'); await symlink(path, linked, 'junction')
  await expect(readResourcePackFilesSnapshot(linked, root, configuration)).rejects.toThrow('Unsafe instance source')
})
it('rejects oversized inventory before inspecting individual entries', async () => {
  vi.mocked(readdir).mockResolvedValueOnce(Array(10001).fill('unused') as never)
  await expect(readResourcePackFilesSnapshot(path, root, configuration, domain)).rejects.toThrow('Too many resource packs')
})

it('rejects a root replaced during inventory without adopting its new authority', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(readdir).mockImplementationOnce(async () => {
    await rename(join(path, domain), join(path, 'previous'))
    await mkdir(join(path, domain)); await writeFile(join(path, `${domain}/a.zip`), 'PACK')
    return actual.readdir(join(path, domain)) as never
  })
  await expect(readResourcePackFilesSnapshot(path, root, configuration, domain)).rejects.toHaveProperty('name', 'ModFilesChangedError')
  expect(await readFile(join(path, 'previous/a.zip'), 'utf8')).toBe('PACK')
})

})
