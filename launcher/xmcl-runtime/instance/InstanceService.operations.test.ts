import { InstanceSchema, type Instance } from '@xmcl/instance'
import { InstanceState } from '@xmcl/runtime-api'
import { Mutex } from 'async-mutex'
import { ensureDir, mkdtemp, pathExists, readFile, rename, rm, rmdir, symlink, writeFile, writeJson } from 'fs-extra'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app'), PathResolver: class {}, kGameDataPath: Symbol('path') }))
vi.mock('~/infra', () => ({ ImageStorage: class {}, Tasks: class {}, kTasks: Symbol('tasks') }))
vi.mock('~/install', () => ({ VersionMetadataService: class {} }))
vi.mock('fs-extra', async importOriginal => { const real = await importOriginal<any>(); const values = { ...real.default, ...real }; return { ...values, rename: vi.fn(values.rename) } })
const { InstanceService } = await import('./InstanceService')
let root: string, path: string, state: InstanceState, service: InstanceType<typeof InstanceService>
function instance(at: string, name = 'Original'): Instance { return { ...InstanceSchema.parse({ name, path: at, runtime: { minecraft: '1.21.1' } }), path: at, creationDate: 1, lastAccessDate: 1, lastPlayedDate: 0, playtime: 0 } }
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-operations-'))
  path = join(root, 'instances', 'Original')
  await ensureDir(path)
  await writeJson(join(path, 'instance.json'), instance(path))
  state = new InstanceState()
  Object.assign(state, { subscribe: vi.fn() })
  state.instanceAdd(instance(path))
  const locks = new Map<string, Mutex>()
  const app = { appDataPath: root, getLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }), controller: { broadcast: vi.fn() }, mutex: { of: (key: string) => { if (!locks.has(key)) locks.set(key, new Mutex()); return locks.get(key)! } } }
  service = new InstanceService(app as any, { registerStatic: () => state } as any, { getLatestRelease: () => '1.21.1' } as any, (...parts: string[]) => join(root, ...parts), {} as any, {} as any)
  vi.spyOn(service, 'initialize').mockResolvedValue(undefined)
  vi.mocked(rename).mockClear()
})
afterEach(async () => { vi.mocked(rename).mockRestore(); await rm(root, { recursive: true, force: true }) })
test('managed containment rejects the root, siblings and traversal', () => {
  expect(service.isUnderManaged(path)).toBe(true)
  for (const at of [join(root, 'instances'), join(root, 'instances-other/a'), root, join(root, 'instances/../outside')]) expect(service.isUnderManaged(at)).toBe(false)
})
test('deletion refuses unregistered paths and non-boolean flags before touching their files', async () => {
  const unknown = join(root, 'instances/unknown')
  await ensureDir(unknown); await writeFile(join(unknown, 'sentinel'), 'keep')
  await expect(service.deleteInstance(unknown)).rejects.toThrow()
  await expect(service.deleteInstance(path, 'false' as any)).rejects.toThrow('boolean')
  expect(await readFile(join(unknown, 'sentinel'), 'utf8')).toBe('keep')
  expect(state.all[path]).toBeDefined()
})
test('retirement preserves files and group members, and a conflicting hidden destination blocks removal', async () => {
  await writeFile(join(path, 'sentinel'), 'keep')
  state.instanceGroupsSet([{ id: 'group', name: 'Group', color: '', instances: [path, 'another'] }])
  const hidden = join(dirname(path), '.Original')
  await ensureDir(hidden)
  await expect(service.deleteInstance(path, false)).rejects.toThrow('already exists')
  expect(state.all[path]).toBeDefined()
  await rmdir(hidden)
  await service.deleteInstance(path, false)
  expect(await readFile(join(hidden, 'sentinel'), 'utf8')).toBe('keep')
  expect(state.all[path]).toBeUndefined()
  expect(state.groups).toEqual([{ id: 'group', name: 'Group', color: '', instances: ['another'] }])
})
test('moves worlds before deletion and refuses to delete when preserving a world fails', async () => {
  const world = join(path, 'saves', 'World')
  await ensureDir(world); await writeFile(join(world, 'level.dat'), 'world-data')
  await ensureDir(join(path, 'saves/.Hidden')); await writeFile(join(path, 'saves/.Hidden/level.dat'), 'hidden-world')
  vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('locked world'), { code: 'EPERM' }))
  await expect(service.deleteInstance(path, true)).rejects.toThrow('Cannot preserve')
  expect(await readFile(join(world, 'level.dat'), 'utf8')).toBe('world-data')
  expect(state.all[path]).toBeDefined()
  await service.deleteInstance(path, true)
  expect(await pathExists(path)).toBe(false)
  expect(await readFile(join(root, 'saves/World/level.dat'), 'utf8')).toBe('world-data')
  expect(await readFile(join(root, 'saves/.Hidden/level.dat'), 'utf8')).toBe('hidden-world')
})
test('never follows a managed junction to external worlds', async () => {
  const outside = join(root, 'outside')
  await ensureDir(join(outside, 'saves/World')); await writeFile(join(outside, 'saves/World/level.dat'), 'keep')
  const linked = join(root, 'instances/linked')
  await symlink(outside, linked, 'junction'); state.instanceAdd(instance(linked, 'Linked'))
  await expect(service.deleteInstance(linked, true)).rejects.toThrow('Unsafe')
  expect(await readFile(join(outside, 'saves/World/level.dat'), 'utf8')).toBe('keep')
  expect(state.all[linked]).toBeDefined()
})
test('an external sibling is only unregistered and keeps its files', async () => {
  const outside = join(root, 'instances-other', 'External')
  await ensureDir(outside); await writeFile(join(outside, 'sentinel'), 'keep')
  state.instanceAdd(instance(outside, 'External'))
  await service.deleteInstance(outside, true)
  expect(await readFile(join(outside, 'sentinel'), 'utf8')).toBe('keep')
  expect(state.all[outside]).toBeUndefined()
})
test('loading a persisted instance keeps its path when the display name changed', async () => {
  await writeJson(join(path, 'instance.json'), instance(path, 'Renamed'))
  state.instanceRemove(path)
  await service.loadInstance(path)
  expect(state.all[path].name).toBe('Renamed')
  expect(await pathExists(join(root, 'instances/Renamed'))).toBe(false)
  expect(await pathExists(path)).toBe(true)
})
test('main rejects stale metadata without overwriting current fields', async () => {
  const expectedMetadata = { name: 'Original', description: '', author: '' }
  state.instanceEdit({ path, description: 'Changed elsewhere' })
  await expect(service.editInstance({ instancePath: path, name: 'Edited', expectedMetadata })).rejects.toMatchObject({ name: 'InstanceMetadataChanged' })
  expect(state.all[path].name).toBe('Original')
  expect(state.all[path].description).toBe('Changed elsewhere')
})

test('a stale reviewed icon is rejected before image I/O and does not overwrite the current bytes', async () => {
  const icon = join(path, 'icon.png'); await writeFile(icon, 'keep-original')
  state.instanceEdit({ path, icon: 'current-icon' })
  await expect(service.editInstance({ instancePath: path, icon: 'https://example.com/new.png', expectedMetadata: { name: 'Original', description: '', author: '', icon: 'stale-icon' } })).rejects.toMatchObject({ name: 'InstanceMetadataChanged' })
  expect(await readFile(icon, 'utf8')).toBe('keep-original')
  expect(state.all[path].icon).toBe('current-icon')
})
test('concurrent reviewed metadata edits serialize and reject the obsolete writer', async () => {
  const expectedMetadata = { name: 'Original', description: '', author: '' }
  const outcomes = await Promise.allSettled([
    service.editInstance({ instancePath: path, name: 'First', expectedMetadata }),
    service.editInstance({ instancePath: path, name: 'Second', expectedMetadata }),
  ])
  expect(outcomes.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(state.all[path].name).toBe('First')
})
test('group updates compare the whole current snapshot before replacing any membership', async () => {
  const previous = [{ id: 'group', name: 'Group', color: '', instances: [path, 'bedrock'] }]
  state.instanceGroupsSet(previous)
  const next = [{ ...previous[0], name: 'Renamed' }]
  await service.updateInstanceGroups(previous, next)
  await expect(service.updateInstanceGroups(previous, [])).rejects.toMatchObject({ name: 'InstanceGroupsChanged' })
  expect(state.groups).toEqual(next)
})
