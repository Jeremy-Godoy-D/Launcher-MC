import { lstat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'

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
