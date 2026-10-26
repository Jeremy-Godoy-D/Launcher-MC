import { InstanceSchema } from '@xmcl/instance'
import { InstanceState } from '@xmcl/runtime-api'
import { Mutex } from 'async-mutex'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { COPY_JOB } from './instanceCopy'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), PathResolver: class {}, kGameDataPath: Symbol('path') }))
vi.mock('~/infra', () => ({ ImageStorage: class {}, Tasks: class {}, kTasks: Symbol('tasks') }))
vi.mock('../launch/LaunchService', () => ({ LaunchService: class {} }))
const { InstanceService } = await import('./InstanceService')
let root: string, source: string, state: InstanceState, service: InstanceType<typeof InstanceService>, processes: any[], tasks: any[], cancelAtFirst: boolean
async function file(path: string, data: string | Buffer) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, data) }
function createService(next: InstanceState) {
  const locks = new Map<string, Mutex>()
  Object.assign(next, { subscribe: vi.fn() })
  const app = { appDataPath: root, getLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }), controller: { broadcast: vi.fn() }, registry: { get: async () => ({ getGameProcesses: async () => processes }) }, mutex: { of: (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! } } }
  const instance = new InstanceService(app as any, { registerStatic: () => next } as any, { getLatestRelease: () => '1.21.1' } as any, (...parts: string[]) => join(root, ...parts), {} as any, { create: (input: any) => {
    const task = { ...input, id: String(tasks.length), controller: new AbortController(), complete: vi.fn(), fail: vi.fn() }
    let progress: any
    Object.defineProperty(task, 'progress', { get: () => progress, set: value => { progress = value; if (cancelAtFirst && value.progress >= 1) { cancelAtFirst = false; task.controller.abort() } } })
    tasks.push(task); return task
  } } as any)
  vi.spyOn(instance, 'initialize').mockResolvedValue(undefined)
  return instance
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-copy-service-')); source = join(root, 'source'); processes = []; tasks = []; cancelAtFirst = false; state = new InstanceState()
  const data = { ...InstanceSchema.parse({ name: 'Original', path: source, java: 'C:/custom-java.exe', vmOptions: ['-Dkeep=1'], runtime: { minecraft: '1.21.1' } }), path: source, creationDate: 1, lastAccessDate: 1, lastPlayedDate: 0, playtime: 0 }
  await file(join(source, 'instance.json'), JSON.stringify(data)); await file(join(source, 'saves/World/level.dat'), 'world-source'); await file(join(source, 'config/qa.txt'), 'config-source')
  state.instanceAdd(data); service = createService(state)
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })

test('native duplication preserves metadata and independent worlds with no pending state after completion', async () => {
  const copy = await service.duplicateInstance(source, 'copy-request')
  expect(copy).not.toBe(source); expect(state.instances).toHaveLength(2)
  expect(tasks[0]).toMatchObject({ from: source, to: copy, requestId: 'copy-request' }); expect(tasks[0].complete).toHaveBeenCalledOnce()
  expect(await service.getInstanceCopyState(copy)).toBeUndefined()
  expect(state.all[copy].java).toBe('C:/custom-java.exe'); expect(state.all[copy].vmOptions).toEqual(['-Dkeep=1'])
  await file(join(copy, 'saves/World/level.dat'), 'copy-only')
  expect(await readFile(join(source, 'saves/World/level.dat'), 'utf8')).toBe('world-source')
})
async function interrupted() {
  for (let index = 0; index < 8; index++) await file(join(source, `mods/${index}.jar`), Buffer.alloc(1024 * 1024, index))
  cancelAtFirst = true
  const error = await service.duplicateInstance(source, 'cancel-request').then(() => undefined, error => error)
  expect(error.destinationPath).toBeTruthy()
  const path = error.destinationPath as string
  expect(await service.getInstanceCopyState(path)).toMatchObject({ sourcePath: source, totalFiles: 10 })
  return path
}
test('a cancelled native copy reloads its durable state and resumes the same instance without another folder', async () => {
  const path = await interrupted(), next = new InstanceState()
  next.instanceAdd(state.all[source]); const restarted = createService(next)
  expect(await restarted.loadInstance(path)).toBe(true)
  expect(next.pendingCopies[path]).toMatchObject({ sourcePath: source, totalFiles: 10 })
  expect(await restarted.resumeInstanceCopy(path, 'resume-request')).toBe(path)
  expect(next.instances).toHaveLength(2); expect(next.pendingCopies[path]).toBeUndefined()
  expect(await readFile(join(path, 'saves/World/level.dat'), 'utf8')).toBe('world-source')
  expect(await restarted.resumeInstanceCopy(path)).toBe(path)
  expect(next.instances).toHaveLength(2)
})
test('resume conflicts preserve edited destination data and the pending marker', async () => {
  const path = await interrupted(); await file(join(path, 'config/qa.txt'), 'keep-user-edit')
  await expect(service.resumeInstanceCopy(path)).rejects.toMatchObject({ name: 'InstanceCopyConflict', destinationPath: path })
  expect(await readFile(join(path, 'config/qa.txt'), 'utf8')).toBe('keep-user-edit')
  expect(state.pendingCopies[path]).toBeDefined()
})
test('two concurrent resumptions share one destination and do not create another instance or task', async () => {
  const path = await interrupted(), count = tasks.length
  expect(await Promise.all([service.resumeInstanceCopy(path, 'resume-a'), service.resumeInstanceCopy(path, 'resume-b')])).toEqual([path, path])
  expect(state.instances).toHaveLength(2); expect(tasks).toHaveLength(count + 1)
})
test('malformed copy metadata stays visible as invalid and never starts another copy', async () => {
  const path = await interrupted(), count = state.instances.length
  await file(join(path, COPY_JOB), 'not-json')
  expect(await service.getInstanceCopyState(path)).toMatchObject({ invalid: true })
  await expect(service.resumeInstanceCopy(path)).rejects.toMatchObject({ name: 'InstanceCopyInvalid' })
  await expect(service.duplicateInstance(path)).rejects.toMatchObject({ name: 'InstanceCopyIncomplete' })
  expect(state.instances).toHaveLength(count)
})
test('source processes, missing sources, unregistered destinations and invalid correlation IDs fail before unsafe writes', async () => {
  processes = [{ options: { gameDirectory: source } }]
  await expect(service.duplicateInstance(source)).rejects.toMatchObject({ name: 'InstanceCopyGameRunning' })
  expect(state.instances).toHaveLength(1); processes = []
  await expect(service.duplicateInstance(source, 'x'.repeat(81))).rejects.toThrow('request')
  await expect(service.resumeInstanceCopy(root)).rejects.toMatchObject({ name: 'InstanceCopyUnsafePath' })
  const path = await interrupted(); state.instanceRemove(source)
  await expect(service.resumeInstanceCopy(path)).rejects.toMatchObject({ name: 'InstanceCopySourceMissing' })
})
