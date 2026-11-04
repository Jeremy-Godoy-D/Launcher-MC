import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Mutex } from 'async-mutex'
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { rename } from 'fs-extra'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), kGameDataPath: Symbol('data') }))
vi.mock('~/instance', () => ({ InstanceService: class {} }))
vi.mock('~/launch', () => ({ LaunchService: class {} }))
vi.mock('~/resource', () => ({ kResourceManager: Symbol('resources') }))
vi.mock('~/market', () => ({ kMarketProvider: Symbol('market') }))
vi.mock('~/save', () => ({ kSaveWorker: Symbol('save') }))
vi.mock('~/service', async () => ({ AbstractService: (await import('../service/Service')).AbstractService, ExposeServiceKey: () => () => {}, ServiceStateManager: class {} }))
vi.mock('node:fs/promises', async original => { const fs = await original<typeof import('node:fs/promises')>(); return { ...fs, copyFile: vi.fn(fs.copyFile) } })
vi.mock('fs-extra', async original => { const fs = await original<any>(); return { ...fs.default, ...fs, rename: vi.fn(fs.rename) } })
const { InstanceSavesService } = await import('./InstanceSavesService')
let root: string, logger: { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> }, processes: any[], app: any
const sessions: { verify: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }[] = []
const service = () => new InstanceSavesService(app, {} as any, (...parts) => join(root, ...parts), {} as any)
async function world(name: string, value = name) { const path = join(root, 'shared-saves', name); await mkdir(path, { recursive: true }); await writeFile(join(path, 'level.dat'), value); return path }
beforeEach(async () => {
  root = await mkdtemp(join(process.cwd(), '.world-init-test-')); processes = []; sessions.length = 0
  logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const locks = new Map<string, Mutex>()
  app = { getLogger: () => logger, mutex: { of: (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! } }, registry: { get: async () => ({ getGameProcesses: async () => processes }) }, acquireWorldLock: vi.fn(async () => { const lock = { verify: vi.fn(async () => {}), release: vi.fn() }; sessions.push(lock); return lock }) }
  vi.mocked(copyFile).mockClear(); vi.mocked(rename).mockClear()
})
afterEach(async () => { vi.restoreAllMocks(); expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.world-init-test-'); await rm(root, { recursive: true, force: true }) })

it('never deletes old archives by access time and does not require resource-cache initialization', async () => {
  await mkdir(join(root, 'saves')); const archive = join(root, 'saves/old.zip'); await writeFile(archive, 'KEEP')
  await utimes(archive, new Date(0), new Date(0)); await service().initialize()
  expect(await readFile(archive, 'utf8')).toBe('KEEP'); expect(logger.error).not.toHaveBeenCalled(); expect(app.acquireWorldLock).not.toHaveBeenCalled()
})
it('validates the configured data root before creating a worlds directory through a junction', async () => {
  const foreign = join(root, 'foreign'), alias = join(root, 'alias'); await mkdir(foreign); await symlink(foreign, alias, 'junction')
  await new InstanceSavesService(app, {} as any, (...parts) => join(alias, ...parts), {} as any).initialize()
  expect(logger.error).toHaveBeenCalled(); expect(await readdir(foreign)).toEqual([])
})
it('copies legacy worlds and notes independently, preserves collisions and archives all originals', async () => {
  const source = await world('World'), hidden = await world('.Hidden')
  await writeFile(join(root, 'shared-saves/note.txt'), 'NOTE')
  await mkdir(join(root, 'saves/World'), { recursive: true }); await writeFile(join(root, 'saves/World/level.dat'), 'OCCUPIED')
  await service().initialize()
  expect(logger.error).not.toHaveBeenCalled(); expect(await readFile(join(root, 'saves/World/level.dat'), 'utf8')).toBe('OCCUPIED')
  expect(await readFile(join(root, 'saves/World (1)/level.dat'), 'utf8')).toBe('World')
  expect(await readFile(join(root, 'saves/.Hidden/level.dat'), 'utf8')).toBe('.Hidden'); expect(await readFile(join(root, 'saves/note.txt'), 'utf8')).toBe('NOTE')
  await expect(lstat(join(root, 'shared-saves'))).rejects.toHaveProperty('code', 'ENOENT')
  const [folder] = await readdir(join(root, '.backups')), backup = join(root, '.backups', folder, 'shared-saves')
  expect(await readFile(join(backup, 'World/level.dat'), 'utf8')).toBe('World')
  expect((await lstat(join(backup, 'World/level.dat'), { bigint: true })).ino).not.toBe((await lstat(join(root, 'saves/World (1)/level.dat'), { bigint: true })).ino)
  expect(sessions).toHaveLength(2); expect(sessions.every(lock => lock.release.mock.calls.length === 1)).toBe(true)
  expect(app.acquireWorldLock.mock.calls.map((call: string[]) => call[0]).sort()).toEqual([source, hidden].sort())
})
it('keeps source data and complete copies after interruption and reuses those copies on restart', async () => {
  await world('A'); await world('B')
  vi.mocked(copyFile).mockRejectedValueOnce(new Error('COPY FAILED'))
  await service().initialize()
  expect(logger.error).toHaveBeenCalled(); expect(await readFile(join(root, 'shared-saves/A/level.dat'), 'utf8')).toBe('A')
  await service().initialize()
  expect(await readFile(join(root, 'saves/A (1)/level.dat'), 'utf8')).toBe('A')
  expect(await readFile(join(root, 'saves/B/level.dat'), 'utf8')).toBe('B')
  expect((await readdir(join(root, '.backups')))).toHaveLength(1)
})
it('does not duplicate complete copies after an archival failure and a restart', async () => {
  await world('A'); await world('B'); vi.mocked(rename).mockRejectedValueOnce(new Error('RENAME FAILED'))
  await service().initialize(); expect(logger.error).toHaveBeenCalled()
  expect(await readFile(join(root, 'shared-saves/A/level.dat'), 'utf8')).toBe('A')
  await service().initialize(); expect(await readdir(join(root, 'saves'))).toEqual(['A', 'B'])
  expect((await readdir(join(root, '.backups')))).toHaveLength(2)
})
it('leaves legacy worlds untouched while a game is active or a write lock is unavailable', async () => {
  const path = await world('World'); processes = [{}]
  await service().initialize(); expect(app.acquireWorldLock).not.toHaveBeenCalled(); expect(await readdir(join(root, 'saves'))).toEqual([])
  processes = []; app.acquireWorldLock.mockResolvedValueOnce(undefined)
  await service().initialize(); expect(await readFile(join(path, 'level.dat'), 'utf8')).toBe('World'); expect(await readdir(join(root, 'saves'))).toEqual([])
})
it('refuses foreign legacy junctions and nested links without reading or changing their targets', async () => {
  const foreign = join(root, 'foreign'); await mkdir(foreign); await writeFile(join(foreign, 'private'), 'KEEP')
  await symlink(foreign, join(root, 'shared-saves'), 'junction'); await service().initialize()
  expect(logger.error).toHaveBeenCalled(); expect(await readFile(join(foreign, 'private'), 'utf8')).toBe('KEEP')
  await rm(join(root, 'shared-saves')); await world('World'); await symlink(foreign, join(root, 'shared-saves/World/region'), 'junction')
  await service().initialize(); expect(await readdir(join(root, 'saves'))).toEqual([]); expect(await readFile(join(foreign, 'private'), 'utf8')).toBe('KEEP')
})
it('retains originals and releases all handles when a session changes during migration', async () => {
  await world('World'); app.acquireWorldLock.mockImplementationOnce(async () => { const lock = { verify: vi.fn(async () => { throw new Error('CHANGED SESSION') }), release: vi.fn() }; sessions.push(lock); return lock })
  await service().initialize(); expect(logger.error).toHaveBeenCalled(); expect(await readFile(join(root, 'shared-saves/World/level.dat'), 'utf8')).toBe('World')
  expect(sessions[0].release).toHaveBeenCalledOnce(); expect(await readdir(join(root, 'saves'))).toEqual([])
})

it('reports blocked recovery without retrying on reads and recovers explicitly after games close', async () => {
  await world('World'); processes = [{}]; const saves = service(); await saves.initialize()
  const status = await saves.getLegacyWorldMigrationStatus(); expect(status).toEqual({ status: 'blocked', reason: 'running' })
  if (status.status === 'blocked') status.reason = 'failed'
  expect(await saves.getLegacyWorldMigrationStatus()).toEqual({ status: 'blocked', reason: 'running' })
  expect(app.acquireWorldLock).not.toHaveBeenCalled(); expect(copyFile).not.toHaveBeenCalled()
  processes = []; expect(await saves.retryLegacyWorldMigration()).toEqual({ status: 'ready' })
  expect(await readFile(join(root, 'saves/World/level.dat'), 'utf8')).toBe('World')
  await expect(lstat(join(root, 'shared-saves'))).rejects.toHaveProperty('code', 'ENOENT')
})

it('coalesces concurrent recovery requests and exposes pending state without duplicate copies', async () => {
  const saves = service(); await saves.initialize(); await world('World')
  const release = await app.mutex.of('resource-pack-options').acquire()
  let first: Promise<unknown>, second: Promise<unknown>
  try {
    first = saves.retryLegacyWorldMigration(); second = saves.retryLegacyWorldMigration()
    expect(await saves.getLegacyWorldMigrationStatus()).toEqual({ status: 'running' })
    expect(app.acquireWorldLock).not.toHaveBeenCalled()
  } finally { release() }
  expect(await Promise.all([first!, second!])).toEqual([{ status: 'ready' }, { status: 'ready' }])
  expect(app.acquireWorldLock).toHaveBeenCalledOnce(); expect(await readdir(join(root, 'saves'))).toEqual(['World'])
})

it('exposes bounded recovery reasons and never returns paths or raw errors', async () => {
  await world('World'); app.acquireWorldLock.mockResolvedValue(undefined)
  const saves = service(); await saves.initialize()
  expect(await saves.getLegacyWorldMigrationStatus()).toEqual({ status: 'blocked', reason: 'session' })
  app.acquireWorldLock.mockRejectedValueOnce(Object.assign(new Error(root + ' PRIVATE'), { name: 'WorldFilesChangedError' }))
  expect(await saves.retryLegacyWorldMigration()).toEqual({ status: 'blocked', reason: 'changed' })
  app.acquireWorldLock.mockRejectedValueOnce(new Error(root + ' PRIVATE'))
  expect(await saves.retryLegacyWorldMigration()).toEqual({ status: 'blocked', reason: 'failed' })
  expect(JSON.stringify(await saves.getLegacyWorldMigrationStatus())).not.toContain(root)
  expect(await readFile(join(root, 'shared-saves/World/level.dat'), 'utf8')).toBe('World')
})

it('does not report missing legacy worlds as blocked when a game prevents initialization', async () => {
  processes = [{}]; const saves = service(); await saves.initialize()
  expect(await saves.getLegacyWorldMigrationStatus()).toEqual({ status: 'ready' })
})
