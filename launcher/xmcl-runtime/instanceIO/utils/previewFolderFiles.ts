import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { isAbsolute, join, parse, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getMultiMCGameDirectory, isInstanceInstallPath, type InstanceFile } from '@xmcl/instance'
import type { InstanceType } from '@xmcl/runtime-api'
import { instanceFileSource } from './instanceFileSource'

const omitted = new Set(['assets', 'libraries', 'versions', 'jre', 'java_versions', 'logs', 'crash-reports', 'instance.json', 'launcher_profiles.json', 'launcher_settings.json', 'launcher_accounts.json', 'usercache.json', 'usernamecache.json', 'profile.json', 'minecraftinstance.json', 'instance.cfg', 'mmc-pack.json', 'user.json', 'accounts.json'])

/** External imports reject all links; native instance operations may supply their own shared data root. */
export async function previewFolderFiles(source: string, type?: InstanceType, options: { signal?: AbortSignal; sharedRoot?: string } = {}): Promise<InstanceFile[]> {
  options.signal?.throwIfAborted()
  if (!isAbsolute(source) || parse(source).root === source) throw new Error('Invalid import directory')
  if ((await lstat(source)).isSymbolicLink()) throw new Error('Import directory is a link')
  const directory = type === 'mmc' || type === 'prism' ? getMultiMCGameDirectory(source) : source
  if ((await lstat(directory)).isSymbolicLink()) throw new Error('Import directory is a link')
  const root = await realpath(directory)
  if (!(await lstat(root)).isDirectory() || parse(root).root === root) throw new Error('Invalid import directory')
  const files: InstanceFile[] = []
  const seen = new Set<string>()
  let entries = 0
  async function scan(dir: string, anchor: string, prefix: string, depth: number) {
    options.signal?.throwIfAborted()
    if (depth > 64) throw new Error('Import directory is too deep')
    for (const entry of await readdir(dir)) {
      options.signal?.throwIfAborted()
      if (++entries > 100000) throw new Error('Import directory is too large')
      const file = join(dir, entry)
      const name = prefix + entry
      if (omitted.has(name.split('/')[0].toLowerCase()) || depth === 0 && /^instance\.json\.tmp-[a-f0-9]{16}$/i.test(name) || isInstanceInstallPath(name)) continue
      let info = await lstat(file), actual = await realpath(file), branch = anchor
      if (info.isSymbolicLink()) {
        if (depth !== 0 || !options.sharedRoot) throw new Error('Import contains a link outside its source')
        const mapped = await instanceFileSource(root, name, options.sharedRoot)
        actual = await realpath(join(mapped.root, mapped.path)); info = await lstat(actual)
        branch = info.isDirectory() ? actual : mapped.root
      }
      const inside = relative(branch, actual)
      if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) throw new Error('Import contains a link outside its source')
      if (info.isDirectory()) { await scan(actual, branch, `${name}/`, depth + 1); continue }
      if (!info.isFile() || files.length >= 100000 || seen.has(name.toLowerCase())) throw new Error('Unsupported or ambiguous import file')
      seen.add(name.toLowerCase())
      const sha1 = createHash('sha1'), sha256 = createHash('sha256')
      for await (const chunk of createReadStream(actual, { signal: options.signal })) { sha1.update(chunk); sha256.update(chunk) }
      options.signal?.throwIfAborted()
      files.push({ path: name, size: info.size, hashes: { sha1: sha1.digest('hex'), sha256: sha256.digest('hex') }, downloads: [pathToFileURL(actual).href] })
    }
  }
  await scan(root, root, '', 0)
  return files
}
