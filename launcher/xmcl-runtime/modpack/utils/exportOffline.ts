import type { ResolvedVersion } from '@xmcl/core'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, realpath } from 'node:fs/promises'
import { basename, isAbsolute, join, relative } from 'node:path'
import type { ZipFile } from 'yazl'
import { importPathParts, readImportFile } from '../../util/importFile'

/** Isolated clients need not belong to the version JSON chain. */
export async function offlineModpackFiles(root: string, version: ResolvedVersion) {
  const files = new Map<string, { path: string; sha1?: string; size?: number }>()
  function add(path: string, expected?: { sha1?: string; size?: number }) {
    importPathParts(path)
    const key = path.toLowerCase(), previous = files.get(key)
    if (expected?.sha1 && !/^[a-f0-9]{40}$/i.test(expected.sha1)) throw new Error('Invalid offline checksum')
    if (previous && (previous.path !== path || previous.sha1 && expected?.sha1 && previous.sha1 !== expected.sha1)) throw new Error('Conflicting offline files')
    files.set(key, { ...previous, path, ...(expected?.sha1 ? { sha1: expected.sha1.toLowerCase() } : {}), ...(expected?.size !== undefined && expected.size >= 0 ? { size: expected.size } : {}) })
    if (files.size > 100000) throw new Error('Offline runtime too large')
  }
  function id(value: string) {
    if (typeof value !== 'string' || importPathParts(value).length !== 1) throw new Error('Invalid offline version identifier')
    return value
  }
  const index = `assets/indexes/${id(version.assets)}.json`
  const data = await readImportFile(root, index, 16 * 1024 * 1024)
  if (!data) throw new Error('Missing offline asset index')
  const checksum = createHash('sha1').update(data).digest('hex')
  if (version.assetIndex?.sha1 && checksum !== version.assetIndex.sha1.toLowerCase()) throw new Error('Offline asset index checksum mismatch')
  const objects = JSON.parse(data.toString('utf8')).objects
  if (!objects || typeof objects !== 'object' || Array.isArray(objects)) throw new Error('Invalid offline assets')
  add(index, { sha1: checksum, size: data.length })
  for (const value of Object.values(objects) as { hash: string }[]) {
    if (!value || !/^[a-f0-9]{40}$/.test(value.hash)) throw new Error('Invalid offline asset hash')
    add(`assets/objects/${value.hash.slice(0, 2)}/${value.hash}`, { sha1: value.hash })
  }
  for (const directory of version.pathChain) {
    const versionId = id(basename(directory))
    if (relative(join(root, 'versions', versionId), directory)) throw new Error('Offline version outside managed directory')
    const json = `versions/${versionId}/${versionId}.json`
    const bytes = await readImportFile(root, json, 1024 * 1024)
    if (!bytes) throw new Error('Missing offline version JSON')
    add(json, { sha1: createHash('sha1').update(bytes).digest('hex'), size: bytes.length })
    const jar = `versions/${versionId}/${versionId}.jar`
    try { await lstat(join(root, jar)); add(jar) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  const client = id(version.clientJar || version.minecraftVersion)
  add(`versions/${client}/${client}.jar`, version.downloads?.client)
  if (version.logging?.client?.file?.id) add(`assets/log_configs/${id(version.logging.client.file.id)}`, version.logging.client.file)
  for (const library of version.libraries) {
    importPathParts(library.download.path)
    add(`libraries/${library.download.path}`, library.download)
  }
  return [...files.values()]
}

export async function exportOfflineModpack(zip: ZipFile, root: string, version: ResolvedVersion) {
  for (const { path, sha1, size } of await offlineModpackFiles(root, version)) {
    const parts = importPathParts(path)
    let current = root
    for (const [index, part] of parts.entries()) {
      current = join(current, part)
      const info = await lstat(current)
      if (info.isSymbolicLink() || (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())) throw new Error('Unsafe offline file')
    }
    const actual = relative(await realpath(root), await realpath(current))
    if (actual === '..' || actual.startsWith('../') || actual.startsWith('..\\') || isAbsolute(actual)) throw new Error('Offline file outside managed directory')
    if (size !== undefined && (await lstat(current)).size !== size) throw new Error('Offline file size mismatch')
    if (sha1) {
      const checksum = createHash('sha1')
      for await (const chunk of createReadStream(current)) checksum.update(chunk)
      if (checksum.digest('hex') !== sha1) throw new Error('Offline file checksum mismatch')
    }
    zip.addFile(current, path)
  }
}
