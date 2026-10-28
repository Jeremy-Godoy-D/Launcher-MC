import { createHash, randomUUID } from 'node:crypto'
import { lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { ResourcePackSelection } from '@xmcl/runtime-api/src/services/InstanceOptionsService'
import { importPathParts } from '../../util/importFile'

const MAX_BYTES = 1024 * 1024
const changed = () => Object.assign(new Error('Resource pack options changed'), { name: 'ResourcePackSelectionChangedError' })
async function inspect(path: string) {
  return lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error })
}
async function readOptions(path: string) {
  if (typeof path !== 'string' || !isAbsolute(path) || !(await lstat(path)).isDirectory()) throw new Error('Unsafe instance directory')
  const file = join(path, 'options.txt'), info = await inspect(file)
  if (info && (!info.isFile() || info.size > MAX_BYTES)) throw new Error('Unsafe options file')
  const bytes = info ? await readFile(file) : undefined
  if (bytes && bytes.length > MAX_BYTES) throw new Error('Options file too large')
  const text = bytes?.toString('utf8') || '', lines = text.split(/\r?\n/).filter(line => line.startsWith('resourcePacks:'))
  if (lines.length > 1) throw new Error('Ambiguous resource pack options')
  const packs: unknown = lines.length ? JSON.parse(lines[0].slice('resourcePacks:'.length)) : []
  validateSelection(packs)
  return { file, info, text, packs, snapshot: createHash('sha256').update(JSON.stringify([info ? [info.dev, info.ino, info.nlink] : null, bytes?.toString('base64')])).digest('hex') }
}
function validateSelection(packs: unknown): asserts packs is string[] {
  // eslint-disable-next-line no-control-regex
  if (!Array.isArray(packs) || packs.length > 1000 || packs.some(pack => typeof pack !== 'string' || !pack || pack.length > 1024 || /[\x00-\x1f\x7f]/.test(pack))) throw new Error('Invalid resource pack selection')
}

export async function readResourcePackSelection(path: string): Promise<ResourcePackSelection> {
  const { packs, snapshot, info } = await readOptions(path)
  return { packs, snapshot, shared: (info?.nlink || 0) > 1 }
}

export async function writeResourcePackSelection(path: string, selection: ResourcePackSelection, sharedDirectory: string, sharedOptions: string): Promise<ResourcePackSelection> {
  validateSelection(selection?.packs)
  if (typeof selection.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(selection.snapshot)) throw changed()
  const before = await readOptions(path)
  if (before.snapshot !== selection.snapshot) throw changed()
  const added = selection.packs.filter(pack => !before.packs.includes(pack) && pack !== 'vanilla')
  if (added.length) {
    const directory = join(path, 'resourcepacks'), info = await lstat(directory)
    if (info.isSymbolicLink()) {
      if (await realpath(directory) !== await realpath(sharedDirectory) || !(await lstat(sharedDirectory)).isDirectory()) throw new Error('Unmanaged resource pack directory')
    } else if (!info.isDirectory()) throw new Error('Invalid resource pack directory')
    for (const pack of added) {
      const name = pack.startsWith('file/') ? pack.slice(5) : pack
      if (importPathParts(name).length !== 1) throw new Error('Invalid resource pack identifier')
      const file = await lstat(join(directory, name))
      if (!file.isFile() && !file.isDirectory()) throw new Error('Unmanaged resource pack')
    }
  }
  const newline = before.text.includes('\r\n') ? '\r\n' : '\n', line = `resourcePacks:${JSON.stringify(selection.packs)}`
  const content = /^resourcePacks:/m.test(before.text) ? before.text.replace(/^resourcePacks:[^\r\n]*/m, () => line) : `${before.text}${before.text && !before.text.endsWith('\n') ? newline : ''}${line}${newline}`
  if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('Options file too large')
  if (before.info && before.info.nlink > 1) {
    const shared = await inspect(sharedOptions)
    if (!shared?.isFile() || shared.ino !== before.info.ino || shared.dev !== before.info.dev || resolve(sharedOptions) === before.file) throw new Error('Unmanaged shared options')
    // Explicitly shared options retain their inode and affect all linked instances.
    const handle = await open(before.file, 'r+')
    try {
      const info = await handle.stat()
      if (info.ino !== before.info.ino || info.dev !== before.info.dev || (await readOptions(path)).snapshot !== before.snapshot) throw changed()
      await handle.writeFile(content, 'utf8'); await handle.truncate(Buffer.byteLength(content)); await handle.sync()
    } finally { await handle.close() }
  } else {
    const temporary = join(path, `.grimo-options-${randomUUID()}.tmp`), handle = await open(temporary, 'wx')
    try {
      try { await handle.writeFile(content, 'utf8'); await handle.sync() } finally { await handle.close() }
      if ((await readOptions(path)).snapshot !== before.snapshot) throw changed()
      await rename(temporary, before.file)
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  }
  return readResourcePackSelection(path)
}
