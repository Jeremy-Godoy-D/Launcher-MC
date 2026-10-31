import { describe, expect, it, vi } from 'vitest'
import type { ModpackState } from '@xmcl/runtime-api/src/services/ModpackService'
import type { VersionMetadataService } from '@xmcl/runtime-api/src/services/VersionMetadataService'
import {
  CreationSession,
  creationOptions,
  importedOptions,
  loaderVersions,
  validInstanceName,
  validateImportFiles,
  advancedOptions, defaultAdvanced, importUrl, readLinkPreferences,
} from './creation'

describe('Java instance creation', () => {
  it('accepts only explicit HTTPS archive URLs without credentials, fragments or controls', () => {
    expect(importUrl(' https://example.com/pack.mrpack?version=2 ')).toBe('https://example.com/pack.mrpack?version=2')
    for (const value of ['http://example.com/a', 'file:///C:/a', 'javascript:alert(1)', 'https://user:pass@example.com/a', 'https://example.com/a#part', 'https://exa\nmple.com', 'https://example.com/' + 'a'.repeat(4096), '']) expect(() => importUrl(value)).toThrow()
  })
  it('validates manual memory without importing executable arguments', () => {
    expect(advancedOptions(defaultAdvanced)).toEqual({ description: '', author: '' })
    expect(advancedOptions({ ...defaultAdvanced, memory: 'auto' })).toMatchObject({ assignMemory: 'auto' })
    expect(advancedOptions({ ...defaultAdvanced, memory: 'manual', min: '1024', max: '4096', java: 'C:/java/bin/javaw.exe' })).toMatchObject({ assignMemory: true, minMemory: 1024, maxMemory: 4096, java: 'C:/java/bin/javaw.exe' })
    for (const [min, max] of [['4096', '1024'], ['', ''], ['0', '0'], ['-1', '2048'], ['', '1.5'], ['', 'Infinity'], ['', '9007199254740992']]) expect(() => advancedOptions({ ...defaultAdvanced, memory: 'manual', min, max })).toThrow()
    expect(() => advancedOptions({ ...defaultAdvanced, java: 'bad\njava' })).toThrow()
  })
  it('reads legacy link preferences without overwriting unavailable or newer storage', () => {
    const read = (value: string | null) => readLinkPreferences(() => ({ getItem: () => value }))
    expect(read(null)).toMatchObject({ error: false, writable: true, preferences: { saves: false } })
    expect(read('{"saves":true,"options":"true"}')).toMatchObject({ preferences: { version: 1, saves: true, options: false } })
    for (const value of ['{', 'null', '[]', '{"version":2,"saves":true}']) expect(read(value)).toMatchObject({ error: true, writable: false, preferences: { saves: false } })
    expect(readLinkPreferences(() => { throw new Error('storage disabled') })).toMatchObject({ error: true, writable: false })
  })
  it('retries failed shared setup in the retained instance and never repeats successful setup', async () => {
    const createInstance = vi.fn().mockResolvedValue('C:/retained')
    const installs = { stageInstanceFiles: vi.fn(), applyInstanceInstallManifest: vi.fn(), resumeInstanceInstall: vi.fn() }
    const session = new CreationSession({ createInstance }, installs)
    const setup = vi.fn().mockRejectedValueOnce(new Error('link failed')).mockResolvedValue(undefined)
    const options = creationOptions('World', '1.21.1', 'Vanilla', '')
    await expect(session.run(options, [], undefined, setup)).rejects.toThrow('link failed')
    expect(session.path).toBe('C:/retained')
    await session.run(options, [], undefined, setup)
    await session.run(options, [], undefined, setup)
    expect(createInstance).toHaveBeenCalledTimes(1)
    expect(setup.mock.calls).toEqual([['C:/retained'], ['C:/retained']])
  })
  it('validates names and creates only an explicit Java runtime', () => {
    for (const name of ['My world', 'Aventura_2', 'Un mundo español'])
      expect(validInstanceName(name)).toBe(true)
    for (const name of [
      '',
      '../world',
      'NUL',
      'COM1.txt',
      'a\nb',
      'a\u0000b',
      'x'.repeat(101),
      'world.',
    ])
      expect(validInstanceName(name)).toBe(false)
    expect(creationOptions('World', '1.21.1', 'Fabric', '0.16.0')).toEqual({
      name: 'World',
      edition: 'java',
      runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0' },
    })
    expect(() => creationOptions('World', '', 'Vanilla', '')).toThrow()
    expect(() => creationOptions('World', '../outside', 'Vanilla', '')).toThrow()
    expect(() => creationOptions('World', '1.21.1', 'Forge', '')).toThrow()
  })
  it('does not copy archive commands, paths, Java, JVM arguments or account settings', () => {
    const config = {
      name: 'Pack',
      runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0' },
      path: 'C:/outside',
      java: 'evil.exe',
      preExecuteCommand: 'malicious',
      vmOptions: ['-javaagent:evil.jar'],
      mcOptions: ['--token=private'],
      disableAuthlibInjector: true,
      upstream: { type: 'peer', id: 'external' },
    } as ModpackState['config']
    const safe = importedOptions(config, 'My pack')
    expect(safe).toMatchObject({
      name: 'My pack',
      edition: 'java',
      runtime: { minecraft: '1.21.1', fabricLoader: '0.16.0' },
    })
    for (const key of [
      'path',
      'java',
      'preExecuteCommand',
      'vmOptions',
      'mcOptions',
      'disableAuthlibInjector',
      'upstream',
    ])
      expect(safe).not.toHaveProperty(key)
    expect(() => importedOptions({ ...config, edition: 'bedrock' }, 'Pack')).toThrow()
    expect(() => importedOptions({ ...config, version: '../../outside' }, 'Pack')).toThrow()
    expect(() =>
      importedOptions({ ...config, runtime: { minecraft: '../outside' } }, 'Pack'),
    ).toThrow()
  })
  it('rejects traversal, absolute, control, reserved metadata and colliding file targets before creation', () => {
    const file = (path: string) => ({ path, hashes: {} })
    for (const path of [
      '../outside',
      '/outside',
      'C:\\outside',
      'mods/../../outside',
      '.install/a',
      '.install-manifest',
      'INSTANCE.JSON',
      'a\u0000b',
      'mods//a.jar',
      'mods/a.',
      'mods/NUL.jar',
      'CON/config.json',
    ])
      expect(() => validateImportFiles([file(path)])).toThrow()
    expect(() => validateImportFiles([file('mods/A.jar'), file('mods/a.jar')])).toThrow()
    expect(() =>
      validateImportFiles([file('mods/good.jar'), file('config/settings.json')]),
    ).not.toThrow()
  })
  it('stages before installing and retries on the retained path, including failures before native apply begins', async () => {
    const createInstance = vi.fn().mockResolvedValue('C:/new-world')
    const stageInstanceFiles = vi.fn().mockResolvedValue({})
    const applyInstanceInstallManifest = vi
      .fn()
      .mockRejectedValueOnce(new Error('native failure'))
      .mockResolvedValue(undefined)
    const resumeInstanceInstall = vi.fn().mockResolvedValue(undefined)
    const session = new CreationSession(
      { createInstance },
      { stageInstanceFiles, applyInstanceInstallManifest, resumeInstanceInstall },
    )
    const payload = creationOptions('Pack', '1.21.1', 'Vanilla', '')
    const files = [{ path: 'config/example.txt', hashes: {} }]
    const onCreated = vi.fn()
    await expect(session.run(payload, files, onCreated)).rejects.toThrow('native failure')
    expect(onCreated).toHaveBeenCalledWith('C:/new-world')
    expect(stageInstanceFiles.mock.invocationCallOrder[0]).toBeLessThan(
      applyInstanceInstallManifest.mock.invocationCallOrder[0],
    )
    expect(await session.run(payload, files)).toBe('C:/new-world')
    expect(createInstance).toHaveBeenCalledTimes(1)
    expect(stageInstanceFiles).toHaveBeenCalledTimes(1)
    expect(resumeInstanceInstall).toHaveBeenCalledTimes(2)
    resumeInstanceInstall.mockResolvedValueOnce([{ name: 'ChecksumNotMatchError' }])
    await expect(session.run(payload, files)).rejects.toThrow('integrity')
    expect(applyInstanceInstallManifest).toHaveBeenCalledTimes(2)
    expect(createInstance).toHaveBeenCalledTimes(1)
  })
  it('refuses unsafe files and concurrent requests without duplicating a native create', async () => {
    let finish!: (path: string) => void
    const createInstance = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    const installs = {
      stageInstanceFiles: vi.fn(),
      applyInstanceInstallManifest: vi.fn(),
      resumeInstanceInstall: vi.fn(),
    }
    const session = new CreationSession({ createInstance }, installs)
    const options = creationOptions('World', '1.21.1', 'Vanilla', '')
    await expect(session.run(options, [{ path: '../outside', hashes: {} }])).rejects.toThrow()
    expect(createInstance).not.toHaveBeenCalled()
    const pending = session.run(options)
    await expect(session.run(options)).rejects.toThrow('already running')
    finish('C:/new')
    expect(await pending).toBe('C:/new')
    expect(createInstance).toHaveBeenCalledTimes(1)
    expect(installs.stageInstanceFiles).not.toHaveBeenCalled()
  })
  it('loads compatible versions using every existing Java loader provider', async () => {
    const service = {
      getFabricVersions: vi
        .fn()
        .mockResolvedValue({ gameVersions: ['1.21.1'], loaderVersions: [{ version: 'fabric' }] }),
      getQuiltVersions: vi
        .fn()
        .mockResolvedValue({ gameVersions: ['1.21.1'], loaderVersions: [{ version: 'quilt' }] }),
      getForgeVersions: vi.fn().mockResolvedValue([
        { mcversion: '1.21.1', version: 'forge' },
        { mcversion: 'other', version: 'excluded' },
      ]),
      getNeoForgedVersions: vi.fn().mockResolvedValue(['neo']),
      getOptifineVersions: vi
        .fn()
        .mockResolvedValue([{ mcversion: '1.21.1', type: 'HD_U', patch: 'J1' }]),
      getLabyModManifest: vi
        .fn()
        .mockResolvedValue({ minecraftVersions: [{ tag: '1.21.1' }], labyModVersion: '4' }),
    } as unknown as VersionMetadataService
    for (const [loader, version] of [
      ['Fabric', 'fabric'],
      ['Quilt', 'quilt'],
      ['Forge', 'forge'],
      ['NeoForge', 'neo'],
      ['OptiFine', 'HD_U_J1'],
      ['LabyMod', '4'],
    ] as const)
      expect(await loaderVersions(service, loader, '1.21.1')).toEqual([version])
    expect(await loaderVersions(service, 'Vanilla', '1.21.1')).toEqual([])
    expect(await loaderVersions(service, 'Fabric', 'unknown')).toEqual([])
    expect(await loaderVersions(service, 'LabyMod', 'unknown')).toEqual([])
  })
})
