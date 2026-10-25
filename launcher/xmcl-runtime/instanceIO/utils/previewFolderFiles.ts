import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, parse, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getMultiMCGameDirectory, isInstanceInstallPath, type InstanceFile } from '@xmcl/instance'
import type { InstanceType } from '@xmcl/runtime-api'

const omitted = new Set(['assets', 'libraries', 'versions', 'jre', 'java_versions', 'logs', 'crash-reports', 'instance.json', 'launcher_profiles.json', 'launcher_settings.json', 'launcher_accounts.json', 'usercache.json', 'usernamecache.json', 'profile.json', 'minecraftinstance.json', 'instance.cfg', 'mmc-pack.json', 'user.json', 'accounts.json'])

/** Read-only, hash-pinned source inventory; never follow links or reuse launcher credentials. */
export async function previewFolderFiles(source: string, type?: InstanceType): Promise<InstanceFile[]> {
  if (!isAbsolute(source) || parse(source).root === source) throw new Error('Invalid import directory')
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Import directory is a link')
  const directory = type === 'mmc' || type === 'prism' ? getMultiMCGameDirectory(source) : source
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Import directory is a link')
  const root = await realpath(directory)
  if (!(await lstat(root)).isDirectory() || parse(root).root === root) throw new Error('Invalid import directory')
  const files: InstanceFile[] = []
  const seen = new Set<string>()
  let entries = 0
  async function scan(dir: string, depth: number) {
    if (depth > 64) throw new Error('Import directory is too deep')
    for (const entry of await readdir(dir)) {
      if (++entries > 100000) throw new Error('Import directory is too large')
      const file = join(dir, entry)
      const name = relative(root, file).replaceAll('\\', '/')
      if (omitted.has(name.split('/')[0].toLowerCase()) || isInstanceInstallPath(name)) continue
      const info = await lstat(file)
      const actual = await realpath(file)
      const inside = relative(root, actual)
      if (info.isSymbolicLink() || inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error('Import contains a link outside its source')
      if (info.isDirectory()) { await scan(file, depth + 1); continue }
      if (!info.isFile() || files.length >= 100000 || seen.has(name.toLowerCase())) throw new Error('Unsupported or ambiguous import file')
      seen.add(name.toLowerCase())
      const sha1 = createHash('sha1'), sha256 = createHash('sha256')
      for await (const chunk of createReadStream(actual)) { sha1.update(chunk); sha256.update(chunk) }
      files.push({ path: name, size: info.size, hashes: { sha1: sha1.digest('hex'), sha256: sha256.digest('hex') }, downloads: [pathToFileURL(actual).href] })
    }
  }
  await scan(root, 0)
  return files
}
