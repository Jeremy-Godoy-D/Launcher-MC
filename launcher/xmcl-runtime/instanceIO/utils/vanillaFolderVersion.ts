import { LibraryInfo, Version } from '@xmcl/core'
import { getResolvedVersionHeader } from '@xmcl/runtime-api/src/entities/version'
import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { isAbsolute, parse, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import filenamify from 'filenamify'
import { importPathParts, readImportFile, writeImmutableImportFiles } from '../../util/importFile'

const fields = ['id', 'inheritsFrom', 'jar', 'mainClass', 'minecraftArguments', 'arguments', 'libraries', 'downloads', 'assetIndex', 'assets', 'javaVersion', 'compatibleJavaMajors', 'type', 'time', 'releaseTime', 'minimumLauncherVersion', 'clientVersion', '_minecraftVersion', 'logging'] as const
const pick = (value: Record<string, unknown>) => Object.fromEntries(fields.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) as unknown as Version
function versionId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > 200 || importPathParts(value).length !== 1) throw new Error('Invalid imported version identifier')
}
const sha1 = (data: Buffer) => createHash('sha1').update(data).digest('hex')
function verify(data: Buffer, metadata?: { sha1?: string; size?: number }) {
  if (metadata?.sha1 && (!/^[a-f0-9]{40}$/i.test(metadata.sha1) || sha1(data) !== metadata.sha1.toLowerCase())) throw new Error('Imported artifact checksum mismatch')
  if (metadata?.size !== undefined && metadata.size >= 0 && metadata.size !== data.length) throw new Error('Imported artifact size mismatch')
}
function validate(value: unknown, depth = 0) {
  if (!value || typeof value !== 'object') return
  if (depth > 64) throw new Error('Version metadata is too deep')
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe version metadata key')
    if (key === 'path') { if (typeof item !== 'string') throw new Error('Invalid artifact path'); importPathParts(item) }
    if (key === 'url') {
      if (typeof item !== 'string') throw new Error('Invalid artifact URL')
      const url = new URL(item)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe artifact URL')
    }
    validate(item, depth + 1)
  }
}

/** Inspect only the selected version's dependency graph, never import launcher settings. */
export async function inspectVanillaFolderVersion(root: string, selected: string) {
  const absolute = resolve(root)
  if (!isAbsolute(root) || parse(absolute).root === absolute || (await lstat(root)).isSymbolicLink()) throw new Error('Invalid Vanilla source')
  versionId(selected)
  const nodes = new Map<string, Version | undefined>()
  let metadataBytes = 0, fileBytes = 0
  const fingerprint = createHash('sha256')
  const files = new Map<string, Buffer>()
  async function node(id: string) {
    versionId(id)
    if (nodes.has(id)) return nodes.get(id)
    if (nodes.size >= 64) throw new Error('Too many imported version dependencies')
    const bytes = await readImportFile(root, `versions/${id}/${id}.json`, 1024 * 1024)
    if (!bytes) { nodes.set(id, undefined); fingerprint.update(`missing:${id}`); return undefined }
    if ((metadataBytes += bytes.length) > 8 * 1024 * 1024) throw new Error('Imported metadata is too large')
    const parsed = JSON.parse(bytes.toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.id !== id) throw new Error('Invalid version JSON identity')
    const value = pick(parsed)
    for (const key of [value.inheritsFrom, value.jar, value.clientVersion, value._minecraftVersion, value.assets, value.assetIndex?.id, value.javaVersion?.component, Reflect.get(value.logging?.client?.file || {}, 'id')]) if (key !== undefined) versionId(key)
    if (value.libraries !== undefined && !Array.isArray(value.libraries)) throw new Error('Invalid version libraries')
    for (const library of value.libraries || []) importPathParts(LibraryInfo.resolve(library).path)
    validate(value)
    nodes.set(id, value)
    fingerprint.update(id).update(JSON.stringify(value))
    return value
  }
  const top = await node(selected)
  if (!top) return undefined
  const chain: Version[] = [], seen = new Set<string>()
  let current: Version | undefined = top
  while (current) {
    if (seen.has(current.id)) throw new Error('Circular imported version inheritance')
    seen.add(current.id); chain.push(current)
    if (!current.inheritsFrom) break
    current = await node(current.inheritsFrom)
    if (!current) throw new Error('Missing imported parent version')
  }
  const resolved = Version.resolve(root, chain.map(value => Version.normalizeVersionJson(JSON.stringify(value), root)))
  versionId(resolved.minecraftVersion)
  if (resolved.libraries.length > 10000) throw new Error('Too many imported libraries')
  let jarId = chain.find(value => value.jar)?.jar || resolved.minecraftVersion
  const jarSeen = new Set<string>()
  while (true) {
    versionId(jarId)
    if (jarSeen.has(jarId)) throw new Error('Circular imported JAR aliases')
    jarSeen.add(jarId)
    const value = await node(jarId)
    if (!value?.jar || value.jar === jarId) break
    jarId = value.jar
  }
  async function cache(source: string, destination: string, metadata?: { sha1?: string; size?: number }, required = false) {
    const data = await readImportFile(root, source)
    fingerprint.update(source)
    if (!data) {
      if (required) throw new Error('Missing local imported artifact')
      fingerprint.update('missing'); return undefined
    }
    if ((fileBytes += data.length) > 512 * 1024 * 1024) throw new Error('Imported cache is too large')
    verify(data, metadata)
    fingerprint.update(createHash('sha256').update(data).digest())
    files.set(destination, data)
    return data
  }
  const client = await cache(`versions/${jarId}/${jarId}.jar`, `versions/${resolved.minecraftVersion}/${resolved.minecraftVersion}.jar`, resolved.downloads.client, !resolved.downloads.client?.url)
  if (client) verify(client, chain[chain.length - 1].downloads?.client)
  // The current launcher addresses clients by Minecraft version; never substitute different alias bytes.
  if (jarId !== resolved.minecraftVersion && client && !resolved.downloads.client?.sha1) {
    const base = await readImportFile(root, `versions/${resolved.minecraftVersion}/${resolved.minecraftVersion}.jar`)
    if (!base?.equals(client)) throw new Error('Unsupported modified client alias')
  }
  for (const library of resolved.libraries) {
    importPathParts(library.download.path)
    const local = chain.some(value => value.libraries?.some(item => item.name === library.name && Reflect.get(item, 'MMC-hint') === 'local'))
    await cache(`libraries/${library.download.path}`, `libraries/${library.download.path}`, library.download, local)
  }
  const header = getResolvedVersionHeader(resolved)
  return { fingerprint: fingerprint.digest('hex'), chain, files, minecraft: resolved.minecraftVersion, runtime: { minecraft: resolved.minecraftVersion, forge: header.forge, fabricLoader: header.fabric, quiltLoader: header.quilt, neoForged: header.neoForged, optifine: header.optifine, labyMod: header.labyMod } }
}

export async function prepareVanillaFolderVersion(root: string, selected: string, expected: string, destination: string, refresh: (id: string) => Promise<unknown>) {
  if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid Vanilla confirmation')
  const inspected = await inspectVanillaFolderVersion(root, selected)
  if (!inspected || inspected.fingerprint !== expected) throw Object.assign(new Error('Vanilla source changed; review again'), { name: 'PrismSourceChanged' })
  const ids = new Map(inspected.chain.map(value => [value.id, `vanilla-${filenamify(value.id, { maxLength: 60 })}-${expected.slice(0, 16)}`]))
  const entries = [...inspected.files].map(([path, data]) => ({ path, data }))
  for (const value of [...inspected.chain].reverse()) {
    const id = ids.get(value.id)!
    const json = { ...value, id, clientVersion: inspected.minecraft, ...(value.inheritsFrom ? { inheritsFrom: ids.get(value.inheritsFrom)! } : {}) }
    delete json.jar
    const path = `versions/${id}/${id}.json`
    const data = Buffer.from(JSON.stringify(json, null, 2))
    const existing = await readImportFile(destination, path, 1024 * 1024)
    entries.push({ path, data: existing && isDeepStrictEqual(JSON.parse(existing.toString('utf8')), json) ? existing : data })
  }
  await writeImmutableImportFiles(destination, entries)
  const version = ids.get(selected)!
  await refresh(version)
  return version
}
