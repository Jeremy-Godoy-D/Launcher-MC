import { LibraryInfo } from '@xmcl/core'
import { getMmcLocalLibraryNames, getMultiMCGameDirectory, type MMCModpackManifest } from '@xmcl/instance'
import { createHash } from 'node:crypto'
import { lstat, readdir } from 'node:fs/promises'
import { basename, dirname, isAbsolute, parse } from 'node:path'
import { parseCFG } from '../../modpack/utils/cfg'
import { importPathParts, readImportFile } from '../../util/importFile'
import { persistMmcStandaloneVersion, resolveMmcStandaloneVersion } from '../../util/mmcStandaloneVersion'

export async function inspectPrismFolderVersion(source: string) {
  if (!isAbsolute(source) || parse(source).root === source || (await lstat(source)).isSymbolicLink()) throw new Error('Invalid Prism source')
  const game = getMultiMCGameDirectory(source), root = dirname(game)
  if ((await lstat(game)).isSymbolicLink()) throw new Error('Invalid Prism game directory')
  let metadataSize = 0
  const readJSON = async (path: string) => {
    const data = await readImportFile(root, path, 1024 * 1024)
    if (!data) throw new Error('Missing Prism metadata')
    if ((metadataSize += data.length) > 8 * 1024 * 1024) throw new Error('Prism metadata is too large')
    return JSON.parse(data.toString('utf8'))
  }
  const json = await readJSON('mmc-pack.json')
  if (json.formatVersion !== 1 || !Array.isArray(json.components) || json.components.length > 256 || !json.components.every((c: any) => c && typeof c.uid === 'string') || !json.components.some((c: any) => c.uid === 'net.minecraft')) throw new Error('Invalid Prism manifest')
  const cfg = await readImportFile(root, 'instance.cfg', 1024 * 1024)
  const manifest: MMCModpackManifest = { json, cfg: { name: '', notes: '', ...parseCFG(cfg?.toString('utf8') || '') } }
  const patches = await lstat(`${root}/patches`).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
  if (patches) {
    if (patches.isSymbolicLink() || !patches.isDirectory()) throw new Error('Invalid Prism patches directory')
    const entries = (await readdir(`${root}/patches`)).filter(name => name.endsWith('.json')).sort()
    if (entries.length > 256) throw new Error('Too many Prism patches')
    manifest.patches = Object.create(null)
    for (const name of entries) {
      const patch = await readJSON(`patches/${name}`)
      if (!patch || typeof patch.uid !== 'string' || !patch.uid || Object.hasOwn(manifest.patches!, patch.uid)) throw new Error('Invalid Prism patch')
      if (patch.order !== undefined && (typeof patch.order !== 'number' || !Number.isFinite(patch.order))) throw new Error('Invalid Prism patch order')
      for (const key of ['+jvmArgs', '+tweakers']) if (patch[key] !== undefined && (!Array.isArray(patch[key]) || !patch[key].every((arg: unknown) => typeof arg === 'string' && arg.length <= 4096 && !/[\x00-\x1f\x7f]/.test(arg)))) throw new Error('Invalid Prism patch arguments')
      manifest.patches![patch.uid] = patch
    }
  }
  const version = resolveMmcStandaloneVersion(manifest, true)
  if (!version) {
    if (Object.keys(manifest.patches || {}).length) throw new Error('Prism patches do not define a complete standalone version')
    return undefined
  }
  if (version.jar || !version.downloads?.client) throw new Error('Prism version needs a standalone client download')
  if (version.arguments && !version.arguments.jvm.length) throw new Error('Incomplete Prism JVM arguments')
  for (const id of [version.clientVersion, version.assets, version.assetIndex?.id, version.javaVersion?.component]) {
    if (id !== undefined && (typeof id !== 'string' || importPathParts(id).length !== 1)) throw new Error('Invalid Prism version identifier')
  }
  for (const library of version.libraries) importPathParts(LibraryInfo.resolve(library).path)
  function validate(value: unknown) {
    if (!value || typeof value !== 'object') return
    for (const [key, item] of Object.entries(value)) {
      if (key === 'path' && typeof item === 'string') importPathParts(item)
      if (key === 'url') {
        if (typeof item !== 'string') throw new Error('Invalid version download')
        const url = new URL(item)
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe version download')
      }
      validate(item)
    }
  }
  validate(version)
  const libraries = new Map<string, Buffer>()
  let total = 0
  for (const library of getMmcLocalLibraryNames(version)) {
    const path = LibraryInfo.resolve(library).path
    importPathParts(path)
    let data: Buffer | undefined
    for (const candidate of [`libraries/${basename(path)}`, `libraries/${path}`, `${basename(game)}/libraries/${basename(path)}`, `${basename(game)}/libraries/${path}`]) {
      data = await readImportFile(root, candidate)
      if (data) break
    }
    if (!data || (total += data.length) > 256 * 1024 * 1024) throw new Error('Missing or oversized Prism local library')
    const definition = version.libraries.find(item => item.name === library)
    const artifact = definition && 'downloads' in definition ? definition.downloads?.artifact : undefined
    if (artifact?.path && artifact.path !== path) throw new Error('Unsupported local library destination')
    if (artifact?.sha1 && (!/^[a-f0-9]{40}$/i.test(artifact.sha1) || createHash('sha1').update(data).digest('hex') !== artifact.sha1.toLowerCase())) throw new Error('Local library checksum mismatch')
    if (artifact?.size !== undefined && artifact.size !== data.length) throw new Error('Local library size mismatch')
    libraries.set(path, data)
  }
  const fingerprint = createHash('sha256').update(JSON.stringify(manifest))
  for (const [path, data] of libraries) fingerprint.update(path).update(createHash('sha256').update(data).digest())
  return { manifest, libraries, fingerprint: fingerprint.digest('hex') }
}

export async function preparePrismFolderVersion(source: string, name: string, expected: string, gameDirectory: string, refreshVersion: (id: string) => Promise<unknown>) {
  if (typeof name !== 'string' || name.length > 100 || !/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid Prism confirmation')
  const inspected = await inspectPrismFolderVersion(source)
  if (!inspected || inspected.fingerprint !== expected) throw Object.assign(new Error('Prism source changed; review it again'), { name: 'PrismSourceChanged' })
  return persistMmcStandaloneVersion({ manifest: inspected.manifest, name, gameDirectory, includePatchArguments: true, refreshVersion, readLocalLibrary: async path => inspected.libraries.get(path) })
}
