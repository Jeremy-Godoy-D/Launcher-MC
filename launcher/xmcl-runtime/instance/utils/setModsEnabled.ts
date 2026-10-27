import { constants } from 'node:fs'
import { copyFile, link, lstat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'

export async function setModsEnabled(path: string, files: string[], enabled: boolean) {
  if (!isAbsolute(path) || !Array.isArray(files)) throw new Error('Invalid mod selection')
  const directory = join(path, 'mods')
  if (!(await lstat(directory)).isDirectory()) throw new Error('Unmanaged mods directory')
  const changes: Array<[string, string]> = []
  for (const file of new Set(files)) {
    if (typeof file !== 'string' || dirname(file) !== directory || !(await lstat(file)).isFile()) throw new Error('Unmanaged mod file')
    if (file.endsWith('.disabled') === enabled) changes.push([file, enabled ? file.slice(0, -9) : `${file}.disabled`])
  }
  for (const [source, destination] of changes) {
    // Exclusive creation preserves both versions if an enabled/disabled name already exists.
    try { await link(source, destination) }
    catch (failure) {
      if (!failure || typeof failure !== 'object' || !('code' in failure) || !['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'ENOSYS'].includes(String(failure.code))) throw failure
      await copyFile(source, destination, constants.COPYFILE_EXCL)
    }
    await unlink(source)
  }
}
