import { describe, expect, it, vi } from 'vitest'
import type { ProjectVersion } from '@xmcl/modrinth'
import type { File } from '@xmcl/curseforge'
import type { CatalogProject } from './api'
import type { UpdateMod } from '../instance/queryModUpdates'
import { resolveCatalogDependencies, type DependencyClients } from './dependencies'

const project = { provider: 'modrinth', id: 'ROOT0001', kind: 'mod', name: 'Root' } as CatalogProject
const version = (id: string, owner: string, dependencies: unknown[] = [], loaders = ['fabric']) => ({ id, project_id: owner, name: id, game_versions: ['1.21.1'], loaders, version_type: 'release', dependencies, files: [] }) as unknown as ProjectVersion
const edge = (project_id: string, dependency_type = 'required', version_id?: string) => ({ project_id, dependency_type, ...(version_id ? { version_id } : {}) })
function clients(versions: ProjectVersion[]): DependencyClients {
  return {
    modrinth: {
      getProject: vi.fn(async (id: string) => ({ id, title: id, project_type: 'mod', client_side: 'required' })),
      getProjectVersion: vi.fn(async (id: string) => { const v = versions.find(v => v.id === id); if (!v) throw new Error('Unavailable'); return v }),
      getProjectVersions: vi.fn(async (id: string) => versions.filter(v => v.project_id === id)),
    }, curseforge: {},
  } as unknown as DependencyClients
}
const installed = (projectId = 'DEPS0001', versionId = 'VERS0001', disabled = false): UpdateMod => ({ path: '/owned/mods/dependency.jar', fileName: `dependency.jar${disabled ? '.disabled' : ''}`, name: 'Dependency', hash: 'a'.repeat(40), size: 1, modrinth: { projectId, versionId } })
const run = (root: ProjectVersion, api: DependencyClients, present: UpdateMod[] = [], optional = new Set<string>(), loader = 'fabric') => resolveCatalogDependencies({ provider: 'modrinth', version: root }, project, '1.21.1', loader, present, optional, api, new AbortController().signal)

describe('catalog dependency resolution', () => {
  it('rejects malformed dependency identifiers and incompatible roots before network access', async () => {
    const root = version('ROOTVER1', project.id, [edge('../unsafe')]), api = clients([root])
    await expect(run(root, api)).rejects.toMatchObject({ code: 'unavailable' })
    expect(api.modrinth.getProject).not.toHaveBeenCalled()
    await expect(run(version('ROOTVER1', project.id, [], ['forge']), api)).rejects.toMatchObject({ code: 'incompatible' })
    expect(api.modrinth.getProjectVersion).not.toHaveBeenCalled()
  })
  it('bounds graph expansion and oversized edge arrays', async () => {
    const versions = Array.from({ length: 129 }, (_, index) => version(`V${String(index).padStart(7, '0')}`, index ? `P${String(index).padStart(7, '0')}` : project.id, index === 128 ? [] : [edge(`P${String(index + 1).padStart(7, '0')}`)]))
    await expect(run(versions[0], clients(versions))).rejects.toMatchObject({ code: 'tooMany' })
    const oversized = version('ROOTVER1', project.id, Array.from({ length: 257 }, () => edge('DEPS0001')))
    await expect(run(oversized, clients([oversized]))).rejects.toMatchObject({ code: 'unavailable' })
  })
  it('resolves a cycle without switching the explicitly selected root to a newer version', async () => {
    const root = version('ROOTVER1', project.id, [edge('DEPS0001')]), dependency = version('VERS0001', 'DEPS0001', [edge(project.id)])
    const api = clients([root, dependency, version('ROOTVER2', project.id)])
    const result = await run(root, api)
    expect(result.selected.map(node => node.project.id)).toEqual([project.id, 'DEPS0001'])
    expect(api.modrinth.getProjectVersions).toHaveBeenCalledTimes(1)
    expect(result.optional).toEqual([])
  })
  it('offers optional projects and only traverses their required children when explicitly selected', async () => {
    const root = version('ROOTVER1', project.id, [edge('DEPS0001', 'optional')]), child = version('VERS0001', 'DEPS0001', [edge('DEPS0002')]), nested = version('VERS0002', 'DEPS0002')
    const api = clients([root, child, nested]), first = await run(root, api)
    expect(first.selected).toHaveLength(1); expect(first.optional[0].key).toBe('modrinth:DEPS0001')
    const selected = await run(root, api, [], new Set(['modrinth:DEPS0001']))
    expect(selected.selected.map(node => node.project.id)).toEqual([project.id, 'DEPS0001', 'DEPS0002'])
  })
  it('keeps an installed compatible dependency and marks a disabled required one for reviewed activation', async () => {
    const root = version('ROOTVER1', project.id, [edge('DEPS0001')]), old = version('VERS0001', 'DEPS0001'), next = version('VERS0002', 'DEPS0001')
    const result = await run(root, clients([root, next, old]), [installed('DEPS0001', old.id, true)])
    expect(result.selected[1]).toMatchObject({ version: { id: old.id }, activate: true })
  })
  it('blocks incompatible exact versions instead of silently dropping a required dependency', async () => {
    const root = version('ROOTVER1', project.id, [edge('DEPS0001', 'required', 'VERS0001')]), incompatible = { ...version('VERS0001', 'DEPS0001'), game_versions: ['1.20.4'] }
    await expect(run(root, clients([root, incompatible]))).rejects.toMatchObject({ code: 'incompatible' })
    await expect(run(root, clients([root]))).rejects.toThrow('Unavailable')
  })
  it('rejects contradictory version constraints and installed incompatibilities', async () => {
    const root = version('ROOTVER1', project.id, [edge('DEPS0001', 'required', 'VERS0001'), edge('DEPS0001', 'required', 'VERS0002')])
    await expect(run(root, clients([root, version('VERS0001', 'DEPS0001'), version('VERS0002', 'DEPS0001')]))).rejects.toMatchObject({ code: 'conflict' })
    const conflict = version('ROOTVER1', project.id, [edge('DEPS0001', 'incompatible')])
    await expect(run(conflict, clients([conflict]), [installed()])).rejects.toMatchObject({ code: 'conflict' })
    expect((await run(conflict, clients([conflict]), [installed('DEPS0001', 'VERS0001', true)])).selected).toHaveLength(1)
  })
  it('reports an unavailable optional project without treating it as required', async () => {
    const root = version('ROOTVER1', project.id, [edge('DEPS0001', 'optional')])
    const result = await run(root, clients([root]))
    expect(result.selected).toHaveLength(1); expect(result.unavailableOptional).toEqual([{ key: 'modrinth:DEPS0001', id: 'DEPS0001' }])
  })
  it('accepts Fabric dependencies for Quilt and stops before metadata reads when cancelled', async () => {
    const root = version('ROOTVER1', project.id, [edge('DEPS0001')], ['quilt']), api = clients([root, version('VERS0001', 'DEPS0001')])
    expect((await run(root, api, [], new Set(), 'quilt')).selected).toHaveLength(2)
    const controller = new AbortController(); controller.abort()
    await expect(resolveCatalogDependencies({ provider: 'modrinth', version: root }, project, '1.21.1', 'quilt', [], new Set(), api, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('resolves required CurseForge projects, omits embedded files and exposes optional ones', async () => {
    const root = { id: 101, modId: 1, gameId: 432, gameVersions: ['1.21.1', 'Fabric'], dependencies: [{ modId: 2, relationType: 3 }, { modId: 3, relationType: 2 }, { modId: 4, relationType: 1 }] } as File
    const api = { modrinth: {}, curseforge: { getMod: vi.fn(async (id: number) => ({ id, gameId: 432, classId: 6, name: `Project ${id}` })), getModFiles: vi.fn(async ({ modId }: { modId: number }) => ({ data: [{ ...root, id: modId * 100, modId, dependencies: [] }] })), getFiles: vi.fn() } } as unknown as DependencyClients
    const result = await resolveCatalogDependencies({ provider: 'curseforge', file: root }, { ...project, provider: 'curseforge', id: '1' }, '1.21.1', 'fabric', [], new Set(), api, new AbortController().signal)
    expect(result.selected.map(node => node.project.id)).toEqual(['1', '2']); expect(result.optional.map(node => node.project.id)).toEqual(['3'])
    expect(api.curseforge.getMod).not.toHaveBeenCalledWith(4, expect.anything())
  })
})
