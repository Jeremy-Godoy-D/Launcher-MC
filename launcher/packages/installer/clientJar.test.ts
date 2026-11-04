import { MinecraftFolder, Version } from '@xmcl/core'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { expect, onTestFinished, test } from 'vitest'
import { ZipFile } from 'yazl'
import { resolveMinecraftJarInstallFile } from './minecraft'
import { diagnoseInstallation } from './installer'
import { executeInstallManifest } from './installManifest'
import { createDefaultNodeInstallRuntime } from './installManifest.default'

test('checks an isolated offline client without downloading or touching the vanilla client', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'grimo-installer-client-'))
  onTestFinished(() => rm(temp, { recursive: true, force: true }))
  const folder = MinecraftFolder.from(temp)
  await mkdir(folder.getVersionRoot('client-private'), { recursive: true })
  const zip = new ZipFile()
  zip.addBuffer(Buffer.from('fixture'), 'qa.txt')
  const writing = pipeline(zip.outputStream, createWriteStream(folder.getVersionJar('client-private')))
  zip.end()
  await writing
  const bytes = await readFile(folder.getVersionJar('client-private'))
  const version = Version.resolve(temp, [Version.normalizeVersionJson(JSON.stringify({ id: 'modded', clientVersion: '1.21.1', jar: 'client-private', mainClass: 'Main', libraries: [], downloads: { client: { url: '', size: bytes.length, sha1: createHash('sha1').update(bytes).digest('hex') } } }), temp)])
  await mkdir(folder.getVersionRoot('client-private'), { recursive: true })
  await mkdir(folder.getVersionRoot('1.21.1'), { recursive: true })
  await writeFile(folder.getVersionJar('client-private'), bytes)
  await writeFile(folder.getVersionJar('1.21.1'), 'keep original')
  const file = resolveMinecraftJarInstallFile(version)!
  expect(file.path).toBe(folder.getVersionJar('client-private'))
  expect(file.urls).toEqual([])
  const runtime = createDefaultNodeInstallRuntime()
  runtime.download = async () => { throw new Error('Unexpected client download') }
  await executeInstallManifest({ schemaVersion: 1, tasks: [{ id: 'client', type: 'files', files: [file] }] }, runtime, { attempts: 1 })
  expect(await diagnoseInstallation(version, { strict: true })).toBeUndefined()
  await writeFile(folder.getVersionJar('client-private'), 'corrupt')
  expect((await diagnoseInstallation(version, { strict: true }))?.jar).toBe('modded')
  expect(await readFile(folder.getVersionJar('1.21.1'), 'utf8')).toBe('keep original')
  const server = resolveMinecraftJarInstallFile({ ...version, downloads: { server: { url: 'https://example.com/server.jar', sha1: '0'.repeat(40), size: 1 } } }, { side: 'server' })!
  expect(server.path).toBe(folder.getVersionJar('1.21.1', 'server'))
})
