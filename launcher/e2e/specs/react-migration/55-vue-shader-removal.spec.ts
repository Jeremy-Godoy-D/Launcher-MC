import { test, expect } from '../../helpers/scratch'
import { makeReactShaderPack } from '../../helpers/react-content'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES' } })
test('Vue legacy shader uninstall keeps its paths and empty contract while preserving unrelated selections and backup bytes', async ({ launcher }) => {
  const page = launcher.main, path: string = await page.evaluate(async () => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Vue shader compatibility', runtime: { minecraft: '1.21.1' } }))
  await makeReactShaderPack(path, 'Alpha'); await makeReactShaderPack(path, 'Other'); const archive = join(path, 'shaderpacks/Alpha.zip'), bytes = await readFile(archive), otherBytes = await readFile(join(path, 'shaderpacks/Other.zip'))
  await mkdir(join(path, 'config'), { recursive: true }); const config = 'shaderPack=Alpha.zip\nunknown=KEEP\n', other = 'shaderPack=Other.zip\nenableShaders=true\n'
  await writeFile(join(path, 'optionsshaders.txt'), config); await writeFile(join(path, 'config/iris.properties'), other)
  await page.evaluate(async ({ path, archive }) => {
    const service = (window as any).serviceChannels.open('InstanceShaderPacksService'); await service.call('uninstall', { path, files: [] }); await service.call('uninstall', { path, files: [archive] })
  }, { path, archive })
  const backup = (await readdir(join(path, '.backups'))).find(name => name.startsWith('shaderpacks-'))!
  expect(await readFile(join(path, '.backups', backup, 'shaderpacks/Alpha.zip'))).toEqual(bytes); expect(await readFile(join(path, '.backups', backup, 'optionsshaders.txt'), 'utf8')).toBe(config)
  expect(await readFile(join(path, 'config/iris.properties'), 'utf8')).toBe(other); expect(await readFile(join(path, 'shaderpacks/Other.zip'))).toEqual(otherBytes)
  const options = await page.evaluate(async path => (window as any).serviceChannels.open('InstanceOptionsService').call('getShaderOptions', path), path)
  expect(options).toMatchObject({ shaderPack: '', unknown: 'KEEP' })
})
