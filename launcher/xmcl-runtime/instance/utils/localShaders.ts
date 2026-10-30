import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { move } from 'fs-extra'
import type { ShaderRemovalReview } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { assertInstallDirectory } from '../../instanceIO/utils/pendingInstall'
import { inspectLocalPackFiles } from './localResourcePacks'
import { readShaderProperties, writeShaderProperties } from './shaderProperties'

const changed = () => Object.assign(new Error('Shaders or configurations changed since review'), { name: 'ShaderRemovalChangedError' })
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const engines = ['optifine', 'iris', 'oculus'] as const
const fileKey = (value: string) => process.platform === 'win32' ? value.toLowerCase() : value
async function removal(path: string, names: string[], root: string) {
  const inspected = await inspectLocalPackFiles(path, names, root, 'shaderpacks')
  const configurations = await Promise.all(engines.map(async engine => ({ engine, ...await readShaderProperties(path, engine) })))
  const selected = new Set(inspected.files.map(file => fileKey(file.fileName)))
  const affected = configurations.filter(file => file.values.shaderPack && file.values.shaderPack !== '(internal)' && (file.engine !== 'optifine' || file.values.shaderPack !== 'OFF') && selected.has(fileKey(file.values.shaderPack)))
  if (affected.some(file => file.info?.nlink !== 1)) throw Object.assign(new Error('Shared shader configuration cannot be replaced'), { name: 'ShaderConfigurationSharedError' })
  const review: ShaderRemovalReview = { snapshot: digest([inspected.dest.identity, inspected.hashes, configurations.map(file => file.snapshot)]), files: inspected.files, sharedDirectory: inspected.dest.shared, configurations: affected.map(file => ({ engine: file.engine, pack: file.values.shaderPack })) }
  return { ...inspected, configurations, affected, review }
}
export async function previewShaderRemoval(path: string, names: string[], root: string) {
  return (await removal(path, names, root)).review
}
export async function removeReviewedShaders(path: string, review: ShaderRemovalReview, root: string) {
  if (!review || typeof review.snapshot !== 'string' || !/^[a-f0-9]{64}$/.test(review.snapshot) || !Array.isArray(review.files)) throw changed()
  const current = await removal(path, review.files.map(file => file.fileName), root)
  if (current.review.snapshot !== review.snapshot) throw changed()
  const backup = join(path, '.backups', `shaderpacks-${randomUUID()}`)
  await assertInstallDirectory(path, backup); await mkdir(backup, { recursive: true }); await assertInstallDirectory(path, backup)
  try {
    await mkdir(join(backup, 'shaderpacks')); await assertInstallDirectory(path, join(backup, 'shaderpacks'))
    for (const file of current.affected) {
      const target = join(backup, file.engine === 'optifine' ? 'optionsshaders.txt' : `config/${file.engine}.properties`)
      await mkdir(dirname(target), { recursive: true }); await assertInstallDirectory(path, dirname(target))
      const handle = await open(target, 'wx')
      try { await handle.writeFile(Buffer.from(file.text, 'latin1')); await handle.sync() } finally { await handle.close() }
    }
    // Do not overwrite an external edit made while the backups were written.
    if ((await removal(path, review.files.map(file => file.fileName), root)).review.snapshot !== review.snapshot) throw changed()
    for (const file of current.affected) {
      await writeShaderProperties(path, file.engine, file.engine === 'optifine' ? { shaderPack: '' } : { shaderPack: '', enableShaders: 'false' }, file.snapshot)
    }
    for (let index = 0; index < current.files.length; index++) {
      const file = current.files[index], fresh = await inspectLocalPackFiles(path, [file.fileName], root, 'shaderpacks')
      if (digest([fresh.dest.identity, fresh.hashes[0]]) !== digest([current.dest.identity, current.hashes[index]])) throw changed()
      await assertInstallDirectory(path, join(backup, 'shaderpacks'))
      await move(join(current.dest.root, file.fileName), join(backup, 'shaderpacks', file.fileName), { overwrite: false })
    }
  } catch (error) { throw Object.assign(new Error('Shader removal incomplete; originals or backups retained', { cause: error }), { name: 'ShaderRemovalIncompleteError', backup }) }
  return { backup }
}
