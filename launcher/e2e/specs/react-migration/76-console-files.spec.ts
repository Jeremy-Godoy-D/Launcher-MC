import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
