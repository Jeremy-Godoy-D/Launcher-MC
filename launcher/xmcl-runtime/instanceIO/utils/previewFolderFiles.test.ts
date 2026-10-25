import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { previewFolderFiles } from './previewFolderFiles'

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
    expect(files).toEqual([{ path: 'saves/world/level.dat', size: 14, hashes: { sha1: createHash('sha1').update('world sentinel').digest('hex'), sha256: createHash('sha256').update('world sentinel').digest('hex') }, downloads: [pathToFileURL(join(dir, 'saves', 'world', 'level.dat')).href] }])
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
})
