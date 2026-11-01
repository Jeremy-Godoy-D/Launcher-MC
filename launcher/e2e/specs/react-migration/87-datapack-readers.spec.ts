import { copyFile, lstat, mkdir, readFile, readdir, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, type Page } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { makeReactResourcePack } from '../../helpers/react-content'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function call(page: Page, method: string, ...args: any[]) {
  return page.evaluate(async ({ method, args }) => {
    try { return await (window as any).serviceChannels.open('InstanceSavesService').call(method, ...args) }
    catch (error) { throw new Error(JSON.stringify(error)) }
  }, { method, args })
}
async function instance(page: Page) {
  return page.evaluate(() => (window as any).serviceChannels.open('InstanceService').call('createInstance', { name: 'Reader worlds', runtime: { minecraft: '1.21.1' } })) as Promise<string>
}
async function openWatch(page: Page, savePath: string) {
  return page.evaluate(async savePath => {
    const state = await (window as any).serviceChannels.open('InstanceSavesService').call('watchSaveDatapacks', savePath)
    const changes: any[] = [], listener = (type: string, payload: any) => { if (type === 'saveDatapacks') changes.push(payload) }
    ;(window as any).__datapackReader = { state, changes, listener }
    state.subscribeAll(listener)
    return state.datapacks
  }, savePath)
}
const latest = (page: Page) => page.evaluate(() => {
  const { state, changes } = (window as any).__datapackReader
  return changes.at(-1) || state.datapacks
})
async function closeWatch(page: Page) {
  await page.evaluate(async () => {
    const entry = (window as any).__datapackReader
    entry.state.unsubscribeAll(entry.listener); await entry.state.unref(); delete (window as any).__datapackReader
  })
}

test('Native datapack readers reject foreign destinations and raw private readers without creating folders', async ({ launcher }) => {
  const path = await instance(launcher.main), world = await makeReactWorld(path, 'Alpha')
  const foreign = await makeReactWorld(join(launcher.gameDataPath, 'foreign-instance'), 'Foreign'), bytes = await readFile(join(foreign, 'level.dat'))
  for (const [method, args] of [['watchSaveDatapacks', [foreign]], ['getInstanceSaveDatapacks', [join(launcher.gameDataPath, 'foreign-instance')]], ['readDatapack', [world, 'Pack.zip']]] as const) {
    expect(await launcher.main.evaluate(async ({ method, args }) => { try { await (window as any).serviceChannels.open('InstanceSavesService').call(method, ...args); return false } catch { return true } }, { method, args })).toBe(true)
  }
  await expect(lstat(join(foreign, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(foreign, 'level.dat'))).toEqual(bytes)
  await writeFile(join(world, 'datapacks'), 'INVALID DIRECTORY')
  expect(await launcher.main.evaluate(async world => { try { await (window as any).serviceChannels.open('InstanceSavesService').call('watchSaveDatapacks', world); return false } catch { return true } }, world)).toBe(true)
  await unlink(join(world, 'datapacks')); await mkdir(join(world, 'datapacks'))
  expect(await openWatch(launcher.main, world)).toEqual([])
  await closeWatch(launcher.main)
})

test('Native datapack watch discovers a missing folder, publishes live bounded metadata and releases filesystem handles', async ({ launcher }, testInfo) => {
  const page = launcher.main, path = await instance(page), world = await makeReactWorld(path, 'Alpha'), bytes = await readFile(join(world, 'level.dat'))
  expect(await openWatch(page, world)).toEqual([])
  await expect(lstat(join(world, 'datapacks'))).rejects.toHaveProperty('code', 'ENOENT')
  const active = () => launcher.app.evaluate(() => ((process.report.getReport() as any).libuv || []).some((entry: any) => entry.type === 'fs_event' && typeof entry.filename === 'string' && /\/Reader worlds\/saves\/Alpha(?:\/datapacks)?$/.test(entry.filename.replace(/\\/g, '/'))))
  try {
    await expect.poll(active).toBe(true)
    const source = join(launcher.gameDataPath, 'reader-source'); await makeReactResourcePack(source, 'Pack', 'Native datapack metadata', 48)
    await mkdir(join(world, 'datapacks')); await copyFile(join(source, 'resourcepacks/Pack.zip'), join(world, 'datapacks/Pack.zip'))
    await expect.poll(async () => (await latest(page)).map((row: any) => row.fileName), { timeout: 10000 }).toEqual(['Pack.zip'])
    await writeFile(join(world, 'datapacks/.Pack.zip.curseforge'), JSON.stringify({ projectId: 123, fileId: 456, ignored: 'EXTRA' }))
    await expect.poll(async () => (await latest(page))[0]?.curseforge, { timeout: 10000 }).toEqual({ projectId: 123, fileId: 456 })
    const rows = await call(page, 'getInstanceSaveDatapacks', path)
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ savePath: world, path: join(world, 'datapacks/Pack.zip'), description: 'Native datapack metadata', packFormat: 48 })
    const foreign = join(launcher.gameDataPath, 'foreign-pack'); await mkdir(foreign); await writeFile(join(foreign, 'pack.mcmeta'), '{INVALID FOREIGN METADATA')
    await symlink(foreign, join(world, 'datapacks/Foreign'), 'junction')
    await page.evaluate(() => (window as any).__datapackReader.state.revalidate())
    await expect.poll(async () => (await latest(page)).map((row: any) => row.fileName), { timeout: 10000 }).toEqual(['Pack.zip'])
    expect(await readFile(join(foreign, 'pack.mcmeta'), 'utf8')).toBe('{INVALID FOREIGN METADATA')
    expect(await readFile(join(world, 'level.dat'))).toEqual(bytes)
    await writeFile(testInfo.outputPath('reader-state.json'), JSON.stringify({ rows, foreignPreserved: true, gameStarted: false }, null, 2))
  } finally { await closeWatch(page) }
  await expect.poll(active).toBe(false)
})

test('Native worlds and datapacks observers survive shared-folder replacement and clear a detached world', async ({ launcher }) => {
  const page = launcher.main, path = await instance(page), world = await makeReactWorld(path, 'Alpha')
  const source = join(launcher.gameDataPath, 'reader-source'); await makeReactResourcePack(source, 'Pack', 'Shared datapack', 48)
  await mkdir(join(world, 'datapacks')); await copyFile(join(source, 'resourcepacks/Pack.zip'), join(world, 'datapacks/Pack.zip'))
  await page.evaluate(async path => { (window as any).__readerWorlds = await (window as any).serviceChannels.open('InstanceSavesService').call('watch', path) }, path)
  expect(await openWatch(page, world)).toHaveLength(1)
  try {
    await expect.poll(() => launcher.app.evaluate(() => {
      const paths = ((process.report.getReport() as any).libuv || []).filter((entry: any) => entry.type === 'fs_event' && typeof entry.filename === 'string').map((entry: any) => entry.filename.replace(/\\/g, '/'))
      return { worlds: paths.some((path: string) => path.endsWith('/Reader worlds/saves')), datapacks: paths.some((path: string) => path.endsWith('/Reader worlds/saves/Alpha/datapacks')) }
    })).toEqual({ worlds: true, datapacks: true })
    await call(page, 'linkSharedSave', path)
    expect((await lstat(join(path, 'saves'))).isSymbolicLink()).toBe(true)
    expect((await call(page, 'getInstanceSaveDatapacks', path))[0].path).toBe(join(world, 'datapacks/Pack.zip'))
    await call(page, 'unlinkSharedSave', path)
    await expect.poll(() => latest(page)).toEqual([])
    expect(await readdir(join(path, 'saves'))).toEqual([])
    expect(await readFile(join(launcher.gameDataPath, 'saves/Alpha/datapacks/Pack.zip'))).toEqual(await readFile(join(source, 'resourcepacks/Pack.zip')))
  } finally {
    await closeWatch(page)
    await page.evaluate(async () => { await (window as any).__readerWorlds.unref(); delete (window as any).__readerWorlds })
  }
})

test('Native datapack and world removal preserve backups with an active datapack observer', async ({ launcher }) => {
  const page = launcher.main, path = await instance(page), world = await makeReactWorld(path, 'Alpha'), bytes = await readFile(join(world, 'level.dat'))
  const folder = join(world, 'datapacks/Folder'); await mkdir(folder, { recursive: true }); await writeFile(join(folder, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 48, description: 'Folder fixture' } }))
  expect(await openWatch(page, world)).toHaveLength(1)
  try {
    await expect.poll(() => launcher.app.evaluate(() => ((process.report.getReport() as any).libuv || []).some((entry: any) => entry.type === 'fs_event' && typeof entry.filename === 'string' && entry.filename.replace(/\\/g, '/').endsWith('/Reader worlds/saves/Alpha/datapacks')))).toBe(true)
    const review = await call(page, 'previewWorldFiles', { type: 'remove-datapack', instancePath: path, saveName: 'Alpha', fileName: 'Folder' })
    const removed = await call(page, 'applyWorldFiles', review)
    expect(await readFile(join(removed.backup, 'Alpha/Folder/pack.mcmeta'), 'utf8')).toContain('Folder fixture')
    await expect.poll(() => latest(page)).toEqual([])
    await call(page, 'deleteSave', { instancePath: path, saveName: 'Alpha' })
    await expect(lstat(world)).rejects.toHaveProperty('code', 'ENOENT')
    const backups = await readdir(join(path, '.backups'))
    let preserved = false
    for (const name of backups) { const saved = await readFile(join(path, '.backups', name, 'Alpha/level.dat')).catch(() => undefined); if (saved?.equals(bytes)) preserved = true }
    expect(preserved).toBe(true)
    await makeReactWorld(path, 'Alpha'); await mkdir(join(world, 'datapacks'))
    await page.evaluate(() => (window as any).__datapackReader.state.revalidate())
    const source = join(launcher.gameDataPath, 'restored-source'); await makeReactResourcePack(source, 'Restored', 'Restored world pack', 48)
    await copyFile(join(source, 'resourcepacks/Restored.zip'), join(world, 'datapacks/Restored.zip'))
    await expect.poll(async () => (await latest(page)).map((row: any) => row.fileName), { timeout: 10000 }).toEqual(['Restored.zip'])
  } finally { await closeWatch(page) }
})
