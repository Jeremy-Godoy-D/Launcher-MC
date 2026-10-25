import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inspectPrismFolderVersion, preparePrismFolderVersion } from './prismFolderVersion'
import { writeImmutableImportFiles } from '../../util/importFile'

describe('confirmed Prism standalone import', () => {
  let root: string, source: string, destination: string
  const refresh = vi.fn().mockResolvedValue(undefined)
  const localPath = 'libraries/example/local/1/local-1.jar'
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'grimo-prism-'))
    source = join(root, 'source'); destination = join(root, 'managed')
    await mkdir(join(source, '.minecraft'), { recursive: true })
    await mkdir(join(source, 'patches'))
    await mkdir(join(source, 'libraries'))
    await writeFile(join(source, 'instance.cfg'), 'name=Prism\nJvmArgs=-javaagent:personal.jar\nJavaPath=untrusted.exe\nOverrideCommands=true\nPreLaunchCommand=never-run')
    await writeFile(join(source, 'mmc-pack.json'), JSON.stringify({ formatVersion: 1, components: [{ uid: 'net.minecraft', version: '1.7.10' }] }))
    await writeFile(join(source, 'patches', 'net.minecraft.json'), JSON.stringify({ uid: 'net.minecraft', mainClass: 'custom.Main', minecraftArguments: '--username ${auth_player_name}', '+jvmArgs': ['--add-opens=java.base/java.lang=ALL-UNNAMED'], '+tweakers': ['custom.Tweaker'], compatibleJavaMajors: [17, 21], mainJar: { downloads: { artifact: { url: 'https://example.com/client.jar', sha1: 'a'.repeat(40), size: 10 } } }, libraries: [{ name: 'example:local:1', 'MMC-hint': 'local' }] }))
    await writeFile(join(source, 'libraries', 'local-1.jar'), 'original-library')
    refresh.mockClear()
  })
  afterEach(async () => { await rm(root, { recursive: true, force: true }) })
  it('reviews without writes, confirms stable pinned metadata and preserves required patch arguments only', async () => {
    const preview = await inspectPrismFolderVersion(source)
    expect(await readdir(root)).toEqual(['source'])
    const id = await preparePrismFolderVersion(source, 'My pack', preview!.fingerprint, destination, refresh)
    expect(id).toMatch(/^mmc-My pack-[a-f0-9]{16}$/)
    const bytes = await readFile(join(destination, 'versions', id!, `${id}.json`), 'utf8')
    const version = JSON.parse(bytes)
    expect(version.mainClass).toBe('custom.Main')
    expect(version.javaVersion.majorVersion).toBe(17)
    expect(version.arguments.game).toEqual(['--username', '${auth_player_name}', '--tweakClass', 'custom.Tweaker'])
    expect(version.arguments.jvm).toContain('${classpath}')
    expect(version.arguments.jvm).toContain('--add-opens=java.base/java.lang=ALL-UNNAMED')
    for (const untrusted of ['personal.jar', 'untrusted.exe', 'never-run']) expect(bytes).not.toContain(untrusted)
    expect(await readFile(join(destination, localPath), 'utf8')).toBe('original-library')
    expect(await preparePrismFolderVersion(source, 'My pack', preview!.fingerprint, destination, refresh)).toBe(id)
    await writeFile(join(destination, localPath), 'changed destination')
    expect(await readFile(join(source, 'libraries', 'local-1.jar'), 'utf8')).toBe('original-library')
    expect(refresh).toHaveBeenCalledTimes(2)
  })
  it('rejects stale metadata or changed source jars before publishing any version', async () => {
    const preview = await inspectPrismFolderVersion(source)
    await writeFile(join(source, 'libraries', 'local-1.jar'), 'changed library')
    await expect(preparePrismFolderVersion(source, 'Pack', preview!.fingerprint, destination, refresh)).rejects.toThrow('source changed')
    expect(await readdir(root)).toEqual(['source'])
    const updated = await inspectPrismFolderVersion(source)
    await writeFile(join(source, 'instance.cfg'), 'name=Changed')
    await expect(preparePrismFolderVersion(source, 'Pack', updated!.fingerprint, destination, refresh)).rejects.toThrow('source changed')
    expect(refresh).not.toHaveBeenCalled()
  })
  it('never overwrites a conflicting library, including when another new library would have preceded it', async () => {
    await mkdir(join(destination, 'libraries', 'example', 'local', '1'), { recursive: true })
    await writeFile(join(destination, localPath), 'keep existing')
    const before = createHash('sha256').update(await readFile(join(destination, localPath))).digest('hex')
    const preview = await inspectPrismFolderVersion(source)
    await expect(preparePrismFolderVersion(source, 'Pack', preview!.fingerprint, destination, refresh)).rejects.toThrow('conflicts')
    await expect(writeImmutableImportFiles(destination, [{ path: 'libraries/new.jar', data: Buffer.from('new') }, { path: localPath, data: Buffer.from('different') }])).rejects.toThrow('conflicts')
    expect(await readdir(join(destination, 'libraries'))).toEqual(['example'])
    expect(createHash('sha256').update(await readFile(join(destination, localPath))).digest('hex')).toBe(before)
    expect(refresh).not.toHaveBeenCalled()
  })
  it('rejects linked source metadata/library directories and incomplete patch sets', async () => {
    await mkdir(join(root, 'elsewhere'))
    await mkdir(join(root, 'linked'))
    await symlink(join(root, 'elsewhere'), join(root, 'linked', 'patches'), 'junction')
    await mkdir(join(root, 'linked', '.minecraft'))
    await writeFile(join(root, 'linked', 'mmc-pack.json'), await readFile(join(source, 'mmc-pack.json')))
    await expect(inspectPrismFolderVersion(join(root, 'linked'))).rejects.toThrow('patches directory')
    await writeFile(join(source, 'patches', 'net.minecraft.json'), JSON.stringify({ uid: 'net.minecraft', mainClass: 'incomplete.Main' }))
    await expect(inspectPrismFolderVersion(source)).rejects.toThrow('complete standalone')
  })
  it('does not follow destination junctions or accept traversal, devices and concurrent replacement', async () => {
    await mkdir(destination)
    await mkdir(join(root, 'outside'))
    await symlink(join(root, 'outside'), join(destination, 'libraries'), 'junction')
    await expect(writeImmutableImportFiles(destination, [{ path: 'libraries/leak.jar', data: Buffer.from('no') }])).rejects.toThrow('Unsafe')
    expect(await readdir(join(root, 'outside'))).toEqual([])
    for (const path of ['../outside', 'versions/CON.json', 'C:/outside', 'libraries/a\\b']) await expect(writeImmutableImportFiles(destination, [{ path, data: Buffer.from('no') }])).rejects.toThrow('path')
    await Promise.all([1, 2].map(() => writeImmutableImportFiles(destination, [{ path: 'versions/new/new.json', data: Buffer.from('same') }])))
    expect(await readdir(join(destination, 'versions', 'new'))).toEqual(['new.json'])
  })
  it('refuses a linked source library directory', async () => {
    await rename(join(source, 'libraries'), join(root, 'external-libraries'))
    await symlink(join(root, 'external-libraries'), join(source, 'libraries'), 'junction')
    await expect(inspectPrismFolderVersion(source)).rejects.toThrow('Unsafe')
    expect(await readdir(root)).toEqual(['external-libraries', 'source'])
  })
  it.each(['asset', 'url', 'argument', 'order', 'checksum'])('rejects unsafe %s metadata before confirmation', async kind => {
    const file = join(source, 'patches', 'net.minecraft.json')
    const patch = JSON.parse(await readFile(file, 'utf8'))
    if (kind === 'asset') patch.assetIndex = { id: '../outside', url: 'https://example.com/assets.json' }
    if (kind === 'url') patch.mainJar.downloads.artifact.url = 'file:///C:/private'
    if (kind === 'argument') patch['+jvmArgs'] = [{ value: 'invalid' }]
    if (kind === 'order') patch.order = 'invalid'
    if (kind === 'checksum') patch.libraries[0].downloads = { artifact: { sha1: '0'.repeat(40) } }
    await writeFile(file, JSON.stringify(patch))
    await expect(inspectPrismFolderVersion(source)).rejects.toThrow()
    expect(await readdir(root)).toEqual(['source'])
  })
})
