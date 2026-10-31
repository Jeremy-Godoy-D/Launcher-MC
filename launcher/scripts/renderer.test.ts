import { expect, test, vi } from 'vitest'
import { rendererTarget } from './renderer'

test('renderer defaults to Vue and rejects unknown selections', () => {
  vi.stubEnv('LAUNCHER_RENDERER', undefined)
  expect(rendererTarget().name).toBe('vue')
  expect(rendererTarget('vue')).toEqual({ name: 'vue', package: 'xmcl-keystone-ui', port: 3000 })
  expect(rendererTarget('react')).toEqual({ name: 'react', package: 'xmcl-react-ui', port: 3001 })
  expect(() => rendererTarget('')).toThrow('Invalid LAUNCHER_RENDERER')
  expect(() => rendererTarget('../other')).toThrow('Invalid LAUNCHER_RENDERER')
  vi.unstubAllEnvs()
})
