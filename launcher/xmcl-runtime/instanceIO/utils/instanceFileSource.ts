import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, parse, relative } from 'node:path'
import { importPathParts } from '../../util/importFile'

export const SHARED_INSTANCE_FOLDERS = ['saves', 'resourcepacks', 'shaderpacks'] as const
const sharedFolders = new Set<string>(SHARED_INSTANCE_FOLDERS)

/** Resolve only the launcher's own top-level shared links; callers still validate/read the returned file. */
export async function instanceFileSource(instance: string, path: string, sharedRoot?: string, allowMissing = false) {
  const parts = importPathParts(path)
  if (!isAbsolute(instance) || parse(instance).root === instance) throw new Error('Invalid instance source')
  const instanceInfo = await lstat(instance)
  if (instanceInfo.isSymbolicLink() || !instanceInfo.isDirectory()) throw new Error('Unsafe instance source')
  let root = await realpath(instance)
  const first = join(root, parts[0]), firstInfo = await lstat(first).catch(error => { if (!allowMissing || error.code !== 'ENOENT') throw error })
  let mappedPath = path
  if (firstInfo?.isSymbolicLink()) {
    const name = process.platform === 'win32' ? parts[0].toLowerCase() : parts[0]
    if (!sharedRoot || !sharedFolders.has(name)) throw new Error('Untrusted instance link')
    const shared = await realpath(sharedRoot), expected = join(shared, name), info = await lstat(expected)
    if (parse(shared).root === shared || info.isSymbolicLink() || !info.isDirectory() || relative(await realpath(expected), await realpath(first)) !== '') throw new Error('Untrusted instance link')
    root = shared
    parts[0] = name; mappedPath = parts.join('/')
  }
  let current = root
  for (let index = 0; index < parts.length; index++) {
    current = join(current, parts[index])
    const info = await lstat(current).catch(error => { if (!allowMissing || error.code !== 'ENOENT') throw error })
    if (!info) break
    if (info.isSymbolicLink() || index < parts.length - 1 && !info.isDirectory() || index === parts.length - 1 && !info.isDirectory() && !info.isFile()) throw new Error('Unsafe instance file')
  }
  return { root, path: mappedPath }
}
