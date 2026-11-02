import { CurseforgeV1Client, FileModLoaderType, ModsSearchSortField, type Mod } from '@xmcl/curseforge'
import { publicMetadataFetch } from './queries'
import { ModrinthV2Client, type SearchResultHit, type ProjectVersion } from '@xmcl/modrinth'

export const providers = ['modrinth', 'curseforge'] as const
export const kinds = ['modpack', 'mod', 'resourcepack', 'shader', 'world'] as const
export const loaders = ['', 'fabric', 'forge', 'neoforge', 'quilt'] as const
export const sorts = ['relevance', 'downloads', 'updated', 'newest'] as const
export type Provider = typeof providers[number]
export type Kind = typeof kinds[number]
export type CatalogQuery = { provider: Provider; kind: Kind; text: string; minecraft: string; loader: typeof loaders[number]; sort: typeof sorts[number]; page: number }
export type CatalogProject = { provider: Provider; id: string; kind: Kind; name: string; description: string; author: string; downloads: number; icon: string; image: string }
export const PAGE_SIZE = 24
export type CatalogDetail = { project: CatalogProject; body: string; markdown: boolean; gallery: string[]; website: string }
const modrinth = new ModrinthV2Client({ fetch: publicMetadataFetch })
// Electron's existing HTTPS handler routes this client to the configured Worker and strips credentials.
const curseforge = new CurseforgeV1Client('', { fetch: publicMetadataFetch })
export const catalogClients = { modrinth, curseforge }
const classIds: Record<Kind, number> = { mod: 6, modpack: 4471, resourcepack: 12, shader: 6552, world: 17 }
const loaderIds = { fabric: FileModLoaderType.Fabric, forge: FileModLoaderType.Forge, neoforge: FileModLoaderType.NeoForge, quilt: FileModLoaderType.Quilt }
const cfSort = { relevance: ModsSearchSortField.Popularity, downloads: ModsSearchSortField.TotalDownloads, updated: ModsSearchSortField.LastUpdated, newest: ModsSearchSortField.ReleasedDate }

export function readCatalogQuery(params: URLSearchParams): CatalogQuery {
  const pick = <T extends string>(values: readonly T[], value: string | null, fallback: T) => values.includes(value as T) ? value as T : fallback
  const rawVersion = params.get('minecraft') || '', page = Number(params.get('page') || 0)
  return {
    provider: pick(providers, params.get('source'), 'modrinth'), kind: pick(kinds, params.get('kind'), 'modpack'),
    text: (params.get('q') || '').trim().slice(0, 256), minecraft: /^[A-Za-z0-9_.-]{1,40}$/.test(rawVersion) ? rawVersion : '',
    loader: pick(loaders, params.get('loader'), ''), sort: pick(sorts, params.get('sort'), 'relevance'),
    page: Number.isSafeInteger(page) && page >= 0 && page < 417 ? page : 0,
  }
}

export function safeCatalogImage(value: unknown) {
  if (typeof value !== 'string' || value.length > 4096) return ''
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '' } catch { return '' }
}

export function modrinthProject(row: SearchResultHit): CatalogProject {
  if (!row || typeof row.project_id !== 'string' || !/^[A-Za-z0-9]{8}$/.test(row.project_id) || typeof row.title !== 'string') throw new Error('Invalid catalog response')
  return { provider: 'modrinth', id: row.project_id, kind: kinds.includes(row.project_type as Kind) ? row.project_type as Kind : 'mod', name: row.title.slice(0, 256), description: String(row.description || '').slice(0, 4096), author: String(row.author || '').slice(0, 256), downloads: Number.isSafeInteger(row.downloads) && row.downloads >= 0 ? row.downloads : 0, icon: safeCatalogImage(row.icon_url), image: safeCatalogImage(row.featured_gallery) || safeCatalogImage(row.gallery?.[0]) }
}

export function curseforgeProject(row: Mod, fallback: Kind): CatalogProject {
  if (!row || !Number.isSafeInteger(row.id) || row.id <= 0 || row.gameId !== 432 || typeof row.name !== 'string') throw new Error('Invalid catalog response')
  return { provider: 'curseforge', id: String(row.id), kind: (Object.entries(classIds).find(([, id]) => id === row.classId)?.[0] as Kind | undefined) || fallback, name: row.name.slice(0, 256), description: String(row.summary || '').slice(0, 4096), author: (row.authors || []).map(author => author.name).join(', ').slice(0, 512), downloads: Number.isSafeInteger(row.downloadCount) && row.downloadCount >= 0 ? row.downloadCount : 0, icon: safeCatalogImage(row.logo?.thumbnailUrl) || safeCatalogImage(row.logo?.url), image: safeCatalogImage(row.screenshots?.find(image => image.modId === row.id)?.url) }
}

export async function searchCatalog(query: CatalogQuery, signal?: AbortSignal): Promise<{ projects: CatalogProject[]; total: number }> {
  if (query.provider === 'modrinth') {
    if (query.kind === 'world') return { projects: [], total: 0 }
    const facets = [[`project_type:${query.kind}`], ...(query.minecraft ? [[`versions:${query.minecraft}`]] : []), ...(query.loader && (query.kind === 'mod' || query.kind === 'modpack') ? [[`categories:${query.loader}`]] : [])]
    const result = await modrinth.searchProjects({ query: query.text, facets: JSON.stringify(facets), index: query.sort, limit: PAGE_SIZE, offset: query.page * PAGE_SIZE }, signal)
    if (!Array.isArray(result.hits) || result.hits.length > PAGE_SIZE || !Number.isSafeInteger(result.total_hits) || result.total_hits < 0) throw new Error('Invalid catalog response')
    return { projects: result.hits.map(modrinthProject), total: result.total_hits }
  }
  const result = await curseforge.searchMods({ classId: classIds[query.kind], searchFilter: query.text, gameVersion: query.minecraft || undefined, modLoaderType: query.loader && (query.kind === 'mod' || query.kind === 'modpack') ? loaderIds[query.loader] : undefined, sortField: cfSort[query.sort], index: query.page * PAGE_SIZE, pageSize: PAGE_SIZE }, signal)
  if (!Array.isArray(result.data) || result.data.length > PAGE_SIZE || !Number.isSafeInteger(result.pagination.totalCount) || result.pagination.totalCount < 0) throw new Error('Invalid catalog response')
  return { projects: result.data.map(row => curseforgeProject(row, query.kind)), total: result.pagination.totalCount }
}

function projectId(provider: Provider, id: string) {
  if (provider === 'modrinth' ? !/^[A-Za-z0-9]{8}$/.test(id) : !/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw new Error('Invalid project identifier')
}

export async function getCatalogDetail(provider: Provider, id: string, signal?: AbortSignal): Promise<CatalogDetail> {
  projectId(provider, id)
  if (provider === 'modrinth') {
    const project = await modrinth.getProject(id, signal)
    if (project.id !== id || typeof project.title !== 'string' || typeof project.body !== 'string' || project.body.length > 1024 * 1024) throw new Error('Invalid catalog response')
    const gallery = (project.gallery || []).slice(0, 24).map(image => safeCatalogImage(image.url)).filter(Boolean)
    return { project: { provider, id, kind: kinds.includes(project.project_type as Kind) ? project.project_type as Kind : 'mod', name: project.title.slice(0, 256), description: String(project.description || '').slice(0, 4096), author: '', downloads: Number.isSafeInteger(project.downloads) && project.downloads >= 0 ? project.downloads : 0, icon: safeCatalogImage(project.icon_url), image: gallery[0] || '' }, body: project.body, markdown: true, gallery, website: `https://modrinth.com/project/${id}` }
  }
  const [project, body] = await Promise.all([curseforge.getMod(Number(id), signal), curseforge.getModDescription(Number(id), signal)])
  if (project.id !== Number(id) || typeof body !== 'string' || body.length > 1024 * 1024) throw new Error('Invalid catalog response')
  return { project: curseforgeProject(project, 'mod'), body, markdown: false, gallery: (project.screenshots || []).filter(image => image.modId === project.id).slice(0, 24).map(image => safeCatalogImage(image.url)).filter(Boolean), website: safeCatalogImage(project.links?.websiteUrl) }
}

export async function getCatalogVersions(provider: Provider, id: string, minecraft: string, loader: CatalogQuery['loader'], page = 0, signal?: AbortSignal) {
  projectId(provider, id)
  if (!Number.isSafeInteger(page) || page < 0 || page >= 200) throw new Error('Invalid version page')
  const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 1000 && value.every(item => typeof item === 'string' && item.length <= 256)
  if (provider === 'modrinth') {
    const versions = await modrinth.getProjectVersions(id, { ...(minecraft ? { gameVersions: [minecraft] } : {}), ...(loader ? { loaders: [loader] } : {}) }, signal)
    if (!Array.isArray(versions) || versions.length > 10000 || versions.some(version => version.project_id !== id || !/^[A-Za-z0-9]{8}$/.test(version.id) || typeof version.name !== 'string' || typeof version.version_number !== 'string' || typeof version.date_published !== 'string' || !strings(version.game_versions) || !strings(version.loaders))) throw new Error('Invalid catalog response')
    return { provider, versions: versions.slice(page * 50, (page + 1) * 50), total: versions.length } as const
  }
  const result = await curseforge.getModFiles({ modId: Number(id), gameVersion: minecraft || undefined, modLoaderType: loader ? loaderIds[loader] : undefined, index: page * 50, pageSize: 50 }, signal)
  if (!Array.isArray(result.data) || result.data.length > 50 || !Number.isSafeInteger(result.pagination?.totalCount) || result.pagination.totalCount < 0 || result.data.some(file => file.modId !== Number(id) || file.gameId !== 432 || !Number.isSafeInteger(file.id) || file.id <= 0 || typeof file.displayName !== 'string' || typeof file.fileName !== 'string' || typeof file.fileDate !== 'string' || !strings(file.gameVersions))) throw new Error('Invalid catalog response')
  return { provider, versions: result.data, total: result.pagination.totalCount } as const
}

export async function getRequiredModrinthVersions(version: ProjectVersion, minecraft: string, loader: CatalogQuery['loader'], signal?: AbortSignal) {
  const seen = new Set<string>(), result: ProjectVersion[] = []
  async function visit(current: ProjectVersion) {
    projectId('modrinth', current.id)
    if (minecraft && !current.game_versions?.includes(minecraft) || loader && !current.loaders?.includes(loader)) throw new Error('Required project dependency is incompatible')
    if (seen.has(current.id)) return
    if (seen.size >= 128) throw new Error('Too many project dependencies')
    seen.add(current.id)
    for (const dependency of current.dependencies || []) {
      if (dependency.dependency_type !== 'required') continue
      let next: ProjectVersion | undefined
      if (dependency.version_id && seen.has(dependency.version_id)) continue
      if (dependency.version_id) { projectId('modrinth', dependency.version_id); next = await modrinth.getProjectVersion(dependency.version_id, signal) }
      else if (dependency.project_id) { projectId('modrinth', dependency.project_id); next = (await modrinth.getProjectVersions(dependency.project_id, { ...(minecraft ? { gameVersions: [minecraft] } : {}), ...(loader ? { loaders: [loader] } : {}) }, signal))[0] }
      if (!next || dependency.project_id && next.project_id !== dependency.project_id) throw new Error('Required project dependency is unavailable')
      await visit(next)
    }
    result.push(current)
  }
  await visit(version)
  return result
}
