import { test, expect } from '../../helpers/scratch'
import { seedReactLibrary } from '../../helpers/react-library'
import { makeReactResourcePack } from '../../helpers/react-content'
import { stubOpenDialog } from '../../helpers/tasks/importModpack'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

test.use({ launcherOptions: { locale: 'es-ES' } })

test('production launch preparation waits for a held shared pack copy and releases its locks on Java validation failure', async ({ launcher }) => {
  const page = launcher.main, [a, b] = await seedReactLibrary(page), root = launcher.gameDataPath, version = 'pack-lock-fixture'
  const sourceRoot = join(root, 'copy-source'); await makeReactResourcePack(sourceRoot, 'delayed')
  const source = join(sourceRoot, 'resourcepacks/delayed.zip'), bytes = await readFile(source)
  await mkdir(join(root, 'versions', version), { recursive: true })
  await writeFile(join(root, 'versions', version, `${version}.json`), JSON.stringify({ id: version, type: 'release', mainClass: 'net.minecraft.client.main.Main', assets: 'fixture', assetIndex: { id: 'fixture', url: 'https://example.invalid/assets', size: 0, totalSize: 0, sha1: 'a'.repeat(40) }, downloads: { client: { url: 'https://example.invalid/client', size: 0, sha1: 'b'.repeat(40) } }, libraries: [], arguments: { jvm: [], game: [] } }))
  await page.evaluate(async ({ paths, version }) => {
    for (const path of paths) await (window as any).serviceChannels.open('InstanceResourcePacksService').call('linkShared', path)
    const resolved = await (window as any).serviceChannels.open('VersionService').call('resolveLocalVersion', version)
    if (resolved.id !== version) throw new Error('Invalid fixture version')
  }, { paths: [a, b], version })
  await page.getByTestId('nav-library').click(); await page.getByRole('button', { name: 'Administrar Mi mundo', exact: true }).click(); await page.getByRole('link', { name: 'Packs', exact: true }).click()
  const area = page.getByTestId('instance-resourcepacks')
  await launcher.app.evaluate((_electron, source) => {
    const fs = (process as any).getBuiltinModule('node:fs/promises'), child = (process as any).getBuiltinModule('node:child_process'), modules = (process as any).getBuiltinModule('node:module'), globals = globalThis as any
    const copy = fs.copyFile, spawn = child.ChildProcess.prototype.spawn, noLaunch = process.env.XMCL_E2E_NO_LAUNCH
    let release!: () => void
    const hold = new Promise<void>(resolve => { release = resolve })
    globals.__packCopyHeld = false; globals.__spawnAttempts = []
    globals.__releasePackCopy = release
    globals.__restorePackStartup = () => { release(); fs.copyFile = copy; child.ChildProcess.prototype.spawn = spawn; process.env.XMCL_E2E_NO_LAUNCH = noLaunch; modules.syncBuiltinESMExports() }
    fs.copyFile = async (from: string, to: string, flags: number) => { if (from === source) { globals.__packCopyHeld = true; await hold } return copy(from, to, flags) }
    // Run the real launch branch, while preventing every OS child-process spawn in this isolated fixture.
    delete process.env.XMCL_E2E_NO_LAUNCH
    child.ChildProcess.prototype.spawn = function (options: { file: string }) { globals.__spawnAttempts.push(options.file); throw new Error('Child spawn disabled by fixture') }
    modules.syncBuiltinESMExports()
  }, source)
  try {
    await stubOpenDialog(launcher, source); await area.getByRole('button', { name: 'Añadir archivos', exact: true }).click()
    await expect.poll(() => launcher.app.evaluate(() => (globalThis as any).__packCopyHeld)).toBe(true)
    await page.evaluate(({ path, version }) => {
      const state = window as any
      state.__packLaunchResult = null
      state.__packLaunch = state.serviceChannels.open('LaunchService').call('launch', { gameDirectory: path, version, java: path + '/missing-java.exe', side: 'client', user: { id: 'isolated-lock-fixture', username: 'LockFixture', authority: 'offline', selectedProfile: 'fixture', profiles: { fixture: { id: 'fixture', name: 'LockFixture' } } } }).then(() => { state.__packLaunchResult = { unexpected: true } }, (error: any) => { state.__packLaunchResult = { name: error.name, type: error.exception?.type } })
    }, { path: b, version })
    const settled = await page.evaluate(async () => Promise.race([(window as any).__packLaunch.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 250))]))
    expect(settled).toBe(false)
    await launcher.app.evaluate(() => (globalThis as any).__releasePackCopy())
    await expect.poll(() => page.evaluate(() => (window as any).__packLaunchResult)).toMatchObject({ type: 'launchInvalidJavaPath' })
    await expect(area.getByRole('status').filter({ hasText: 'Archivos copiados' })).toBeVisible()
    expect(await readFile(join(root, 'resourcepacks/delayed.zip'))).toEqual(bytes)
    // A new selection write proves the failed launch released the shared and instance locks.
    await page.evaluate(async path => { const service = (window as any).serviceChannels.open('InstanceOptionsService'), selection = await service.call('getResourcePackSelection', path); await service.call('editResourcePackSelection', path, selection) }, b)
  } finally {
    await launcher.app.evaluate(() => (globalThis as any).__releasePackCopy())
    await page.evaluate(async () => { if ((window as any).__packLaunch) await (window as any).__packLaunch })
    await launcher.app.evaluate(() => (globalThis as any).__restorePackStartup())
  }
})
