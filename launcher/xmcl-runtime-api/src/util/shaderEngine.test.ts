import { expect, it } from 'vitest'
import { RuntimeVersionsSchema } from '@xmcl/instance'
import type { Resource } from '@xmcl/resource'
import { getShaderEngines } from './shaderEngine'
const runtime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16' })
const file = (id: string, metadata: object = { fabric: { schemaVersion: 1, id, name: id, version: '1.0.0' } }, disabled = false) => ({ path: `/mods/${id}.jar${disabled ? '.disabled' : ''}`, fileName: id + '.jar', hash: 'a'.repeat(40), metadata, size: 1, mtime: 1, ctime: 1, ino: 1, version: 3, name: id } as Resource)
it('recognizes runtime OptiFine and enabled loader-compatible Iris/Oculus metadata', () => {
  expect(getShaderEngines(RuntimeVersionsSchema.parse({ optifine: 'HD_U_I7', minecraft: '1.20.1' }), [])).toEqual(['optifine'])
  expect(getShaderEngines(runtime, [file('iris')])).toEqual(['iris'])
  expect(getShaderEngines(RuntimeVersionsSchema.parse({ minecraft: '1.20.1', forge: '47' }), [file('oculus', { forge: { modsToml: [], modAnnotations: [], mcmodInfo: [], modid: 'oculus', name: 'Oculus', version: '1.0.0' } })])).toEqual(['oculus'])
  expect(getShaderEngines(RuntimeVersionsSchema.parse({ minecraft: '1.21.1', neoForged: '21.1' }), [file('iris', { neoforge: { children: [], dependencies: [], modid: 'iris', displayName: 'Iris', version: '1.0.0' } })])).toEqual(['iris'])
})
it('excludes disabled, server-only, wrong-loader and ambiguous runtime engines', () => {
  expect(getShaderEngines(runtime, [file('iris', undefined, true)])).toEqual([])
  expect(getShaderEngines(runtime, [file('iris', { fabric: { id: 'iris', version: '1', environment: 'server' } })])).toEqual([])
  expect(getShaderEngines(RuntimeVersionsSchema.parse({ minecraft: '1.21.1' }), [file('iris')])).toEqual([])
  expect(getShaderEngines({ ...runtime, forge: '52' }, [file('iris')])).toEqual([])
})
it('reports multiple engine families instead of choosing one silently and does not treat OptiFabric alone as OptiFine', () => {
  expect(getShaderEngines({ ...runtime, optifine: 'HD_U' }, [file('iris')])).toEqual(['optifine', 'iris'])
  expect(getShaderEngines(runtime, [file('optifabric')])).toEqual([])
  expect(getShaderEngines(runtime, [file('optifabric'), file('optifine', { forge: { modsToml: [], modAnnotations: [], mcmodInfo: [], modid: 'optifine', name: 'OptiFine', version: 'HD_U' } })])).toEqual(['optifine'])
})
