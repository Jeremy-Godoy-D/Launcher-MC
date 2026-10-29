import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { File } from '@xmcl/curseforge'
import type { ProjectVersion } from '@xmcl/modrinth'
import type { SavedInstance } from '../library/model'
import { queryModUpdates, updateLoaders, updateMods, type UpdateMod, type UpdateOptions } from './queryModUpdates'

const caches: QueryClient[] = []
afterEach(() => { for (const cache of caches.splice(0)) cache.clear() })
const runtime = { minecraft: '1.21.1', fabricLoader: '0.16' } as SavedInstance['runtime']
const hash = 'a'.repeat(40), newerHash = 'b'.repeat(40)
const mod: UpdateMod = { path: 'C:/instance/mods/a.jar.disabled', name: 'A', fileName: 'a.jar.disabled', hash, size: 100, modrinth: { projectId: 'abcdefgh', versionId: 'version1' }, curseforge: { projectId: 11, fileId: 1 } }
const old = { id: 'version1', project_id: 'abcdefgh', game_versions: ['1.21.1'], date_published: '2026-01-01' } as ProjectVersion
const next = { author_id: 'author12', name: 'Version 2', version_number: '2', featured: false, downloads: 0, dependencies: [], id: 'version2', project_id: 'abcdefgh', game_versions: ['1.21.1'], loaders: ['fabric'], version_type: 'release', date_published: '2026-02-01', files: [{ primary: true, filename: 'a2.jar', size: 100, url: 'https://cdn.modrinth.com/a2.jar', hashes: { sha1: newerHash } }] } as ProjectVersion
const cfOld = { hashes: [{ algo: 1, value: hash }], id: 1, modId: 11, gameVersions: ['1.21.1', 'Fabric'], fileDate: '2026-01-01' } as File
const cfNext = { id: 2, modId: 11, isAvailable: true, gameVersions: ['1.21.1', 'Fabric'], releaseType: 1, fileDate: '2026-02-01', hashes: [{ algo: 1, value: newerHash }] } as File
const defaults: UpdateOptions = { policy: 'modrinth', releaseOnly: true, skipVersion: false }
function fixture(options: Partial<UpdateOptions> = {}) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 120000 } } }); caches.push(cache)
  const api = { modrinth: { getProjectVersionsByHash: vi.fn(async () => ({ [hash]: old })), getLatestVersionsFromHashes: vi.fn(async () => ({ [hash]: next })) }, curseforge: { getFiles: vi.fn(async () => [cfOld]), getModFiles: vi.fn(async () => ({ data: [cfNext], pagination: { index: 0, pageSize: 50, resultCount: 1, totalCount: 1 } })) } }
  const controller = new AbortController()
  return { api, cache, controller, run: (mods = [mod]) => queryModUpdates(mods, runtime, { ...defaults, ...options }, controller.signal, api, cache) }
}

it('queries stable compatible versions in batches, includes disabled mods and caches public metadata', async () => {
  const f = fixture(), result = await f.run()
  expect(result).toEqual({ updates: [{ mod, version: next }], issues: [], unidentified: 0 })
  expect(f.api.modrinth.getLatestVersionsFromHashes).toHaveBeenCalledWith([hash], { algorithm: 'sha1', loaders: ['fabric'], gameVersions: ['1.21.1'], versionTypes: ['release'] }, f.controller.signal)
  expect(f.api.curseforge.getModFiles).not.toHaveBeenCalled()
  await f.run(); expect(f.api.modrinth.getLatestVersionsFromHashes).toHaveBeenCalledTimes(1)
})
it('keeps a healthy provider’s result when the preferred provider is rate limited', async () => {
  const f = fixture(); f.api.modrinth.getLatestVersionsFromHashes.mockRejectedValue({ status: 429 })
  const result = await f.run()
  expect(result.updates).toEqual([{ mod, file: cfNext }]); expect(result.issues).toEqual([{ provider: 'modrinth', kind: 'limited' }])
})
it('keeps provider-only policy and never calls the other source', async () => {
  const f = fixture({ policy: 'curseforgeOnly' }); expect((await f.run()).updates).toEqual([{ mod, file: cfNext }])
  expect(f.api.modrinth.getLatestVersionsFromHashes).not.toHaveBeenCalled()
  expect(f.api.curseforge.getModFiles).toHaveBeenCalledWith({ modId: 11, gameVersion: '1.21.1', modLoaderType: 4, index: 0, pageSize: 50 }, f.controller.signal)
})
it('paginates past prereleases and chooses the newest stable file without downgrading', async () => {
  const f = fixture({ policy: 'curseforgeOnly' })
  f.api.curseforge.getModFiles.mockResolvedValueOnce({ data: [{ ...cfNext, releaseType: 2 }], pagination: { index: 0, pageSize: 50, resultCount: 1, totalCount: 51 } }).mockResolvedValueOnce({ data: [cfNext], pagination: { index: 50, pageSize: 50, resultCount: 1, totalCount: 51 } })
  expect((await f.run()).updates).toEqual([{ mod, file: cfNext }]); expect(f.api.curseforge.getModFiles).toHaveBeenCalledTimes(2)
})
it.each(['project', 'loader', 'game', 'hash', 'channel'])('rejects a mismatched Modrinth %s without discarding other provider results', async field => {
  const f = fixture()
  const changed = { ...next, ...(field === 'project' ? { project_id: 'wrongxxx' } : field === 'loader' ? { loaders: ['forge'] } : field === 'game' ? { game_versions: ['1.20'] } : field === 'channel' ? { version_type: 'beta' as const } : { files: [] }) }
  f.api.modrinth.getLatestVersionsFromHashes.mockResolvedValue({ [hash]: changed })
  const result = await f.run(); expect(result.updates).toEqual([{ mod, file: cfNext }]); expect(result.issues[0].kind).toBe('incomplete')
})
it('does not downgrade a newer installed prerelease when stable-only is selected', async () => {
  const f = fixture({ policy: 'modrinthOnly' }); f.api.modrinth.getProjectVersionsByHash.mockResolvedValue({ [hash]: { ...old, date_published: '2026-03-01' } })
  expect((await f.run()).updates).toEqual([])
})
it('omits only installed versions from a different Minecraft when requested', async () => {
  const f = fixture({ skipVersion: true, policy: 'curseforgeOnly' }); f.api.curseforge.getFiles.mockResolvedValue([{ ...cfOld, gameVersions: ['1.20', 'Fabric'] }])
  expect((await f.run()).updates).toEqual([]); expect(f.api.curseforge.getModFiles).not.toHaveBeenCalled()
})
it('does not query unidentified local mods and reports their count', async () => {
  const f = fixture(); expect(await f.run([{ ...mod, curseforge: undefined, modrinth: undefined }])).toEqual({ updates: [], issues: [], unidentified: 1 })
  expect(f.api.modrinth.getProjectVersionsByHash).not.toHaveBeenCalled(); expect(f.api.curseforge.getFiles).not.toHaveBeenCalled()
})
it('stops an obsolete result and prevents fallback after cancellation', async () => {
  const f = fixture(); f.api.modrinth.getLatestVersionsFromHashes.mockImplementation(async () => { f.controller.abort(); return { [hash]: next } })
  await expect(f.run()).rejects.toHaveProperty('name', 'AbortError'); expect(f.api.curseforge.getFiles).not.toHaveBeenCalled()
})
it('rejects missing or ambiguous loaders and preserves Quilt and NeoForge identities', () => {
  expect(() => updateLoaders({ ...runtime, forge: '52' })).toThrow('Ambiguous')
  expect(() => updateLoaders({ minecraft: '1.21.1' } as SavedInstance['runtime'])).toThrow('Ambiguous')
  expect(updateLoaders({ ...runtime, fabricLoader: '', quiltLoader: '1' })).toEqual(['quilt', 5])
  expect(updateLoaders({ ...runtime, fabricLoader: '', neoForged: '21' })).toEqual(['neoforge', 6])
})

it('counts corrupted source identifiers as unidentified instead of reporting a completed check', async () => {
  const f = fixture(); expect((await f.run([{ ...mod, modrinth: { projectId: 'bad', versionId: 'invalid' }, curseforge: { projectId: -1, fileId: 0 } }])).unidentified).toBe(1)
  expect(f.api.curseforge.getFiles).not.toHaveBeenCalled()
})
it('reports stale CurseForge hash metadata without proposing a different project artifact', async () => {
  const f = fixture({ policy: 'curseforgeOnly' }); f.api.curseforge.getFiles.mockResolvedValue([{ ...cfOld, hashes: [{ algo: 1, value: 'c'.repeat(40) }] }])
  const result = await f.run(); expect(result.updates).toEqual([]); expect(result.issues[0].kind).toBe('incomplete'); expect(f.api.curseforge.getModFiles).not.toHaveBeenCalled()
})
it('bounds a pathological CurseForge history and labels the partial result', async () => {
  const f = fixture({ policy: 'curseforgeOnly' }); f.api.curseforge.getModFiles.mockResolvedValue({ data: [cfNext], pagination: { index: 0, pageSize: 50, resultCount: 1, totalCount: 10000 } })
  const result = await f.run(); expect(f.api.curseforge.getModFiles).toHaveBeenCalledTimes(10)
  expect(result.updates).toEqual([{ mod, file: cfNext }]); expect(result.issues).toContainEqual({ provider: 'curseforge', kind: 'incomplete', file: mod.fileName })
})

it('uses committed provider IDs even before their batched state event, without mutating the state record', () => {
  const file = { hash, path: mod.path, fileName: mod.fileName, size: 100, name: 'A', metadata: {} } as Parameters<typeof updateMods>[0][number]
  const sources = [{ hash, curseforge: { projectId: 11, fileId: 1 } }]
  expect(updateMods([file], runtime, sources)[0].curseforge).toEqual(sources[0].curseforge)
  expect(file.metadata).toEqual({})
})

it('queries resource packs for Vanilla using the documented minecraft identity without requiring a mod loader', async () => {
  const f = fixture(), version = { ...next, loaders: ['minecraft'] }
  f.api.modrinth.getLatestVersionsFromHashes.mockResolvedValue({ [hash]: version })
  const result = await queryModUpdates([mod], { minecraft: '1.21.1' } as SavedInstance['runtime'], { ...defaults, domain: 'resourcepacks' }, f.controller.signal, f.api, f.cache)
  expect(result.updates).toEqual([{ mod, version }])
  expect(f.api.modrinth.getLatestVersionsFromHashes).toHaveBeenCalledWith([hash], { algorithm: 'sha1', loaders: ['minecraft'], gameVersions: ['1.21.1'], versionTypes: ['release'] }, f.controller.signal)
})
it('queries CurseForge resource packs without a mod-loader filter or mod-loader tag requirement', async () => {
  const f = fixture({ domain: 'resourcepacks', policy: 'curseforgeOnly' }), file = { ...cfNext, gameVersions: ['1.21.1'] }
  f.api.curseforge.getModFiles.mockResolvedValue({ data: [file], pagination: { index: 0, pageSize: 50, resultCount: 1, totalCount: 1 } })
  expect((await f.run()).updates).toEqual([{ mod, file }])
  expect(f.api.curseforge.getModFiles).toHaveBeenCalledWith({ modId: 11, gameVersion: '1.21.1', index: 0, pageSize: 50 }, f.controller.signal)
})
it('keeps mod and pack metadata caches separate and rejects mod-only candidates for packs', async () => {
  const f = fixture(); expect((await f.run()).updates).toHaveLength(1)
  const result = await queryModUpdates([mod], runtime, { ...defaults, domain: 'resourcepacks', policy: 'modrinthOnly' }, f.controller.signal, f.api, f.cache)
  expect(result.updates).toEqual([]); expect(result.issues).toContainEqual({ provider: 'modrinth', kind: 'incomplete', file: mod.fileName })
  expect(f.api.modrinth.getLatestVersionsFromHashes).toHaveBeenCalledTimes(2)
})
it('rejects pack queries without Minecraft before calling either provider', async () => {
  const f = fixture()
  await expect(queryModUpdates([mod], {} as SavedInstance['runtime'], { ...defaults, domain: 'resourcepacks' }, f.controller.signal, f.api, f.cache)).rejects.toThrow('Missing Minecraft')
  expect(f.api.modrinth.getProjectVersionsByHash).not.toHaveBeenCalled(); expect(f.api.curseforge.getFiles).not.toHaveBeenCalled()
})
