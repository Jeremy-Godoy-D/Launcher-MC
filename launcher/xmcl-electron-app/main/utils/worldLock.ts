import type { WorldLock } from '@xmcl/runtime/app/LauncherApp'
import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative, toNamespacedPath } from 'node:path'
import { getKoffi } from './gameWindow/koffi'

let native: ReturnType<typeof bindings> | undefined
function bindings() {
  const koffi = getKoffi(), kernel = koffi.load('kernel32.dll'), handle = koffi.pointer(koffi.opaque())
  return {
    open: kernel.func('__stdcall', 'CreateFileW', handle, ['str16', 'uint32_t', 'uint32_t', 'void *', 'uint32_t', 'uint32_t', handle]),
    info: kernel.func('__stdcall', 'GetFileInformationByHandle', 'bool', [handle, 'void *']),
    lock: kernel.func('__stdcall', 'LockFile', 'bool', [handle, 'uint32_t', 'uint32_t', 'uint32_t', 'uint32_t']),
    unlock: kernel.func('__stdcall', 'UnlockFile', 'bool', [handle, 'uint32_t', 'uint32_t', 'uint32_t', 'uint32_t']),
    close: kernel.func('__stdcall', 'CloseHandle', 'bool', [handle]),
    error: kernel.func('__stdcall', 'GetLastError', 'uint32_t', []),
  }
}
const unavailable = () => Object.assign(new Error('Unable to protect world session'), { name: 'WorldLockUnavailableError' })
const inUse = () => Object.assign(new Error('Close the game using this world before continuing'), { name: 'InstanceRunningError' })

export async function acquireWindowsWorldLock(world: string, create: boolean): Promise<WorldLock | undefined> {
  if (process.platform !== 'win32' || !isAbsolute(world)) throw unavailable()
  const root = await realpath(world), directory = await lstat(root, { bigint: true }), path = join(root, 'session.lock')
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw unavailable()
  const before = await lstat(path, { bigint: true }).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (before && (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n)) throw unavailable()
  if (!before && !create) return undefined
  const api = native ||= bindings()
  // Replacing the control file must fail verification before publishing world changes.
  const handle = api.open(toNamespacedPath(path), create ? 0xc0000000 : 0x80000000, 7, null, create ? 4 : 3, 0x00200000, null)
  if (handle === null || handle === -1n || handle === 0xffffffffffffffffn || handle === 0xffffffffn) {
    const code = api.error()
    if (code === 32 || code === 33) throw inUse()
    throw unavailable()
  }
  let locked = false, released = false
  function release() {
    if (released) return
    released = true
    const unlocked = !locked || api.unlock(handle, 0, 0, 1, 0), closed = api.close(handle)
    if (!unlocked || !closed) throw unavailable()
  }
  try {
    const info = Buffer.alloc(52)
    if (!api.info(handle, info) || info.readUInt32LE(0) & 0x410 || info.readUInt32LE(40) !== 1) throw unavailable()
    const inode = BigInt(info.readUInt32LE(44)) << 32n | BigInt(info.readUInt32LE(48)), device = BigInt(info.readUInt32LE(28))
    if (before && (before.ino !== inode || before.dev !== device)) throw unavailable()
    if (!api.lock(handle, 0, 0, 1, 0)) {
      const code = api.error()
      if (code === 32 || code === 33) throw inUse()
      throw unavailable()
    }
    locked = true
    async function verify() {
      if (released || relative(root, await realpath(world)) !== '') throw unavailable()
      const currentRoot = await lstat(root, { bigint: true }), current = await lstat(path, { bigint: true })
      if (!currentRoot.isDirectory() || currentRoot.isSymbolicLink() || currentRoot.ino !== directory.ino || currentRoot.dev !== directory.dev || !current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || current.ino !== inode || current.dev !== device) throw unavailable()
    }
    await verify()
    return { verify, release }
  } catch (error) { release(); throw error }
}
