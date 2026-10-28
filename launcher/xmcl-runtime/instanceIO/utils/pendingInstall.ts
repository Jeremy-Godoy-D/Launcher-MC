import { InstanceInstallLock } from '@xmcl/instance'
import { isSystemError } from '@xmcl/utils'
import { readJson, readdir, rename } from 'fs-extra'
import { lstat, open, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, isAbsolute, join } from 'path'
import { setTimeout } from 'timers/promises'

export async function readPendingInstalls(instancePath: string) {
  const directory = join(instancePath, '.install')
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
    const value = await readJson(path).catch((error) => {
      if (isSystemError(error) && error.code === 'ENOENT') return undefined
      throw error
    })
    if (value) {
      const state = InstanceInstallLock.parse(value)
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
