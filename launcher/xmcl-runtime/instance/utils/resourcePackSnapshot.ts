import { createHash } from 'node:crypto'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { ModReviewConfiguration } from '@xmcl/runtime-api/src/services/InstanceModsService'
import type { ResourcePackFilesSnapshot } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { instanceFileSource } from '../../instanceIO/utils/instanceFileSource'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export async function resourcePackLocation(path: string, sharedRoot: string, domain: 'resourcepacks' | 'shaderpacks' = 'resourcepacks') {
  if (domain !== 'resourcepacks' && domain !== 'shaderpacks') throw new Error('Invalid pack domain')
  const source = await instanceFileSource(path, domain, sharedRoot), root = join(source.root, source.path)
  const [instance, directory, link] = await Promise.all([realpath(path), lstat(root), lstat(join(path, domain))])
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Unsafe resource pack directory')
  return { root, shared: source.root !== instance, authority: digest([instance, root, directory.ino, directory.dev, link.ino, link.dev]) }
}
export async function readResourcePackFilesSnapshot(path: string, sharedRoot: string, configuration?: ModReviewConfiguration, domain: 'resourcepacks' | 'shaderpacks' = 'resourcepacks'): Promise<ResourcePackFilesSnapshot> {
  const location = await resourcePackLocation(path, sharedRoot, domain), names = await readdir(location.root), entries: ResourcePackFilesSnapshot['entries'] = []
  if (names.length > 10000) throw new Error('Too many resource packs to review')
  for (const fileName of names.sort()) {
    const info = await lstat(join(location.root, fileName))
    if (info.isSymbolicLink() || !info.isFile() && !info.isDirectory()) throw new Error('Unsafe resource pack entry')
    entries.push({ path: join(path, domain, fileName), fileName, size: info.size, mtime: info.mtimeMs, ctime: info.ctimeMs, ino: info.ino, dev: info.dev, directory: info.isDirectory() })
  }
  if ((await resourcePackLocation(path, sharedRoot, domain)).authority !== location.authority) throw Object.assign(new Error('Resource pack directory changed during review'), { name: 'ModFilesChangedError' })
  return { entries, configuration, authority: location.authority, shared: location.shared, fingerprint: digest([configuration || null, location.authority, entries]) }
}
