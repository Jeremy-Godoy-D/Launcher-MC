import { test, expect } from '../../helpers/scratch'
import { makeReactResourcePack } from '../../helpers/react-content'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('Vue retains local resource pack install empty and same-path contracts while sharing the Native selection service', async ({ launcher }) => {
  const page = launcher.main
  const path: string = await page.evaluate(async () => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Vue pack compatibility', runtime: { minecraft: '1.21.1' } }))
  await makeReactResourcePack(path, 'same'); const file = join(path, 'resourcepacks/same.zip'), bytes = await readFile(file)
  const result = await page.evaluate(async ({ path, file }) => {
    const packs = (window as any).serviceChannels.open('InstanceResourcePacksService'), options = (window as any).serviceChannels.open('InstanceOptionsService')
    await packs.call('watch', path)
    const empty = await packs.call('install', { path, files: [] }), same = await packs.call('install', { path, files: [file] })
    await options.call('editGameSetting', { instancePath: path, resourcePacks: ['vanilla', 'file/same.zip'] })
    return { empty, same, selection: await options.call('getResourcePackSelection', path) }
  }, { path, file })
  expect(result.empty).toEqual([]); expect(result.same).toEqual([file]); expect(result.selection.packs).toEqual(['vanilla', 'file/same.zip'])
  expect(await readFile(file)).toEqual(bytes)
})
