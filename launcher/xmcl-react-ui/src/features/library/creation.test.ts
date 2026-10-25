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
} from './creation'

describe('Java instance creation', () => {
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
