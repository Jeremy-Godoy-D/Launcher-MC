import { link, mkdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
test('concurrent Native log requests keep each instance and file identity and complete each removal', async ({ launcher }) => {
  const page = launcher.main, [first, second] = await seedReactLibrary(page)
  for (const [path, name] of [[first, 'alpha'], [second, 'beta']]) {
    await mkdir(join(path, 'logs'), { recursive: true }); await writeFile(join(path, 'logs', `${name}.log`), name)
  }
  const listings = await page.evaluate(async paths => {
    const service = (window as any).serviceChannels.open('InstanceLogService')
    return Promise.all(paths.map(path => service.call('listLogs', path)))
  }, [first, second])
  expect(listings).toEqual([['alpha.log'], ['beta.log']])
  await writeFile(join(first, 'logs/second.log'), 'second')
  const content = await page.evaluate(async path => {
    const service = (window as any).serviceChannels.open('InstanceLogService')
    return Promise.all(['alpha.log', 'second.log'].map(name => service.call('getLogContent', path, name)))
  }, first)
  expect(content).toEqual(['alpha', 'second'])
  await page.evaluate(async path => {
    const service = (window as any).serviceChannels.open('InstanceLogService')
    await Promise.all(['alpha.log', 'second.log'].map(name => service.call('removeLog', path, name)))
  }, first)
  for (const name of ['alpha.log', 'second.log']) await expect(readFile(join(first, 'logs', name))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(second, 'logs/beta.log'), 'utf8')).toBe('beta')
})

test('Native log IPC refuses external files, traversal, links and unregistered directories', async ({ launcher }) => {
  const page = launcher.main, [first, second] = await seedReactLibrary(page)
  const foreign = join(launcher.gameDataPath, 'unregistered-log-fixture')
  await mkdir(join(foreign, 'logs'), { recursive: true }); await writeFile(join(foreign, 'logs/private.txt'), 'PRIVATE-FIXTURE')
  await mkdir(join(first, 'logs')); await mkdir(join(first, 'crash-reports')); await mkdir(join(second, 'logs'))
  await writeFile(join(second, 'logs/private.txt'), 'PRIVATE-FIXTURE')
  await link(join(second, 'logs/private.txt'), join(first, 'logs/hard.txt'))
  await mkdir(join(first, 'server')); await symlink(join(second, 'logs'), join(first, 'server/logs'), 'junction')
  await writeFile(join(first, 'crash-reports/local.txt'), 'local crash')
  const results = await page.evaluate(async ({ first, second, foreign }) => {
    const service = (window as any).serviceChannels.open('InstanceLogService')
    const failures: string[] = []
    for (const method of ['listLogs', 'listLaunches', 'getLaunch', 'getLaunchEvidence', 'getLogContent', 'removeLog', 'showLog']) {
      try { await service.call(method, foreign, 'private.txt'); failures.push('unexpected success') } catch (error: any) { failures.push(error.name) }
    }
    for (const name of ['../instance.json', 'latest.log:private', 'CON.txt', 'hard.txt']) {
      for (const method of ['getLogContent', 'removeLog', 'showLog']) {
        try { await service.call(method, first, name); failures.push('unexpected success') } catch (error: any) { failures.push(error.name) }
      }
    }
    for (const method of ['listServerLogs', 'getServerLogContent', 'removeServerLog', 'showServerLog']) {
      try { await service.call(method, first, 'private.txt'); failures.push('unexpected success') } catch (error: any) { failures.push(error.name) }
    }
    try { await service.call('getCrashReportContent', first, second + '/logs/private.txt'); failures.push('unexpected success') } catch (error: any) { failures.push(error.name) }
    const internal: boolean[] = []
    for (const method of ['read', 'javaRoot', '#read', '#javaRoot']) {
      try { await service.call(method, foreign, 'logs', 'private.txt'); internal.push(false) } catch { internal.push(true) }
    }
    return { failures, internal, local: await service.call('getCrashReportContent', first, first + '/crash-reports/local.txt') }
  }, { first, second, foreign })
  expect(results.failures.slice(0, 7)).toEqual(Array(7).fill('InstanceNotFoundError'))
  expect(results.failures.slice(7)).toEqual(Array(17).fill('InstanceLogUnsafePath'))
  expect(results.local).toBe('local crash')
  expect(results.internal).toEqual([true, true, true, true])
  expect(await readFile(join(foreign, 'logs/private.txt'), 'utf8')).toBe('PRIVATE-FIXTURE')
  expect(await readFile(join(second, 'logs/private.txt'), 'utf8')).toBe('PRIVATE-FIXTURE')
})
