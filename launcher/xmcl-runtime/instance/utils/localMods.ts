import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { checksum } from '@xmcl/core'

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

export async function uninstallLocalMods(path: string, files: string[], expectedHashes?: Record<string, string>) {
  const targets = selection(files), directory = await modsDirectory(path)
  if (expectedHashes !== undefined && (!expectedHashes || typeof expectedHashes !== 'object' || Array.isArray(expectedHashes))) throw new Error('Invalid reviewed mods')
  const reviewed = await Promise.all(targets.map(async file => {
    if (dirname(file) !== directory) throw new Error('Unmanaged mod file')
    const stat = await lstat(file)
    if (!stat.isFile()) throw new Error('Unmanaged mod file')
    if (expectedHashes !== undefined && (!Object.hasOwn(expectedHashes, file) || !/^[a-f0-9]{40}$/i.test(expectedHashes[file]) || await checksum(file, 'sha1') !== expectedHashes[file])) throw new Error('Mod changed since review')
    return { file, stat }
  }))
  for (const { file, stat } of reviewed) {
    const current = await lstat(file)
    if (!current.isFile() || current.ino !== stat.ino || current.dev !== stat.dev || current.size !== stat.size || current.mtimeMs !== stat.mtimeMs) throw new Error('Mod changed since review')
    await unlink(file)
  }
}
