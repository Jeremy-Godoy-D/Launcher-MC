import { lstat, mkdir, readFile, readdir, rename, symlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test, expect } from '../../helpers/scratch'
import { makeReactWorld } from '../../helpers/react-world'
import { javaWorldLock } from '../../helpers/java-world-lock'

async function seedLegacy(root: string) {
  const temporary = join(root, 'legacy-source'); await makeReactWorld(temporary, 'Alpha', 'Legacy title')
  await makeReactWorld(temporary, '.Hidden', 'Hidden title')
  await writeFile(join(temporary, 'saves/notes.txt'), 'LEGACY NOTES')
  await rename(join(temporary, 'saves'), join(root, 'shared-saves'))
  return { world: join(root, 'shared-saves/Alpha'), bytes: await readFile(join(root, 'shared-saves/Alpha/level.dat')) }
}
async function shared(launcher: { main: any }) {
  return launcher.main.evaluate(() => (window as any).serviceChannels.open('InstanceSavesService').call('getSharedSaves'))
}

test.describe('legacy worlds startup migration', () => {
  test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true, prepareGameData: async root => {
    await seedLegacy(root); await makeReactWorld(root, 'Alpha', 'Existing title')
    const archive = join(root, 'saves/old.zip'); await writeFile(archive, 'USER ARCHIVE'); await utimes(archive, new Date(0), new Date(0))
  } } })
  test('Native startup preserves occupied worlds, old archives and independent original backups', async ({ launcher }, testInfo) => {
    const root = launcher.gameDataPath, rows = await shared(launcher)
    expect(rows.map((row: any) => [row.name, row.levelName])).toEqual([['Alpha', 'Existing title'], ['Alpha (1)', 'Legacy title']])
    expect(await readFile(join(root, 'saves/old.zip'), 'utf8')).toBe('USER ARCHIVE')
    expect(await readFile(join(root, 'saves/notes.txt'), 'utf8')).toBe('LEGACY NOTES')
    await expect(lstat(join(root, 'shared-saves'))).rejects.toHaveProperty('code', 'ENOENT')
    const [folder] = await readdir(join(root, '.backups')), backup = join(root, '.backups', folder, 'shared-saves')
    const original = join(backup, 'Alpha/level.dat'), installed = join(root, 'saves/Alpha (1)/level.dat')
    expect(await readFile(installed)).toEqual(await readFile(original))
    expect((await lstat(installed, { bigint: true })).ino).not.toBe((await lstat(original, { bigint: true })).ino)
    expect(await readFile(join(root, 'saves/.Hidden/level.dat'))).toEqual(await readFile(join(backup, '.Hidden/level.dat')))
    await writeFile(testInfo.outputPath('legacy-world-migration.json'), JSON.stringify({ rows, backup, independent: true, gameStarted: false }, null, 2))
  })
})

test.describe('unsafe legacy source', () => {
  test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true, prepareGameData: async root => {
    await seedLegacy(root); const foreign = join(root, 'foreign'); await mkdir(foreign); await writeFile(join(foreign, 'private'), 'KEEP')
    await symlink(foreign, join(root, 'shared-saves/Alpha/region'), 'junction')
  } } })
  test('Native startup leaves unsafe legacy data and foreign files untouched', async ({ launcher }) => {
    const root = launcher.gameDataPath
    expect(await shared(launcher)).toEqual([])
    expect(await readFile(join(root, 'foreign/private'), 'utf8')).toBe('KEEP')
    expect(await readFile(join(root, 'shared-saves/notes.txt'), 'utf8')).toBe('LEGACY NOTES')
    expect(await readdir(join(root, 'saves'))).toEqual([])
    await expect(lstat(join(root, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
  })
})

test.describe('legacy world with an external session', () => {
  let external: Awaited<ReturnType<typeof javaWorldLock>> | undefined
  test.use({ launcherOptions: { locale: 'es-ES', gameDataParentAlias: true, prepareGameData: async root => {
    const { world } = await seedLegacy(root); await writeFile(join(world, 'session.lock'), '☃'); external = await javaWorldLock(world)
  } } })
  test.afterEach(async () => { await external?.release(); external = undefined })
  test('Native startup refuses migration while another Java process owns a legacy world', async ({ launcher }) => {
    const root = launcher.gameDataPath
    expect(external?.status).toBe('LOCKED')
    expect(await shared(launcher)).toEqual([])
    expect(await readFile(join(root, 'shared-saves/notes.txt'), 'utf8')).toBe('LEGACY NOTES')
    expect(await readdir(join(root, 'saves'))).toEqual([])
    await expect(lstat(join(root, '.backups'))).rejects.toHaveProperty('code', 'ENOENT')
  })
})
