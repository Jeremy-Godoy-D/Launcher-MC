import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'

export async function makeReactMod(path: string, name: string, title: string, metadata: Record<string, unknown> = {}) {
  await mkdir(join(path, 'mods'), { recursive: true })
  const require = createRequire(new URL('../../xmcl-runtime/package.json', import.meta.url)), { ZipFile } = require('yazl'), zip = new ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify({ schemaVersion: 1, id: name, name: title, version: '1.0.0', environment: '*', depends: { minecraft: '>=1.20' }, ...metadata })), 'fabric.mod.json')
  zip.end()
  await pipeline(zip.outputStream, createWriteStream(join(path, 'mods', `${name}.jar`)))
}

export async function makeReactResourcePack(path: string, name: string, description: unknown = `Synthetic resource pack ${name}`, format: unknown = 34) {
  await mkdir(join(path, 'resourcepacks'), { recursive: true })
  const require = createRequire(new URL('../../xmcl-runtime/package.json', import.meta.url)), { ZipFile } = require('yazl'), zip = new ZipFile()
  zip.addBuffer(Buffer.from(JSON.stringify({ pack: { pack_format: format, description } })), 'pack.mcmeta'); zip.end()
  await pipeline(zip.outputStream, createWriteStream(join(path, 'resourcepacks', `${name}.zip`)))
}
