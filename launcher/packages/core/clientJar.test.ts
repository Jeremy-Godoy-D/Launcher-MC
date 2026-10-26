import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { expect, test } from 'vitest'
import { generateArguments, LaunchPrecheck } from './launch'
import { MinecraftFolder } from './folder'
import { Version } from './version'

test('client aliases affect only the JAR, preserving Minecraft identity and launch placeholders', async ({ temp }) => {
  const folder = MinecraftFolder.from(temp)
  const data = Buffer.from('custom-client')
  const profile = { id: 'modded', clientVersion: '1.21.1', jar: 'client-private', mainClass: 'custom.Main', libraries: [], arguments: { game: ['--version', '${version_name}'], jvm: ['-cp', '${classpath}'] }, downloads: { client: { sha1: createHash('sha1').update(data).digest('hex'), size: data.length, url: '' } } }
  const version = Version.resolve(temp, [Version.normalizeVersionJson(JSON.stringify(profile), temp)])
  expect(version.minecraftVersion).toBe('1.21.1')
  expect(version.clientJar).toBe('client-private')
  await mkdir(folder.getVersionRoot('client-private'), { recursive: true })
  await mkdir(folder.getVersionRoot('1.21.1'), { recursive: true })
  await writeFile(folder.getVersionJar('client-private'), data)
  await writeFile(folder.getVersionJar('1.21.1'), 'keep vanilla')
  const args = await generateArguments({ gamePath: temp, resourcePath: temp, javaPath: 'not-spawned-java', version, gameProfile: { id: '0'.repeat(32), name: 'QA' } })
  expect(args[args.indexOf('-cp') + 1]).toBe(folder.getVersionJar('client-private').replaceAll('\\', '/'))
  expect(args[args.indexOf('--version') + 1]).toBe('modded')
  await expect(LaunchPrecheck.checkVersion(folder, version, {} as any)).resolves.toBeUndefined()
  await writeFile(folder.getVersionJar('client-private'), 'corrupt')
  await expect(LaunchPrecheck.checkVersion(folder, version, {} as any)).rejects.toMatchObject({ error: 'CorruptedVersionJar' })
  expect(await readFile(folder.getVersionJar('1.21.1'), 'utf8')).toBe('keep vanilla')
})

test('ordinary clients keep their previous path and child aliases override parent aliases', () => {
  const make = (value: object) => Version.normalizeVersionJson(JSON.stringify({ id: 'base', mainClass: 'Main', libraries: [], ...value }), 'root')
  expect(Version.resolve('root', [make({})]).clientJar).toBeUndefined()
  expect(Version.resolve('root', [make({ id: 'child', jar: 'child-jar' }), make({ jar: 'parent-jar' })]).clientJar).toBe('child-jar')
})

test.each(['../escape', 'a/b', 'C:\\outside', '.', '..', 'NUL', 'client.', 'x'.repeat(201), 'a\nb', null])('rejects unsafe client alias %s while resolving metadata', alias => {
  const raw = { id: 'base', mainClass: 'Main', libraries: [], jar: alias }
  expect(() => Version.resolve('root', [Version.normalizeVersionJson(JSON.stringify(raw), 'root')])).toThrow('client JAR identifier')
})
