import { lstat, mkdir, mkdtemp, readFile, rm, symlink as createLink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { copyFile, rename, symlink } from 'fs-extra'
import { writeFile as writeAtomically } from 'atomically'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { handleMigrateRoot, takeCompletedMigrationTelemetry } from './migrate'

vi.mock('fs-extra', async () => {
  const actual = await vi.importActual<typeof import('fs-extra') & { default: typeof import('fs-extra') }>('fs-extra')
  return { ...actual.default, ...actual, rename: vi.fn(actual.rename), copyFile: vi.fn(actual.copyFile), symlink: vi.fn(actual.symlink) }
})
vi.mock('atomically', async () => {
  const actual = await vi.importActual<typeof import('atomically')>('atomically')
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})
const actualFs = await vi.importActual<typeof import('fs-extra')>('fs-extra')
const actualAtomic = await vi.importActual<typeof import('atomically')>('atomically')
const argv = [...process.argv], roots: string[] = []
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(rename).mockImplementation(actualFs.rename)
  vi.mocked(copyFile).mockImplementation(actualFs.copyFile)
  vi.mocked(symlink).mockImplementation(actualFs.symlink)
  vi.mocked(writeAtomically).mockImplementation(actualAtomic.writeFile)
})
afterEach(async () => {
  process.argv = [...argv]; takeCompletedMigrationTelemetry()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'grimo-migrate-safe-')); roots.push(root)
  const source = join(root, 'source'), destination = join(root, 'destination'), appDataPath = join(root, 'profile')
  await mkdir(join(source, 'instances', 'owned'), { recursive: true }); await mkdir(appDataPath)
  await writeFile(join(source, 'instances', 'owned', 'a.txt'), 'first world')
  await writeFile(join(source, 'instances', 'owned', 'b.txt'), 'second world')
  await writeFile(join(appDataPath, 'root'), source)
  process.argv = [...argv, '--migrate', destination]
  const controller = { startMigrate: vi.fn(), handle: vi.fn(), broadcast: vi.fn(), endMigrate: vi.fn() }
  return { root, source, destination, appDataPath, controller, logger: { log: vi.fn(), warn: vi.fn() } }
}
const failure = (code: string) => Object.assign(new Error('Owned fixture failure'), { code, errno: -18 })

it('refuses an occupied destination without moving or replacing any data', async () => {
  const app = await setup()
  await mkdir(app.destination); await writeFile(join(app.destination, 'keep.txt'), 'existing destination')
  expect(await handleMigrateRoot(app.source, app.logger, app)).toBe(app.source)
  expect(await readFile(join(app.destination, 'keep.txt'), 'utf8')).toBe('existing destination')
  expect(await readFile(join(app.source, 'instances', 'owned', 'a.txt'), 'utf8')).toBe('first world')
  expect(rename).not.toHaveBeenCalled(); expect(app.controller.startMigrate).not.toHaveBeenCalled()
})
it('rolls back files already copied inside the partially failed directory', async () => {
  const app = await setup()
  vi.mocked(rename).mockImplementation(async (from, to) => {
    if (String(from).startsWith(app.source + sep)) throw failure(String(from).endsWith('b.txt') ? 'ENOSPC' : 'EXDEV')
    return actualFs.rename(from, to)
  })
  expect(await handleMigrateRoot(app.source, app.logger, app)).toBe(app.source)
  expect(await readFile(join(app.source, 'instances', 'owned', 'a.txt'), 'utf8')).toBe('first world')
  expect(await readFile(join(app.source, 'instances', 'owned', 'b.txt'), 'utf8')).toBe('second world')
  expect(await readFile(join(app.appDataPath, 'root'), 'utf8')).toBe(app.source)
  expect(copyFile).toHaveBeenCalled()
  expect(app.controller.broadcast).toHaveBeenCalledWith('migration-event', expect.objectContaining({ event: 'progress', payload: expect.objectContaining({ phase: 'failed', error: expect.objectContaining({ rollback: 'complete' }) }) }))
})
it('keeps source links and their targets if cross-volume link creation is refused', async () => {
  const app = await setup(), target = join(app.root, 'external')
  await mkdir(target); await writeFile(join(target, 'keep.txt'), 'external data')
  await createLink(target, join(app.source, 'instances', 'owned', 'link'), process.platform === 'win32' ? 'junction' : 'dir')
  vi.mocked(rename).mockImplementation(async (from, to) => {
    if (String(from).startsWith(app.source + sep)) throw failure('EXDEV')
    return actualFs.rename(from, to)
  })
  vi.mocked(symlink).mockRejectedValue(failure('EPERM'))
  expect(await handleMigrateRoot(app.source, app.logger, app)).toBe(app.source)
  expect((await lstat(join(app.source, 'instances', 'owned', 'link'))).isSymbolicLink()).toBe(true)
  expect(symlink).toHaveBeenCalled()
  expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('external data')
  expect(await readFile(join(app.source, 'instances', 'owned', 'a.txt'), 'utf8')).toBe('first world')
})
it('restores moved data when committing the root pointer fails', async () => {
  const app = await setup()
  vi.mocked(writeAtomically).mockRejectedValueOnce(failure('EPERM'))
  expect(await handleMigrateRoot(app.source, app.logger, app)).toBe(app.source)
  expect(await readFile(join(app.source, 'instances', 'owned', 'a.txt'), 'utf8')).toBe('first world')
  expect(await readFile(join(app.appDataPath, 'root'), 'utf8')).toBe(app.source)
  expect(writeAtomically).toHaveBeenCalledWith(join(app.appDataPath, 'root'), app.destination)
})
it('reports incomplete recovery truthfully and retains both locations', async () => {
  const app = await setup()
  vi.mocked(rename).mockImplementation(async (from, to) => {
    if (String(from).endsWith('b.txt') || String(from).startsWith(app.destination + sep)) throw failure('EPERM')
    if (String(from).startsWith(app.source + sep)) throw failure('EXDEV')
    return actualFs.rename(from, to)
  })
  expect(await handleMigrateRoot(app.source, app.logger, app)).toBe(app.source)
  expect(await readFile(join(app.destination, 'instances', 'owned', 'a.txt'), 'utf8')).toBe('first world')
  expect(await readFile(join(app.source, 'instances', 'owned', 'b.txt'), 'utf8')).toBe('second world')
  expect(app.controller.broadcast).toHaveBeenCalledWith('migration-event', expect.objectContaining({ event: 'progress', payload: expect.objectContaining({ phase: 'failed', error: expect.objectContaining({ rollback: 'incomplete' }) }) }))
})
it('does not undo committed data when the cosmetic window throws synchronously', async () => {
  const app = await setup()
  app.controller.startMigrate.mockImplementation(() => { throw failure('WINDOW_CLOSED') })
  app.controller.endMigrate.mockImplementation(() => { throw failure('WINDOW_CLOSED') })
  app.controller.broadcast.mockImplementation(() => { throw failure('WINDOW_CLOSED') })
  expect(await handleMigrateRoot(app.source, app.logger, app)).toBe(app.destination)
  expect(await readFile(join(app.destination, 'instances', 'owned', 'a.txt'), 'utf8')).toBe('first world')
  expect(await readFile(join(app.appDataPath, 'root'), 'utf8')).toBe(app.destination)
  expect(takeCompletedMigrationTelemetry()?.outcome).toBe('success')
})
