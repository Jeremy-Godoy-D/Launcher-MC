import type { WorldFileOperation, WorldFileReview } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { checksum } from '@xmcl/core'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, link, lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, sep } from 'node:path'
import { ZipFile } from 'yazl'
import { assertInstallDirectory } from '../../instanceIO/utils/pendingInstall'
import { importPathParts } from '../../util/importFile'
import { writeZipFile } from '../../util/zip'
import { readFolderSnapshot } from './sharedResourcePacks'
import { worldLocation, worldName, worldsLocation } from './worldFiles'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const changed = () => Object.assign(new Error('World files changed since review'), { name: 'WorldFilesChangedError' })
const inspect = (path: string) => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
function contains(parent: string, child: string) { const path = relative(parent, child); return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path) }
function operationInput(input: WorldFileOperation): WorldFileOperation {
  if (!input || typeof input.instancePath !== 'string' || !isAbsolute(input.instancePath)) throw new Error('Invalid world operation')
  const base = { instancePath: input.instancePath, saveName: worldName(input.saveName) }
  if (input.type === 'remove') return { ...base, type: 'remove' }
  if (input.type === 'copy' && typeof input.destinationInstancePath === 'string' && isAbsolute(input.destinationInstancePath)) return { ...base, type: 'copy', destinationInstancePath: input.destinationInstancePath, destinationName: worldName(input.destinationName) }
  if (input.type === 'export' && typeof input.destinationDirectory === 'string' && isAbsolute(input.destinationDirectory) && /\.zip$/i.test(input.fileName)) return { ...base, type: 'export', destinationDirectory: input.destinationDirectory, fileName: worldName(input.fileName) }
  throw new Error('Invalid world operation')
}
async function plan(input: WorldFileOperation, sharedRoot: string) {
  const operation = operationInput(input), source = await worldLocation(operation.instancePath, operation.saveName, sharedRoot)
  const linkOnly = operation.type === 'remove' && source.linked
  const sourceTree = linkOnly ? { identity: null, entries: [] } : await readFolderSnapshot(source.root)
  if (!sourceTree.identity && !linkOnly) throw changed()
  if (operation.type !== 'remove' && !sourceTree.entries.some(file => file.path === 'level.dat' && !file.directory)) throw new Error('World has no level.dat')
  let parent = '', target = '', authority = '', shared = source.shared
  if (operation.type === 'copy') {
    const destination = await worldsLocation(operation.destinationInstancePath, sharedRoot)
    parent = destination.root; target = join(parent, operation.destinationName); authority = destination.identity; shared ||= destination.shared
    if (contains(source.root, target)) throw new Error('World copy overlaps its source')
  } else if (operation.type === 'export') {
    const info = await lstat(operation.destinationDirectory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid export directory')
    parent = await realpath(operation.destinationDirectory); target = join(parent, operation.fileName)
    if (contains(await realpath(sharedRoot), parent) || contains(await realpath(operation.instancePath), parent)) throw new Error('Export must be outside launcher data')
    authority = digest([parent, info.ino, info.dev])
  }
  if (target && await inspect(target)) throw Object.assign(new Error('World destination already exists'), { name: 'WorldDestinationExistsError' })
  const review: WorldFileReview = { operation, snapshot: digest([operation, source, sourceTree, parent, target, authority]), files: sourceTree.entries.filter(file => !file.directory).length,
    bytes: sourceTree.entries.reduce((sum, file) => sum + file.size, 0), shared, linkOnly, destination: target || source.logical }
  if (!Number.isSafeInteger(review.bytes)) throw new Error('World size exceeds preview limits')
  return { review, source, sourceTree, parent, target, authority }
}
export async function previewWorldFiles(input: WorldFileOperation, sharedRoot: string) { return (await plan(input, sharedRoot)).review }

export async function applyWorldFiles(review: WorldFileReview, sharedRoot: string, verify: (review: WorldFileReview) => Promise<void> = async () => {}) {
  if (!review || typeof review.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(review.snapshot)) throw changed()
  const current = await plan(review.operation, sharedRoot)
  if (current.review.snapshot !== review.snapshot) throw changed()
  await verify(current.review)
  const { operation } = current.review
  async function unchanged() {
    if ((await worldLocation(operation.instancePath, operation.saveName, sharedRoot)).identity !== current.source.identity) throw changed()
    if (!current.review.linkOnly && digest(await readFolderSnapshot(current.source.root)) !== digest(current.sourceTree)) throw changed()
    await verify(current.review)
  }
  if (operation.type === 'remove') {
    const instance = await realpath(operation.instancePath), backup = join(instance, '.backups', `world-${randomUUID()}`)
    await assertInstallDirectory(instance, backup); await mkdir(backup, { recursive: true }); await assertInstallDirectory(instance, backup)
    await unchanged()
    // Rename keeps the original bytes (or just the owned link); cross-device moves fail without deleting anything.
    await rename(current.review.linkOnly ? current.source.logical : current.source.root, join(backup, operation.saveName))
    return { path: current.source.logical, backup }
  }
  async function copyInto(target: string, verifyDestination: () => Promise<void> = async () => {}) {
    const identity = await lstat(target)
    async function stableTarget() {
      const current = await inspect(target)
      if (!current?.isDirectory() || current.isSymbolicLink() || current.ino !== identity.ino || current.dev !== identity.dev) throw changed()
      await verifyDestination()
    }
    const ordered = [...current.sourceTree.entries].sort((a, b) => Number(a.path === 'level.dat') - Number(b.path === 'level.dat'))
    for (const entry of ordered) {
      await stableTarget()
      const parts = importPathParts(entry.path), source = join(current.source.root, ...parts), destination = join(target, ...parts)
      if ((await worldLocation(operation.instancePath, operation.saveName, sharedRoot)).identity !== current.source.identity) throw changed()
      await assertInstallDirectory(current.source.root, dirname(source)); await assertInstallDirectory(target, dirname(destination))
      if (entry.directory) await mkdir(destination)
      else {
        const info = await lstat(source)
        if (!info.isFile() || info.isSymbolicLink()) throw changed()
        await copyFile(source, destination, constants.COPYFILE_EXCL)
        if (await checksum(destination, 'sha256') !== entry.hash) throw changed()
      }
    }
    await unchanged(); await stableTarget()
  }
  if (operation.type === 'copy') {
    const directory = await worldsLocation(operation.destinationInstancePath, sharedRoot)
    if (directory.root !== current.parent || directory.identity !== current.authority) throw changed()
    await mkdir(current.parent).catch(error => { if (error.code !== 'EEXIST') throw error })
    const destination = await worldsLocation(operation.destinationInstancePath, sharedRoot)
    await mkdir(current.target)
    try {
      await copyInto(current.target, async () => { if ((await worldsLocation(operation.destinationInstancePath, sharedRoot)).identity !== destination.identity) throw changed() })
      return { path: join(operation.destinationInstancePath, 'saves', operation.destinationName) }
    } catch (cause) { throw Object.assign(new Error('World copy incomplete; source and partial destination retained', { cause }), { name: 'WorldOperationIncompleteError', path: current.target }) }
  }
  const destinationDirectory = operation.destinationDirectory
  async function exportParent() {
    const info = await lstat(current.parent)
    if (!info.isDirectory() || info.isSymbolicLink() || digest([current.parent, info.ino, info.dev]) !== current.authority || await realpath(destinationDirectory) !== current.parent) throw changed()
  }
  await exportParent()
  const temporary = await mkdtemp(join(current.parent, '.grimo-world-export-')), temporaryInfo = await lstat(temporary)
  if (dirname(temporary) !== current.parent || !temporary.startsWith(join(current.parent, '.grimo-world-export-')) || parse(temporary).root === temporary) throw changed()
  try {
    const staged = join(temporary, 'world'); await mkdir(staged); await copyInto(staged)
    const archive = new ZipFile()
    for (const entry of current.sourceTree.entries) {
      if (entry.directory) archive.addEmptyDirectory(entry.path)
      else archive.addFile(join(staged, ...importPathParts(entry.path)), entry.path)
    }
    await exportParent()
    const file = join(temporary, 'world.zip'); await writeZipFile(archive, file)
    await unchanged()
    await exportParent()
    await link(file, current.target)
    return { path: current.target }
  } finally {
    // Only the unique export workspace created above is eligible for cleanup.
    const info = await inspect(temporary)
    if (dirname(temporary) === current.parent && temporary.startsWith(join(current.parent, '.grimo-world-export-')) && info?.isDirectory() && !info.isSymbolicLink() && info.ino === temporaryInfo.ino && info.dev === temporaryInfo.dev) await rm(temporary, { recursive: true, force: true })
  }
}
