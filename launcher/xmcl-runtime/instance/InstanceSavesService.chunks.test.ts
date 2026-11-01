import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { LockKey } from '@xmcl/runtime-api'
import { mkdir, mkdtemp, rm, writeFile, readFile, symlink, rename, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/instance', () => ({ InstanceService: class {} }))
vi.mock('~/launch', () => ({ LaunchService: class {} }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/market', () => ({ kMarketProvider: Symbol('market') }))
vi.mock('~/save', async (importOriginal) => {
  const actual: any = await importOriginal()
  return {
    ...actual,
    kSaveWorker: Symbol('save'),
    deleteSaveChunks: vi.fn(),
    writeSaveChunks: vi.fn(),
  }
})
vi.mock('~/service', () => ({
  AbstractService: class { constructor(public app: any) {} get mutex() { return this.app.mutex } log() {} error() {} warn() {} },
  ExposeServiceKey: () => () => {},
  ServiceStateManager: class {},
}))

const { InstanceSavesService } = await import('./InstanceSavesService')
const { deleteSaveChunks, writeSaveChunks } = await import('~/save')

describe('InstanceSavesService chunk operations and safety', () => {
  let service: InstanceType<typeof InstanceSavesService>
  let testRoot: string
  let instancePath: string
  let savePath: string
  let processes: any[]
  let instances: any[]
  let processError: Error | undefined
  let locks: Map<string, Mutex>
  let mutexOf: ReturnType<typeof vi.fn<(key: string) => Mutex>>

  beforeEach(async () => {
    vi.clearAllMocks()
    testRoot = await mkdtemp(join(tmpdir(), 'xmcl-chunks-test-'))
    instancePath = join(testRoot, 'instance-a')
    savePath = join(instancePath, 'saves', 'WorldOne')
    await mkdir(savePath, { recursive: true })
    await writeFile(join(savePath, 'level.dat'), Buffer.from('mock-level-dat'))
    const regionDir = join(savePath, 'region')
    await mkdir(regionDir, { recursive: true })
    await writeFile(join(regionDir, 'r.0.0.mca'), Buffer.from('dummy-region-bytes-at-least-8192'.repeat(300)))

    instances = [{ path: instancePath, edition: 'java' }]
    processes = []; processError = undefined
    locks = new Map()
    mutexOf = vi.fn(key => {
      if (!locks.has(key)) locks.set(key, new Mutex())
      return locks.get(key)!
    })

    const app = {
      mutex: { of: mutexOf },
      registry: { get: async () => ({ getGameProcesses: async () => { if (processError) throw processError; return processes } }) },
    }
    service = new InstanceSavesService(
      app as any,
      { initialize: async () => {}, state: { get instances() { return instances } } } as any,
      {} as any,
      () => testRoot,
      {} as any,
    )
  })

  afterEach(async () => {
    expect(dirname(resolve(testRoot))).toBe(resolve(tmpdir()))
    expect(testRoot).toContain('xmcl-chunks-test-')
    await rm(testRoot, { recursive: true, force: true })
  })

  it.each(['registration', 'game'])('blocks writes through a parent directory alias in the %s path', async (aliasKind) => {
    const alias = join(testRoot, 'parent-alias'), physical = join(testRoot, 'physical')
    await mkdir(join(physical, 'instance', 'saves', 'WorldOne'), { recursive: true })
    await writeFile(join(physical, 'instance', 'saves', 'WorldOne', 'level.dat'), 'level')
    await symlink(physical, alias, 'junction')
    const registered = join(aliasKind === 'registration' ? alias : physical, 'instance')
    const game = join(aliasKind === 'game' ? alias : physical, 'instance')
    instances = [{ path: registered, edition: 'java' }]
    processes = [{ options: { gameDirectory: game } }]
    await expect(service.deleteSaveChunks({ savePath: join(physical, 'instance', 'saves', 'WorldOne'), dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] })).rejects.toHaveProperty('name', 'InstanceRunningError')
    expect(deleteSaveChunks).not.toHaveBeenCalled()
  })

  it('rejects a world outside registered Java instances and the owned shared depot', async () => {
    const foreign = join(testRoot, 'foreign')
    await mkdir(foreign); await writeFile(join(foreign, 'level.dat'), 'level')
    await expect(service.deleteSaveChunks({ savePath: foreign, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] })).rejects.toHaveProperty('name', 'WorldNotFoundError')
    expect(deleteSaveChunks).not.toHaveBeenCalled()
  })

  it('fails closed when game process state cannot be read', async () => {
    processError = new Error('Process state unavailable')
    await expect(service.deleteSaveChunks({ savePath, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] })).rejects.toThrow('Process state unavailable')
    expect(deleteSaveChunks).not.toHaveBeenCalled()
  })

  it('rejects dimensions and chunk coordinates that cannot identify local region files', async () => {
    for (const dimension of ['evil:../../outside', 'constructor', 'minecraft:overworld/../region']) {
      await expect(service.deleteSaveChunks({ savePath, dimension, chunks: [{ chunkX: 0, chunkZ: 0 }] })).rejects.toThrow()
    }
    for (const chunkX of [NaN, Infinity, 0.5, 2147483648]) {
      await expect(service.deleteSaveChunks({ savePath, dimension: 'minecraft:overworld', chunks: [{ chunkX, chunkZ: 0 }] })).rejects.toThrow()
    }
    expect(deleteSaveChunks).not.toHaveBeenCalled()
  })

  it('rechecks the active game and Java registration after waiting for the instance lock', async () => {
    for (const change of ['game', 'registration']) {
      instances = [{ path: instancePath, edition: 'java' }]; processes = []; mutexOf.mockClear()
      const key = LockKey.instance(instancePath), release = await mutexOf(key).acquire()
      mutexOf.mockClear()
      const pending = service.deleteSaveChunks({ savePath, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] })
      const failure = expect(pending).rejects.toHaveProperty('name', change === 'game' ? 'InstanceRunningError' : 'WorldNotFoundError')
      await vi.waitFor(() => expect(mutexOf).toHaveBeenCalledWith(key))
      if (change === 'game') processes = [{ options: { gameDirectory: instancePath } }]
      else instances = []
      release(); await failure
    }
    expect(deleteSaveChunks).not.toHaveBeenCalled()
  })

  it('rejects linked region and backup directories before any chunk mutation', async () => {
    const foreign = join(testRoot, 'foreign-regions')
    await mkdir(foreign)
    await writeFile(join(foreign, 'r.0.0.mca'), 'untouched')
    const region = join(savePath, 'region', 'r.0.0.mca'), original = join(testRoot, 'original-region')
    await rename(dirname(region), original)
    await symlink(foreign, dirname(region), 'junction')
    const input = { savePath, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0 }] }
    await expect(service.deleteSaveChunks(input)).rejects.toThrow('Unsafe install directory')
    expect(await readFile(join(foreign, 'r.0.0.mca'), 'utf8')).toBe('untouched')
    await unlink(dirname(region)); await rename(original, dirname(region)); await writeFile(region, 'local')
    await symlink(foreign, join(savePath, '.backups'), 'junction')
    await expect(service.deleteSaveChunks(input)).rejects.toThrow('Unsafe install directory')
    expect(await readFile(region, 'utf8')).toBe('local')
    expect(deleteSaveChunks).not.toHaveBeenCalled()
  })

  it('validates pasted bytes and offsets before backing up or writing regions', async () => {
    const base = { savePath, dimension: 'minecraft:overworld', chunks: [{ chunkX: 0, chunkZ: 0, compression: 2, data: Buffer.from('abc') }] }
    await expect(service.pasteSaveChunks({ ...base, offsetX: Infinity })).rejects.toThrow('Invalid chunk coordinates')
    await expect(service.pasteSaveChunks({ ...base, chunks: [{ ...base.chunks[0], compression: 128 }] })).rejects.toThrow('Invalid chunk payload')
    await expect(service.pasteSaveChunks({ ...base, chunks: [{ ...base.chunks[0], data: Buffer.alloc(255 * 4096) }] })).rejects.toThrow('Invalid chunk payload')
    expect(writeSaveChunks).not.toHaveBeenCalled()
  })

  it('rejects deleteSaveChunks if save directory does not contain level.dat', async () => {
    const invalidSave = join(testRoot, 'non-existent-save')
    await expect(service.deleteSaveChunks({
      savePath: invalidSave,
      dimension: 'minecraft:overworld',
      chunks: [{ chunkX: 0, chunkZ: 0 }],
    })).rejects.toHaveProperty('name', 'WorldNotFoundError')
  })

  it('rejects deleteSaveChunks if the instance is currently running', async () => {
    processes = [{ options: { gameDirectory: instancePath } }]
    await expect(service.deleteSaveChunks({
      savePath,
      dimension: 'minecraft:overworld',
      chunks: [{ chunkX: 0, chunkZ: 0 }],
    })).rejects.toHaveProperty('name', 'InstanceRunningError')
    expect(deleteSaveChunks).not.toHaveBeenCalled()
  })

  it('rejects deleteSaveChunks if a shared world is running in any instance', async () => {
    const sharedSavePath = join(testRoot, 'saves', 'SharedWorld')
    await mkdir(sharedSavePath, { recursive: true })
    await writeFile(join(sharedSavePath, 'level.dat'), Buffer.from('mock-level-dat'))
    processes = [{ options: { gameDirectory: join(testRoot, 'other-instance') } }]

    await expect(service.deleteSaveChunks({
      savePath: sharedSavePath,
      dimension: 'minecraft:overworld',
      chunks: [{ chunkX: 0, chunkZ: 0 }],
    })).rejects.toHaveProperty('name', 'SharedWorldRunningError')
    expect(deleteSaveChunks).not.toHaveBeenCalled()
  })

  it('creates backup in .backups/world-chunks-* and executes deleteSaveChunks when not running', async () => {
    await service.deleteSaveChunks({
      savePath,
      dimension: 'minecraft:overworld',
      chunks: [{ chunkX: 1, chunkZ: 1 }],
    })

    expect(deleteSaveChunks).toHaveBeenCalledWith(savePath, 'minecraft:overworld', [{ chunkX: 1, chunkZ: 1 }])

    // Verify backup was created
    const backupsDir = join(savePath, '.backups')
    const { readdir } = await import('fs-extra')
    const backupFolders = await readdir(backupsDir)
    expect(backupFolders.length).toBeGreaterThan(0)
    expect(backupFolders[0]).toMatch(/^world-chunks-/)
  })

  it('rejects pasteSaveChunks if the instance is running', async () => {
    processes = [{ options: { gameDirectory: instancePath } }]
    await expect(service.pasteSaveChunks({
      savePath,
      dimension: 'minecraft:overworld',
      chunks: [{ chunkX: 0, chunkZ: 0, compression: 2, data: Buffer.from('abc') }],
      offsetX: 0,
      offsetZ: 0,
    })).rejects.toHaveProperty('name', 'InstanceRunningError')
    expect(writeSaveChunks).not.toHaveBeenCalled()
  })

  it('creates backup and executes pasteSaveChunks when not running', async () => {
    await service.pasteSaveChunks({
      savePath,
      dimension: 'minecraft:overworld',
      chunks: [{ chunkX: 0, chunkZ: 0, compression: 2, data: Buffer.from('abc') }],
      offsetX: 5,
      offsetZ: 5,
    })

    expect(writeSaveChunks).toHaveBeenCalled()
    const backupsDir = join(savePath, '.backups')
    const { readdir } = await import('fs-extra')
    const backupFolders = await readdir(backupsDir)
    expect(backupFolders.length).toBeGreaterThan(0)
  })
})
