import { describe, expect, it } from 'vitest'
import { modpackDownload } from './modpack'
import type { CatalogProject, getCatalogVersions } from './api'

type Versions = Awaited<ReturnType<typeof getCatalogVersions>>
const project = { provider: 'modrinth', kind: 'modpack', id: 'AAAA0001', icon: '' } as CatalogProject
const mr = (files: unknown[] = [{ filename: 'pack.mrpack', primary: true }]) => ({ provider: 'modrinth', total: 1, versions: [{ id: 'VVVV0001', project_id: 'AAAA0001', files }] }) as unknown as Versions
const cf = (fields = {}) => ({ provider: 'curseforge', total: 1, versions: [{ id: 101, modId: 1, fileName: 'pack.zip', downloadUrl: 'https://example.test/pack.zip', ...fields }] }) as unknown as Versions

describe('catalog modpack archive selection', () => {
  it('captures the exact MR version and archive rather than an unrelated primary file', () => {
    expect(modpackDownload(project, mr([{ filename: 'client.jar', primary: true }, { filename: 'pack.mrpack', primary: false }]), 'VVVV0001')).toEqual({ market: 0, version: { versionId: 'VVVV0001', projectId: 'AAAA0001', filename: 'pack.mrpack' } })
  })
  it('captures CF file identity and pack media only', () => {
    expect(modpackDownload({ ...project, provider: 'curseforge', id: '1', icon: 'https://example.test/icon' }, cf(), '101')).toEqual({ market: 1, file: { fileId: 101, projectId: 1, icon: 'https://example.test/icon' } })
  })
  it('uses the verified CF ZIP pipeline for worlds and rejects other world sources', () => {
    const world = { ...project, kind: 'world', provider: 'curseforge', id: '1' } as CatalogProject
    expect(modpackDownload(world, cf(), '101')).toEqual({ market: 1, file: { fileId: 101, projectId: 1 } })
    expect(() => modpackDownload({ ...world, provider: 'modrinth' }, mr(), 'VVVV0001')).toThrow()
    expect(() => modpackDownload(world, cf({ modId: 2 }), '101')).toThrow()
    expect(() => modpackDownload(world, cf({ fileName: 'world.exe' }), '101')).toThrow()
  })
  it.each([[], [{ filename: '../pack.mrpack' }], [{ filename: 'pack.jar' }], [{ filename: 'a.mrpack' }, { filename: 'b.mrpack' }]].map(files => ({ files })))('rejects missing or ambiguous archives: %j', ({ files }) => {
    expect(() => modpackDownload(project, mr(files), 'VVVV0001')).toThrow()
  })
  it('rejects an obsolete selection or a different provider without sending a native request', () => {
    expect(() => modpackDownload(project, mr(), 'VVVV0002')).toThrow()
    expect(() => modpackDownload(project, cf(), '101')).toThrow()
    expect(() => modpackDownload({ ...project, kind: 'mod' }, mr(), 'VVVV0001')).toThrow()
  })
  it.each([{ downloadUrl: null }, { isAvailable: false }, { fileName: 'pack.jar' }, { modId: 2 }])('respects unavailable CF files: %j', fields => {
    expect(() => modpackDownload({ ...project, provider: 'curseforge', id: '1' }, cf(fields), '101')).toThrow()
  })
})
