import { RuntimeVersionsSchema } from '@xmcl/instance'
import { expect, it } from 'vitest'
import type { Resource } from '@xmcl/resource'
import { getModFileFromResource, resolveModsToDisable, resolveModsToEnable } from './mod'
import { getModProvides } from './modDependencies'
import { getModCompatiblity, getModsCompatiblity } from './modCompatible'

function resource(metadata: Record<string, unknown>, path = '/mods/example.jar') {
  return { path, fileName: path.split('/').pop(), metadata, name: 'Cached name', version: 3, hash: 'a'.repeat(40), size: 100, mtime: 1, ino: 1, atime: 1, ctime: 1, isDirectory: false } as Resource
}
const fabric = (id: string, depends: Record<string, string> = {}) => ({ schemaVersion: 1, id, version: '1.2.0', name: id, depends })
it('normalizes frozen Fabric metadata without Vue globals or changing native data', () => {
  const metadata = Object.freeze({ ...fabric('example', { minecraft: '>=1.20' }), authors: 'Author', description: '<img src=x onerror=alert(1)>' })
  const source = Object.freeze(resource(Object.freeze({ fabric: metadata })))
  const before = JSON.stringify(source), mod = getModFileFromResource(source, RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16.0' }))
  expect(mod).toMatchObject({ name: 'example', version: '1.2.0', authors: ['Author'], modLoaders: ['fabric'], description: '<img src=x onerror=alert(1)>', dependencies: { fabric: [{ modId: 'minecraft', semanticVersion: '>=1.20' }] } })
  expect(JSON.stringify(source)).toBe(before)
  expect(Object.hasOwn(mod, '__v_skip')).toBe(false)
})
it('retains hybrid loader preference, Forge aliases and Fabric provided ids', () => {
  const forge = { modid: 'forge_id', name: 'Forge name', version: '2.0.0', description: '', authors: [], modsToml: [], modAnnotations: [], mcmodInfo: [] }
  const source = resource({ fabric: { ...fabric('fabric_id'), provides: ['alias'] }, forge })
  expect(getModFileFromResource(source, RuntimeVersionsSchema.parse({ minecraft: '1.21.1', forge: '52.0.0' })).name).toBe('Forge name')
  expect(getModFileFromResource(source, RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16.0' })).name).toBe('fabric_id')
  expect(getModProvides(source)).toMatchObject({ forge_id: '2.0.0', fabric_id: '1.2.0', alias: '1.2.0' })
})
it('retains NeoForge children, Quilt and LiteLoader identities and disabled files', () => {
  const neo = { modid: 'neo', displayName: 'Neo', version: '3.0.0', description: '', authors: 'N', children: [{ modid: 'child', version: '1.0.0', dependencies: [] }], dependencies: [], loaderVersion: '[4,)' }
  const source = resource({ neoforge: neo })
  expect(getModFileFromResource(source, RuntimeVersionsSchema.parse({ minecraft: '1.21.1', neoForged: '21.1.0' }))).toMatchObject({ name: 'Neo', authors: ['N'], modLoaders: ['neoforge'] })
  expect(getModProvides(source)).toMatchObject({ neo: '3.0.0', child: '1.0.0' })
  expect(getModFileFromResource(resource({ quilt: { quilt_loader: { id: 'quilt_id', version: '1.0', metadata: { name: 'Quilt name' } } } }), RuntimeVersionsSchema.parse({ minecraft: '1.21.1', quiltLoader: '0.27.0' }))).toMatchObject({ modId: 'quilt_id', name: 'Quilt name', modLoaders: ['quilt'] })
  expect(getModFileFromResource(resource({ liteloader: { name: 'Lite', version: '1.0', author: 'L' } }, '/mods/lite.litemod.disabled'), RuntimeVersionsSchema.parse({ minecraft: '1.12.2' }))).toMatchObject({ name: 'Lite', enabled: false, authors: ['L'], modLoaders: ['liteloader'] })
})
it('preserves semantic ranges, missing/unknown results and optional diagnostics', () => {
  expect(getModCompatiblity({ modId: 'minecraft', semanticVersion: '>=1.20' }, '1.21.1')).toBe(true)
  expect(getModCompatiblity({ modId: 'minecraft', semanticVersion: '>=1.20' }, '1.19.4')).toBe(false)
  expect(getModCompatiblity({ modId: 'example', semanticVersion: 'invalid range' }, 'not-a-version')).toBe(false)
  expect(getModCompatiblity({ modId: 'unknown', versionRange: '' }, '1.0.0')).toBe('maybe')
  expect(getModsCompatiblity([{ modId: 'missing', optional: true, semanticVersion: '*' }], {})).toEqual([{ modId: 'missing', optional: true, compatible: false, requirements: '*', version: '' }])
})
it('retains dependency enable/disable closure and keeps dependencies needed by other enabled mods', () => {
  const runtime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16.0' })
  const main = getModFileFromResource(resource({ fabric: fabric('main', { library: '*' }) }, '/mods/main.jar.disabled'), runtime)
  const lib = getModFileFromResource(resource({ fabric: fabric('library') }, '/mods/lib.jar.disabled'), runtime)
  expect(resolveModsToEnable([main], [main, lib]).map(mod => mod.modId)).toEqual(['main', 'library'])
  main.enabled = lib.enabled = true
  const other = getModFileFromResource(resource({ fabric: fabric('other', { library: '*' }) }, '/mods/other.jar'), runtime)
  expect(resolveModsToDisable([main], [main, lib, other]).map(mod => mod.modId)).toEqual(['main'])
  expect(resolveModsToDisable([main], [main, lib]).map(mod => mod.modId)).toEqual(['main', 'library'])
})
