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

export async function makeReactShaderPack(path: string, name: string) {
  await mkdir(join(path, 'shaderpacks'), { recursive: true })
  const require = createRequire(new URL('../../xmcl-runtime/package.json', import.meta.url)), { ZipFile } = require('yazl'), zip = new ZipFile()
  zip.addBuffer(Buffer.from('# Synthetic shader fixture\n'), 'shaders/shaders.properties')
  zip.addBuffer(Buffer.from('#version 150\nvoid main() {}\n'), 'shaders/final.fsh'); zip.end()
  await pipeline(zip.outputStream, createWriteStream(join(path, 'shaderpacks', `${name}.zip`)))
}

export async function makeReactForgeShaderEngine(path: string, engine: 'oculus' | 'iris') {
  await mkdir(join(path, 'mods'), { recursive: true })
  const require = createRequire(new URL('../../xmcl-runtime/package.json', import.meta.url)), { ZipFile } = require('yazl'), zip = new ZipFile()
  const metadata = `modLoader="javafml"\nloaderVersion="[1,)"\nlicense="MIT"\n[[mods]]\nmodId="${engine}"\nversion="1.0.0"\ndisplayName="${engine}"\n`
  zip.addBuffer(Buffer.from(metadata), engine === 'iris' ? 'META-INF/neoforge.mods.toml' : 'META-INF/mods.toml'); zip.end()
  await pipeline(zip.outputStream, createWriteStream(join(path, 'mods', `${engine}.jar`)))
}
