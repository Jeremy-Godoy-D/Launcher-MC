import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

vi.mock('~/app', () => ({ Inject: () => () => {}, LauncherAppKey: Symbol('app') }))
const { InstanceLogService } = await import('./InstanceLogService')
let root: string, first: string, second: string, service: InstanceType<typeof InstanceLogService>
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'grimo-log-isolation-'))); first = join(root, 'first'); second = join(root, 'second')
  for (const path of [first, second]) { await mkdir(join(path, 'logs'), { recursive: true }); await mkdir(join(path, 'server/logs'), { recursive: true }); await mkdir(join(path, 'crash-reports')) }
  service = new InstanceLogService({ appDataPath: root, getLogger: () => ({ log() {}, warn() {}, error() {} }) } as any, { guessEncodingByBuffer: async () => 'utf8', decode: async buffer => buffer.toString('utf8') })
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
