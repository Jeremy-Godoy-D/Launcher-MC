import { checksum } from '@xmcl/core'
import type { ResourcePackRemovalReview } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, realpath } from 'node:fs/promises'
import { move } from 'fs-extra'
import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { instanceFileSource } from '../../instanceIO/utils/instanceFileSource'
import { previewFolderFiles } from '../../instanceIO/utils/previewFolderFiles'
import { assertInstallDirectory } from '../../instanceIO/utils/pendingInstall'
import { importPathParts } from '../../util/importFile'
import { readResourcePackSelection, writeResourcePackSelection } from './resourcePackSelection'

const changed = () => Object.assign(new Error('Resource packs changed since review'), { name: 'ResourcePacksChangedError' })
function names(files: string[]) {
  if (!Array.isArray(files) || !files.length || files.length > 200 || files.some(name => typeof name !== 'string' || importPathParts(name).length !== 1)) throw new Error('Invalid resource pack selection')
  const unique = [...new Set(files)]
  if (new Set(unique.map(name => name.toLowerCase())).size !== unique.length) throw new Error('Conflicting resource pack names')
  return unique
}
async function directory(path: string, sharedRoot: string, create = false, domain: 'resourcepacks' | 'shaderpacks' = 'resourcepacks') {
  const source = await instanceFileSource(path, domain, sharedRoot, true), root = join(source.root, source.path)
  if (create) await mkdir(root).catch(error => { if (error.code !== 'EEXIST') throw error })
  const info = await lstat(root)
  if (!info.isDirectory()) throw new Error('Unsafe resource pack directory')
  return { root, shared: source.root !== await realpath(path), identity: [root, info.ino, info.dev] }
}

export async function installLocalResourcePacks(path: string, files: string[], sharedRoot: string, domain: 'resourcepacks' | 'shaderpacks' = 'resourcepacks') {
  if (!Array.isArray(files) || files.length > 200 || files.some(file => typeof file !== 'string' || !isAbsolute(file))) throw new Error('Invalid resource pack sources')
  if (!files.length) return []
  const sources = [...new Set(files)], selected = names(sources.map(file => basename(file))), destination = await directory(path, sharedRoot, true, domain)
  if (selected.length !== sources.length) throw new Error('Conflicting resource pack names')
  const plans = []
  let entries = 0
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index], name = selected[index], target = join(destination.root, name), info = await lstat(source)
    if (!info.isFile() && !info.isDirectory() || info.isFile() && !/\.zip$/i.test(name)) throw new Error('Invalid resource pack source')
    const existing = await lstat(target).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (existing) {
      if (await realpath(source) === await realpath(target)) continue
      throw Object.assign(new Error('Resource pack destination already exists'), { name: 'ResourcePackCollisionError' })
    }
    const payload = info.isDirectory() ? (await previewFolderFiles(source, undefined, { resourcePack: true })).sort((a, b) => a.path.localeCompare(b.path)) : undefined
    if (payload && (!payload.some(file => domain === 'resourcepacks' ? file.path === 'pack.mcmeta' : file.path.startsWith('shaders/')) || (entries += payload.length) > 100000)) throw new Error('Invalid or oversized resource pack folder')
    if (payload) for (const file of payload) importPathParts(file.path)
    plans.push({ source, target, payload, sha256: payload ? undefined : await checksum(source, 'sha256') })
  }
  for (const plan of plans) {
    const current = await directory(path, sharedRoot, false, domain)
    if (JSON.stringify(current.identity) !== JSON.stringify(destination.identity)) throw changed()
    if (!plan.payload) {
      await copyFile(plan.source, plan.target, constants.COPYFILE_EXCL)
      if (await checksum(plan.target, 'sha256') !== plan.sha256) throw changed()
    }
    else {
      await mkdir(plan.target)
      for (const file of plan.payload) {
        const parts = importPathParts(file.path), target = join(plan.target, ...parts)
        await assertInstallDirectory(destination.root, dirname(target))
        await mkdir(dirname(target), { recursive: true }); await assertInstallDirectory(destination.root, dirname(target))
        await copyFile(fileURLToPath(file.downloads![0]), target, constants.COPYFILE_EXCL)
        if (await checksum(target, 'sha256') !== file.hashes.sha256) throw changed()
      }
    }
  }
  return selected.map(name => join(path, domain, name))
}

export async function inspectLocalPackFiles(path: string, fileNames: string[], sharedRoot: string, domain: 'resourcepacks' | 'shaderpacks') {
  const selected = names(fileNames), dest = await directory(path, sharedRoot, false, domain)
  const files: ResourcePackRemovalReview['files'] = [], hashes: unknown[] = []
  let entries = 0
  for (const fileName of selected) {
    const file = join(dest.root, fileName), info = await lstat(file)
    if (!info.isFile() && !info.isDirectory()) throw new Error('Unsafe resource pack')
    const payload = info.isDirectory() ? (await previewFolderFiles(file, undefined, { resourcePack: true })).sort((a, b) => a.path.localeCompare(b.path)) : undefined
    if ((entries += payload ? payload.length : 1) > 100000) throw new Error('Too many pack entries')
    const content = payload || await checksum(file, 'sha256')
    if (!payload && (typeof content !== 'string' || !/^[a-f0-9]{64}$/.test(content))) throw new Error('Pack checksum unavailable')
    const after = await lstat(file)
    if (after.ino !== info.ino || after.dev !== info.dev || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw changed()
    hashes.push([fileName, info.ino, info.dev, info.size, info.mtimeMs, info.ctimeMs, content])
    files.push({ fileName, directory: info.isDirectory(), size: payload ? payload.reduce((size, file) => size + (file.size || 0), 0) : info.size, entries: payload ? payload.length : 1 })
  }
  const current = await directory(path, sharedRoot, false, domain)
  if (JSON.stringify(current.identity) !== JSON.stringify(dest.identity)) throw changed()
  return { files, hashes, dest }
}
async function removal(path: string, fileNames: string[], sharedRoot: string) {
  const selection = await readResourcePackSelection(path), { files, hashes, dest } = await inspectLocalPackFiles(path, fileNames, sharedRoot, 'resourcepacks')
  const review: ResourcePackRemovalReview = { snapshot: createHash('sha256').update(JSON.stringify([dest.identity, selection.snapshot, hashes])).digest('hex'), files, sharedDirectory: dest.shared, sharedOptions: selection.shared }
  return { review, dest, selection }
}
export async function previewResourcePackRemoval(path: string, fileNames: string[], sharedRoot: string) {
  return (await removal(path, fileNames, sharedRoot)).review
}
export async function removeReviewedResourcePacks(path: string, review: ResourcePackRemovalReview, sharedRoot: string) {
  if (!review || typeof review.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(review.snapshot) || !Array.isArray(review.files)) throw changed()
  const current = await removal(path, review.files.map(file => file.fileName), sharedRoot)
  if (current.review.snapshot !== review.snapshot) throw changed()
  const backup = join(path, '.backups', `resourcepacks-${randomUUID()}`)
  await assertInstallDirectory(path, backup); await mkdir(backup, { recursive: true }); await assertInstallDirectory(path, backup)
  const selected = new Set(current.review.files.map(file => file.fileName))
  await writeResourcePackSelection(path, { ...current.selection, packs: current.selection.packs.filter(pack => !selected.has(pack.startsWith('file/') ? pack.slice(5) : pack)) }, join(sharedRoot, 'resourcepacks'), join(sharedRoot, 'options.txt'))
  try {
    for (const file of current.review.files) await move(join(current.dest.root, file.fileName), join(backup, file.fileName), { overwrite: false })
  } catch (error) { throw Object.assign(new Error('Resource pack removal incomplete', { cause: error }), { name: 'ResourcePackRemovalIncompleteError', backup }) }
  return { backup }
}
