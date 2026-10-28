import { test, expect, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactMod } from '../../helpers/react-content'
import { readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createServer, type ServerResponse } from 'node:http'

test.use({ launcherOptions: { locale: 'es-ES' } })
type FilePlan = { path: string; hashes: { sha1: string }; downloads?: string[] }
async function reviewed(page: Page, path: string, oldFile: FilePlan, file: FilePlan) {
  return page.evaluate(async ({ path, oldFile, file }) => {
    const snapshot = await (window as any).serviceChannels.open('InstanceModsService').call('getModFilesSnapshot', path)
    const options = { path, oldFiles: [oldFile], files: [file] }
    const changes = await (window as any).serviceChannels.open('InstanceInstallService').call('previewInstanceFiles', options)
    return { ...options, review: { snapshot: snapshot.fingerprint as string, changes: changes.map((change: { file: FilePlan; operation: string }) => ({ path: change.file.path, operation: change.operation })) } }
  }, { path, oldFile, file })
}
async function apply(page: Page, options: unknown) {
  return page.evaluate(async options => {
    try { await (window as any).serviceChannels.open('InstanceInstallService').call('installInstanceFiles', options); return { error: undefined } }
    catch (error: any) { return { error: { name: error.name, message: error.message } } }
  }, options)
}
const hash = (data: Buffer) => ({ sha1: createHash('sha1').update(data).digest('hex') })

test('native reviewed replacement keeps a disabled mod disabled and preserves the original source', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'source')
  await makeReactMod(path, 'old', 'Old'); await makeReactMod(source, 'next', 'New')
  await rename(join(path, 'mods/old.jar'), join(path, 'mods/old.jar.disabled'))
  const original = await readFile(join(path, 'mods/old.jar.disabled')), next = await readFile(join(source, 'mods/next.jar'))
  const options = await reviewed(page, path, { path: 'mods/old.jar.disabled', hashes: hash(original) }, { path: 'mods/next.jar.disabled', hashes: hash(next), downloads: [pathToFileURL(join(source, 'mods/next.jar')).href] })
  expect((await apply(page, options)).error).toBeUndefined()
  expect(await readFile(join(path, 'mods/next.jar.disabled'))).toEqual(next)
  expect(await readFile(join(source, 'mods/next.jar'))).toEqual(next)
  await expect(readFile(join(path, 'mods/old.jar.disabled'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(join(path, 'mods/next.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
})

test('native confirmation refuses a configuration changed after the preview', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'source')
  await makeReactMod(path, 'old', 'Old'); await makeReactMod(source, 'next', 'New')
  const original = await readFile(join(path, 'mods/old.jar')), next = await readFile(join(source, 'mods/next.jar'))
  const options = await reviewed(page, path, { path: 'mods/old.jar', hashes: hash(original) }, { path: 'mods/next.jar', hashes: hash(next), downloads: [pathToFileURL(join(source, 'mods/next.jar')).href] })
  await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.1' } }), path)
  expect((await apply(page, options)).error?.name).toBe('ModFilesChangedError')
  expect(await readFile(join(path, 'mods/old.jar'))).toEqual(original)
  await expect(readFile(join(path, 'mods/next.jar'))).rejects.toMatchObject({ code: 'ENOENT' })
})

for (const change of ['file', 'configuration']) test(`native review rejects ${change} changes while a real local download is waiting`, async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), source = join(launcher.gameDataPath, 'source')
  await makeReactMod(path, 'alpha', 'Original'); await makeReactMod(source, 'alpha', 'New')
  const original = await readFile(join(path, 'mods/alpha.jar')), next = await readFile(join(source, 'mods/alpha.jar'))
  let requested = false, released = false
  const responses = new Set<ServerResponse>()
  const finish = () => { released = true; for (const response of responses) if (!response.writableEnded) response.end(next) }
  const server = createServer((request, response) => {
    if (request.url !== '/new.jar') { response.writeHead(404); response.end(); return }
    response.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': next.length })
    if (request.method === 'HEAD') { response.end(); return }
    requested = true; responses.add(response)
    response.once('close', () => responses.delete(response))
    if (released) response.end(next)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture server address')
  let installing: ReturnType<typeof apply> | undefined
  try {
    const options = await reviewed(page, path, { path: 'mods/alpha.jar', hashes: hash(original) }, { path: 'mods/alpha.jar', hashes: hash(next), downloads: [`http://127.0.0.1:${address.port}/new.jar`] })
    installing = apply(page, options)
    await expect.poll(() => requested, { timeout: 10000 }).toBe(true)
    if (change === 'file') await makeReactMod(path, 'alpha', 'User edit')
    else await page.evaluate(async path => (window as any).serviceChannels.open('InstanceService').call('editInstance', { instancePath: path, runtime: { minecraft: '1.21.1', fabricLoader: '0.16.1' } }), path)
    const preserved = await readFile(join(path, 'mods/alpha.jar'))
    finish()
    expect((await installing).error?.name).toBe('ModFilesChangedError')
    expect(await readFile(join(path, 'mods/alpha.jar'))).toEqual(preserved)
    if (change === 'file') expect(preserved).not.toEqual(original)
    else expect(preserved).toEqual(original)
  } finally {
    finish(); await installing
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
