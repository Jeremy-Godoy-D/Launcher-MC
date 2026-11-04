import { RuntimeVersionsSchema } from '@xmcl/instance'
import { expect, it } from 'vitest'
import { isReactive, reactive } from 'vue'
import type { Resource } from '@xmcl/resource'
import { getModFileFromResource as normalize } from '@xmcl/runtime-api/src/util/mod'
import { getModFileFromResource } from './mod'
import { getModDependencies } from './modDependencies'

const resource = { path: '/mods/example.jar', fileName: 'example.jar', name: 'Cached', version: 3, hash: 'a'.repeat(40), size: 100, mtime: 1, ino: 1, atime: 1, ctime: 1, isDirectory: false, metadata: { fabric: { id: 'example', name: 'Example', version: '1.0.0', schemaVersion: 1, depends: { minecraft: '>=1.20' } } } } as Resource
it('Vue keeps the same normalized data and raw model/dependency arrays', () => {
  const runtime = RuntimeVersionsSchema.parse({ minecraft: '1.21.1', fabricLoader: '0.16.0' }), mod = getModFileFromResource(resource, runtime)
  expect(JSON.stringify(mod)).toBe(JSON.stringify(normalize(resource, runtime)))
  const holder = reactive({ mod, loaders: mod.modLoaders, provided: mod.provideRuntime, dependencies: mod.dependencies, fabric: mod.dependencies.fabric })
  for (const value of Object.values(holder)) expect(isReactive(value)).toBe(false)
})
it('the direct legacy dependencies helper also retains raw snapshots', () => {
  const dependencies = getModDependencies(resource), holder = reactive({ dependencies, fabric: dependencies.fabric })
  expect(isReactive(holder.dependencies)).toBe(false); expect(isReactive(holder.fabric)).toBe(false)
})
