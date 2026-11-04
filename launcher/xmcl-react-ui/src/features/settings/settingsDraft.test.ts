import { describe, expect, it } from 'vitest'
import { Settings } from '@xmcl/runtime-api/src/entities/setting'
import { globalDraft, prepareGlobalSettings, reconcileGlobalSettings } from './settingsDraft'
import { parseLauncherSettingsEdit } from '@xmcl/runtime-api/src/util/launcherSettings'

describe('global settings drafts', () => {
  it('merges changed launch fields without importing or resetting commands, flags or environment', () => {
    const data = new Settings(), draft = globalDraft(data)
    data.globalPreExecuteCommand = 'user command'; data.globalEnv = { LOCAL: 'keep' }; data.globalDisableAuthlibInjector = true
    draft.values.java = 'C:/Java/bin/javaw.exe'; draft.values.vmOptions = ['-Dtext=two words', '', '-Dline=a\nb']
    const { game } = prepareGlobalSettings(draft, data)
    expect(game).toMatchObject({ globalJava: draft.values.java, globalVmOptions: draft.values.vmOptions, globalPreExecuteCommand: 'user command', globalEnv: { LOCAL: 'keep' }, globalDisableAuthlibInjector: true })
    expect(data.globalJava).toBe(''); expect(data.globalVmOptions).toEqual([])
  })
  it('retains edits while reconciling unrelated changes and acknowledges our own mutation', () => {
    const data = new Settings(), draft = globalDraft(data)
    draft.values.maxMemory = '4096'; data.locale = 'en'
    const next = reconcileGlobalSettings(draft, data)
    expect(next.values.maxMemory).toBe('4096'); expect(next.values.locale).toBe('en')
    data.globalMaxMemory = 4096
    expect(reconcileGlobalSettings(next, data).base.maxMemory).toBe('4096')
  })
  it('rejects competing edits and invalid memory before producing a mutation', () => {
    const data = new Settings(), draft = globalDraft(data)
    draft.values.maxMemory = '4096'; data.globalMaxMemory = 8192
    expect(() => prepareGlobalSettings(draft, data)).toThrow('another window')
    data.globalMaxMemory = 0; draft.values.assignMemory = true; draft.values.minMemory = '8192'
    expect(() => prepareGlobalSettings(draft, data)).toThrow('Invalid global setting')
    draft.values.minMemory = '2e3'
    expect(() => prepareGlobalSettings(draft, data)).toThrow()
  })
  it('allows automatic Java and preserves the selected monitor when changing dimensions', () => {
    const data = new Settings(); data.globalJava = 'C:/Java/java.exe'; data.globalResolution = { monitor: 'secondary', width: 1280 }
    const draft = globalDraft(data); draft.values.java = ''; draft.values.width = ''; draft.values.height = '720'
    expect(prepareGlobalSettings(draft, data).game).toMatchObject({ globalJava: '', globalResolution: { monitor: 'secondary', height: 720 } })
  })
  it('validates proxy schemes and connection limits, without echoing credentials', () => {
    for (const proxy of ['file:///C:/secret', 'http://proxy/path', 'http://proxy?key=secret', 'http://proxy/#fragment', 'http://a\\b', 'http://a\nb']) {
      const data = new Settings(), draft = globalDraft(data); draft.values.httpProxy = proxy
      expect(() => prepareGlobalSettings(draft, data)).toThrow('Invalid global setting')
    }
    const data = new Settings(), draft = globalDraft(data); draft.values.httpProxy = 'http://127.0.0.1:8080'; draft.values.httpProxyEnabled = true; draft.values.maxSockets = '256'
    expect(prepareGlobalSettings(draft, data).values.httpProxyEnabled).toBe(true)
    draft.values.maxSockets = '257'; expect(() => prepareGlobalSettings(draft, data)).toThrow()
    draft.values.maxSockets = '0'; expect(prepareGlobalSettings(draft, data).values.maxSockets).toBe('0')
  })
  it('rejects an unknown locale and does not rewrite untouched legacy values', () => {
    const data = new Settings(); data.maxSockets = 900
    const draft = globalDraft(data); draft.values.locale = 'unknown'
    expect(() => prepareGlobalSettings(draft, data)).toThrow()
    draft.values.locale = 'en'
    expect(prepareGlobalSettings(draft, data)).toMatchObject({ game: undefined, dirty: ['locale'], values: { maxSockets: '900' } })
  })
  it('submits only editable differences with the coupled Native review', () => {
    const data = new Settings(), draft = globalDraft(data)
    draft.values.assignMemory = true; draft.values.maxMemory = '4096'; draft.values.httpProxy = 'http://127.0.0.1:8080'
    const input = parseLauncherSettingsEdit(prepareGlobalSettings(draft, data).edit)
    expect(input.changes).toEqual({ globalAssignMemory: true, globalMaxMemory: 4096, httpProxy: 'http://127.0.0.1:8080' })
    expect(input.review).toEqual(expect.arrayContaining(['globalAssignMemory', 'globalMinMemory', 'globalMaxMemory', 'httpProxy', 'httpProxyEnabled']))
    expect(input.changes).not.toHaveProperty('globalPreExecuteCommand')
  })
})
