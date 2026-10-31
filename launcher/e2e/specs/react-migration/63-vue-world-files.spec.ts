import { test, expect } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES' } })
test('Vue host retains save state compatibility while the reviewed Native API copies and backs up worlds', async ({ launcher }) => {
  const page = launcher.main, path: string = await page.evaluate(async () => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Vue world compatibility', runtime: { minecraft: '1.21.1' } }))
  const source = await makeReactWorld(path, 'Alpha'), bytes = await readFile(join(source, 'level.dat'))
  const result = await page.evaluate(async path => {
    const service = (window as any).serviceChannels.open('InstanceSavesService')
    const copy = await service.call('previewWorldFiles', { type: 'copy', instancePath: path, saveName: 'Alpha', destinationInstancePath: path, destinationName: 'Beta' }); await service.call('applyWorldFiles', copy)
    const removal = await service.call('previewWorldFiles', { type: 'remove', instancePath: path, saveName: 'Alpha' }); const result = await service.call('applyWorldFiles', removal)
    return { ...result, worlds: await service.call('getInstanceSaves', path) }
  }, path)
  expect(await readFile(join(result.backup, 'Alpha/level.dat'))).toEqual(bytes); expect(await readFile(join(path, 'saves/Beta/level.dat'))).toEqual(bytes); expect(result.worlds.map((world: any) => world.name)).toEqual(['Beta'])
})
