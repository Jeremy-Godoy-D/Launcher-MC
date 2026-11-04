import { createHash } from 'node:crypto'
import { link, mkdir, readFile, rename, symlink, truncate, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import type { LauncherFixture } from '../../fixtures/launcher'

const launchId = '11111111-1111-4111-8111-111111111111'
test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function seedHistory(launcher: LauncherFixture, instance: string) {
  const normalized = resolve(instance).replace(/\\/g, '/')
  const key = createHash('sha256').update(process.platform === 'win32' ? normalized.toLowerCase() : normalized).digest('hex')
  const path = join(launcher.appDataPath, 'LauncherMC', 'launch-history', key, launchId)
  const record = { launchId, operationId: 'native-history-fixture', pid: 42, side: 'client', version: '1.21.1', minecraft: '1.21.1', state: 'exited', startedAt: 100, endedAt: 200, signal: null, evidence: { gameLog: 'absent', debugLog: 'absent', crashReport: 'absent', launcherOutput: 'available' } }
  await mkdir(path, { recursive: true }); await writeFile(join(path, 'launch.json'), JSON.stringify(record))
  return { path, record }
}

test('Native history keeps identical launch ids isolated by instance and projects validated metadata', async ({ launcher }) => {
  const [first, second] = await seedReactLibrary(launcher.main)
  const a = await seedHistory(launcher, first), b = await seedHistory(launcher, second)
  await writeFile(join(a.path, 'launcher-output.log'), 'first launch'); await writeFile(join(b.path, 'launcher-output.log'), 'second launch')
  await writeFile(join(a.path, 'launch.json'), JSON.stringify({ ...a.record, privateValue: 'PRIVATE-FIXTURE', evidence: { ...a.record.evidence, privateValue: 'PRIVATE-FIXTURE' } }))
  const result = await launcher.main.evaluate(async ({ first, second, launchId }) => {
    const service = (window as any).serviceChannels.open('InstanceLogService')
    return {
      text: await Promise.all([first, second].map(path => service.call('getLaunchEvidence', path, launchId, 'launcher-output.log'))),
      record: await service.call('getLaunch', first, launchId),
      list: await service.call('listLaunches', first),
    }
  }, { first, second, launchId })
  expect(result.text).toEqual(['first launch', 'second launch'])
  expect(result.record).toMatchObject({ launchId, state: 'exited', evidence: { launcherOutput: 'available' } })
  expect(result.record.signal).toBeUndefined(); expect(result.record).not.toHaveProperty('privateValue'); expect(result.record.evidence).not.toHaveProperty('privateValue')
  expect(result.list).toHaveLength(1)
  expect(await readFile(join(b.path, 'launcher-output.log'), 'utf8')).toBe('second launch')
})

test('Native history reports oversized, corrupt, unavailable and hard-linked evidence', async ({ launcher }) => {
  const [instance] = await seedReactLibrary(launcher.main), { path, record } = await seedHistory(launcher, instance)
  const invoke = (method: string, ...args: unknown[]) => launcher.main.evaluate(async ({ method, args }) => {
    try { return { value: await (window as any).serviceChannels.open('InstanceLogService').call(method, ...args) } } catch (error: any) { return { error: error.name } }
  }, { method, args })
  await writeFile(join(path, 'launcher-output.log'), 'owned')
  await truncate(join(path, 'launcher-output.log'), 16 * 1024 * 1024 + 1)
  expect(await invoke('getLaunchEvidence', instance, launchId, 'launcher-output.log')).toEqual({ error: 'InstanceLogTooLarge' })
  await writeFile(join(path, 'launch.json'), '{')
  expect(await invoke('getLaunch', instance, launchId)).toEqual({ error: 'InstanceLogInvalidManifest' })
  await writeFile(join(path, 'launch.json'), ' '.repeat(65537))
  expect(await invoke('listLaunches', instance)).toEqual({ error: 'InstanceLogTooLarge' })
  await writeFile(join(path, 'launch.json'), JSON.stringify({ ...record, evidence: { ...record.evidence, launcherOutput: 'unavailable' } }))
  expect(await invoke('getLaunchEvidence', instance, launchId, 'launcher-output.log')).toEqual({ error: 'InstanceLogCaptureError' })
  const privatePath = join(launcher.gameDataPath, 'private-history-fixture.json')
  await rename(join(path, 'launch.json'), privatePath); await link(privatePath, join(path, 'launch.json'))
  expect(await invoke('getLaunch', instance, launchId)).toEqual({ error: 'InstanceLogUnsafePath' })
  expect(JSON.parse(await readFile(privatePath, 'utf8')).launchId).toBe(launchId)
})

test('Native history refuses archive junctions and never adopts a stale running record as the current process', async ({ launcher }) => {
  const [instance] = await seedReactLibrary(launcher.main), { path, record } = await seedHistory(launcher, instance)
  await writeFile(join(path, 'launch.json'), JSON.stringify({ ...record, state: 'running', endedAt: undefined, evidence: { ...record.evidence, launcherOutput: 'absent' } }))
  await mkdir(join(instance, 'logs')); await writeFile(join(instance, 'logs/latest.log'), 'new unrelated log')
  const stale = await launcher.main.evaluate(async ({ instance, launchId }) => {
    const service = (window as any).serviceChannels.open('InstanceLogService')
    return { list: await service.call('listLaunches', instance), text: await service.call('getLaunchEvidence', instance, launchId, 'game.log') }
  }, { instance, launchId })
  expect(stale.list[0].evidence.gameLog).toBe('absent'); expect(stale.text).toBe('')
  const external = join(launcher.gameDataPath, 'external-history-fixture'); await mkdir(external); await writeFile(join(external, 'private.txt'), 'PRIVATE-FIXTURE')
  await rename(path, `${path}-original`); await symlink(external, path, 'junction')
  const errors = await launcher.main.evaluate(async ({ instance, launchId }) => {
    const service = (window as any).serviceChannels.open('InstanceLogService'), result: string[] = []
    for (const [method, args] of [['getLaunch', [instance, launchId]], ['listLaunches', [instance]], ['getLaunchEvidence', [instance, launchId, 'game.log']], ['getLaunch', [instance, '../private.txt']]] as const) {
      try { await service.call(method, ...args); result.push('unexpected success') } catch (error: any) { result.push(error.name) }
    }
    return result
  }, { instance, launchId })
  expect(errors).toEqual(Array(4).fill('InstanceLogUnsafePath'))
  expect(await readFile(join(external, 'private.txt'), 'utf8')).toBe('PRIVATE-FIXTURE')
})
