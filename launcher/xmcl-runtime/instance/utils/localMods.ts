import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { checksum } from '@xmcl/core'
import type { ModFilesSnapshot, ModReviewConfiguration } from '@xmcl/runtime-api/src/services/InstanceModsService'

async function modsDirectory(path: string, create = false) {
  if (typeof path !== 'string' || !isAbsolute(path) || !(await lstat(path)).isDirectory()) throw new Error('Unmanaged instance directory')
  const directory = join(path, 'mods')
  if (create) await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error })
  if (!(await lstat(directory)).isDirectory()) throw new Error('Unmanaged mods directory')
  return directory
}
function selection(files: string[]) {
  if (!Array.isArray(files) || files.length > 1000 || files.some(file => typeof file !== 'string' || !isAbsolute(file))) throw new Error('Invalid mod selection')
  return [...new Set(files)]
}

export async function installLocalMods(path: string, files: string[]) {
  const sources = selection(files), directory = await modsDirectory(path, true), destinations = new Set<string>()
  const changes = await Promise.all(sources.map(async source => {
    if (!/\.(jar|zip|litemod)(\.disabled)?$/i.test(source) || !(await lstat(source)).isFile()) throw new Error('Invalid mod file')
    const destination = join(directory, basename(source)), key = process.platform === 'win32' ? destination.toLowerCase() : destination
    if (destinations.has(key)) throw new Error('Conflicting mod names')
    destinations.add(key)
    if (source !== destination) {
      const existing = await lstat(destination).catch(error => { if (error.code !== 'ENOENT') throw error })
      if (existing) throw new Error('Mod destination already exists')
    }
    return { source, destination }
  }))
  // Preflight catches batch collisions; exclusive copies also reject destinations created afterwards.
  for (const { source, destination } of changes) if (source !== destination) await copyFile(source, destination, constants.COPYFILE_EXCL)
  return changes.map(change => change.destination)
}

export async function readModFilesSnapshot(path: string, configuration?: ModReviewConfiguration): Promise<ModFilesSnapshot> {
  const directory = await modsDirectory(path), names = await readdir(directory)
  if (names.length > 10000) throw new Error('Too many mod entries to review')
  const entries: ModFilesSnapshot['entries'] = []
  for (const fileName of names.sort()) {
    const path = join(directory, fileName), stat = await lstat(path)
    if (!stat.isFile() && !stat.isDirectory()) throw new Error('Unmanaged mod entry')
    entries.push({ path, fileName, size: stat.size, mtime: stat.mtimeMs, ctime: stat.ctimeMs, ino: stat.ino, dev: stat.dev, directory: stat.isDirectory() })
  }
  return { entries, configuration, fingerprint: createHash('sha256').update(JSON.stringify([configuration || null, entries])).digest('hex') }
}

async function reviewedModFiles(path: string, files: string[], expectedHashes?: Record<string, string>, expectedSnapshot?: string, configuration?: ModReviewConfiguration) {
  const targets = selection(files), directory = await modsDirectory(path)
  if (expectedHashes !== undefined && (!expectedHashes || typeof expectedHashes !== 'object' || Array.isArray(expectedHashes))) throw new Error('Invalid reviewed mods')
  const reviewed = await Promise.all(targets.map(async file => {
    if (dirname(file) !== directory) throw new Error('Unmanaged mod file')
    const stat = await lstat(file)
    if (!stat.isFile()) throw new Error('Unmanaged mod file')
    if (expectedHashes !== undefined && (!Object.hasOwn(expectedHashes, file) || typeof expectedHashes[file] !== 'string' || !/^[a-f0-9]{40}$/i.test(expectedHashes[file]) || await checksum(file, 'sha1') !== expectedHashes[file])) throw new Error('Mod changed since review')
    return { file, stat }
  }))
  if (expectedSnapshot !== undefined && (typeof expectedSnapshot !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSnapshot) || (await readModFilesSnapshot(path, configuration)).fingerprint !== expectedSnapshot)) throw Object.assign(new Error('Mod files changed since review'), { name: 'ModFilesChangedError' })
  return reviewed
}

export async function validateModFileChanges(path: string, files: string[], expectedHashes?: Record<string, string>, expectedSnapshot?: string, configuration?: ModReviewConfiguration) {
  await reviewedModFiles(path, files, expectedHashes, expectedSnapshot, configuration)
}

export async function uninstallLocalMods(path: string, files: string[], expectedHashes?: Record<string, string>, expectedSnapshot?: string, configuration?: ModReviewConfiguration) {
  const reviewed = await reviewedModFiles(path, files, expectedHashes, expectedSnapshot, configuration)
  for (const { file, stat } of reviewed) {
    const current = await lstat(file)
    if (!current.isFile() || current.ino !== stat.ino || current.dev !== stat.dev || current.size !== stat.size || current.mtimeMs !== stat.mtimeMs) throw new Error('Mod changed since review')
    await unlink(file)
  }
}
