import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { link, mkdir, mkdtemp, open, opendir, readFile, readdir, realpath, rename, rm, stat, symlink, truncate, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { LaunchHistoryStore } from './LaunchHistoryStore'

vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, open: vi.fn(actual.open), opendir: vi.fn(actual.opendir) }
})
const native = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']
let root: string, history: string, instance: string, store: LaunchHistoryStore, active: any[]
const begin = (index = 0, side: 'client' | 'server' = 'client') => store.begin(instance, { launchId: ids[index], operationId: `operation-${index}`, pid: 42, side, version: '1.21.1', minecraft: '1.21.1', startedAt: 100 + index })
const complete = (result: Partial<Parameters<LaunchHistoryStore['complete']>[2]> = {}, index = 0) => store.complete(instance, ids[index], { endedAt: Date.now(), crashed: false, gameLogAmbiguous: false, ...result })
const location = async (index = 0) => join(history, (await readdir(history))[0], ids[index])
const processFor = (index = 0, side: 'client' | 'server' = 'client', gameDirectory = instance) => ({ launchId: ids[index], side, options: { gameDirectory } })
beforeEach(async () => {
  vi.mocked(open).mockReset().mockImplementation(native.open)
  vi.mocked(opendir).mockReset().mockImplementation(native.opendir)
  root = await realpath(await mkdtemp(join(tmpdir(), 'grimo-history-boundary-')))
  history = join(root, 'history'); instance = join(root, 'instance'); active = []
  for (const area of ['logs', 'crash-reports', 'server/logs', 'server/crash-reports']) await mkdir(join(instance, area), { recursive: true })
  store = new LaunchHistoryStore(history, async () => active)
})
afterEach(async () => {
  vi.restoreAllMocks()
  expect(dirname(root)).toBe(await realpath(tmpdir()))
  expect(basename(root)).toMatch(/^grimo-history-boundary-/)
  await rm(root, { recursive: true, force: true })
})

it.each(['root', 'instance', 'launch'])('rejects a junction at the %s archive boundary without changing its target', async level => {
  await begin()
  const launch = await location(), path = level === 'root' ? history : level === 'instance' ? dirname(launch) : launch
  const external = join(root, 'external'); await mkdir(external); await writeFile(join(external, 'private.txt'), 'private')
  await rename(path, `${path}-original`); await symlink(external, path, 'junction')
  await expect(store.get(instance, ids[0])).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  await expect(store.list(instance)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  await expect(begin(1)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  expect(await readFile(join(external, 'private.txt'), 'utf8')).toBe('private')
  expect(await readdir(external)).toEqual(['private.txt'])
})

it('validates launch and evidence identifiers before reading or writing', async () => {
  await begin()
  for (const id of ['../private', ids[0] + ':stream', 'CON', null]) {
    await expect(store.get(instance, id as any)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
    await expect(store.markReady(instance, id as any, 200)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  }
  for (const name of ['../launch.json', 'launch.json', 'game.log:stream', null]) await expect(store.readEvidence(instance, ids[0], name as any)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
})

it.each(['json', 'shape', 'large'])('reports %s manifest failure instead of an empty history', async kind => {
  await begin()
  const path = join(await location(), 'launch.json')
  await writeFile(path, kind === 'json' ? '{' : kind === 'shape' ? JSON.stringify({ launchId: ids[0] }) : ' '.repeat(65537))
  await expect(store.get(instance, ids[0])).rejects.toHaveProperty('name', kind === 'large' ? 'InstanceLogTooLarge' : 'InstanceLogInvalidManifest')
  await expect(store.list(instance)).rejects.toHaveProperty('name', kind === 'large' ? 'InstanceLogTooLarge' : 'InstanceLogInvalidManifest')
})

it('returns only defined metadata fields and requires a manifest before an evidence read', async () => {
  await begin()
  const path = join(await location(), 'launch.json'), record = JSON.parse(await readFile(path, 'utf8'))
  record.privateValue = 'never-return'; record.evidence.privateValue = 'never-return'
  await writeFile(path, JSON.stringify(record))
  const parsed = await store.get(instance, ids[0])
  expect(parsed).not.toHaveProperty('privateValue'); expect(parsed!.evidence).not.toHaveProperty('privateValue')
  const unknown = join(dirname(path), '..', ids[1]); await mkdir(unknown); await writeFile(join(unknown, 'game.log'), 'unowned')
  vi.mocked(open).mockClear()
  expect(await store.readEvidence(instance, ids[1], 'game.log')).toBe('')
  expect(vi.mocked(open).mock.calls.some(([path]) => String(path).endsWith('game.log'))).toBe(false)
})

it.each(['launch.json', 'launcher-output.log'])('refuses a hard-linked %s', async name => {
  await begin(); await complete({ launcherOutput: 'owned' })
  const launch = await location(), path = join(launch, name), privatePath = join(root, 'private.txt')
  await rename(path, privatePath); await link(privatePath, path)
  const operation = name === 'launch.json' ? store.get(instance, ids[0]) : store.readEvidence(instance, ids[0], 'launcher-output.log')
  await expect(operation).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  expect(await readFile(privatePath, 'utf8')).toContain(name === 'launch.json' ? ids[0] : 'owned')
})

it('bounds archive enumeration without allocating or ignoring an unlimited directory', async () => {
  await begin()
  vi.mocked(opendir).mockResolvedValueOnce((async function* () { for (let i = 0; i < 257; i++) yield { name: `unrelated-${i}` } })() as any)
  await expect(store.list(instance)).rejects.toHaveProperty('name', 'InstanceLogTooLarge')
})

it('does not capture paths outside this instance and still records exit and other evidence', async () => {
  await begin()
  const privatePath = join(root, 'private.txt'); await writeFile(privatePath, 'PRIVATE')
  await complete({ gameLogPath: privatePath, debugLogPath: privatePath, crashReportPath: privatePath, launcherOutput: 'safe output' })
  expect(await store.get(instance, ids[0])).toMatchObject({ state: 'exited', evidence: { gameLog: 'unavailable', debugLog: 'unavailable', crashReport: 'unavailable', launcherOutput: 'available' } })
  await expect(store.readEvidence(instance, ids[0], 'game.log')).rejects.toHaveProperty('name', 'InstanceLogCaptureError')
  expect(await store.readEvidence(instance, ids[0], 'launcher-output.log')).toBe('safe output')
  expect(await readFile(privatePath, 'utf8')).toBe('PRIVATE')
  expect(await readdir(await location())).toEqual(['launch.json', 'launcher-output.log'])
})

it('keeps crash output fallback when a reported file is unsafe', async () => {
  await begin()
  await complete({ crashReportPath: join(root, 'private.txt'), crashReport: 'captured crash output' })
  expect(await store.readEvidence(instance, ids[0], 'crash-report.txt')).toBe('captured crash output')
})

it('accepts native null exit values and reads legacy nulls without exposing them', async () => {
  await begin(); await complete({ exitCode: 0, signal: null })
  expect(await store.get(instance, ids[0])).toMatchObject({ state: 'exited', exitCode: 0 })
  expect((await store.get(instance, ids[0]))!.signal).toBeUndefined()
  await begin(1); await complete({ exitCode: null, signal: 'SIGTERM' }, 1)
  expect(await store.get(instance, ids[1])).toMatchObject({ state: 'exited', signal: 'SIGTERM' })
  expect((await store.get(instance, ids[1]))!.exitCode).toBeUndefined()
  const path = join(await location(), 'launch.json'), record = JSON.parse(await readFile(path, 'utf8'))
  await writeFile(path, JSON.stringify({ ...record, signal: null }))
  expect((await store.get(instance, ids[0]))!.signal).toBeUndefined()
})

it('captures canonical source paths for a registered instance reached through a directory alias', async () => {
  const original = instance, alias = join(root, 'instance-alias')
  await symlink(instance, alias, 'junction'); instance = alias
  await begin(); await writeFile(join(original, 'logs/latest.log'), 'own aliased log')
  await complete({ gameLogPath: join(original, 'logs/latest.log') })
  expect(await store.readEvidence(instance, ids[0], 'game.log')).toBe('own aliased log')
})

it('refuses hard-linked sources, cross-side files, and existing evidence destinations', async () => {
  const privatePath = join(root, 'private.txt'); await writeFile(privatePath, 'PRIVATE')
  await link(privatePath, join(instance, 'logs/latest.log'))
  await writeFile(join(instance, 'server/logs/debug.log'), 'other side')
  await begin(); await link(privatePath, join(await location(), 'launcher-output.log'))
  await complete({ gameLogPath: join(instance, 'logs/latest.log'), debugLogPath: join(instance, 'server/logs/debug.log'), launcherOutput: 'new text' })
  expect((await store.get(instance, ids[0]))!.evidence).toMatchObject({ gameLog: 'unavailable', debugLog: 'unavailable', launcherOutput: 'unavailable' })
  expect(await readFile(privatePath, 'utf8')).toBe('PRIVATE')
})

it('keeps a complete multi-chunk snapshot above the view limit without exposing an unbounded read', async () => {
  const data = Buffer.alloc(17 * 1024 * 1024 + 13)
  for (let i = 0; i < data.length; i++) data[i] = i % 251
  const path = join(instance, 'logs/latest.log'); await writeFile(path, data)
  await begin(); await complete({ gameLogPath: path })
  expect((await readFile(join(await location(), 'game.log'))).equals(data)).toBe(true)
  expect((await readFile(path)).equals(data)).toBe(true)
  await expect(store.readEvidence(instance, ids[0], 'game.log')).rejects.toHaveProperty('name', 'InstanceLogTooLarge')
  await truncate(path, 256 * 1024 * 1024 + 1)
  await begin(1); await complete({ gameLogPath: path }, 1)
  expect((await store.get(instance, ids[1]))!.evidence.gameLog).toBe('unavailable')
  expect((await stat(path)).size).toBe(256 * 1024 * 1024 + 1)
})

it('requires the active launch id, instance and side for a live fallback, independently of PID reuse', async () => {
  await begin(); await writeFile(join(instance, 'logs/latest.log'), 'live')
  for (const processes of [[], [processFor(1)], [processFor(0, 'server')], [processFor(0, 'client', join(root, 'other'))]]) {
    active = processes
    expect((await store.list(instance))[0].evidence.gameLog).toBe('absent')
    expect(await store.readEvidence(instance, ids[0], 'game.log')).toBe('')
  }
  active = [processFor()]
  expect(await store.readEvidence(instance, ids[0], 'game.log')).toBe('live')
  await begin(1); active = [processFor(1)]
  await complete({ gameLogPath: join(instance, 'logs/latest.log') })
  expect((await store.get(instance, ids[0]))!.evidence.gameLog).toBe('unavailable')
})

it('does not confuse simultaneous client and server log directories', async () => {
  await begin(); await begin(1, 'server'); active = [processFor(), processFor(1, 'server')]
  await writeFile(join(instance, 'logs/latest.log'), 'client'); await writeFile(join(instance, 'server/logs/latest.log'), 'server')
  expect(await store.readEvidence(instance, ids[0], 'game.log')).toBe('client')
  expect(await store.readEvidence(instance, ids[1], 'game.log')).toBe('server')
})

it('keeps active launches and unfamiliar files when applying retention', async () => {
  await begin(); active = [processFor()]
  for (let i = 1; i < 4; i++) await begin(i)
  expect(await store.get(instance, ids[0])).toBeDefined()
  const launch = await location(); await writeFile(join(launch, 'user-notes.txt'), 'preserve me'); active = []
  await begin(4)
  expect(await readFile(join(launch, 'user-notes.txt'), 'utf8')).toBe('preserve me')
  expect(await store.get(instance, ids[0])).toBeDefined()
})

it('protects a snapshot still committing when newer launches trigger retention', async () => {
  await begin()
  let release!: () => void, entered!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), started = new Promise<void>(resolve => { entered = resolve })
  vi.mocked(open).mockImplementation(async (...args: Parameters<typeof open>) => {
    const handle = await native.open(...args)
    if (String(args[0]).includes('.snapshot-')) {
      const sync = handle.sync.bind(handle)
      vi.spyOn(handle, 'sync').mockImplementation(async () => { entered(); await gate; await sync() })
    }
    return handle
  })
  const pending = complete({ launcherOutput: 'pending snapshot' })
  try {
    await started
    for (let i = 1; i < 4; i++) await begin(i)
    expect(await store.get(instance, ids[0])).toBeDefined()
  } finally { release(); await pending }
  expect(await store.readEvidence(instance, ids[0], 'launcher-output.log')).toBe('pending snapshot')
})

it('ignores late ready and repeated exit events instead of changing completed evidence', async () => {
  await begin(); await complete({ launcherOutput: 'first exit' }); await store.markReady(instance, ids[0], Date.now())
  await complete({ launcherOutput: 'second exit', crashed: true })
  expect(await store.get(instance, ids[0])).toMatchObject({ state: 'exited', crashed: false })
  expect(await store.get(instance, ids[0])).not.toHaveProperty('readyAt')
  expect(await store.readEvidence(instance, ids[0], 'launcher-output.log')).toBe('first exit')
})

it('closes a snapshot descriptor even when inspecting that descriptor fails', async () => {
  await begin()
  let closed = false
  vi.mocked(open).mockImplementation(async (...args: Parameters<typeof open>) => {
    const handle = await native.open(...args)
    if (String(args[0]).includes('.snapshot-')) {
      vi.spyOn(handle, 'stat').mockRejectedValue(new Error('PRIVATE-FIXTURE'))
      const close = handle.close.bind(handle)
      vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); closed = true })
    }
    return handle
  })
  await complete({ launcherOutput: 'output' })
  expect(closed).toBe(true)
  expect(await store.get(instance, ids[0])).toMatchObject({ state: 'exited', evidence: { launcherOutput: 'unavailable' } })
})
