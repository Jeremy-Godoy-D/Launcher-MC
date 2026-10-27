import { expect, it } from 'vitest'
import type { StateData } from '@launcher/renderer-client'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import type { SavedInstance } from '../library/model'
import { modIdentity } from './modIdentity'

it('chooses the active loader metadata, honors a saved name and falls back for unknown files', () => {
  const resource = { fileName: 'example.jar', name: 'example.jar', metadata: { fabric: [{ id: 'fabric', name: 'Fabric title', version: '1' }], forge: { name: 'Forge title', version: '2' }, neoforge: { displayName: 'Neo title', version: '3' } } } as unknown as StateData<ResourceState>['files'][number]
  expect(modIdentity(resource, { fabricLoader: '0.16' } as SavedInstance['runtime'])).toEqual({ name: 'Fabric title', version: '1' })
  expect(modIdentity(resource, { forge: '52' } as SavedInstance['runtime'])).toEqual({ name: 'Forge title', version: '2' })
  expect(modIdentity(resource, { forge: '52', neoForged: '21' } as SavedInstance['runtime'])).toEqual({ name: 'Forge title', version: '2' })
  expect(modIdentity(resource, { neoForged: '21' } as SavedInstance['runtime'])).toEqual({ name: 'Neo title', version: '3' })
  expect(modIdentity({ ...resource, metadata: { ...resource.metadata, name: 'Saved name' } }, {} as SavedInstance['runtime']).name).toBe('Saved name')
  expect(modIdentity({ ...resource, metadata: { fabric: [] } }, {} as SavedInstance['runtime'])).toEqual({ name: 'example.jar', version: '' })
})
