import { test, expect } from '../../helpers/scratch'
import { makeReactShaderPack } from '../../helpers/react-content'
import { lstat, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
test('the Vue host keeps legacy shader link and unlink calls with independent retained files', async ({ launcher }) => {
  const page = launcher.main, root = launcher.gameDataPath, path: string = await page.evaluate(async () => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Vue shader sharing', runtime: { minecraft: '1.21.1' } }))
  await makeReactShaderPack(path, 'local'); await makeReactShaderPack(root, 'common'); const bytes = await readFile(join(path, 'shaderpacks/local.zip'))
  await writeFile(join(path, 'optionsshaders.txt'), 'shaderPack=local.zip\n')
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceShaderPacksService').call('linkShared', path), path)
  expect((await lstat(join(path, 'shaderpacks'))).isSymbolicLink()).toBe(true)
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceShaderPacksService').call('unlinkShared', path), path)
  expect((await lstat(join(path, 'shaderpacks'))).isSymbolicLink()).toBe(false)
  expect(await readFile(join(path, 'shaderpacks/local.zip'))).toEqual(bytes)
  expect((await lstat(join(path, 'shaderpacks/common.zip'))).ino).not.toBe((await lstat(join(root, 'shaderpacks/common.zip'))).ino)
  expect(await readFile(join(path, 'optionsshaders.txt'), 'utf8')).toBe('shaderPack=local.zip\n')
})
