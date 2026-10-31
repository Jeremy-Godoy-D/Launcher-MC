import { InstanceInstallLock } from '@xmcl/instance'
import { isSystemError } from '@xmcl/utils'
import { readJson, readdir, rename } from 'fs-extra'
import { lstat, open, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, sep } from 'path'
import { setTimeout } from 'timers/promises'

export async function assertInstallDirectory(instancePath: string, path: string) {
  const inside = relative(instancePath, path)
  if (!isAbsolute(instancePath) || !isAbsolute(path) || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error('Unsafe install directory')
  let current = instancePath
  for (const part of ['', ...inside.split(sep).filter(Boolean)]) {
    current = join(current, part)
    const info = await lstat(current).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!info) return
    if (!info.isDirectory()) throw new Error('Unsafe install directory')
  }
}

export function isLegacyInstallWorkspace(instancePath: string, profilePath: string, state: InstanceInstallLock) {
  return profilePath === join(instancePath, '.install-profile') && dirname(state.workspace) === dirname(instancePath) &&
    basename(state.workspace).startsWith(`.${basename(instancePath)}-install-`)
}

export async function assertInstallStatePaths(instancePath: string, profilePath: string, state: InstanceInstallLock, allowLegacyWorkspace = false) {
  const workspace = relative(instancePath, state.workspace).split(sep), backup = relative(instancePath, state.backup).split(sep)
  const legacy = allowLegacyWorkspace && isLegacyInstallWorkspace(instancePath, profilePath, state)
  if (!isAbsolute(state.workspace) || !legacy && (workspace.length !== 3 || workspace[0] !== '.install' || !workspace[1] || workspace[2] !== 'files') ||
      !isAbsolute(state.backup) || backup.length !== 2 || backup[0] !== '.backups' || !backup[1] ||
      profilePath !== join(instancePath, '.install-profile') && (dirname(profilePath) !== join(instancePath, '.install') || !basename(profilePath).endsWith('.json'))) throw new Error('Unsafe install state paths')
  await assertInstallDirectory(instancePath, dirname(profilePath))
  if (!legacy) await assertInstallDirectory(instancePath, state.workspace)
  await assertInstallDirectory(instancePath, state.backup)
  const profile = await lstat(profilePath).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (profile && !profile.isFile()) throw new Error('Unsafe install state file')
}

export async function readPendingInstalls(instancePath: string) {
  const directory = join(instancePath, '.install')
  await assertInstallDirectory(instancePath, directory)
  const entries = await readdir(directory).catch((error) => {
    if (isSystemError(error) && error.code === 'ENOENT') return []
    throw error
  })
  const paths = [
    join(instancePath, '.install-profile'),
    ...entries.filter(name => name.endsWith('.json')).sort().map(name => join(directory, name)),
  ]
  const result: Array<{ path: string; state: InstanceInstallLock }> = []
  for (const path of paths) {
    const info = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
    if (!info) continue
    if (!info.isFile()) throw new Error('Unsafe install state file')
    const value = await readJson(path).catch((error) => {
      if (isSystemError(error) && error.code === 'ENOENT') return undefined
      throw error
    })
    if (value) {
      const state = InstanceInstallLock.parse(value)
      await assertInstallStatePaths(instancePath, path, state, true)
      state.revision ??= state.mtime
      result.push({ path, state })
    }
  }
  return result.sort((a, b) => (b.state.revision ?? 0) - (a.state.revision ?? 0))
}

// Install operations serialize writers; readers see only complete JSON.
export async function writeInstallState(path: string, state: unknown) {
  const data = JSON.stringify(state)
  if (data === undefined) throw new TypeError('Invalid install state')
  if (!isAbsolute(path) || !(await lstat(dirname(path))).isDirectory()) throw new Error('Unsafe install state directory')
  const existing = await lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (existing && !existing.isFile()) throw new Error('Unsafe install state file')
  // A fixed .tmp name could be a hard link to another file.
  const temporary = join(dirname(path), `.install-state-${randomUUID()}.tmp`), handle = await open(temporary, 'wx')
  try {
    try { await handle.writeFile(`${data}\n`, 'utf8') }
    finally { await handle.close() }
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(temporary, path)
        return
      } catch (error) {
        if (process.platform !== 'win32' || attempt >= 5 ||
            !isSystemError(error) || !['EPERM', 'EACCES', 'EBUSY'].includes(error.code)) throw error
        // Windows can briefly hold the destination open in a reader or watcher.
        await setTimeout(20 * 2 ** attempt)
      }
    }
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
}
