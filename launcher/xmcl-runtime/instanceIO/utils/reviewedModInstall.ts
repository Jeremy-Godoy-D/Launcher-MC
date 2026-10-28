import type { InstanceFile, InstanceInstallLock } from '@xmcl/instance'
import type { InstanceFileUpdate, ModReviewConfiguration, ModInstallReview } from '@xmcl/runtime-api'
import { createHash } from 'node:crypto'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { importPathParts } from '../../util/importFile'
import { readModFilesSnapshot, validateModFileChanges } from '../../instance/utils/localMods'
import { activeInstallFiles, installPathKey } from './installPlan'

function changed() { return Object.assign(new Error('Mods or configuration changed since review'), { name: 'ModFilesChangedError' }) }
function modPath(path: string) {
  const parts = importPathParts(path)
  if (parts.length !== 2 || (process.platform === 'win32' ? parts[0].toLowerCase() : parts[0]) !== 'mods') throw new Error('Only direct mod files can use an upgrade review')
  return installPathKey(path)
}
function changesKey(changes: Array<{ path: string; operation: string }>) {
  return JSON.stringify(changes.map(change => [modPath(change.path), change.operation]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
}

async function readModHash(path: string, relative: string, checksum: (path: string, algorithm: string) => Promise<string>) {
  modPath(relative)
  if (!(await lstat(join(path, 'mods'))).isDirectory()) throw changed()
  const file = join(path, relative), info = await lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (!info) return null
  if (!info.isFile()) throw changed()
  return (await checksum(file, 'sha1')).toLowerCase()
}

/** Read-only token binds recovery to the saved plan and current bytes, including edited published files. */
export async function captureModInstallRecovery(path: string, state: InstanceInstallLock, updates: InstanceFileUpdate[], configuration: ModReviewConfiguration, checksum: (path: string, algorithm: string) => Promise<string>) {
  if (!state.review || updates.length > 2000) throw new Error('Invalid reviewed recovery')
  for (const file of [...activeInstallFiles(state), ...activeInstallFiles(state, true)]) modPath(file.path)
  const inventory = await readModFilesSnapshot(path, configuration), targets: Record<string, string | null> = {}
  for (const name of [...new Set(updates.map(update => modPath(update.file.path)))].sort()) targets[name] = await readModHash(path, name, checksum)
  if ((await readModFilesSnapshot(path, configuration)).fingerprint !== inventory.fingerprint) throw changed()
  const snapshot = createHash('sha256').update(JSON.stringify([inventory.fingerprint, targets, state.operationId, state.revision, state.review.snapshot, activeInstallFiles(state), activeInstallFiles(state, true), changesKey(updates.map(update => ({ path: update.file.path, operation: update.operation })))])).digest('hex')
  return { snapshot, configuration, targets }
}

/** Called under the installer's instance lock; never acquires that lock again. */
export async function prepareModInstallReview(
  path: string,
  getState: () => InstanceInstallLock,
  updates: InstanceFileUpdate[],
  getConfiguration: () => ModReviewConfiguration,
  checksum: (path: string, algorithm: string) => Promise<string>,
  recoveryReview?: ModInstallReview,
) {
  const state = getState()
  let review = state.review
  if (!review && recoveryReview) throw new Error('Reviewed install no longer pending')
  if (!review) return undefined
  const paths = [...new Set(updates.map(update => modPath(update.file.path)))]
  const wanted = new Map(activeInstallFiles(state).map(file => {
    if (!/^[a-f0-9]{40}$/i.test(file.hashes.sha1 || '')) throw new Error('Reviewed upgrades require SHA-1 hashes')
    return [modPath(file.path), file.hashes.sha1.toLowerCase()]
  }))
  const readHash = (relative: string) => readModHash(path, relative, checksum)
  if (recoveryReview) {
    const capture = await captureModInstallRecovery(path, state, updates, getConfiguration(), checksum)
    if (recoveryReview.snapshot !== capture.snapshot || changesKey(recoveryReview.changes) !== changesKey(updates.map(update => ({ path: update.file.path, operation: update.operation })))) throw changed()
    review = state.review = { snapshot: recoveryReview.snapshot, changes: recoveryReview.changes, configuration: capture.configuration, targets: capture.targets }
  }
  if (!!review.configuration !== !!review.targets) throw new Error('Invalid persisted mod review')
  if (!review.configuration) {
    if (changesKey(review.changes) !== changesKey(updates.map(update => ({ path: update.file.path, operation: update.operation })))) throw changed()
    const oldFiles = state.oldFiles ?? []
    const hashes = Object.fromEntries(oldFiles.map(file => [join(path, file.path), file.hashes.sha1?.toLowerCase()]))
    for (const file of oldFiles) modPath(file.path)
    await validateModFileChanges(path, oldFiles.map(file => join(path, file.path)), hashes, review.snapshot, getConfiguration())
    const targets: Record<string, string | null> = {}
    for (const name of paths) targets[name] = await readHash(name)
    if ((await readModFilesSnapshot(path, getConfiguration())).fingerprint !== review.snapshot) throw changed()
    review.configuration = getConfiguration()
    review.targets = targets
  }
  const checkConfiguration = () => {
    if (JSON.stringify(getConfiguration()) !== JSON.stringify(review.configuration)) throw changed()
  }
  const targets = review.targets!
  for (const name of Object.keys(targets)) modPath(name)
  let allTargetsPresent: boolean | undefined
  const check = async (file?: InstanceFile, operation?: InstanceFileUpdate['operation']) => {
    checkConfiguration()
    for (const name of file ? [modPath(file.path)] : paths) {
      if (!Object.hasOwn(targets, name)) throw changed()
      if (file && operation !== 'remove' && operation !== 'backup-remove' && wanted.has(name) && file.hashes.sha1?.toLowerCase() !== wanted.get(name)) throw changed()
      const actual = await readHash(name), expected = targets[name]
      if (actual === expected || actual !== null && actual === wanted.get(name)) continue
      // Recovery also recognizes a crash after the final planned removals.
      if (actual === null && !wanted.has(name)) {
        const active = activeInstallFiles(getState()).map(file => modPath(file.path))
        allTargetsPresent ??= (await Promise.all(active.map(async name => await readHash(name) === wanted.get(name)))).every(Boolean)
        if (allTargetsPresent) continue
      }
      throw changed()
    }
    checkConfiguration()
  }
  await check()
  return check
}
