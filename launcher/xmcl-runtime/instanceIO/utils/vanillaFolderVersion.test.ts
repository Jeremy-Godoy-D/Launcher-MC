import { Version } from '@xmcl/core'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inspectVanillaFolderVersion, prepareVanillaFolderVersion } from './vanillaFolderVersion'

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex')
describe('confirmed Vanilla local version import', () => {
  let root: string, source: string, destination: string
  const refresh = vi.fn().mockResolvedValue(undefined)
  async function file(path: string, data: string) {
    const target = join(source, path); await mkdir(dirname(target), { recursive: true }); await writeFile(target, data)
  }
  async function json(id: string, value: unknown) { await file(`versions/${id}/${id}.json`, JSON.stringify(value)) }
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'grimo-vanilla-')); source = join(root, 'source'); destination = join(root, 'managed')
    await mkdir(source)
    await json('1.21.1', { id: '1.21.1', mainClass: 'net.minecraft.client.main.Main', minecraftArguments: '--username ${auth_player_name}', javaVersion: { component: 'java-runtime-delta', majorVersion: 21 }, downloads: { client: { sha1: sha1('client'), size: 6, url: 'https://example.com/client.jar' } }, libraries: [{ name: 'example:local:1', downloads: { artifact: { sha1: sha1('library'), size: 7, path: 'example/local/1/local-1.jar', url: 'https://example.com/library.jar' } } }] })
    await json('custom', { id: 'custom', inheritsFrom: '1.21.1', mainClass: 'custom.Main', libraries: [], preExecuteCommand: 'never-run', java: 'untrusted.exe', vmOptions: ['-javaagent:personal.jar'] })
    await file('versions/1.21.1/1.21.1.jar', 'client')
    await file('libraries/example/local/1/local-1.jar', 'library')
    refresh.mockClear()
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })
  it('reviews read-only, preserves inheritance/runtime and copies only referenced files with a stable private version ID', async () => {
    await file('libraries/unrelated-private.jar', 'not referenced')
    const preview = await inspectVanillaFolderVersion(source, 'custom')
    expect(preview?.runtime.minecraft).toBe('1.21.1')
    expect(await readdir(root)).toEqual(['source'])
    const id = await prepareVanillaFolderVersion(source, 'custom', preview!.fingerprint, destination, refresh)
    expect(id).toMatch(/^vanilla-custom-[a-f0-9]{16}$/)
    const version = await Version.parse(destination, id)
    expect(version.mainClass).toBe('custom.Main')
    expect(version.minecraftVersion).toBe('1.21.1')
    expect(version.javaVersion.majorVersion).toBe(21)
    expect(version.inheritances).toHaveLength(2)
    expect(version.clientJar).toMatch(/^\.client-/)
    expect(await readFile(join(destination, `versions/${version.clientJar}/${version.clientJar}.jar`), 'utf8')).toBe('client')
    const body = await readFile(join(destination, `versions/${id}/${id}.json`), 'utf8')
    for (const privateValue of ['never-run', 'untrusted.exe', 'personal.jar']) expect(body).not.toContain(privateValue)
    expect(await readdir(join(destination, 'libraries'))).toEqual(['example'])
    expect(await prepareVanillaFolderVersion(source, 'custom', preview!.fingerprint, destination, refresh)).toBe(id)
    await writeFile(join(destination, 'libraries/example/local/1/local-1.jar'), 'changed')
    expect(await readFile(join(source, 'libraries/example/local/1/local-1.jar'), 'utf8')).toBe('library')
  })
  it('detects changes before publication and leaves conflicting existing clients/libraries untouched', async () => {
    const preview = await inspectVanillaFolderVersion(source, 'custom')
    await json('custom', { id: 'custom', inheritsFrom: '1.21.1', mainClass: 'changed.Main', libraries: [] })
    await expect(prepareVanillaFolderVersion(source, 'custom', preview!.fingerprint, destination, refresh)).rejects.toThrow('source changed')
    expect(await readdir(root)).toEqual(['source'])
    const current = await inspectVanillaFolderVersion(source, 'custom')
    const client = current!.client.id
    await mkdir(join(destination, `versions/${client}`), { recursive: true })
    await writeFile(join(destination, `versions/${client}/${client}.jar`), 'keep existing')
    await expect(prepareVanillaFolderVersion(source, 'custom', current!.fingerprint, destination, refresh)).rejects.toThrow('conflicts')
    expect(await readFile(join(destination, `versions/${client}/${client}.jar`), 'utf8')).toBe('keep existing')
    expect(await readdir(join(destination, 'versions'))).toEqual([client])
    expect(refresh).not.toHaveBeenCalled()
  })
  it('accepts ordinary uncached versions without creating a speculative local version', async () => {
    expect(await inspectVanillaFolderVersion(source, '1.20.4')).toBeUndefined()
    expect(await readdir(root)).toEqual(['source'])
  })
  it('supports an offline legacy client and a compatible JAR alias without overwriting a base version JSON', async () => {
    await json('legacy', { id: 'legacy', mainClass: 'legacy.Main', minecraftArguments: '--username ${auth_player_name}', libraries: [] })
    await file('versions/legacy/legacy.jar', 'legacy client')
    const preview = await inspectVanillaFolderVersion(source, 'legacy')
    const id = await prepareVanillaFolderVersion(source, 'legacy', preview!.fingerprint, destination, refresh)
    const resolved = await Version.parse(destination, id)
    expect(resolved.minecraftVersion).toBe('legacy')
    expect(await readFile(join(destination, `versions/${resolved.clientJar}/${resolved.clientJar}.jar`), 'utf8')).toBe('legacy client')
    expect(await readdir(join(destination, 'versions'))).not.toContain('legacy')
    await json('custom', { id: 'custom', inheritsFrom: '1.21.1', jar: 'alias', libraries: [] })
    await file('versions/alias/alias.jar', 'client')
    expect((await inspectVanillaFolderVersion(source, 'custom'))?.client.data?.toString()).toBe('client')
  })
  it('isolates a modified client alias while preserving an existing official client', async () => {
    await json('custom', { id: 'custom', inheritsFrom: '1.21.1', jar: 'alias', libraries: [] })
    await file('versions/alias/alias.jar', 'modified client')
    await mkdir(join(destination, 'versions/1.21.1'), { recursive: true })
    await writeFile(join(destination, 'versions/1.21.1/1.21.1.jar'), 'keep official client')
    const preview = await inspectVanillaFolderVersion(source, 'custom')
    const id = await prepareVanillaFolderVersion(source, 'custom', preview!.fingerprint, destination, refresh)
    const version = await Version.parse(destination, id)
    expect(version.minecraftVersion).toBe('1.21.1')
    expect(await readFile(join(destination, `versions/${version.clientJar}/${version.clientJar}.jar`), 'utf8')).toBe('modified client')
    expect(await readFile(join(destination, 'versions/1.21.1/1.21.1.jar'), 'utf8')).toBe('keep official client')
    expect(version.downloads.client?.sha1).toBe(sha1('modified client'))
    expect(version.downloads.client?.url).toBe('')
  })
  it.each(['cycle', 'missing', 'path', 'url', 'hash', 'jar-cycle', 'prototype'])('rejects invalid %s graphs before any write', async kind => {
    if (kind === 'cycle') await json('1.21.1', { id: '1.21.1', inheritsFrom: 'custom' })
    if (kind === 'missing') await json('custom', { id: 'custom', inheritsFrom: 'missing' })
    if (kind === 'path') await json('custom', { id: 'custom', inheritsFrom: '../outside' })
    if (kind === 'url') await json('custom', { id: 'custom', inheritsFrom: '1.21.1', downloads: { client: { url: 'file:///private' } } })
    if (kind === 'hash') await file('libraries/example/local/1/local-1.jar', 'tampered')
    if (kind === 'jar-cycle') { await json('custom', { id: 'custom', inheritsFrom: '1.21.1', jar: 'alias' }); await json('alias', { id: 'alias', jar: 'custom' }) }
    if (kind === 'prototype') await json('custom', JSON.parse('{"id":"custom","inheritsFrom":"1.21.1","downloads":{"__proto__":{"client":{"url":"https://example.com/client.jar"}}}}'))
    await expect(inspectVanillaFolderVersion(source, 'custom')).rejects.toThrow()
    expect(await readdir(root)).toEqual(['source'])
  })
  it('does not follow a linked version directory or scan a drive root', async () => {
    await expect(inspectVanillaFolderVersion(parse(source).root, 'custom')).rejects.toThrow()
    await expect(inspectVanillaFolderVersion(parse(source).root.replaceAll('\\', '/'), 'custom')).rejects.toThrow()
    await mkdir(join(root, 'external'))
    await symlink(join(root, 'external'), join(source, 'versions/linked'), 'junction')
    await expect(inspectVanillaFolderVersion(source, 'linked')).rejects.toThrow('Unsafe')
  })
})
