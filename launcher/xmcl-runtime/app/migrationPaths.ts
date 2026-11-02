import { lstat, readdir, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'

export function migrationPathError(code: 'invalid' | 'occupied' | 'nested' | 'changed' | 'busy') {
  return Object.assign(new Error('Data migration cannot use this destination'), { name: 'DataMigrationUnsafe', code })
}
function validate(path: string) {
  if (typeof path !== 'string' || !path || path.length > 32768 || /[\0\r\n]/.test(path) || !isAbsolute(path)) throw migrationPathError('invalid')
}
async function canonical(path: string) {
  let current = resolve(path)
  const suffix: string[] = []
  for (let depth = 0; depth < 256; depth++) {
    try { return resolve(await realpath(current), ...suffix) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(current) === current) throw error
      suffix.unshift(basename(current)); current = dirname(current)
    }
  }
  throw migrationPathError('invalid')
}
function contains(parent: string, child: string) {
  const path = relative(parent, child)
  return !path || path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path)
}
export async function reviewMigrationPaths(source: string, destination: string, expectedSource?: string) {
  validate(source); validate(destination)
  if (expectedSource !== undefined) validate(expectedSource)
  const [from, to] = await Promise.all([canonical(source), canonical(destination)])
  if (expectedSource !== undefined && relative(from, await canonical(expectedSource))) throw migrationPathError('changed')
  if (!relative(from, to)) return { source: resolve(source), destination: to, unchanged: true }
  if (contains(from, to) || contains(to, from)) throw migrationPathError('nested')
  const info = await lstat(to).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (info && (!info.isDirectory() || info.isSymbolicLink())) throw migrationPathError('invalid')
  if (info && (await readdir(to)).length) throw migrationPathError('occupied')
  return { source: resolve(source), destination: to, unchanged: false }
}
