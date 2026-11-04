import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, open, rename, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ShaderEngine } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { encodeUnicodeEscapes } from '@xmcl/gamesetting'
import { assertInstallDirectory } from '../../instanceIO/utils/pendingInstall'

const MAX_BYTES = 1024 * 1024
const files = { optifine: 'optionsshaders.txt', iris: 'config/iris.properties', oculus: 'config/oculus.properties' } as const
const changed = () => Object.assign(new Error('Shader configuration changed'), { name: 'ShaderSelectionChangedError' })
function propertyValue(value: string) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|[\s\S])/g, (_, escaped: string) => {
    if (escaped === 'u') throw new Error('Invalid properties escape')
    return escaped.startsWith('u') && escaped.length === 5 ? String.fromCharCode(parseInt(escaped.slice(1), 16)) : ({ t: '\t', n: '\n', r: '\r', f: '\f' }[escaped] ?? escaped)
  })
}
function blocks(text: string) {
  const lines = text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g)?.filter(Boolean) || [], result: { text: string; key?: string; value?: string }[] = []
  if (lines.length > 10000) throw new Error('Too many shader properties')
  for (let i = 0; i < lines.length; i++) {
    let raw = lines[i], logical = raw.replace(/[\r\n]+$/, '').replace(/^[ \t\f]+/, '')
    if (!logical || /^[#!]/.test(logical)) { result.push({ text: raw }); continue }
    while ((logical.match(/\\+$/)?.[0].length || 0) % 2) {
      if (++i >= lines.length) throw new Error('Unfinished properties continuation')
      raw += lines[i]; logical = logical.slice(0, -1) + lines[i].replace(/[\r\n]+$/, '').replace(/^[ \t\f]+/, '')
    }
    const match = /^((?:\\.|[^\\:= \t\f])*)(?:[ \t\f]*[=:][ \t\f]*|[ \t\f]+|$)([\s\S]*)$/.exec(logical)
    if (!match || result.length > 10000) throw new Error('Invalid shader properties')
    result.push({ text: raw, key: propertyValue(match[1]), value: propertyValue(match[2]) })
  }
  return result
}
export async function readShaderProperties(path: string, engine: ShaderEngine) {
  if (!Object.hasOwn(files, engine)) throw new Error('Invalid shader engine')
  const file = join(path, files[engine]); await assertInstallDirectory(path, dirname(file))
  const info = await lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error })
  if (info && (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES)) throw new Error('Unsafe shader configuration')
  let bytes = Buffer.alloc(0)
  if (info) {
    const handle = await open(file, 'r')
    try {
      const current = await handle.stat()
      if (current.ino !== info.ino || current.dev !== info.dev || !current.isFile()) throw changed()
      const buffer = Buffer.alloc(MAX_BYTES + 1); let size = 0
      for (;;) { const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null); size += bytesRead; if (size > MAX_BYTES) throw new Error('Shader configuration too large'); if (!bytesRead) break }
      const after = await handle.stat()
      if (after.size !== current.size || after.mtimeMs !== current.mtimeMs || after.ctimeMs !== current.ctimeMs) throw changed()
      bytes = buffer.subarray(0, size)
    } finally { await handle.close() }
  }
  const text = bytes.toString('latin1'), entries = blocks(text), values: Record<string, string> = Object.create(null)
  for (const entry of entries) if (entry.key !== undefined) values[entry.key] = entry.value!
  // A shader identifier is a single filename, even when Java escapes are used.
  if (values.shaderPack && (values.shaderPack.length > 1024 || Array.from(values.shaderPack).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) throw new Error('Invalid shader pack property')
  const snapshot = createHash('sha256').update(JSON.stringify([info ? [info.ino, info.dev, info.nlink, info.ctimeMs, info.mtimeMs] : null, bytes.toString('base64')])).digest('hex')
  return { file, info, text, entries, values, snapshot }
}
function encodeValue(value: string) {
  return encodeUnicodeEscapes(value.replace(/\\/g, '\\\\').replace(/ /g, '\\ ').replace(/=/g, '\\=').replace(/:/g, '\\:').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\f/g, '\\f'))
}
export async function writeShaderProperties(path: string, engine: ShaderEngine, patch: Record<string, string>, expected: string, check?: () => Promise<void>) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length > 256 || Object.entries(patch).some(([key, value]) => !/^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(key) || typeof value !== 'string' || value.length > 10000)) throw new Error('Invalid shader options')
  const before = await readShaderProperties(path, engine)
  if (before.snapshot !== expected) throw changed()
  if (before.info && before.info.nlink !== 1) throw new Error('Shared shader configuration cannot be replaced')
  const newline = before.text.includes('\r\n') ? '\r\n' : '\n', entries = before.entries.map(entry => ({ ...entry }))
  for (const [key, value] of Object.entries(patch)) {
    const index = entries.findLastIndex(entry => entry.key === key), line = `${key}=${encodeValue(value)}`
    if (index >= 0) { const ending = entries[index].text.match(/(?:\r\n|\r|\n)$/)?.[0] || ''; entries[index].text = line + ending }
    else { if (entries.length && !/[\r\n]$/.test(entries.at(-1)!.text)) entries.at(-1)!.text += newline; entries.push({ text: line + newline, key, value }) }
  }
  const content = Buffer.from(entries.map(entry => entry.text).join(''), 'latin1')
  if (content.length > MAX_BYTES) throw new Error('Shader configuration too large')
  await assertInstallDirectory(path, dirname(before.file)); await mkdir(dirname(before.file), { recursive: true }); await assertInstallDirectory(path, dirname(before.file))
  const temporary = join(dirname(before.file), `.grimo-shader-${randomUUID()}.tmp`), handle = await open(temporary, 'wx')
  try {
    try { await handle.writeFile(content); await handle.sync() } finally { await handle.close() }
    if ((await readShaderProperties(path, engine)).snapshot !== before.snapshot) throw changed()
    await check?.(); await assertInstallDirectory(path, dirname(before.file))
    await rename(temporary, before.file)
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error }) }
  return (await readShaderProperties(path, engine)).values
}
