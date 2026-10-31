import { checksum } from '@xmcl/core'
import type { ResourcePackSharingReview } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readdir, realpath, rmdir, symlink, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, relative, sep } from 'node:path'
import { move } from 'fs-extra'
import { instanceFileSource } from '../../instanceIO/utils/instanceFileSource'
import { assertInstallDirectory } from '../../instanceIO/utils/pendingInstall'
import { importPathParts } from '../../util/importFile'

type Entry = { path: string; directory: boolean; size: number; hash?: string }
const changed = () => Object.assign(new Error('Resource packs changed since review'), { name: 'ResourcePacksChangedError' })
const inspect = (path: string) => lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function readFolderSnapshot(root: string) {
  const info = await inspect(root), entries: Entry[] = [], seen = new Set<string>()
  if (!info) return { entries, identity: null }
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Unsafe pack directory')
  async function scan(path: string, prefix = '', depth = 0) {
    if (depth > 64) throw new Error('Pack directory is too deep')
    for (const name of (await readdir(path)).sort()) {
      const relative = prefix + name; importPathParts(relative)
      if (entries.length >= 100000 || seen.has(relative.toLowerCase())) throw new Error('Oversized or ambiguous pack directory')
      seen.add(relative.toLowerCase())
      const file = join(path, name), before = await lstat(file)
      if (before.isSymbolicLink() || !before.isDirectory() && !before.isFile()) throw new Error('Unsafe pack entry')
      const entry: Entry = { path: relative, directory: before.isDirectory(), size: before.isDirectory() ? 0 : before.size }
      entries.push(entry)
      if (entry.directory) await scan(file, relative + '/', depth + 1)
      else {
        entry.hash = await checksum(file, 'sha256')
        if (typeof entry.hash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.hash)) throw new Error('Pack checksum unavailable')
        const after = await lstat(file)
        if (before.ino !== after.ino || before.dev !== after.dev || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw changed()
      }
    }
  }
  await scan(root)
  return { entries, identity: [info.ino, info.dev] }
}
const topNames = (entries: Entry[]) => entries.filter(entry => !entry.path.includes('/')).map(entry => entry.path)
const branch = (entries: Entry[], name: string) => entries.filter(entry => entry.path === name || entry.path.startsWith(name + '/'))
function contains(parent: string, path: string) {
  const value = relative(parent, path)
  return value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value)
}
async function plan(path: string, shared: boolean, sharedRoot: string, domain: 'resourcepacks' | 'shaderpacks') {
  if (typeof shared !== 'boolean') throw new Error('Invalid sharing choice')
  if (domain !== 'resourcepacks' && domain !== 'shaderpacks') throw new Error('Invalid pack domain')
  const mapped = await instanceFileSource(path, domain, sharedRoot, true), instance = await realpath(path), globalRoot = await realpath(sharedRoot)
  const local = join(instance, domain), global = join(globalRoot, domain), linked = mapped.root !== instance
  if (parse(globalRoot).root === globalRoot) throw new Error('Unsafe shared root')
  if (contains(local, global) || contains(global, local)) throw new Error('Overlapping pack roots')
  await assertInstallDirectory(globalRoot, global)
  const globalTree = await readFolderSnapshot(global), localTree = linked ? globalTree : await readFolderSnapshot(local), link = await inspect(local)
  const globalNames = topNames(globalTree.entries), localNames = topNames(localTree.entries), conflicts: string[] = [], copy: string[] = []
  if (shared && !linked) for (const name of localNames) {
    const existing = globalNames.find(value => value.toLowerCase() === name.toLowerCase())
    if (existing === undefined) copy.push(name)
    else if (existing !== name || digest(branch(localTree.entries, name)) !== digest(branch(globalTree.entries, name))) conflicts.push(name)
  }
  const copying = shared ? copy.flatMap(name => branch(localTree.entries, name)) : globalTree.entries
  const review: ResourcePackSharingReview = { snapshot: digest([shared, linked, local, global, link && [link.ino, link.dev], localTree, globalTree]), shared, linked, localPacks: localNames.length, sharedPacks: globalNames.length, files: shared === linked ? 0 : copying.filter(entry => !entry.directory).length, bytes: shared === linked ? 0 : copying.reduce((size, entry) => size + entry.size, 0), conflicts }
  return { review, instance, local, global, globalRoot, localTree, globalTree, copy }
}
export async function previewResourcePackSharing(path: string, shared: boolean, root: string, domain: 'resourcepacks' | 'shaderpacks' = 'resourcepacks') {
  return (await plan(path, shared, root, domain)).review
}
async function copyEntries(source: string, target: string, entries: Entry[]) {
  for (const entry of entries) {
    const file = join(target, ...importPathParts(entry.path))
    await assertInstallDirectory(target, dirname(file))
    if (entry.directory) await mkdir(file)
    else {
      await copyFile(join(source, ...importPathParts(entry.path)), file, constants.COPYFILE_EXCL)
      if (await checksum(file, 'sha256') !== entry.hash) throw changed()
    }
  }
}
const contents = (entries: Entry[]) => digest([...entries].sort((a, b) => a.path.localeCompare(b.path)))
export async function applyResourcePackSharing(path: string, review: ResourcePackSharingReview, root: string, domain: 'resourcepacks' | 'shaderpacks' = 'resourcepacks'): Promise<{ backup?: string }> {
  if (!review || typeof review.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(review.snapshot)) throw changed()
  const current = await plan(path, review.shared, root, domain)
  if (current.review.snapshot !== review.snapshot) throw changed()
  if (current.review.conflicts.length) throw Object.assign(new Error('Conflicting shared pack names'), { name: 'ResourcePackCollisionError' })
  if (review.shared === current.review.linked) return {}
  const backup = join(current.instance, '.backups', `${domain}-share-${randomUUID()}`)
  await assertInstallDirectory(current.instance, backup); await mkdir(backup, { recursive: true }); await assertInstallDirectory(current.instance, backup)
  try {
    if (review.shared) {
      await mkdir(current.global).catch(error => { if (error.code !== 'EEXIST') throw error }); await assertInstallDirectory(current.globalRoot, current.global)
      const stagedLink = join(backup, 'link')
      await symlink(current.global, stagedLink, process.platform === 'win32' ? 'junction' : 'dir')
      const copied = current.copy.flatMap(name => branch(current.localTree.entries, name))
      await copyEntries(current.local, current.global, copied)
      if (contents((await readFolderSnapshot(current.local)).entries) !== contents(current.localTree.entries) || contents((await readFolderSnapshot(current.global)).entries) !== contents([...current.globalTree.entries, ...copied])) throw changed()
      if (current.localTree.identity) await move(current.local, join(backup, 'previous'), { overwrite: false })
      await move(stagedLink, current.local, { overwrite: false })
      if (current.localTree.identity) return { backup }
    } else {
      const privateCopy = join(backup, 'private'); await mkdir(privateCopy)
      await copyEntries(current.global, privateCopy, current.globalTree.entries)
      if ((await plan(path, false, root, domain)).review.snapshot !== current.review.snapshot) throw changed()
      await unlink(current.local)
      await move(privateCopy, current.local, { overwrite: false })
    }
    await rmdir(backup).catch(() => {})
    return {}
  } catch (error) {
    // Restore only into a missing path; never replace something created by another writer.
    try {
      if (!(await inspect(current.local))) {
        if (review.shared && await inspect(join(backup, 'previous'))) await move(join(backup, 'previous'), current.local, { overwrite: false })
        else if (!review.shared) await symlink(current.global, current.local, process.platform === 'win32' ? 'junction' : 'dir')
      }
    } catch { /* Copies remain in the private backup if restoring the path also fails. */ }
    throw Object.assign(new Error('Sharing change incomplete; copies retained', { cause: error }), { name: 'ResourcePackSharingIncompleteError', backup })
  }
}
