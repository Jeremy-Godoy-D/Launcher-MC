import { lstat, mkdir, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, type Page } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function call(page: Page, method: string, ...args: any[]) {
  return page.evaluate(async ({ method, args }) => {
    try { return await (window as any).serviceChannels.open('InstanceSavesService').call(method, ...args) }
    catch (error) { throw new Error(JSON.stringify(error)) }
  }, { method, args })
}
async function instance(page: Page) {
  return page.evaluate(() => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Metadata worlds', runtime: { minecraft: '1.21.1' } })) as Promise<string>
}
async function openWatch(page: Page, path: string) {
  return page.evaluate(async path => {
    const state = await (window as any).serviceChannels.open('InstanceSavesService').call('watch', path)
    const changes: any[] = [], listener = (type: string, payload: any) => { if (type === 'instanceSaves') changes.push(payload) }
    ;(window as any).__worldReader = { state, changes, listener }
    state.subscribeAll(listener)
    return state.saves
  }, path)
}
const latest = (page: Page) => page.evaluate(() => {
  const entry = (window as any).__worldReader
  return entry.changes.at(-1) || entry.state.saves
})

test('Native bounded shared-world metadata preserves counts and provenance while rejecting foreign roots', async ({ launcher }, testInfo) => {
  const page = launcher.main, path = await instance(page), local = await makeReactWorld(path, 'Alpha'), shared = await makeReactWorld(launcher.gameDataPath, 'Shared')
  const bytes = await readFile(join(shared, 'level.dat'))
  await mkdir(join(shared, 'advancements')); await writeFile(join(shared, 'advancements/player.json'), '{INVALID JSON'); await writeFile(join(shared, 'advancements/notes.txt'), 'KEEP')
  await writeFile(join(shared, '.curseforge'), JSON.stringify({ projectId: 123, fileId: 456, ignored: 'EXTRA' }))
  const foreign = await makeReactWorld(join(launcher.gameDataPath, 'foreign-root'), 'Foreign')
  await symlink(foreign, join(launcher.gameDataPath, 'saves/Foreign'), 'junction')
  const rows = await call(page, 'getSharedSaves')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ path: shared, name: 'Shared', instanceName: '', advancements: 1, cheat: true, curseforge: { projectId: 123, fileId: 456 } })
  expect(rows[0].curseforge).not.toHaveProperty('ignored'); expect(rows[0].linkTo).toBeUndefined()
  expect((await call(page, 'getInstanceSaves', path))[0].advancements).toBeUndefined()
  expect(await readFile(join(shared, 'level.dat'))).toEqual(bytes)
  expect(await readdir(local)).toContain('level.dat')
  await writeFile(testInfo.outputPath('shared-metadata.json'), JSON.stringify({ rows, foreignPreserved: true, gameStarted: false }, null, 2))
})

test('Native world snapshots track owned aliases and metadata changes without observing foreign directories', async ({ launcher }, testInfo) => {
  const page = launcher.main, path = await instance(page), local = await makeReactWorld(path, 'Alpha'), shared = await makeReactWorld(launcher.gameDataPath, 'Shared')
  await symlink(shared, join(path, 'saves/Owned alias'), 'junction')
  const foreign = await makeReactWorld(join(launcher.gameDataPath, 'foreign-root'), 'Foreign')
  const privateBytes = await readFile(join(foreign, 'level.dat')); await symlink(foreign, join(path, 'saves/Foreign'), 'junction')
  const initial = await openWatch(page, path)
  expect(initial.map((row: any) => row.name)).toEqual(['Alpha', 'Owned alias'])
  expect(initial[1]).toMatchObject({ path: join(path, 'saves/Owned alias'), linkTo: await realpath(shared), advancements: 0 })
  await makeReactWorld(launcher.gameDataPath, 'Shared', 'Updated depot title')
  await expect.poll(async () => (await latest(page)).find((row: any) => row.name === 'Owned alias')?.levelName, { timeout: 10000 }).toBe('Updated depot title')
  await writeFile(join(local, '.curseforge'), JSON.stringify({ projectId: 9, fileId: 8 }))
  await expect.poll(async () => (await latest(page)).find((row: any) => row.name === 'Alpha')?.curseforge, { timeout: 10000 }).toEqual({ projectId: 9, fileId: 8 })
  const watched = await launcher.app.evaluate(() => ((process.report.getReport() as any).libuv || []).filter((entry: any) => entry.type === 'fs_event' && typeof entry.filename === 'string').map((entry: any) => entry.filename.replace(/\\/g, '/').toLowerCase()))
  expect(watched.some((entry: string) => entry.includes('/foreign-root/foreign'))).toBe(false)
  expect(await readFile(join(foreign, 'level.dat'))).toEqual(privateBytes)
  const final = await latest(page); expect(final.map((row: any) => row.name)).toEqual(['Alpha', 'Owned alias'])
  await writeFile(testInfo.outputPath('world-metadata-events.json'), JSON.stringify({ initial, final, watched, gameStarted: false }, null, 2))
})

test('Native world observer follows shared-folder replacement and resumes on the restored local folder', async ({ launcher }) => {
  const page = launcher.main, path = await instance(page), world = await makeReactWorld(path, 'Alpha'), bytes = await readFile(join(world, 'level.dat'))
  expect(await openWatch(page, path)).toHaveLength(1)
  await call(page, 'linkSharedSave', path)
  await expect.poll(async () => (await latest(page)).map((row: any) => row.name)).toEqual(['Alpha'])
  await call(page, 'unlinkSharedSave', path)
  await expect.poll(() => latest(page)).toEqual([])
  await makeReactWorld(path, 'Restored')
  await expect.poll(async () => (await latest(page)).map((row: any) => row.name), { timeout: 10000 }).toEqual(['Restored'])
  expect((await lstat(join(path, 'saves'))).isSymbolicLink()).toBe(false)
  expect(await readFile(join(launcher.gameDataPath, 'saves/Alpha/level.dat'))).toEqual(bytes)
})
