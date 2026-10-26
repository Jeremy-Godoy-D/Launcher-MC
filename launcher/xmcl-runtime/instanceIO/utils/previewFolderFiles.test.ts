import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import { createReadStream } from 'node:fs'
import { previewFolderFiles } from './previewFolderFiles'

vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>()
  return { ...fs, createReadStream: vi.fn(fs.createReadStream) }
})

describe('read-only folder import preview', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'grimo-folder-preview-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
  it('pins source bytes, excludes launcher credentials/caches and does not modify the source', async () => {
    await mkdir(join(dir, 'saves', 'world'), { recursive: true })
    await writeFile(join(dir, 'saves', 'world', 'level.dat'), 'world sentinel')
    for (const path of ['launcher_accounts.json', 'instance.json', '.install-manifest']) await writeFile(join(dir, path), 'private')
    await mkdir(join(dir, 'libraries')); await writeFile(join(dir, 'libraries', 'cache.jar'), 'cache')
    const files = await previewFolderFiles(dir)
    expect(files).toEqual([{ path: 'saves/world/level.dat', size: 14, hashes: { sha1: createHash('sha1').update('world sentinel').digest('hex'), sha256: createHash('sha256').update('world sentinel').digest('hex') }, downloads: [pathToFileURL(await realpath(join(dir, 'saves', 'world', 'level.dat'))).href] }])
    expect(await readFile(join(dir, 'launcher_accounts.json'), 'utf8')).toBe('private')
    expect(await readFile(join(dir, 'saves', 'world', 'level.dat'), 'utf8')).toBe('world sentinel')
  })
  it('flattens the Prism game directory without including launcher configuration', async () => {
    await mkdir(join(dir, '.minecraft'))
    await writeFile(join(dir, 'instance.cfg'), 'name=Prism')
    await writeFile(join(dir, 'mmc-pack.json'), JSON.stringify({ formatVersion: 1, components: [{ uid: 'net.minecraft', version: '1.21.1' }] }))
    await writeFile(join(dir, '.minecraft', 'options.txt'), 'setting')
    expect((await previewFolderFiles(dir, 'prism')).map(file => file.path)).toEqual(['options.txt'])
    await mkdir(join(dir, 'patches'))
    await writeFile(join(dir, 'patches', 'custom.json'), JSON.stringify({ uid: 'net.minecraft', mainClass: 'custom.Main' }))
    expect((await previewFolderFiles(dir, 'prism')).map(file => file.path)).toEqual(['options.txt'])
  })
  it('refuses relative paths, drive roots, symlink sources and nested junctions', async () => {
    await expect(previewFolderFiles('.')).rejects.toThrow()
    await expect(previewFolderFiles(parse(dir).root)).rejects.toThrow()
    await mkdir(join(dir, 'original'))
    await symlink(join(dir, 'original'), join(dir, 'linked'), 'junction')
    await expect(previewFolderFiles(join(dir, 'linked'))).rejects.toThrow('link')
    await expect(previewFolderFiles(dir)).rejects.toThrow('link')
  })
  it('does not confuse a valid dot-prefixed filename with traversal', async () => {
    await writeFile(join(dir, '..cache'), 'safe')
    expect((await previewFolderFiles(dir))[0].path).toBe('..cache')
  })
  it('aborts an in-flight hash stream and closes it before rejecting the review', async () => {
    const native = await vi.importActual<typeof import('node:fs')>('node:fs')
    await writeFile(join(dir, 'large.jar'), Buffer.alloc(8 * 1024 * 1024))
    const controller = new AbortController()
    let stream: ReturnType<typeof createReadStream> | undefined
    vi.mocked(createReadStream).mockImplementationOnce((...args) => {
      stream = native.createReadStream(...args)
      stream.once('data', () => controller.abort())
      return stream
    })
    await expect(previewFolderFiles(dir, undefined, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(stream?.closed).toBe(true))
    expect(stream?.destroyed).toBe(true)
    expect(stream?.bytesRead).toBeLessThan(8 * 1024 * 1024)
    await expect(previewFolderFiles(dir, undefined, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('accepts only the native shared folders while external imports still reject the same links', async () => {
    const instance = join(dir, 'instance'), shared = join(dir, 'data')
    await mkdir(instance)
    for (const name of ['saves', 'resourcepacks', 'shaderpacks']) {
      await mkdir(join(shared, name), { recursive: true }); await writeFile(join(shared, name, 'sentinel.txt'), name)
      await symlink(join(shared, name), join(instance, name), 'junction')
    }
    await expect(previewFolderFiles(instance)).rejects.toThrow('link')
    const result = await previewFolderFiles(instance, undefined, { sharedRoot: shared })
    expect(result.map(file => file.path)).toEqual(['resourcepacks/sentinel.txt', 'saves/sentinel.txt', 'shaderpacks/sentinel.txt'])
    expect(result[0].downloads).toEqual([pathToFileURL(await realpath(join(shared, 'resourcepacks/sentinel.txt'))).href])
    await mkdir(join(shared, 'accounts'))
    await symlink(join(shared, 'accounts'), join(instance, 'config'), 'junction')
    await expect(previewFolderFiles(instance, undefined, { sharedRoot: shared })).rejects.toThrow('link')
  })
  it('rejects redirected shared roots and nested junctions even under a trusted shared directory', async () => {
    const instance = join(dir, 'instance'), shared = join(dir, 'data'), outside = join(dir, 'outside')
    await mkdir(instance); await mkdir(shared); await mkdir(outside)
    await symlink(outside, join(shared, 'saves'), 'junction'); await symlink(outside, join(instance, 'saves'), 'junction')
    await expect(previewFolderFiles(instance, undefined, { sharedRoot: shared })).rejects.toThrow('link')
    await rm(join(shared, 'saves')); await rm(join(instance, 'saves'))
    await mkdir(join(shared, 'saves')); await symlink(join(shared, 'saves'), join(instance, 'saves'), 'junction')
    await symlink(outside, join(shared, 'saves', 'nested'), 'junction')
    await expect(previewFolderFiles(instance, undefined, { sharedRoot: shared })).rejects.toThrow('link')
  })
  it.skipIf(process.platform !== 'win32')('matches the Windows casing of a native shared-folder link', async () => {
    const instance = join(dir, 'instance'), shared = join(dir, 'data')
    await mkdir(instance); await mkdir(join(shared, 'saves'), { recursive: true })
    await writeFile(join(shared, 'saves/world.dat'), 'case-sentinel')
    await symlink(join(shared, 'saves'), join(instance, 'SAVES'), 'junction')
    expect((await previewFolderFiles(instance, undefined, { sharedRoot: shared })).map(file => file.path)).toEqual(['SAVES/world.dat'])
  })
})
