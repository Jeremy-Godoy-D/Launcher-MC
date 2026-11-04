import { randomUUID } from 'node:crypto'
import { link, lstat, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'

export function importPathParts(path: string) {
  const parts = path.split('/')
  // Reject control characters in untrusted import identifiers and arguments.
  // eslint-disable-next-line no-control-regex
  if (isAbsolute(path) || parts.some(p => !p || p === '.' || p === '..' || /[\\<>:"|?*\x00-\x1f\x7f]/.test(p) || /[. ]$/.test(p) || /^(CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(\.|$)/i.test(p))) throw new Error('Invalid MultiMC local library path')
  return parts
}

/** Read only regular files, never follow source links or library-directory junctions. */
export async function readImportFile(root: string, path: string, limit = 256 * 1024 * 1024): Promise<Buffer | undefined> {
  const parts = importPathParts(path)
  let current = root
  try {
    for (let i = 0; i < parts.length; i++) {
      current = join(current, parts[i])
      const info = await lstat(current)
      if (info.isSymbolicLink() || (i < parts.length - 1 ? !info.isDirectory() : !info.isFile() || info.size > limit)) throw new Error('Unsafe or oversized import file')
    }
    const data = await readFile(current)
    if (data.length > limit) throw new Error('Import file changed size')
    return data
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Publish complete files without replacing a pre-existing version or library. */
export async function writeImmutableImportFiles(root: string, files: { path: string; data: Buffer }[]) {
  for (const file of files) {
    const existing = await readImportFile(root, file.path)
    if (existing && !existing.equals(file.data)) throw Object.assign(new Error('Import conflicts with an existing library or version'), { name: 'ImportFileConflict' })
  }
  await mkdir(root, { recursive: true })
  for (const file of files) {
    const parts = importPathParts(file.path)
    let directory = root
    for (const part of parts.slice(0, -1)) {
      directory = join(directory, part)
      await mkdir(directory).catch(error => { if (error.code !== 'EEXIST') throw error })
      const info = await lstat(directory)
      if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('Unsafe import destination')
    }
    const destination = join(root, ...parts), temporary = join(dirname(destination), `.import-${randomUUID()}`)
    try {
      await writeFile(temporary, file.data, { flag: 'wx' })
      await link(temporary, destination).catch(async error => {
        if (error.code !== 'EEXIST') throw error
        const existing = await readImportFile(root, file.path)
        if (!existing?.equals(file.data)) throw Object.assign(new Error('Import destination changed'), { name: 'ImportFileConflict' })
      })
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
}
