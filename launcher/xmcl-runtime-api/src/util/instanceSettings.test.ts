import { expect, it } from 'vitest'
import { instanceSettingsSnapshot, instanceSettingsEdit, instanceSettingsReviewKeys, parseInstanceSettingsChanges } from './instanceSettings'

it('preserves explicit false, auto, zero, empty lists and nested optional fields in private snapshots', () => {
  const args = ['path with spaces', '"quoted"', ''], source = { java: '', assignMemory: 'auto', minMemory: 0, vmOptions: args, mcOptions: [], fastLaunch: false, resolution: { fullscreen: false, monitor: 'display-2' }, server: { host: 'localhost', name: 'Local world' } }
  const result = instanceSettingsSnapshot(source)
  expect(result).toMatchObject({ java: '', assignMemory: 'auto', minMemory: 0, maxMemory: null, vmOptions: args, mcOptions: [], fastLaunch: false, hideLauncher: null, resolution: { width: null, height: null, fullscreen: false, monitor: 'display-2' }, server: { host: 'localhost', port: null, name: 'Local world' } })
  args.push('changed'); expect(result.vmOptions).toHaveLength(3)
})
it('keeps reset markers while removing only null nested fields from the Native mutation', () => {
  expect(instanceSettingsEdit({ java: null, vmOptions: [], hideLauncher: false, resolution: { width: 1280, height: null, fullscreen: false, monitor: 'display-2' }, server: { host: 'localhost', port: null, name: 'Local world' } })).toEqual({ java: null, vmOptions: [], hideLauncher: false, resolution: { width: 1280, fullscreen: false, monitor: 'display-2' }, server: { host: 'localhost', name: 'Local world' } })
})
it.each([
  { unknown: true }, { java: undefined }, { maxMemory: NaN }, { minMemory: -1 }, { maxMemory: 1.5 },
  { vmOptions: ['DO_NOT_LOG\0secret'] }, { java: '' }, { vmOptions: Array(1025).fill('x') },
  { vmOptions: [1] }, { server: { host: 'localhost', port: 65536, name: null } },
  { resolution: { width: 0, height: 720, fullscreen: false, monitor: null } },
  JSON.parse('{"__proto__":{"polluted":true}}'),
])('rejects malformed settings without including their values in the error', changes => {
  let error: any
  try { parseInstanceSettingsChanges(changes) } catch (value) { error = value }
  expect(error).toHaveProperty('name', 'InstanceSettingsInvalid'); expect(String(error)).not.toContain('DO_NOT_LOG')
  expect(JSON.stringify(error)).not.toContain('secret')
})
it('accepts exact argument values and reviews memory fields as one coupled group', () => {
  const changes = parseInstanceSettingsChanges({ vmOptions: ['  literal  ', '', 'a\nb'], assignMemory: false, minMemory: null })
  expect(changes.vmOptions).toEqual(['  literal  ', '', 'a\nb'])
  expect(new Set(instanceSettingsReviewKeys(changes))).toEqual(new Set(['vmOptions', 'assignMemory', 'minMemory', 'maxMemory']))
})
