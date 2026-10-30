import { afterEach, beforeEach, expect, it } from 'vitest'
import { link, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ShaderEngine } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import { readShaderSelection, writeShaderSelection, type ShaderSelectionContext } from './shaderSelection'

let root: string, path: string, context: ShaderSelectionContext
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'grimo-shader-selection-')); path = join(root, 'instance')
  await mkdir(join(path, 'shaderpacks'), { recursive: true }); await mkdir(join(path, 'config'))
  await writeFile(join(path, 'shaderpacks/New.zip'), 'PACK')
  context = { engines: ['iris'], fingerprint: 'a'.repeat(64), metadataPending: false }
})
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const read = () => readShaderSelection(path, root, context)
it.each(['iris', 'oculus', 'optifine'] as ShaderEngine[])('saves only %s selection and preserves other engines, settings, options and world', async engine => {
  context.engines = [engine]
  const files = { optifine: 'optionsshaders.txt', iris: 'config/iris.properties', oculus: 'config/oculus.properties' }
  for (const file of Object.values(files)) await writeFile(join(path, file), '# keep\r\nshaderPack=Old.zip\r\ncustom=value=equal\r\n')
  await writeFile(join(path, 'options.txt'), 'lang:es_es\r\n'); await mkdir(join(path, 'saves/world'), { recursive: true }); await writeFile(join(path, 'saves/world/level.dat'), 'WORLD')
  const before = await read(), result = await writeShaderSelection(path, root, { snapshot: before.snapshot, engine, pack: 'New.zip', enabled: true }, async () => context)
  expect(result).toMatchObject({ engine, pack: 'New.zip', enabled: true, shared: false })
  for (const [key, file] of Object.entries(files)) expect(await readFile(join(path, file), 'utf8')).toBe(key === engine ? '# keep\r\nshaderPack=New.zip\r\ncustom=value=equal\r\n' + (engine === 'optifine' ? '' : 'enableShaders=true\r\n') : '# keep\r\nshaderPack=Old.zip\r\ncustom=value=equal\r\n')
  expect(await readFile(join(path, 'options.txt'), 'utf8')).toBe('lang:es_es\r\n'); expect(await readFile(join(path, 'saves/world/level.dat'), 'utf8')).toBe('WORLD')
})
it('reads disabled Iris without losing its saved pack and toggles enabled state independently', async () => {
  await writeFile(join(path, 'config/iris.properties'), 'shaderPack=New.zip\nenableShaders=false\n')
  const before = await read(); expect(before).toMatchObject({ pack: 'New.zip', enabled: false })
  const active = await writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack: 'New.zip', enabled: true }, async () => context)
  const disabled = await writeShaderSelection(path, root, { snapshot: active.snapshot, engine: 'iris', pack: 'New.zip', enabled: false }, async () => context)
  expect(disabled).toMatchObject({ pack: 'New.zip', enabled: false })
})
it.each(['options', 'inventory', 'engine'])('rejects a stale %s snapshot without creating a replacement', async reason => {
  const before = await read()
  if (reason === 'options') await writeFile(join(path, 'config/oculus.properties'), 'other=USER\n')
  if (reason === 'inventory') await writeFile(join(path, 'shaderpacks/New.zip'), 'EDIT')
  if (reason === 'engine') context = { ...context, fingerprint: 'b'.repeat(64) }
  await expect(writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack: 'New.zip', enabled: true }, async () => context)).rejects.toHaveProperty('name', 'ShaderSelectionChangedError')
  expect(await readdir(join(path, 'config'))).not.toContain('iris.properties')
})
it('rejects a changed engine at the last guard and cleans its temporary file', async () => {
  const before = await read(); let calls = 0
  await expect(writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack: 'New.zip', enabled: true }, async () => ++calls === 1 ? context : { ...context, engines: ['oculus'] })).rejects.toHaveProperty('name', 'ShaderSelectionChangedError')
  expect(await readdir(join(path, 'config'))).toEqual([])
})
it.each(([[], ['iris', 'oculus'], ['iris']] as ShaderEngine[][]).map(engines => ({ engines })))('does not change configs with missing, ambiguous or pending engines: $engines', async ({ engines }) => {
  context = { ...context, engines, metadataPending: engines.length === 1 }
  const before = await read(); expect(before.engine).toBe(null)
  await expect(writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack: 'New.zip', enabled: true }, async () => context)).rejects.toHaveProperty('name', 'ShaderEngineUnavailableError')
  expect(await readdir(join(path, 'config'))).toEqual([])
})
it('selects through the authorized shared directory while writing only private engine options', async () => {
  const shared = join(root, 'shaderpacks'); await mkdir(shared); await writeFile(join(shared, 'Shared.zip'), 'SHARED')
  await rm(join(path, 'shaderpacks'), { recursive: true }); await symlink(shared, join(path, 'shaderpacks'), 'junction')
  const before = await read(); expect(before.shared).toBe(true)
  const result = await writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack: 'Shared.zip', enabled: true }, async () => context)
  expect(result.pack).toBe('Shared.zip'); expect(await readFile(join(shared, 'Shared.zip'), 'utf8')).toBe('SHARED'); expect((await lstat(join(path, 'shaderpacks'))).isSymbolicLink()).toBe(true)
})
it.each(['../outside.zip', 'other/file.zip', 'readme.txt'])('rejects an unsafe or unsupported pack identifier %s', async pack => {
  await writeFile(join(path, 'shaderpacks/readme.txt'), 'KEEP')
  const before = await read()
  await expect(writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack, enabled: true }, async () => context)).rejects.toThrow()
  expect(await readdir(join(path, 'config'))).toEqual([])
})
it('selects a shader folder but refuses its nested junctions or a shared configuration inode', async () => {
  await mkdir(join(path, 'shaderpacks/Folder/shaders'), { recursive: true }); await writeFile(join(path, 'shaderpacks/Folder/shaders/main.fsh'), 'SHADER')
  let before = await read(); await writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack: 'Folder', enabled: true }, async () => context)
  const outside = join(root, 'outside'); await mkdir(outside); await symlink(outside, join(path, 'shaderpacks/Folder/shaders/foreign'), 'junction'); before = await read()
  await expect(writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack: 'Folder', enabled: true }, async () => context)).rejects.toThrow()
  await link(join(path, 'config/iris.properties'), join(root, 'shared-config')); before = await read()
  await expect(writeShaderSelection(path, root, { snapshot: before.snapshot, engine: 'iris', pack: 'New.zip', enabled: true }, async () => context)).rejects.toThrow('Shared shader configuration')
})
