import type { InstanceFile, InstanceInstallLock } from '@xmcl/instance'
import type { InstanceFileUpdate, ModReviewConfiguration, ModInstallReview } from '@xmcl/runtime-api'
import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { importPathParts } from '../../util/importFile'
import { readModFilesSnapshot, validateModFileChanges } from '../../instance/utils/localMods'
import { readResourcePackFilesSnapshot, resourcePackLocation } from '../../instance/utils/resourcePackSnapshot'
import { activeInstallFiles, installPathKey } from './installPlan'

function changed() { return Object.assign(new Error('Mods or configuration changed since review'), { name: 'ModFilesChangedError' }) }
type Domain = 'mods' | 'resourcepacks'
function modPath(path: string, domain: Domain = 'mods') {
  const parts = importPathParts(path)
  if (parts.length !== 2 || (process.platform === 'win32' ? parts[0].toLowerCase() : parts[0]) !== domain || domain === 'resourcepacks' && !/\.zip$/i.test(parts[1])) throw new Error('Only direct content archives can use an upgrade review')
  return installPathKey(path)
}
function changesKey(changes: Array<{ path: string; operation: string }>, domain: Domain = 'mods') {
  return JSON.stringify(changes.map(change => [modPath(change.path, domain), change.operation]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
}

async function readModHash(path: string, relative: string, checksum: (path: string, algorithm: string) => Promise<string>, domain: Domain = 'mods', sharedRoot?: string) {
  modPath(relative, domain)
  if (domain === 'resourcepacks') await resourcePackLocation(path, sharedRoot!)
  else if (!(await lstat(join(path, 'mods'))).isDirectory()) throw changed()
  const file = join(path, relative), info = await lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!info) return null
  if (!info.isFile()) throw changed()
  const hash = await checksum(file, 'sha1')
  if (domain === 'resourcepacks' && (typeof hash !== 'string' || !/^[a-f0-9]{40}$/i.test(hash))) throw changed()
  return hash.toLowerCase()
}

async function inventory(path: string, configuration: ModReviewConfiguration, domain: Domain, sharedRoot?: string) {
  if (domain === 'resourcepacks') return readResourcePackFilesSnapshot(path, sharedRoot!, configuration)
  return { ...await readModFilesSnapshot(path, configuration), authority: undefined, shared: undefined }
}

/** Read-only token binds recovery to the saved plan and current bytes, including edited published files. */
export async function captureModInstallRecovery(path: string, state: InstanceInstallLock, updates: InstanceFileUpdate[], configuration: ModReviewConfiguration, checksum: (path: string, algorithm: string) => Promise<string>, sharedRoot?: string) {
  const domain = state.review?.domain || 'mods'
  if (!state.review || updates.length > 2000) throw new Error('Invalid reviewed recovery')
  for (const file of [...activeInstallFiles(state), ...activeInstallFiles(state, true)]) modPath(file.path, domain)
  const currentInventory = await inventory(path, configuration, domain, sharedRoot), targets: Record<string, string | null> = {}
  for (const name of [...new Set(updates.map(update => modPath(update.file.path, domain)))].sort()) targets[name] = await readModHash(path, name, checksum, domain, sharedRoot)
  if ((await inventory(path, configuration, domain, sharedRoot)).fingerprint !== currentInventory.fingerprint) throw changed()
  const snapshot = createHash('sha256').update(JSON.stringify([currentInventory.fingerprint, targets, state.operationId, state.revision, state.review.snapshot, activeInstallFiles(state), activeInstallFiles(state, true), changesKey(updates.map(update => ({ path: update.file.path, operation: update.operation })), domain)])).digest('hex')
  return { snapshot, configuration, targets, directory: currentInventory.authority, shared: currentInventory.shared }
}

/** Called under the installer's instance lock; never acquires that lock again. */
export async function prepareModInstallReview(
  path: string,
  getState: () => InstanceInstallLock,
  updates: InstanceFileUpdate[],
  getConfiguration: () => ModReviewConfiguration,
  checksum: (path: string, algorithm: string) => Promise<string>,
  recoveryReview?: ModInstallReview,
  sharedRoot?: string,
) {
  const state = getState(), domain = state.review?.domain || 'mods'
  let review = state.review
  if (!review && recoveryReview) throw new Error('Reviewed install no longer pending')
  if (!review) return undefined
  if (recoveryReview?.domain !== undefined && recoveryReview.domain !== domain) throw changed()
  if (domain === 'resourcepacks') {
    const before = activeInstallFiles(state, true).map(file => file.path.replace(/\\/g, '/')).sort(), after = activeInstallFiles(state).map(file => file.path.replace(/\\/g, '/')).sort()
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Pack updates preserve archive names')
  }
  const paths = [...new Set(updates.map(update => modPath(update.file.path, domain)))]
  const wanted = new Map(activeInstallFiles(state).map(file => {
    if (!/^[a-f0-9]{40}$/i.test(file.hashes.sha1 || '')) throw new Error('Reviewed upgrades require SHA-1 hashes')
    return [modPath(file.path, domain), file.hashes.sha1.toLowerCase()]
  }))
  const readHash = (relative: string) => readModHash(path, relative, checksum, domain, sharedRoot)
  if (recoveryReview) {
    const capture = await captureModInstallRecovery(path, state, updates, getConfiguration(), checksum, sharedRoot)
    if (recoveryReview.snapshot !== capture.snapshot || changesKey(recoveryReview.changes, domain) !== changesKey(updates.map(update => ({ path: update.file.path, operation: update.operation })), domain)) throw changed()
    review = state.review = { snapshot: recoveryReview.snapshot, changes: recoveryReview.changes, configuration: capture.configuration, targets: capture.targets, ...(domain === 'resourcepacks' ? { domain, directory: capture.directory } : {}) }
  }
  if (!!review.configuration !== !!review.targets) throw new Error('Invalid persisted mod review')
  if (!review.configuration) {
    if (changesKey(review.changes, domain) !== changesKey(updates.map(update => ({ path: update.file.path, operation: update.operation })), domain)) throw changed()
    const reviewedInventory = domain === 'resourcepacks' ? await readResourcePackFilesSnapshot(path, sharedRoot!, getConfiguration()) : undefined
    const oldFiles = state.oldFiles ?? []
    const hashes = Object.fromEntries(oldFiles.map(file => [join(path, file.path), file.hashes.sha1?.toLowerCase()]))
    for (const file of oldFiles) modPath(file.path, domain)
    if (domain === 'mods') await validateModFileChanges(path, oldFiles.map(file => join(path, file.path)), hashes, review.snapshot, getConfiguration())
    else {
      if (reviewedInventory!.fingerprint !== review.snapshot) throw changed()
      for (const file of oldFiles) if (await readHash(modPath(file.path, domain)) !== file.hashes.sha1?.toLowerCase()) throw changed()
    }
    const targets: Record<string, string | null> = {}
    for (const name of paths) targets[name] = await readHash(name)
    if ((await inventory(path, getConfiguration(), domain, sharedRoot)).fingerprint !== review.snapshot) throw changed()
    review.configuration = getConfiguration()
    review.targets = targets
    if (reviewedInventory) review.directory = reviewedInventory.authority
  }
  const checkConfiguration = async () => {
    if (JSON.stringify(getConfiguration()) !== JSON.stringify(review.configuration)) throw changed()
    if (domain === 'resourcepacks' && (await resourcePackLocation(path, sharedRoot!)).authority !== review.directory) throw changed()
  }
  const targets = review.targets!
  for (const name of Object.keys(targets)) modPath(name, domain)
  let allTargetsPresent: boolean | undefined
  const check = async (file?: InstanceFile, operation?: InstanceFileUpdate['operation']) => {
    await checkConfiguration()
    for (const name of file ? [modPath(file.path, domain)] : paths) {
      if (!Object.hasOwn(targets, name)) throw changed()
      if (file && operation !== 'remove' && operation !== 'backup-remove' && wanted.has(name) && file.hashes.sha1?.toLowerCase() !== wanted.get(name)) throw changed()
      const actual = await readHash(name), expected = targets[name]
      if (actual === expected || actual !== null && actual === wanted.get(name)) continue
      // Recovery also recognizes a crash after the final planned removals.
      if (actual === null && !wanted.has(name)) {
        const active = activeInstallFiles(getState()).map(file => modPath(file.path, domain))
        allTargetsPresent ??= (await Promise.all(active.map(async name => await readHash(name) === wanted.get(name)))).every(Boolean)
        if (allTargetsPresent) continue
      }
      throw changed()
    }
    await checkConfiguration()
  }
  await check()
  return check
}
