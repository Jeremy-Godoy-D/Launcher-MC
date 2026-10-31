import { afterEach, beforeEach, expect, it } from 'vitest'
import { serialize, TagType } from '@xmcl/nbt'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { readWorlds, worldLocation, worldName } from './worldFiles'

class Version { @TagType(TagType.String) Name = '1.21.1' }
class Level {
  @TagType(TagType.String) LevelName = '<img src=x onerror=attack()>'
  @TagType(TagType.Int) GameType = 0
  @TagType(TagType.Byte) Difficulty = 2
  @TagType(TagType.Byte) allowCommands = 1
  @TagType(TagType.Long) Time = 12345n
  @TagType(TagType.Long) LastPlayed = 1760000000000n
  @TagType(TagType.Long) RandomSeed = 0n
  @TagType(Version) Version = new Version()
}
class World { @TagType(Level) Data = new Level() }
let root: string, instance: string
beforeEach(async () => { root = await mkdtemp(join(process.cwd(), '.world-read-test-')); instance = join(root, 'instance'); await mkdir(join(instance, 'saves/Alpha'), { recursive: true }); await writeFile(join(instance, 'saves/Alpha/level.dat'), await serialize(new World(), { compressed: 'gzip' })) })
afterEach(async () => { if (root) { expect(dirname(root)).toBe(process.cwd()); expect(root).toContain('.world-read-test-'); await rm(root, { recursive: true, force: true }) } })

it('reads bounded metadata without changing world bytes or claiming an advancement count', async () => {
  const file = join(instance, 'saves/Alpha/level.dat'), bytes = await readFile(file), info = await lstat(file), [world] = await readWorlds(instance, root)
  expect(world).toMatchObject({ name: 'Alpha', levelName: '<img src=x onerror=attack()>', mode: 0, difficulty: 2, cheat: true, gameVersion: '1.21.1', seed: '0', lastPlayed: 1760000000000, time: 12345 })
  expect(world.error).toBeUndefined(); expect(world.advancements).toBeUndefined(); expect(world.linkTo).toBeUndefined()
  expect(await readFile(file)).toEqual(bytes); expect((await lstat(file)).mtimeMs).toBe(info.mtimeMs)
})
it('retains unreadable worlds as error rows, rejects metadata links and bounds compressed output', async () => {
  await mkdir(join(instance, 'saves/Broken')); await writeFile(join(instance, 'saves/Broken/level.dat'), 'not NBT')
  await mkdir(join(instance, 'saves/Bomb')); await writeFile(join(instance, 'saves/Bomb/level.dat'), gzipSync(Buffer.alloc(17 * 1024 * 1024)))
  await mkdir(join(instance, 'saves/Linked')); await symlink(join(instance, 'saves/Alpha'), join(instance, 'saves/Linked/level.dat'), 'junction')
  expect((await readWorlds(instance, root)).filter(world => world.error).map(world => [world.name, world.error])).toEqual([['Bomb', 'metadata'], ['Broken', 'metadata'], ['Linked', 'metadata']])
})
it('permits only owned shared roots and per-world links, keeping foreign links unread', async () => {
  await mkdir(join(root, 'saves/Owned'), { recursive: true }); await writeFile(join(root, 'saves/Owned/level.dat'), await readFile(join(instance, 'saves/Alpha/level.dat')))
  await symlink(join(root, 'saves/Owned'), join(instance, 'saves/Shared'), 'junction')
  await mkdir(join(root, 'foreign')); await writeFile(join(root, 'foreign/level.dat'), 'PRIVATE'); await symlink(join(root, 'foreign'), join(instance, 'saves/Foreign'), 'junction')
  const worlds = await readWorlds(instance, root)
  expect(worlds.find(world => world.name === 'Shared')).toMatchObject({ seed: '0', linkTo: expect.any(String) }); expect(worlds.find(world => world.name === 'Foreign')).toMatchObject({ error: 'unsafe' })
  expect(await readFile(join(root, 'foreign/level.dat'), 'utf8')).toBe('PRIVATE')
  await rm(join(instance, 'saves'), { recursive: true }); await symlink(join(root, 'saves'), join(instance, 'saves'), 'junction')
  expect((await readWorlds(instance, root))[0]).toMatchObject({ name: 'Owned', linkTo: expect.any(String) })
})
it('copies bounded static PNG icons, refuses icon links and rejects unsafe names and instance roots', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await writeFile(join(instance, 'saves/Alpha/icon.png'), png)
  const [world] = await readWorlds(instance, root); expect(world.icon).toBe('data:image/png;base64,' + png.toString('base64'))
  const huge = Buffer.from(png); huge.writeUInt32BE(99999, 16); await writeFile(join(instance, 'saves/Alpha/icon.png'), huge); expect((await readWorlds(instance, root))[0].icon).toBe('')
  await rm(join(instance, 'saves/Alpha/icon.png')); await symlink(join(instance, 'saves/Alpha'), join(instance, 'saves/Alpha/icon.png'), 'junction')
  expect((await readWorlds(instance, root))[0].icon).toBe('')
  for (const name of ['../other', 'nested/world', 'C:\\foreign', '.', 'NUL', 'bad.']) expect(() => worldName(name)).toThrow()
  await symlink(instance, join(root, 'alias'), 'junction'); await expect(worldLocation(join(root, 'alias'), 'Alpha', root)).rejects.toThrow('Unsafe instance source')
})
it('does not expose timestamps that cannot be formatted as JavaScript dates', async () => {
  const world = new World(); world.Data.LastPlayed = 9000000000000000n
  await writeFile(join(instance, 'saves/Alpha/level.dat'), await serialize(world, { compressed: 'gzip' }))
  expect((await readWorlds(instance, root))[0].lastPlayed).toBe(0)
})
it('rejects forged collection counts and excessive nesting before the shared NBT decoder allocates', async () => {
  const prefix = Buffer.from([10, 0, 0]), name = Buffer.from([0, 1, 120])
  const oversized = Buffer.from([9, ...name, 1, 0x7f, 0xff, 0xff, 0xff, 0])
  const emptyType = Buffer.from([9, ...name, 0, 0, 0, 0, 1, 0])
  const nested = Buffer.concat([prefix, ...Array.from({ length: 70 }, () => Buffer.from([10, ...name])), Buffer.alloc(71)])
  for (const bytes of [Buffer.concat([prefix, oversized]), Buffer.concat([prefix, emptyType]), nested, Buffer.from([10, 0, 0, 8, 0, 5, 120])]) {
    await writeFile(join(instance, 'saves/Alpha/level.dat'), bytes)
    expect((await readWorlds(instance, root))[0].error).toBe('metadata')
    expect(await readFile(join(instance, 'saves/Alpha/level.dat'))).toEqual(bytes)
  }
})
