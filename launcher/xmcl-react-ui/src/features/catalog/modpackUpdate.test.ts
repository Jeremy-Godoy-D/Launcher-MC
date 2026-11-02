import { describe, expect, it } from 'vitest'
import { InstanceDataSchema } from '../../../../packages/instance/instance'
import type { SavedInstance } from '../library/model'
import type { ModpackState } from '@xmcl/runtime-api/src/services/ModpackService'
import type { StateData } from '@launcher/renderer-client'
import { assertPackUpdateChanges, isPackTarget, packRuntimeLabel, preparePackUpdate } from './modpackUpdate'

const upstream = { type: 'modrinth-modpack', projectId: 'AAAA0001', versionId: 'VVVV0002' } as const
const target = { ...InstanceDataSchema.parse({ name: 'My custom name', runtime: { minecraft: '1.21.1' }, upstream: { ...upstream, versionId: 'VVVV0001' }, java: 'C:/Java/java.exe', vmOptions: ['-Dlocal=keep'] }), path: 'C:/owned/instance' } as SavedInstance
const profile = (): StateData<ModpackState> => ({ modpackPath: 'C:/owned/new.mrpack', ready: true, error: undefined, config: InstanceDataSchema.parse({ name: 'Remote name', runtime: { minecraft: '1.21.1', fabricLoader: '0.16.1' }, java: 'C:/remote/java.exe', vmOptions: ['-javaagent:remote.jar'], preExecuteCommand: 'remote command' }), files: [{ path: 'config/owned.txt', hashes: { sha1: 'a'.repeat(40) }, size: 3 }] })

describe('existing modpack update preparation', () => {
  it('uses the creation whitelist while preserving local identity, Java and commands', () => {
    const result = preparePackUpdate(profile(), target, upstream)
    expect(result.edit).toEqual({ instancePath: target.path, runtime: expect.objectContaining({ minecraft: '1.21.1', fabricLoader: '0.16.1' }), version: '', upstream })
    expect(result.edit).not.toHaveProperty('name'); expect(result.edit).not.toHaveProperty('java'); expect(result.edit).not.toHaveProperty('vmOptions'); expect(result.edit).not.toHaveProperty('preExecuteCommand')
    expect(result.options).toMatchObject({ path: target.path, upstream, files: [{ path: 'config/owned.txt' }] })
    expect(packRuntimeLabel(result.edit.runtime)).toBe('Minecraft 1.21.1 · Fabric 0.16.1')
    expect(packRuntimeLabel({ minecraft: '1.21.1', forge: '52.0.1' })).toBe('Minecraft 1.21.1 · Forge 52.0.1')
  })
  it('requires a populated ready profile and the same project origin', () => {
    for (const state of [{ ...profile(), ready: false }, { ...profile(), files: [] }, { ...profile(), error: new Error('Failed') }]) expect(() => preparePackUpdate(state, target, upstream)).toThrow()
    expect(() => preparePackUpdate(profile(), target, { ...upstream, projectId: 'BBBB0001' })).toThrow()
    expect(isPackTarget(target, { provider: 'curseforge', id: '1' })).toBe(false)
  })
  it('keeps file and runtime validation rather than trusting cached archive metadata', () => {
    expect(() => preparePackUpdate({ ...profile(), files: [{ path: '../outside', hashes: {} }] }, target, upstream)).toThrow()
    expect(() => preparePackUpdate({ ...profile(), config: { ...profile().config, edition: 'bedrock' } }, target, upstream)).toThrow()
  })
  it.each(['saves/World/level.dat', 'SAVES\\World\\level.dat', 'screenshots/image.png', 'logs/latest.log'])('blocks user data from an update review: %s', path => {
    expect(() => assertPackUpdateChanges([{ operation: 'backup-add', file: { path, hashes: {} } }])).toThrow()
  })
  it('allows normal game content changes', () => {
    expect(() => assertPackUpdateChanges([{ operation: 'add', file: { path: 'config/owned.txt', hashes: {} } }])).not.toThrow()
  })
})
