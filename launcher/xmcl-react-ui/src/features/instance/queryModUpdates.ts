import { QueryClient } from '@tanstack/react-query'
import { CurseforgeV1Client, FileModLoaderType, HashAlgo, type File } from '@xmcl/curseforge'
import { ModrinthV2Client, type ProjectVersion } from '@xmcl/modrinth'
import type { SavedInstance } from '../library/model'
import type { StateData } from '@launcher/renderer-client'
import type { ModSource } from '@xmcl/runtime-api/src/services/InstanceModsService'
import type { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { modIdentity } from './modIdentity'

type RuntimeVersions = SavedInstance['runtime']

export type UpdatePolicy = 'modrinth' | 'curseforge' | 'modrinthOnly' | 'curseforgeOnly'
export type UpdateOptions = { policy: UpdatePolicy; releaseOnly: boolean; skipVersion: boolean; domain?: 'mods' | 'resourcepacks' }
export type UpdateMod = { path: string; name: string; fileName: string; hash: string; size: number; curseforge?: { projectId: number; fileId: number }; modrinth?: { projectId: string; versionId: string } }
export type ModUpdate = { mod: UpdateMod } & ({ version: ProjectVersion } | { file: File })
export type UpdateIssue = { provider: 'modrinth' | 'curseforge'; kind: 'failed' | 'limited' | 'incomplete'; file?: string }

// Public metadata only. No account tokens, instance configuration or install state enter this cache.
export const modUpdateQueries = new QueryClient({ defaultOptions: { queries: { staleTime: 120000, gcTime: 300000, retry: (count, error) => count < 2 && (error instanceof TypeError || 'status' in error && Number(error.status) >= 500) } } })
const cooldowns = new Map<string, number>()
const metadataFetch: typeof fetch = async (input, init) => {
  const origin = new URL(input instanceof Request ? input.url : String(input)).origin
  if ((cooldowns.get(origin) || 0) > Date.now()) throw Object.assign(new Error('Metadata rate limited'), { status: 429 })
  const response = await fetch(input, init)
  if (!response.ok) {
    if (response.status === 429) {
      const header = response.headers.get('retry-after') || '60'
      const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()
      cooldowns.set(origin, Date.now() + Math.max(1000, Number.isFinite(delay) ? delay : 60000))
    }
    throw Object.assign(new Error('Public metadata request failed'), { status: response.status })
  }
  return response
}
const clients = { modrinth: new ModrinthV2Client({ fetch: metadataFetch }), curseforge: new CurseforgeV1Client('', { fetch: metadataFetch }) }
type Clients = { modrinth: Pick<ModrinthV2Client, 'getLatestVersionsFromHashes' | 'getProjectVersionsByHash'>; curseforge: Pick<CurseforgeV1Client, 'getModFiles' | 'getFiles'> }

export function updateMods(files: StateData<ResourceState>['files'], runtime: RuntimeVersions, sources: readonly ModSource[] = []): UpdateMod[] {
  const byHash = new Map(sources.map(source => [source.hash, source]))
  return files.filter(file => /^[a-f0-9]{40}$/i.test(file.hash)).map(file => ({ path: file.path, name: modIdentity(file, runtime).name, fileName: file.fileName, hash: file.hash, size: file.size, curseforge: (byHash.get(file.hash) || file.metadata).curseforge, modrinth: (byHash.get(file.hash) || file.metadata).modrinth }))
}

export function updateLoaders(runtime: RuntimeVersions) {
  const loaders = [runtime.fabricLoader && ['fabric', FileModLoaderType.Fabric], runtime.quiltLoader && ['quilt', FileModLoaderType.Quilt], runtime.forge && ['forge', FileModLoaderType.Forge], runtime.neoForged && ['neoforge', FileModLoaderType.NeoForge]].filter(Boolean) as Array<[string, FileModLoaderType]>
  if (loaders.length !== 1 || !runtime.minecraft) throw new Error('Ambiguous mod runtime')
  return loaders[0]
}
const sha1 = /^[a-f0-9]{40}$/i
const hasModrinth = (mod: UpdateMod) => !!mod.modrinth && /^[0-9a-z]{8}$/i.test(mod.modrinth.projectId) && /^[0-9a-z]{8}$/i.test(mod.modrinth.versionId)
const hasCurseforge = (mod: UpdateMod) => Number.isSafeInteger(mod.curseforge?.projectId) && mod.curseforge!.projectId > 0 && Number.isSafeInteger(mod.curseforge?.fileId) && mod.curseforge!.fileId > 0
function newer(candidate: string, current: string) { if (typeof candidate !== 'string' || typeof current !== 'string') return false; const a = Date.parse(candidate), b = Date.parse(current); return Number.isFinite(a) && Number.isFinite(b) && a > b }
function aborted(signal: AbortSignal) { signal.throwIfAborted() }

export async function queryModUpdates(mods: UpdateMod[], runtime: RuntimeVersions, options: UpdateOptions, signal: AbortSignal, api: Clients = clients, cache = modUpdateQueries) {
  const packs = options.domain === 'resourcepacks'
  if (packs && !runtime.minecraft) throw new Error('Missing Minecraft version')
  const [loader, cfLoader] = packs ? ['minecraft', undefined] as const : updateLoaders(runtime), results = new Map<string, ModUpdate>(), issues: UpdateIssue[] = []
  const cached = <T,>(key: unknown[], query: () => Promise<T>) => cache.fetchQuery({ queryKey: ['mod-updates', options.domain || 'mods', ...key], queryFn: query })
  const issue = (provider: UpdateIssue['provider'], error: unknown, file?: string) => {
    aborted(signal)
    issues.push({ provider, file, kind: error && typeof error === 'object' && 'status' in error && error.status === 429 ? 'limited' : 'failed' })
  }
  const checkModrinth = async () => {
    const targets = mods.filter(mod => !results.has(mod.path) && hasModrinth(mod))
    for (let i = 0; i < targets.length; i += 1000) {
      aborted(signal)
      const batch = targets.slice(i, i + 1000), hashes = [...new Set(batch.map(mod => mod.hash))].sort()
      try {
        const current = await cached(['modrinth-current', hashes], () => api.modrinth.getProjectVersionsByHash(hashes, 'sha1', signal))
        aborted(signal)
        const candidates = await cached(['modrinth', hashes, runtime.minecraft, loader, options.releaseOnly], () => api.modrinth.getLatestVersionsFromHashes(hashes, { algorithm: 'sha1', loaders: [loader], gameVersions: [runtime.minecraft], ...(options.releaseOnly ? { versionTypes: ['release'] } : {}) }, signal))
        aborted(signal)
        for (const mod of batch) {
          const old = current[mod.hash], version = candidates[mod.hash]
          if (!old || old.project_id !== mod.modrinth!.projectId || old.id !== mod.modrinth!.versionId) { issues.push({ provider: 'modrinth', kind: 'incomplete', file: mod.fileName }); continue }
          if (options.skipVersion && !old.game_versions.includes(runtime.minecraft)) continue
          if (!version) continue
          const primary = version.files?.find(file => file.primary) || version.files?.[0]
          if (!/^[0-9a-z]{8}$/i.test(version.id) || version.project_id !== old.project_id || !version.loaders?.includes(loader) || !version.game_versions?.includes(runtime.minecraft) || options.releaseOnly && version.version_type !== 'release' || !primary || !sha1.test(primary.hashes?.sha1 || '')) { issues.push({ provider: 'modrinth', kind: 'incomplete', file: mod.fileName }); continue }
          if (version.id !== old.id && primary.hashes.sha1 !== mod.hash && newer(version.date_published, old.date_published)) results.set(mod.path, { mod, version })
        }
      } catch (error) { issue('modrinth', error) }
    }
  }
  const checkCurseforge = async () => {
    const targets = mods.filter(mod => !results.has(mod.path) && hasCurseforge(mod))
    for (let i = 0; i < targets.length; i += 50) {
      aborted(signal)
      const batch = targets.slice(i, i + 50), ids = [...new Set(batch.map(mod => mod.curseforge!.fileId))].sort((a, b) => a - b)
      let current: File[]
      try { current = await cached(['curseforge-current', ids], () => api.curseforge.getFiles(ids, signal)); if (!Array.isArray(current)) throw new Error('Invalid metadata') } catch (error) { issue('curseforge', error); continue }
      for (const mod of batch) {
        aborted(signal)
        const old = current.find(file => file.id === mod.curseforge!.fileId && file.modId === mod.curseforge!.projectId)
        if (!old || !Array.isArray(old.gameVersions) || !Array.isArray(old.hashes) || String(old.hashes.find(hash => hash.algo === HashAlgo.Sha1)?.value).toLowerCase() !== mod.hash.toLowerCase()) { issues.push({ provider: 'curseforge', kind: 'incomplete', file: mod.fileName }); continue }
        if (options.skipVersion && !old.gameVersions.includes(runtime.minecraft)) continue
        try {
          // Bound pathological histories; an incomplete result is visible, never reported as up to date.
          const files: File[] = []
          for (let index = 0; index < 500; index += 50) {
            const page = await cached(['curseforge', mod.curseforge!.projectId, runtime.minecraft, cfLoader, index], () => api.curseforge.getModFiles({ modId: mod.curseforge!.projectId, gameVersion: runtime.minecraft, ...(packs ? {} : { modLoaderType: cfLoader }), index, pageSize: 50 }, signal))
            aborted(signal); files.push(...page.data)
            if (index + page.data.length >= page.pagination.totalCount || page.data.length === 0) break
            if (index === 450) issues.push({ provider: 'curseforge', kind: 'incomplete', file: mod.fileName })
          }
          const file = files.filter(file => Number.isSafeInteger(file.id) && file.id > 0 && file.modId === old.modId && file.isAvailable && file.gameVersions.includes(runtime.minecraft) && (packs || file.gameVersions.some(value => value.toLowerCase() === loader)) && (!options.releaseOnly || file.releaseType === 1) && sha1.test(file.hashes.find(hash => hash.algo === HashAlgo.Sha1)?.value || '')).sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate))[0]
          if (file && file.id !== old.id && newer(file.fileDate, old.fileDate) && file.hashes.find(hash => hash.algo === HashAlgo.Sha1)?.value !== mod.hash) results.set(mod.path, { mod, file })
        } catch (error) { issue('curseforge', error, mod.fileName) }
      }
    }
  }
  if (options.policy === 'curseforge' || options.policy === 'curseforgeOnly') { await checkCurseforge(); if (options.policy === 'curseforge') await checkModrinth() }
  else { await checkModrinth(); if (options.policy === 'modrinth') await checkCurseforge() }
  aborted(signal)
  return { updates: [...results.values()], issues, unidentified: mods.filter(mod => !hasModrinth(mod) && !hasCurseforge(mod)).length }
}
