import {
  chmod,
  copyFile,
  ensureDir,
  lstat,
  readdir,
  readlink,
  rename,
  rmdir,
  symlink,
  utimes,
  unlink,
} from 'fs-extra'
import { dirname, join } from 'path'
import { constants } from 'node:fs'
import { writeFile as writeAtomically } from 'atomically'
import { reviewMigrationPaths } from './migrationPaths'
import type { Logger } from '~/infra'
import type { LauncherApp } from './LauncherApp'
import { isSystemError } from '@xmcl/utils'
import type { MigrationProgress } from '@xmcl/runtime-api'

type MigrationLogger = Pick<Logger, 'log' | 'warn'>
type MigrationApp = Pick<LauncherApp, 'appDataPath'> & {
  controller: Pick<
    LauncherApp['controller'],
    'startMigrate' | 'handle' | 'broadcast' | 'endMigrate'
  >
}

/**
 * Called for every file that is physically copied across volumes, with the
 * number of bytes copied and the destination path. Same-volume renames are
 * effectively free and never reported here — the caller reconciles those
 * against the pre-computed size instead.
 */
type OnCopied = (bytes: number, file: string) => void

/**
 * Move `from` to `to`.
 *
 * The destination starts empty. Directory merging is used only for parents
 * created by this transfer or its rollback; existing files are never replaced.
 *
 * Symlinks are recreated as links and never followed. Instances keep their
 * `versions`/`libraries` folders as symlinks back to the shared root, so
 * following one (the default `stat` behaviour) would copy the root's contents
 * into the instance and then `remove()` them *through* the link — silently
 * wiping the real version jars from the root. That is the "my Minecraft
 * version jar is gone after moving the data" report.
 *
 * Falls back to copy + remove across different volumes (`EXDEV`). The optional
 * `onCopied` callback receives byte-level progress for that slow cross-volume
 * path so the UI can render a smooth, determinate progress bar.
 */
async function move(from: string, to: string, onCopied?: OnCopied, onMoved?: (from: string, to: string) => void) {
  // `lstat`, never `stat`: we must see a symlink as a link, not as its target.
  const fromStat = await lstat(from)
  const toStat = await lstat(to).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (toStat?.isSymbolicLink()) throw Object.assign(new Error('Migration destination is a link'), { code: 'EEXIST' })

  if (fromStat.isSymbolicLink()) {
    // Recreate the link itself at the destination rather than its target. The
    // target is an absolute path into the old root; the instance launch
    // precheck relinks any stale target to the new root on next launch.
    if (toStat) throw Object.assign(new Error('Migration destination exists'), { code: 'EEXIST' })
    try { await rename(from, to) } catch (error) {
      if (!isSystemError(error) || error.code !== 'EXDEV') throw error
      await symlink(await readlink(from), to)
      await unlink(from)
    }
    onMoved?.(from, to)
    return
  }

  // Both sides are directories: merge child by child instead of failing.
  if (fromStat.isDirectory() && toStat?.isDirectory()) {
    const children = await readdir(from)
    for (const child of children) {
      await move(join(from, child), join(to, child), onCopied, onMoved)
    }
    // Only removes the source directory once it is empty.
    await rmdir(from)
    return
  }

  try {
    if (toStat) throw Object.assign(new Error('Migration destination exists'), { code: 'EEXIST' })
    await rename(from, to)
    onMoved?.(from, to)
  } catch (e) {
    if (isSystemError(e) && e.code === 'EXDEV') {
      // Different volume: rename is impossible, copy then remove.
      if (fromStat.isDirectory()) {
        await ensureDir(to)
        const children = await readdir(from)
        for (const child of children) {
          await move(join(from, child), join(to, child), onCopied, onMoved)
        }
        await rmdir(from)
      } else {
        // A regular file across volumes (symlinks were handled above). Copy
        // with the low-level `copyFile` to avoid fs-extra's per-file `mkdirs`
        // + `lstat` overhead, which is a real win for the thousands of tiny
        // files under assets/libraries where cross-volume migrations spend
        // most of their time. The destination directory is guaranteed to
        // exist (the directory branch above ran `ensureDir`, or this is a
        // top-level file landing in the migration root).
        await copyFile(from, to, constants.COPYFILE_EXCL)
        const current = await lstat(from)
        if (!current.isFile() || current.size !== fromStat.size || current.mtimeMs !== fromStat.mtimeMs) throw new Error('Migration source changed while copying')
        // Preserve mode (the JRE ships executable binaries) and timestamps
        // (resource caches key off mtime); failures here must not abort the
        // migration on filesystems that ignore these attributes (e.g. NTFS
        // mounted via ntfs-3g).
        await chmod(to, fromStat.mode).catch(() => {})
        await utimes(to, fromStat.atime, fromStat.mtime).catch(() => {})
        await unlink(from)
        onMoved?.(from, to)
        onCopied?.(fromStat.size, to)
      }
    } else {
      throw e
    }
  }
}

/**
 * Recursively sum the byte size and file count of `path` using metadata only.
 * Cheap relative to the copy that follows, and lets the progress bar be
 * determinate instead of an endless spinner.
 */
async function computeSize(path: string): Promise<{ bytes: number; files: number }> {
  // `lstat` so a symlink is weighed as a single zero-byte entry instead of its
  // (possibly huge, possibly shared) target — `move` only recreates the link,
  // it never copies the target, so counting the target here would both
  // double-count shared roots reached via instance symlinks and stop the bar
  // from ever reaching 100%.
  const s = await lstat(path).catch(() => undefined)
  if (!s) return { bytes: 0, files: 0 }
  if (s.isSymbolicLink()) return { bytes: 0, files: 1 }
  if (s.isDirectory()) {
    const children = await readdir(path)
    let bytes = 0
    let files = 0
    for (const child of children) {
      const r = await computeSize(join(path, child))
      bytes += r.bytes
      files += r.files
    }
    return { bytes, files }
  }
  return { bytes: s.size, files: 1 }
}

export interface CompletedMigrationTelemetry {
  traceparent?: string
  startTime: number
  endTime: number
  outcome: 'success' | 'error'
  copiedBytes: number
  copiedFiles: number
  error?: { name: string; message: string; stack?: string }
}

let completedMigrationTelemetry: CompletedMigrationTelemetry | undefined

export function takeCompletedMigrationTelemetry() {
  const telemetry = completedMigrationTelemetry
  completedMigrationTelemetry = undefined
  return telemetry
}

export async function handleMigrateRoot(
  source: string,
  logger: MigrationLogger,
  app: MigrationApp,
) {
  // Use the last occurrence: a stale `--migrate` can be carried forward into a
  // relaunch (e.g. by the updater reusing the current argv), so the freshest
  // destination wins.
  const migrateIndex = process.argv.lastIndexOf('--migrate')
  const requestedDestination = process.argv[migrateIndex + 1]
  if (migrateIndex === -1 || !requestedDestination) {
    return source
  }
  // Nothing to do if the destination is already the current root. This avoids
  // popping the migration window (and useless work) when a stale `--migrate`
  // flag survives a relaunch.
  let destination: string
  try {
    const review = await reviewMigrationPaths(source, requestedDestination)
    if (review.unchanged) return source
    destination = review.destination
  } catch (error) { logger.warn('Migration destination refused', error); return source }
  const traceparentIndex = process.argv.lastIndexOf('--migration-traceparent')
  const traceparent = traceparentIndex === -1 ? undefined : process.argv[traceparentIndex + 1]
  const startTime = Date.now()
  const candidates = [
    'assets',
    'instances',
    'jre',
    'libraries',
    'labymod-neo',
    'modpacks',
    'mods',
    'resourcepacks',
    'saves',
    'shaderpacks',
    'versions',
    'authlib-injection.json',
    'ely-authlib.json',
    'launcher_profiles.json',
    'options.txt',
    'servers.dat',
  ]
  const finished = [] as Array<{ from: string; to: string }>
  // The single source of truth for the progress window. Mutated in place and
  // pushed to the renderer on a throttle so a fast stream of tiny-file copies
  // cannot flood the IPC channel.
  const state: MigrationProgress = {
    from: source,
    to: destination,
    file: '',
    copiedBytes: 0,
    totalBytes: 0,
    copiedFiles: 0,
    totalFiles: 0,
    phase: 'scanning',
  }
  let lastBroadcast = 0
  const broadcast = (force = false) => {
    const now = Date.now()
    if (!force && now - lastBroadcast < 64) return
    lastBroadcast = now
    try { app.controller.broadcast('migration-event', { event: 'progress', payload: { ...state } }) }
    catch (error) { logger.warn('Migration progress window unavailable', error) }
  }
  try {
    logger.log(`Try to use rename to migrate the files: ${source} -> ${destination}`)

    // The progress window is purely cosmetic — never let its failure abort
    // the migration itself.
    app.controller.handle('migration-get-progress', () => ({ ...state }))
    await Promise.resolve().then(() => app.controller.startMigrate()).catch((e) => {
      logger.warn('Failed to show the migration window', e)
    })
    await ensureDir(destination)

    const files = await readdir(source).then((files) =>
      files.filter((file) => candidates.includes(file)),
    )

    // Phase 1: scan sizes so the bar can be determinate. Metadata only, so it
    // is cheap next to the copy that follows.
    const sizes = new Map<string, { bytes: number; files: number }>()
    for (const file of files) {
      const size = await computeSize(join(source, file))
      sizes.set(file, size)
      state.totalBytes += size.bytes
      state.totalFiles += size.files
    }
    broadcast(true)

    // Phase 2: actually move the data.
    state.phase = 'migrating'
    for (const file of files) {
      const from = join(source, file)
      const to = join(destination, file)
      const size = sizes.get(file)!
      const baseBytes = state.copiedBytes
      const baseFiles = state.copiedFiles
      state.file = from
      broadcast(true)
      try {
        logger.log(`Move ${from} -> ${to}`)
        await move(from, to, (bytes, copiedFile) => {
          state.copiedBytes += bytes
          state.copiedFiles += 1
          state.file = copiedFile
          broadcast()
        }, (from, to) => finished.push({ from, to }))
        // A same-volume rename moves the whole entry atomically without firing
        // the per-file callback, so reconcile the counters against the scan to
        // keep the bar honest (also covers skipped symlinks on the slow path).
        state.copiedBytes = Math.max(state.copiedBytes, baseBytes + size.bytes)
        state.copiedFiles = Math.max(state.copiedFiles, baseFiles + size.files)
        broadcast(true)
      } catch (e) {
        logger.warn(`Fail to move ${from} -> ${to}`, e)
        throw e
      }
    }

    state.file = ''
    await writeAtomically(join(app.appDataPath, 'root'), destination)
    state.phase = 'done'
    broadcast(true)
    completedMigrationTelemetry = {
      traceparent,
      startTime,
      endTime: Date.now(),
      outcome: 'success',
      copiedBytes: state.copiedBytes,
      copiedFiles: state.copiedFiles,
    }
    await Promise.resolve().then(() => app.controller.endMigrate({
      from: source,
      to: destination,
    })).catch(error => logger.warn('Failed to close migration window', error))
    return destination
  } catch (e) {
    completedMigrationTelemetry = {
      traceparent,
      startTime,
      endTime: Date.now(),
      outcome: 'error',
      copiedBytes: state.copiedBytes,
      copiedFiles: state.copiedFiles,
      error: {
        name: e instanceof Error ? e.name : 'Error',
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
    }
    // rollback
    logger.warn(`Fail to migrate, rollback`, e)
    state.phase = 'rollingBack'
    state.error = { file: state.file, rollback: 'running' }
    broadcast(true)
    let restored = true
    for (const { from, to } of finished.reverse()) {
      try {
        logger.log(`Rollback ${to} -> ${from}`)
        state.file = from; broadcast()
        await ensureDir(dirname(from))
        await move(to, from)
      } catch (e) {
        restored = false
        logger.warn(`Fail to rollback ${to} -> ${from}`, e)
      }
    }
    state.phase = 'failed'; state.error = { ...state.error, rollback: restored ? 'complete' : 'incomplete' }
    broadcast(true)
    try { app.controller.broadcast('migration-event', { event: 'error', payload: { file: state.error.file, error: { name: 'DataMigrationFailed' } } }) } catch {}
    await Promise.resolve().then(() => app.controller.endMigrate()).catch(error => logger.warn('Migration window unavailable', error))
    return source
  }
}
