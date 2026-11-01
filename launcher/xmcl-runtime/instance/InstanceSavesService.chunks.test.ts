import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { mkdir, mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
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
    processes = []

    const app = {
      mutex: { of: vi.fn(() => new Mutex()) },
      registry: { get: async () => ({ getGameProcesses: async () => processes }) },
    }
    service = new InstanceSavesService(
      app as any,
      { initialize: async () => {}, state: { get instances() { return instances } } } as any,
      {} as any,
      () => testRoot,
      {} as any,
    )
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
