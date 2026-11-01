import type { WorldFileOperation, WorldFileReview } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { checksum } from '@xmcl/core'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, mkdtemp, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, sep } from 'node:path'
import { ZipFile } from 'yazl'
import { assertInstallDirectory } from '../../instanceIO/utils/pendingInstall'
import { importPathParts } from '../../util/importFile'
import { writeZipFile } from '../../util/zip'
import { readFolderSnapshot } from './sharedResourcePacks'
import { prepareWorldMetadata, validateWorldMetadata, worldLocation, worldName, worldsLocation } from './worldFiles'
import { assertWorldArchiveUnchanged, extractWorldArchive, inspectWorldArchive } from './worldArchive'
import { linkOrCopyFile } from '../../util/fs'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const changed = () => Object.assign(new Error('World files changed since review'), { name: 'WorldFilesChangedError' })
const inspect = (path: string) => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
function contains(parent: string, child: string) { const path = relative(parent, child); return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path) }
function operationInput(input: WorldFileOperation): WorldFileOperation {
  if (!input || typeof input.instancePath !== 'string' || !isAbsolute(input.instancePath)) throw new Error('Invalid world operation')
  const base = { instancePath: input.instancePath, saveName: worldName(input.saveName) }
  if (input.type === 'import' && typeof input.sourcePath === 'string' && isAbsolute(input.sourcePath)) return { ...base, type: 'import', sourcePath: input.sourcePath }
  if (input.type === 'metadata') return { ...base, type: 'metadata', metadata: validateWorldMetadata(input.metadata) }
  if (input.type === 'remove') return { ...base, type: 'remove' }
  if (input.type === 'copy' && typeof input.destinationInstancePath === 'string' && isAbsolute(input.destinationInstancePath)) return { ...base, type: 'copy', destinationInstancePath: input.destinationInstancePath, destinationName: worldName(input.destinationName) }
  if (input.type === 'export' && typeof input.destinationDirectory === 'string' && isAbsolute(input.destinationDirectory) && /\.zip$/i.test(input.fileName)) return { ...base, type: 'export', destinationDirectory: input.destinationDirectory, fileName: worldName(input.fileName) }
  throw new Error('Invalid world operation')
}
async function sourceLocation(operation: WorldFileOperation, sharedRoot: string) {
  if (operation.type !== 'import') return { ...await worldLocation(operation.instancePath, operation.saveName, sharedRoot), file: false }
  const info = await lstat(operation.sourcePath), root = await realpath(operation.sourcePath)
  if (info.isSymbolicLink() || !info.isDirectory() && !info.isFile() || info.isFile() && !/\.zip$/i.test(operation.sourcePath) || parse(root).root === root) throw Object.assign(new Error('Invalid world import source'), { name: 'WorldImportInvalidError' })
  const actual = await lstat(root)
  if (actual.ino !== info.ino || actual.dev !== info.dev || actual.isSymbolicLink()) throw changed()
  return { root, logical: operation.sourcePath, shared: false, linked: false, file: info.isFile(), identity: digest([root, info.ino, info.dev]) }
}
async function plan(input: WorldFileOperation, sharedRoot: string) {
  const operation = operationInput(input), source = await sourceLocation(operation, sharedRoot)
  if (operation.type === 'metadata') {
    const level = await prepareWorldMetadata(source.root, operation.metadata).catch(error => { if (error?.name === 'WorldChangedError') throw changed(); throw error })
    if ((await sourceLocation(operation, sharedRoot)).identity !== source.identity) throw changed()
    const metadata = { before: level.before, after: level.after }
    const review: WorldFileReview = { operation, snapshot: digest([operation, source, level.hash, metadata]), files: 1, bytes: level.size, shared: source.shared, linkOnly: false, destination: source.logical, metadata }
    return { review, source, sourceTree: { identity: [level.hash], entries: [] }, parent: '', target: '', authority: '', archive: undefined, level }
  }
  const linkOnly = operation.type === 'remove' && source.linked
  const archive = source.file ? await inspectWorldArchive(source.root) : undefined
  const sourceTree = archive ? { identity: [archive.hash], entries: archive.files.map(file => ({ path: file.path, directory: file.directory, size: file.size, hash: undefined as string | undefined })) } : linkOnly ? { identity: null, entries: [] } : await readFolderSnapshot(source.root)
  if (!sourceTree.identity && !linkOnly) throw changed()
  if (operation.type !== 'remove' && !sourceTree.entries.some(file => file.path === 'level.dat' && !file.directory)) throw Object.assign(new Error('World has no level.dat'), { name: operation.type === 'import' ? 'WorldImportInvalidError' : 'Error' })
  let parent = '', target = '', authority = '', shared = source.shared
  if (operation.type === 'copy' || operation.type === 'import') {
    const destination = await worldsLocation(operation.type === 'copy' ? operation.destinationInstancePath : operation.instancePath, sharedRoot)
    parent = destination.root; target = join(parent, operation.type === 'copy' ? operation.destinationName : operation.saveName); authority = destination.identity; shared ||= destination.shared
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
  return { review, source, sourceTree, parent, target, authority, archive, level: undefined }
}
export async function previewWorldFiles(input: WorldFileOperation, sharedRoot: string) { return (await plan(input, sharedRoot)).review }

export async function applyWorldFiles(review: WorldFileReview, sharedRoot: string, verify: (review: WorldFileReview) => Promise<void> = async () => {}) {
  if (!review || typeof review.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(review.snapshot)) throw changed()
  const current = await plan(review.operation, sharedRoot)
  if (current.review.snapshot !== review.snapshot) throw changed()
  await verify(current.review)
  const { operation } = current.review
  async function unchanged() {
    if ((await sourceLocation(operation, sharedRoot)).identity !== current.source.identity) throw changed()
    if (current.level && operation.type === 'metadata') {
      const next = await prepareWorldMetadata(current.source.root, operation.metadata).catch(error => { if (error?.name === 'WorldChangedError') throw changed(); throw error })
      if (next.hash !== current.level.hash) throw changed()
    } else if (current.archive) await assertWorldArchiveUnchanged(current.archive)
    else if (!current.review.linkOnly && digest(await readFolderSnapshot(current.source.root)) !== digest(current.sourceTree)) throw changed()
    await verify(current.review)
  }
  if (operation.type === 'metadata') {
    const instance = await realpath(operation.instancePath), backup = join(instance, '.backups', `world-metadata-${randomUUID()}`), saved = join(backup, operation.saveName, 'level.dat'), file = join(current.source.root, 'level.dat'), temporary = join(current.source.root, `.level.dat-${randomUUID()}`)
    await assertInstallDirectory(instance, dirname(saved)); await mkdir(dirname(saved), { recursive: true }); await assertInstallDirectory(instance, dirname(saved))
    await unchanged()
    await copyFile(file, saved, constants.COPYFILE_EXCL)
    if (await checksum(saved, 'sha256') !== current.level!.hash) throw changed()
    try {
      await assertInstallDirectory(current.source.root, current.source.root)
      await writeFile(temporary, current.level!.bytes, { flag: 'wx' })
      if (await checksum(temporary, 'sha256') !== createHash('sha256').update(current.level!.bytes).digest('hex')) throw changed()
      await unchanged()
      await rename(temporary, file)
      return { path: current.source.logical, backup }
    } finally {
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
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
      if ((await sourceLocation(operation, sharedRoot)).identity !== current.source.identity) throw changed()
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
  if (operation.type === 'copy' || operation.type === 'import') {
    const instance = operation.type === 'copy' ? operation.destinationInstancePath : operation.instancePath, name = operation.type === 'copy' ? operation.destinationName : operation.saveName
    const directory = await worldsLocation(instance, sharedRoot)
    if (directory.root !== current.parent || directory.identity !== current.authority) throw changed()
    await mkdir(current.parent).catch(error => { if (error.code !== 'EEXIST') throw error })
    const destination = await worldsLocation(instance, sharedRoot)
    await mkdir(current.target)
    try {
      const targetInfo = await lstat(current.target)
      const verifyDestination = async () => {
        const info = await inspect(current.target)
        if (!info?.isDirectory() || info.isSymbolicLink() || info.ino !== targetInfo.ino || info.dev !== targetInfo.dev || (await worldsLocation(instance, sharedRoot)).identity !== destination.identity) throw changed()
      }
      if (current.archive) { await extractWorldArchive(current.archive, current.target, verifyDestination); await unchanged(); await verifyDestination() }
      else await copyInto(current.target, verifyDestination)
      return { path: join(instance, 'saves', name) }
    } catch (cause) { throw Object.assign(new Error('World copy incomplete; source and partial destination retained', { cause }), { name: cause instanceof Error && cause.name === 'WorldArchiveChecksumError' ? cause.name : 'WorldOperationIncompleteError', path: current.target }) }
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
    await linkOrCopyFile(file, current.target, true)
    return { path: current.target }
  } finally {
    // Only the unique export workspace created above is eligible for cleanup.
    const info = await inspect(temporary)
    if (dirname(temporary) === current.parent && temporary.startsWith(join(current.parent, '.grimo-world-export-')) && info?.isDirectory() && !info.isSymbolicLink() && info.ino === temporaryInfo.ino && info.dev === temporaryInfo.dev) await rm(temporary, { recursive: true, force: true })
  }
}
