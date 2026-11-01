import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { appendFile, link, mkdtemp, mkdir, open, opendir, readFile, realpath, rename, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { gzipSync } from 'node:zlib'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app') }))
vi.mock('./InstanceService', () => ({ InstanceService: class {} }))
vi.mock('../launch/LaunchService', () => ({ LaunchService: class {} }))
vi.mock('node:fs/promises', async original => {
  const actual = await original<typeof import('node:fs/promises')>()
  return { ...actual, open: vi.fn(actual.open), opendir: vi.fn(actual.opendir) }
})
const { InstanceLogService } = await import('./InstanceLogService')
let root: string, first: string, second: string, service: InstanceType<typeof InstanceLogService>
let instances: { path: string; edition: string }[], shell: ReturnType<typeof vi.fn>
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'grimo-log-isolation-'))); first = join(root, 'first'); second = join(root, 'second')
  for (const path of [first, second]) { await mkdir(join(path, 'logs'), { recursive: true }); await mkdir(join(path, 'server/logs'), { recursive: true }); await mkdir(join(path, 'crash-reports')) }
  instances = [first, second].map(path => ({ path, edition: 'java' })); shell = vi.fn()
  service = new InstanceLogService({ appDataPath: root, shell: { showItemInFolder: shell }, registry: { get: async () => ({ initialize: async () => {}, state: { instances } }) }, getLogger: () => ({ log() {}, warn() {}, error() {} }) } as any, { guessEncodingByBuffer: async () => 'utf8', decode: async buffer => buffer.toString('utf8') })
})
afterEach(async () => { expect(dirname(root)).toBe(await realpath(tmpdir())); expect(basename(root)).toMatch(/^grimo-log-isolation-/); await rm(root, { recursive: true, force: true }) })

it('keeps concurrent directory listings isolated between instances', async () => {
  for (const area of ['logs', 'server/logs', 'crash-reports']) {
    await writeFile(join(first, area, 'first.txt'), 'first'); await writeFile(join(second, area, 'second.txt'), 'second')
  }
  for (const method of ['listLogs', 'listServerLogs', 'listCrashReports'] as const) {
    const [a, b] = await Promise.all([service[method](first), service[method](second)])
    expect(a).toEqual(['first.txt']); expect(b).toEqual(['second.txt'])
  }
})
it('keeps concurrent reads of distinct files isolated within the same instance', async () => {
  for (const [area, method] of [['logs', 'getLogContent'], ['server/logs', 'getServerLogContent'], ['crash-reports', 'getCrashReportContent']] as const) {
    await writeFile(join(first, area, 'one.txt'), 'one'); await writeFile(join(first, area, 'two.txt'), 'two')
    expect(await Promise.all([service[method](first, 'one.txt'), service[method](first, 'two.txt')])).toEqual(['one', 'two'])
  }
})
it('applies concurrent removals to each requested file instead of acknowledging only the first', async () => {
  for (const [area, method] of [['logs', 'removeLog'], ['server/logs', 'removeServerLog'], ['crash-reports', 'removeCrashReport']] as const) {
    const one = join(first, area, 'one.txt'), two = join(first, area, 'two.txt'); await writeFile(one, 'one'); await writeFile(two, 'two')
    await Promise.all([service[method](first, 'one.txt'), service[method](first, 'two.txt')])
    await expect(readFile(one)).rejects.toHaveProperty('code', 'ENOENT'); await expect(readFile(two)).rejects.toHaveProperty('code', 'ENOENT')
  }
})

it('requires a registered Java instance for file and history operations', async () => {
  const foreign = join(root, 'foreign'); await mkdir(join(foreign, 'logs'), { recursive: true }); await writeFile(join(foreign, 'logs/secret.txt'), 'private')
  instances[1].edition = 'bedrock'
  for (const path of [foreign, second, '', null, { path: first }] as any[]) {
    await expect(service.listLogs(path)).rejects.toHaveProperty('name', 'InstanceNotFoundError')
    await expect(service.getLogContent(path, 'secret.txt')).rejects.toHaveProperty('name', 'InstanceNotFoundError')
    await expect(service.listLaunches(path)).rejects.toHaveProperty('name', 'InstanceNotFoundError')
    await expect(service.removeLog(path, 'secret.txt')).rejects.toHaveProperty('name', 'InstanceNotFoundError')
  }
  expect(await readFile(join(foreign, 'logs/secret.txt'), 'utf8')).toBe('private')
})

it('rejects traversal, absolute paths, alternate streams, devices and unsupported names', async () => {
  await writeFile(join(first, 'private.txt'), 'private')
  for (const name of ['../private.txt', '..\\private.txt', join(first, 'private.txt'), 'latest.log:private', 'CON.txt', 'two/one.log', 'bad.log ', 'bad.txt\0', 'x'.repeat(256) + '.log', 'instance.json']) {
    await expect(service.getLogContent(first, name)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
    await expect(service.removeLog(first, name)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
    await expect(service.showLog(first, name)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  }
  expect(shell).not.toHaveBeenCalled(); expect(await readFile(join(first, 'private.txt'), 'utf8')).toBe('private')
})

it('accepts legacy absolute crash locations only in this instance crash directories', async () => {
  await mkdir(join(first, 'server/crash-reports')); await writeFile(join(first, 'crash-reports/local.txt'), 'client'); await writeFile(join(first, 'server/crash-reports/local.txt'), 'server')
  for (const area of ['crash-reports', 'server/crash-reports']) expect(await service.getCrashReportContent(first, join(first, area, 'local.txt'))).toBe(area.startsWith('server') ? 'server' : 'client')
  await writeFile(join(second, 'crash-reports/foreign.txt'), 'private')
  await expect(service.getCrashReportContent(first, join(second, 'crash-reports/foreign.txt'))).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  await expect(service.getCrashReportContent(first, join(first, 'logs/latest.log'))).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
})

it('refuses linked files, hard links and linked directories without reading, deleting or opening their targets', async () => {
  await writeFile(join(second, 'logs/secret.txt'), 'private')
  await link(join(second, 'logs/secret.txt'), join(first, 'logs/hard.txt'))
  for (const method of ['getLogContent', 'removeLog', 'showLog'] as const) await expect(service[method](first, 'hard.txt')).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  expect(dirname(first)).toBe(root); expect(await realpath(join(first, 'logs'))).toBe(join(first, 'logs'))
  await rm(join(first, 'logs'), { recursive: true }); await symlink(join(second, 'logs'), join(first, 'logs'), 'junction')
  await expect(service.listLogs(first)).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  for (const method of ['getLogContent', 'removeLog', 'showLog'] as const) await expect(service[method](first, 'secret.txt')).rejects.toHaveProperty('name', 'InstanceLogUnsafePath')
  expect(shell).not.toHaveBeenCalled(); expect(await readFile(join(second, 'logs/secret.txt'), 'utf8')).toBe('private')
})

it('bounds encoded and expanded logs and propagates corrupt archives instead of claiming empty content', async () => {
  const limit = 16 * 1024 * 1024
  await writeFile(join(first, 'logs/oversized.log'), ''); await truncate(join(first, 'logs/oversized.log'), limit + 1)
  await expect(service.getLogContent(first, 'oversized.log')).rejects.toHaveProperty('name', 'InstanceLogTooLarge')
  await writeFile(join(first, 'logs/bomb.gz'), gzipSync(Buffer.alloc(limit + 1, 97)))
  await expect(service.getLogContent(first, 'bomb.gz')).rejects.toHaveProperty('name', 'InstanceLogTooLarge')
  await writeFile(join(first, 'logs/broken.gz'), 'not gzip')
  await expect(service.getLogContent(first, 'broken.gz')).rejects.toHaveProperty('name', 'InstanceLogReadError')
  expect(await service.getLogContent(first, 'missing.log')).toBe('')
  await writeFile(join(first, 'logs/good.gz'), gzipSync('compressed log'))
  expect(await service.getLogContent(first, 'good.gz')).toBe('compressed log')
})

it('lists only supported regular files and permits a registered root alias', async () => {
  await writeFile(join(first, 'logs/valid.log'), 'valid'); await writeFile(join(first, 'logs/private.json'), '{}'); await mkdir(join(first, 'logs/directory.log'))
  expect(await service.listLogs(first)).toEqual(['valid.log'])
  const alias = join(root, 'registered-alias'); await symlink(first, alias, 'junction'); instances.push({ path: alias, edition: 'java' })
  expect(await service.getLogContent(alias, 'valid.log')).toBe('valid')
  await service.showLog(alias, 'valid.log'); expect(shell).toHaveBeenCalledWith(join(first, 'logs/valid.log'))
  await service.removeLog(alias, 'missing.log')
})

it('reads a bounded snapshot while the live file appends', async () => {
  const path = join(first, 'logs/live.log'); await writeFile(path, 'initial')
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(open).mockImplementationOnce(async (...args) => { const handle = await actual.open(...args); await appendFile(path, '-appended'); return handle })
  expect(await service.getLogContent(first, 'live.log')).toBe('initial')
  expect(await readFile(path, 'utf8')).toBe('initial-appended')
})

it('rejects a file replaced between inspection and open', async () => {
  const path = join(first, 'logs/replaced.log'); await writeFile(path, 'reviewed')
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  vi.mocked(open).mockImplementationOnce(async (...args) => { await rename(path, path + '.old'); await writeFile(path, 'replacement'); return actual.open(...args) })
  await expect(service.getLogContent(first, 'replaced.log')).rejects.toHaveProperty('name', 'InstanceLogChanged')
  expect(await readFile(path, 'utf8')).toBe('replacement'); expect(await readFile(path + '.old', 'utf8')).toBe('reviewed')
})

it('caps directory iteration before building an unbounded result', async () => {
  let visited = 0
  vi.mocked(opendir).mockResolvedValueOnce({ async *[Symbol.asyncIterator]() { for (let i = 0; i < 10002; i++) { visited++; yield { name: `${i}.log`, isFile: () => true } } } } as any)
  await expect(service.listLogs(first)).rejects.toHaveProperty('name', 'InstanceLogTooLarge')
  expect(visited).toBe(10001)
})

it('reports permission and decoder failures without exposing their raw details', async () => {
  await writeFile(join(first, 'logs/private.log'), 'data')
  vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error('fixture-private-detail'), { code: 'EACCES' }))
  await expect(service.getLogContent(first, 'private.log')).rejects.toMatchObject({ name: 'InstanceLogReadError', message: '' })
  vi.spyOn((service as any).encoder, 'decode').mockRejectedValueOnce(new Error('fixture-private-detail'))
  await expect(service.getLogContent(first, 'private.log')).rejects.toMatchObject({ name: 'InstanceLogReadError', message: '' })
})
