import { test, expect, type Page } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { link, mkdir, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES' } })

async function call(page: Page, method: string, ...args: unknown[]) {
  return page.evaluate(async ({ method, args }) => {
    try { return { value: await (window as any).serviceChannels.open('InstanceInstallService').call(method, ...args) } }
    catch (error: any) { return { error: { name: error.name, message: error.message } } }
  }, { method, args })
}

test('native installer refuses unmanaged directories and hides its internal file readers', async ({ launcher }) => {
  const page = launcher.main, outside = join(launcher.gameDataPath, 'unregistered')
  await mkdir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
  const options = { path: outside, oldFiles: [], files: [] }
  for (const method of ['installInstanceFiles', 'previewInstanceFiles', 'stageInstanceFiles', 'setInstanceInstallManifest']) {
    expect((await call(page, method, options)).error?.name).toBe('InstanceNotFoundError')
  }
  for (const method of ['getInstanceInstallManifest', 'applyInstanceInstallManifest', 'discardInstanceInstallManifest', 'resumeInstanceInstall', 'dismissUnresolvedFiles', 'watchInstanceInstall', 'getLegacyLock']) {
    expect((await call(page, method, outside)).error?.name).toBe('InstanceNotFoundError')
  }
  for (const method of ['getInstallFile', 'getSha1', 'getCrc32', 'getChecksum', 'resumeInstallProfile']) {
    expect((await call(page, method, outside)).error).toBeTruthy()
  }
  expect(await readdir(outside)).toEqual(['keep'])
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
})

test('native installer rejects a registered root replaced with a junction', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), outside = join(launcher.gameDataPath, 'outside')
  await mkdir(outside); await writeFile(join(outside, 'keep'), 'KEEP')
  await rename(path, `${path}-saved`); await symlink(outside, path, 'junction')
  for (const method of ['installInstanceFiles', 'stageInstanceFiles']) {
    expect((await call(page, method, { path, oldFiles: [], files: [] })).error?.name).toBe('UnsafeInstanceDirectory')
  }
  expect(await readdir(outside)).toEqual(['keep'])
  expect(await readFile(join(outside, 'keep'), 'utf8')).toBe('KEEP')
})

test('native metadata writes preserve linked originals and cannot replace launcher configuration', async ({ launcher }) => {
  const page = launcher.main, [path] = await seedReactLibrary(page), original = await readFile(join(path, 'instance.json'))
  for (const target of ['../outside', 'instance.json', 'config/../INSTANCE.JSON', '.install-state-old.tmp', '']) {
    const options = { path, oldFiles: [], files: [{ path: target, hashes: {} }] }
    for (const method of ['previewInstanceFiles', 'stageInstanceFiles', 'installInstanceFiles']) {
      expect((await call(page, method, options)).error?.message).toContain('Invalid instance install path')
    }
  }
  expect(await readFile(join(path, 'instance.json'))).toEqual(original)
  const outside = join(launcher.gameDataPath, 'manifest-original.json'), manifest = join(path, '.install-manifest')
  const data = JSON.stringify({ version: 1, createdAt: 1, updatedAt: 1, oldFiles: [], files: [] })
  await writeFile(outside, data); await link(outside, manifest)
  expect((await call(page, 'stageInstanceFiles', { path, oldFiles: [], files: [{ path: 'mods/next.jar', hashes: {} }] })).error).toBeUndefined()
  expect(JSON.parse(await readFile(manifest, 'utf8')).files[0].path).toBe('mods/next.jar')
  expect(await readFile(outside, 'utf8')).toBe(data)
  expect((await call(page, 'discardInstanceInstallManifest', path)).error).toBeUndefined()
  await expect(readFile(manifest)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(outside, 'utf8')).toBe(data)
  expect(await readFile(join(path, 'instance.json'))).toEqual(original)
})
