import { spawn } from 'node:child_process'
import { lstat, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect, type Page } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { javaWorldLock } from '../../helpers/java-world-lock'
import { seedReactLibrary } from '../../helpers/react-library'
import { activateLauncherControl } from '../../helpers/focus-launcher'
import axe from 'axe-core'

test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true } })
async function call(page: Page, service: string, method: string, ...args: any[]) {
  return page.evaluate(async ({ service, method, args }) => {
    try { return await (window as any).serviceChannels.open(service).call(method, ...args) }
    catch (error) { throw new Error(JSON.stringify(error)) }
  }, { service, method, args })
}
const instance = (page: Page) => call(page, 'InstanceService', 'createInstance', { name: 'Removal worlds', runtime: { minecraft: '1.21.1' } }) as Promise<string>
async function existsInstance(page: Page, path: string) { const state = await call(page, 'InstanceService', 'getSharedInstancesState'); return state.instances.some((row: any) => row.path === path) }
async function rejected(page: Page, service: string, method: string, ...args: any[]) { return page.evaluate(async ({ service, method, args }) => { try { await (window as any).serviceChannels.open(service).call(method, ...args); return false } catch { return true } }, { service, method, args }) }

test('Native instance deletion preserves collisions, root notes, backups and clears active world/datapack states', async ({ launcher }, testInfo) => {
  const page = launcher.main, path = await instance(page), world = await makeReactWorld(path, 'Alpha', 'Original title'), bytes = await readFile(join(world, 'level.dat'))
  const occupied = await makeReactWorld(launcher.gameDataPath, 'Alpha', 'Occupied title'), occupiedBytes = await readFile(join(occupied, 'level.dat'))
  await mkdir(join(world, 'datapacks')); await writeFile(join(path, 'saves/.note'), 'ROOT NOTE')
  await mkdir(join(path, 'saves/Misc')); await writeFile(join(path, 'saves/Misc/keep'), 'NON-WORLD DATA')
  await mkdir(join(path, '.backups/previous'), { recursive: true }); await writeFile(join(path, '.backups/previous/keep'), 'PRIOR BACKUP')
  await page.evaluate(async ({ path, world }) => {
    const service = (window as any).serviceChannels.open('InstanceSavesService'), saves = await service.call('watch', path), packs = await service.call('watchSaveDatapacks', world)
    const entry = (window as any).__removalStates = { saves, packs, worlds: saves.saves, datapacks: packs.datapacks }
    saves.subscribeAll((type: string, payload: any) => { if (type === 'instanceSaves') entry.worlds = payload })
    packs.subscribeAll((type: string, payload: any) => { if (type === 'saveDatapacks') entry.datapacks = payload })
  }, { path, world })
  await call(page, 'InstanceSavesService', 'getSharedSaves')
  await call(page, 'InstanceService', 'deleteInstance', path, true)
  expect(await existsInstance(page, path)).toBe(false); await expect(lstat(path)).rejects.toHaveProperty('code', 'ENOENT')
  expect(await readFile(join(occupied, 'level.dat'))).toEqual(occupiedBytes)
  expect(await readFile(join(launcher.gameDataPath, 'saves/Alpha (1)/level.dat'))).toEqual(bytes)
  const [folder] = await readdir(join(launcher.gameDataPath, '.backups')), previous = join(launcher.gameDataPath, '.backups', folder, 'previous')
  expect(await readFile(join(previous, 'previous/keep'), 'utf8')).toBe('PRIOR BACKUP')
  const sharing = (await readdir(previous)).find(name => name.startsWith('world-sharing-'))!
  const original = join(previous, sharing, 'saves/Alpha/level.dat'); expect(await readFile(original)).toEqual(bytes)
  expect((await lstat(original, { bigint: true })).ino).not.toBe((await lstat(join(launcher.gameDataPath, 'saves/Alpha (1)/level.dat'), { bigint: true })).ino)
  expect(await readFile(join(previous, sharing, 'saves/.note'), 'utf8')).toBe('ROOT NOTE')
  expect(await readFile(join(previous, sharing, 'saves/Misc/keep'), 'utf8')).toBe('NON-WORLD DATA')
  await expect.poll(() => page.evaluate(() => { const state = (window as any).__removalStates; return [state.worlds.length, state.datapacks.length] })).toEqual([0, 0])
  await writeFile(testInfo.outputPath('removed-instance-worlds.json'), JSON.stringify({ path, retained: previous, sourceBytesPreserved: true, independent: true, gameStarted: false }, null, 2))
})

test('Native instance deletion and retirement respect an external Java world session', async ({ launcher }) => {
  const page = launcher.main, path = await instance(page), world = await makeReactWorld(path, 'Alpha'), bytes = await readFile(join(world, 'level.dat'))
  await writeFile(join(world, 'session.lock'), '☃'); const external = await javaWorldLock(world); expect(external.status).toBe('LOCKED')
  try {
    for (const flag of [true, false]) expect(await rejected(page, 'InstanceService', 'deleteInstance', path, flag)).toBe(true)
    expect(await existsInstance(page, path)).toBe(true); expect(await readFile(join(world, 'level.dat'))).toEqual(bytes)
    expect(await readdir(join(launcher.gameDataPath, 'saves'))).toEqual([])
  } finally { await external.release() }
  await call(page, 'InstanceService', 'deleteInstance', path, false)
  expect(await existsInstance(page, path)).toBe(false)
  expect(await readFile(join(path, '..', '.Removal worlds/saves/Alpha/level.dat'))).toEqual(bytes)
})

test('Native instance removal refuses foreign saves and the old unguarded preservation method', async ({ launcher }) => {
  const page = launcher.main, path = await instance(page), foreign = await makeReactWorld(join(launcher.gameDataPath, 'foreign-instance'), 'Private'), bytes = await readFile(join(foreign, 'level.dat'))
  await symlink(join(foreign, '..'), join(path, 'saves'), 'junction')
  for (const flag of [true, false]) expect(await rejected(page, 'InstanceService', 'deleteInstance', path, flag)).toBe(true)
  expect(await rejected(page, 'InstanceService', 'moveSavesToShared', path)).toBe(true)
  expect(await rejected(page, 'InstanceSavesService', 'guardInstanceRemoval', path, true)).toBe(true)
  expect(await existsInstance(page, path)).toBe(true); expect(await readFile(join(foreign, 'level.dat'))).toEqual(bytes)
})

test('Native partial removal failure preserves worlds and the registration, then allows retry after releasing the file', async ({ launcher }, testInfo) => {
  const page = launcher.main, path = await instance(page), world = await makeReactWorld(path, 'Alpha'), bytes = await readFile(join(world, 'level.dat')), locked = join(path, 'locked.txt')
  await writeFile(locked, 'LOCKED FIXTURE')
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$stream = [System.IO.File]::Open($env:GRIMO_REMOVAL_LOCK, 'Open', 'Read', 'Read'); [Console]::WriteLine('LOCKED'); [Console]::ReadLine() | Out-Null; $stream.Dispose()"], { windowsHide: true, env: { ...process.env, GRIMO_REMOVAL_LOCK: locked }, stdio: 'pipe' })
  const closed = new Promise(resolve => child.once('close', resolve)), deadline = setTimeout(() => child.kill(), 90000)
  try {
    await new Promise<void>((resolve, reject) => { child.once('error', reject); child.stdout.on('data', data => { if (String(data).includes('LOCKED')) resolve() }); void closed.then(() => reject(new Error('removal file lock helper exited'))) })
    expect(await rejected(page, 'InstanceService', 'deleteInstance', path, true)).toBe(true)
    expect(await existsInstance(page, path)).toBe(true)
    expect(await readFile(join(launcher.gameDataPath, 'saves/Alpha/level.dat'))).toEqual(bytes)
    const backups = await readdir(join(launcher.gameDataPath, '.backups')); expect(backups.some(name => name.startsWith('instance-removal-'))).toBe(true)
    await writeFile(testInfo.outputPath('partial-removal-recovery.json'), JSON.stringify({ path, backups, worldPreserved: true, gameStarted: false }, null, 2))
  } finally { child.stdin.end(); await closed; clearTimeout(deadline) }
  await call(page, 'InstanceService', 'deleteInstance', path, true)
  expect(await existsInstance(page, path)).toBe(false); expect(await readFile(join(launcher.gameDataPath, 'saves/Alpha/level.dat'))).toEqual(bytes)
})

test('React removal explains world contention, retains confirmation and permits retry in both themes and sizes', async ({ launcher }, testInfo) => {
  test.skip(process.env.LAUNCHER_RENDERER === 'vue', 'React dialog; native removal is tested on both renderers')
  const page = launcher.main, [path] = await seedReactLibrary(page), win = await launcher.app.browserWindow(page)
  await launcher.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as any)._invokeHandlers.get('service-call'); (globalThis as any).__removalBusy = true
    ipcMain.removeHandler('service-call'); ipcMain.handle('service-call', async (event: unknown, service: string, method: string, ...args: unknown[]) => {
      if (service === 'InstanceService' && method === 'deleteInstance' && (globalThis as any).__removalBusy) return { error: { name: 'WorldOperationBusyError', message: 'Fixture world operation is pending' } }
      return original(event, service, method, ...args)
    })
  })
  const failure = await page.evaluate(async path => {
    try { await (window as any).serviceChannels.open('InstanceService').call('deleteInstance', path, false); return { rejected: false } }
    catch (error: any) { return { rejected: true, type: typeof error, name: error?.name, message: error?.message, keys: Object.keys(error || {}) } }
  }, path)
  expect(failure).toMatchObject({ rejected: true, name: 'WorldOperationBusyError' })
  await writeFile(testInfo.outputPath('busy-error.json'), JSON.stringify(failure, null, 2))
  for (const theme of ['dark', 'light']) {
    await page.getByTestId('nav-settings').click(); await page.getByLabel('Apariencia', { exact: true }).selectOption(theme)
    await page.getByTestId('nav-library').click(); await activateLauncherControl(launcher, page.getByRole('button', { name: 'Opciones de Mi mundo', exact: true }))
    const dialog = page.getByTestId('instance-operations'); await dialog.getByRole('button', { name: 'Retirar o eliminar', exact: true }).click()
    for (const width of [1200, 800]) {
      await win.evaluate((win, width) => win.setContentSize(width, width === 800 ? 400 : 720), width)
      await activateLauncherControl(launcher, page.getByTestId('instance-operation-confirm'))
      await expect(dialog.getByRole('alert')).toContainText('Hay una operación de mundos en curso')
      await expect(dialog.getByRole('alert')).toBeInViewport({ ratio: 1 }); await expect(page.getByTestId('instance-operation-confirm')).toBeInViewport({ ratio: 1 })
      expect(await existsInstance(page, path)).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.evaluate(axe.source); const report = await page.evaluate(() => (window as any).axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }))
      expect(report.violations).toEqual([]); await writeFile(testInfo.outputPath(`removal-${theme}-${width}-axe.json`), JSON.stringify(report, null, 2))
      await page.screenshot({ path: testInfo.outputPath(`removal-${theme}-${width}.png`) })
    }
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0)
  }
  await launcher.app.evaluate(() => { (globalThis as any).__removalBusy = false })
  await activateLauncherControl(launcher, page.getByRole('button', { name: 'Opciones de Mi mundo', exact: true }))
  await page.getByTestId('instance-operations').getByRole('button', { name: 'Retirar o eliminar', exact: true }).click()
  await activateLauncherControl(launcher, page.getByTestId('instance-operation-confirm'))
  await expect(page.getByTestId('instance-operations')).toHaveCount(0); expect(await existsInstance(page, path)).toBe(false)
})
