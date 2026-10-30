import { createHash } from 'node:crypto'
import { lstat, readdir, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import type { ShaderEngine, ShaderPackSelection, ShaderSelectionChange } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { instanceFileSource } from '../../instanceIO/utils/instanceFileSource'
import { importPathParts } from '../../util/importFile'
import { previewFolderFiles } from '../../instanceIO/utils/previewFolderFiles'
import { readShaderProperties, writeShaderProperties } from './shaderProperties'

export interface ShaderSelectionContext { engines: ShaderEngine[]; fingerprint: string; metadataPending: boolean }
const changed = () => Object.assign(new Error('Shader selection changed'), { name: 'ShaderSelectionChangedError' })
async function inspect(path: string) { return lstat(path).catch(error => { if (error.code !== 'ENOENT') throw error }) }
async function selection(path: string, sharedRoot: string, context: ShaderSelectionContext) {
  const source = await instanceFileSource(path, 'shaderpacks', sharedRoot, true), root = join(source.root, source.path), info = await inspect(root)
  if (info && !info.isDirectory()) throw new Error('Unsafe shader directory')
  const names = info ? (await readdir(root)).sort() : []
  if (names.length > 10000) throw new Error('Too many shaders')
  const entries = []
  for (const name of names) {
    importPathParts(name); const file = await lstat(join(root, name))
    if (!file.isFile() && !file.isDirectory()) throw new Error('Unsafe shader entry')
    entries.push([name, file.ino, file.dev, file.mtimeMs, file.ctimeMs, file.size])
  }
  const engines = ['optifine', 'iris', 'oculus'] as const, properties = await Promise.all(engines.map(engine => readShaderProperties(path, engine)))
  const engine = context.engines.length === 1 && !context.metadataPending ? context.engines[0] : null
  const current = engine ? properties[engines.indexOf(engine)].values : {}, pack = current.shaderPack === 'OFF' ? '' : current.shaderPack || ''
  const state: ShaderPackSelection = { snapshot: createHash('sha256').update(JSON.stringify([context, source, info && [info.ino, info.dev], entries, properties.map(file => file.snapshot)])).digest('hex'), engines: context.engines, engine, pack, enabled: !!pack && pack !== 'OFF' && (engine === 'optifine' || pack !== '(internal)' && current.enableShaders !== 'false'), shared: source.root !== await realpath(path), metadataPending: context.metadataPending }
  return { state, properties, root }
}
export async function readShaderSelection(path: string, root: string, context: ShaderSelectionContext) {
  return (await selection(path, root, context)).state
}
export async function writeShaderSelection(path: string, root: string, change: ShaderSelectionChange, context: () => Promise<ShaderSelectionContext>) {
  if (!change || typeof change.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(change.snapshot) || typeof change.pack !== 'string' || change.pack.length > 1024 || typeof change.enabled !== 'boolean') throw new Error('Invalid shader selection')
  const before = await selection(path, root, await context())
  if (before.state.snapshot !== change.snapshot) throw changed()
  if (!before.state.engine || before.state.engine !== change.engine) throw Object.assign(new Error('A single available shader engine is required'), { name: 'ShaderEngineUnavailableError' })
  if (change.enabled) {
    if (!change.pack || importPathParts(change.pack).length !== 1) throw new Error('Invalid shader name')
    const target = await lstat(join(before.root, change.pack))
    if (!target.isFile() && !target.isDirectory() || target.isFile() && !/\.zip$/i.test(change.pack)) throw new Error('Unsafe shader pack')
    if (target.isDirectory()) {
      const shaders = await lstat(join(before.root, change.pack, 'shaders'))
      if (!shaders.isDirectory()) throw new Error('Invalid shader folder')
      await previewFolderFiles(join(before.root, change.pack), undefined, { resourcePack: true })
    }
  } else if (change.pack !== before.state.pack && change.pack !== '') throw new Error('Cannot select a disabled shader implicitly')
  const properties = before.properties[(['optifine', 'iris', 'oculus'] as const).indexOf(change.engine)]
  const patch: Record<string, string> = change.engine === 'optifine' ? { shaderPack: change.enabled ? change.pack : '' } : { shaderPack: change.pack, enableShaders: change.enabled ? 'true' : 'false' }
  await writeShaderProperties(path, change.engine, patch, properties.snapshot, async () => {
    if ((await selection(path, root, await context())).state.snapshot !== change.snapshot) throw changed()
  })
  return readShaderSelection(path, root, await context())
}
