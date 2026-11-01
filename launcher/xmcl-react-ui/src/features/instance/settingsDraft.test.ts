import { expect, it } from 'vitest'
import { instanceSettingsSnapshot } from '@xmcl/runtime-api/src/util/instanceSettings'
import { conflictingInstanceSettings, createInstanceSettingsDraft, dirtyInstanceSettings, instanceSettingsChanges, reconcileInstanceSettings } from './settingsDraft'

it('does not turn auto/false/inherited or partial metadata into explicit defaults when another setting changes', () => {
  for (const assignMemory of ['auto', false, undefined] as const) {
    const base = instanceSettingsSnapshot({ assignMemory, minMemory: 0, resolution: { width: 1280, monitor: 'display-2' }, server: { host: 'localhost', name: 'Named server' }, hideLauncher: false })
    const draft = createInstanceSettingsDraft(base); draft.values.vmOptions = ['  C:\\Games with spaces  ', '"quoted"', '']
    expect(instanceSettingsChanges(draft)).toEqual({ vmOptions: draft.values.vmOptions })
  }
})
it('preserves nested monitor/name and explicit false while editing another property of that group', () => {
  const base = instanceSettingsSnapshot({ resolution: { monitor: 'display-2', fullscreen: false }, server: { host: 'localhost', name: 'Named server' } }), draft = createInstanceSettingsDraft(base)
  draft.values.resolution.width = '1920'; draft.values.server.port = '25566'
  expect(instanceSettingsChanges(draft)).toEqual({ resolution: { width: 1920, height: null, fullscreen: false, monitor: 'display-2' }, server: { host: 'localhost', port: 25566, name: 'Named server' } })
})
it('distinguishes empty lists, inheritance and invalid numeric drafts without losing the typed value', () => {
  const draft = createInstanceSettingsDraft(instanceSettingsSnapshot({ vmOptions: ['old'] })); draft.values.vmOptions = []; draft.values.mcOptions = []
  expect(instanceSettingsChanges(draft)).toEqual({ vmOptions: [], mcOptions: [] })
  draft.values.vmOptions = null; expect(instanceSettingsChanges(draft)).toEqual({ vmOptions: null, mcOptions: [] })
  draft.values.minMemory = '-'; expect(() => instanceSettingsChanges(draft)).toThrow(); expect(draft.values.minMemory).toBe('-')
})
it('merges untouched external fields and retains edited fields with their original expected value', () => {
  const base = instanceSettingsSnapshot({ showLog: false }), draft = createInstanceSettingsDraft(base); draft.values.java = 'pinned-java'
  const incoming = instanceSettingsSnapshot({ showLog: true }), merged = reconcileInstanceSettings(draft, incoming)
  expect(merged.values.java).toBe('pinned-java'); expect(merged.base.java).toBeNull(); expect(merged.values.showLog).toBe(true)
  expect(conflictingInstanceSettings(merged, incoming)).toEqual([])
  const conflict = instanceSettingsSnapshot({ java: 'other-java', showLog: true }), kept = reconcileInstanceSettings(merged, conflict)
  expect(kept.values.java).toBe('pinned-java'); expect(kept.base.java).toBeNull(); expect(conflictingInstanceSettings(kept, conflict)).toEqual(['java'])
})
it('accepts a committed draft and protects all memory bounds together during reconciliation', () => {
  const draft = createInstanceSettingsDraft(instanceSettingsSnapshot({ assignMemory: true, minMemory: 1024, maxMemory: 4096 })); draft.values.minMemory = '2048'
  const external = instanceSettingsSnapshot({ assignMemory: true, minMemory: 1024, maxMemory: 3072 }), kept = reconcileInstanceSettings(draft, external)
  expect(kept.values.maxMemory).toBe('4096'); expect(conflictingInstanceSettings(kept, external)).toEqual(['maxMemory'])
  const committed = reconcileInstanceSettings(draft, instanceSettingsSnapshot({ assignMemory: true, minMemory: 2048, maxMemory: 4096 }))
  expect(dirtyInstanceSettings(committed)).toEqual([])
})
