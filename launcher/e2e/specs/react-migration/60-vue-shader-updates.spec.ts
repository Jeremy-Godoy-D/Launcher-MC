import { test, expect } from '../../helpers/scratch'
import { makeReactShaderPack } from '../../helpers/react-content'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
test('the Vue host accepts reviewed shader updates and preserves archive names, configurations and backup bytes', async ({ launcher }) => {
  const page = launcher.main, path: string = await page.evaluate(async () => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Vue shader upgrade', runtime: { minecraft: '1.21.1' } })), source = join(launcher.gameDataPath, 'shader-source')
  await makeReactShaderPack(path, 'alpha', 'OLD'); await makeReactShaderPack(source, 'next', 'NEW'); await mkdir(join(path, 'config'), { recursive: true })
  const files = ['config/iris.properties', 'config/oculus.properties', 'optionsshaders.txt']
  for (const name of files) await writeFile(join(path, name), '# KEEP\nshaderPack=alpha.zip\n')
  const old = await readFile(join(path, 'shaderpacks/alpha.zip')), next = await readFile(join(source, 'shaderpacks/next.zip')), sha1 = (bytes: Buffer) => createHash('sha1').update(bytes).digest('hex')
  await page.evaluate(async ({ path, oldHash, newHash, url }) => {
    const shaders = (window as any).serviceChannels.open('InstanceShaderPacksService'), install = (window as any).serviceChannels.open('InstanceInstallService'), snapshot = await shaders.call('getShaderFilesSnapshot', path)
    const options = { path, oldFiles: [{ path: 'shaderpacks/alpha.zip', hashes: { sha1: oldHash } }], files: [{ path: 'shaderpacks/alpha.zip', hashes: { sha1: newHash }, downloads: [url] }], review: { domain: 'shaderpacks', snapshot: snapshot.fingerprint, changes: [] } }
    const updates = await install.call('previewInstanceFiles', options); options.review.changes = updates.map((update: any) => ({ path: update.file.path, operation: update.operation }))
    await install.call('installInstanceFiles', options)
  }, { path, oldHash: sha1(old), newHash: sha1(next), url: pathToFileURL(join(source, 'shaderpacks/next.zip')).href })
  expect(await readFile(join(path, 'shaderpacks/alpha.zip'))).toEqual(next); expect(await readdir(join(path, 'shaderpacks'))).toEqual(['alpha.zip'])
  for (const name of files) expect(await readFile(join(path, name), 'utf8')).toBe('# KEEP\nshaderPack=alpha.zip\n')
  const [backup] = await readdir(join(path, '.backups')); expect(await readFile(join(path, '.backups', backup, 'shaderpacks/alpha.zip'))).toEqual(old)
  expect(await page.evaluate(async path => (window as any).serviceChannels.open('InstanceInstallService').call('getReviewedModInstalls', path, 'shaderpacks'), path)).toEqual([])
})
