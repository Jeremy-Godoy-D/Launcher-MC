import type { CurseforgeV1Client, File } from '@xmcl/curseforge'
import { FileModLoaderType } from '@xmcl/curseforge'
import type { ModrinthV2Client, ProjectVersion } from '@xmcl/modrinth'
import type { CatalogProject } from './api'
import type { UpdateMod } from '../instance/queryModUpdates'

export type CatalogVersion = { provider: 'modrinth'; version: ProjectVersion } | { provider: 'curseforge'; file: File }
export type DependencyNode = CatalogVersion & { project: Pick<CatalogProject, 'provider' | 'id' | 'kind' | 'name'>; key: string; required: boolean; current?: UpdateMod; activate: boolean }
export type DependencyClients = {
  modrinth: Pick<ModrinthV2Client, 'getProjectVersion' | 'getProjectVersions' | 'getProject'>
  curseforge: Pick<CurseforgeV1Client, 'getMod' | 'getFiles' | 'getModFiles'>
  installedRequirement?: (requirement: CatalogRequirementError['requirement'], version: string | undefined) => Promise<string | undefined>
  installedConflict?: (provider: 'modrinth' | 'curseforge', id: string, version: string | undefined) => Promise<boolean>
}
export class CatalogRequirementError extends Error {
  constructor(readonly requirement: { provider: 'modrinth' | 'curseforge'; id: string; kind: 'mod' | 'resourcepack' | 'shader'; name: string }) { super('A dependency of another content type needs a separate installation'); this.name = 'CatalogRequirementError' }
}
const loaderIds = { fabric: FileModLoaderType.Fabric, quilt: FileModLoaderType.Quilt, forge: FileModLoaderType.Forge, neoforge: FileModLoaderType.NeoForge }
function failed(code: 'incompatible' | 'conflict' | 'unavailable' | 'tooMany') { return Object.assign(new Error('Catalog dependencies could not be resolved'), { code, name: 'CatalogDependencyError' }) }
const identifier = (node: CatalogVersion) => node.provider === 'modrinth' ? node.version.id : String(node.file.id)
const projectKey = (provider: string, id: string) => `${provider}:${id}`

/** Resolve required/selected optional projects before native review; never silently omit a required edge. */
export async function resolveCatalogDependencies(root: CatalogVersion, project: DependencyNode['project'], minecraft: string, loader: string, installed: readonly UpdateMod[], optional: ReadonlySet<string>, clients: DependencyClients, signal: AbortSignal) {
  const chosen = new Map<string, DependencyNode>(), offered = new Map<string, DependencyNode>()
  const unavailableOptional = new Map<string, { key: string; id: string }>()
  const satisfied: Array<CatalogRequirementError['requirement'] & { version: string }> = []
  const incompatible: Array<{ key: string; version?: string }> = [], requests = new Map<string, Promise<unknown>>()
  const allowedLoaders = loader === 'quilt' ? ['quilt', 'fabric'] : [loader]
  const cached = <T,>(key: string, read: () => Promise<T>) => {
    if (!requests.has(key)) requests.set(key, read())
    return requests.get(key) as Promise<T>
  }
  const existing = (provider: string, id: string) => installed.filter(file => provider === 'modrinth' ? file.modrinth?.projectId === id : String(file.curseforge?.projectId) === id)
  const currentId = (file: UpdateMod, provider: string) => provider === 'modrinth' ? file.modrinth?.versionId : String(file.curseforge?.fileId)
  function compatible(candidate: CatalogVersion) {
    if (candidate.provider === 'modrinth') return candidate.version.game_versions?.includes(minecraft) && (project.kind === 'mod' ? allowedLoaders.some(loader => candidate.version.loaders?.includes(loader)) : project.kind === 'shader' ? (loader === 'iris' ? ['iris', 'optifine'] : ['optifine']).some(engine => candidate.version.loaders?.includes(engine)) : true)
    if (!candidate.file.gameVersions?.includes(minecraft)) return false
    const tags = candidate.file.gameVersions.map(value => value.toLowerCase().replace(/[ _-]/g, '')), declared = tags.filter(value => ['fabric', 'quilt', 'forge', 'neoforge'].includes(value))
    return project.kind !== 'mod' || !declared.length || allowedLoaders.some(loader => declared.includes(loader))
  }
  async function lookup(provider: 'modrinth' | 'curseforge', id: string, version?: string): Promise<{ candidate: CatalogVersion; info: DependencyNode['project'] }> {
    signal.throwIfAborted()
    if (provider === 'modrinth' ? !/^[A-Za-z0-9]{8}$/.test(id) || version !== undefined && !/^[A-Za-z0-9]{8}$/.test(version) : !/^[1-9]\d{0,14}$/.test(id) || !Number.isSafeInteger(Number(id))) throw failed('unavailable')
    let info: DependencyNode['project']
    if (provider === project.provider && id === project.id) info = project
    else if (provider === 'modrinth') {
      const data = await cached(`mr-project:${id}`, () => clients.modrinth.getProject(id, signal))
      if (data.id !== id || typeof data.title !== 'string' || data.project_type === 'mod' && data.client_side === 'unsupported') throw failed('incompatible')
      if (data.project_type !== project.kind) {
        if (data.project_type === 'mod' || data.project_type === 'resourcepack' || data.project_type === 'shader') throw new CatalogRequirementError({ provider, id, kind: data.project_type, name: data.title.slice(0, 256) })
        throw failed('incompatible')
      }
      info = { provider, id, kind: project.kind, name: data.title.slice(0, 256) }
    } else {
      const data = await cached(`cf-project:${id}`, () => clients.curseforge.getMod(Number(id), signal)), classId = { mod: 6, resourcepack: 12, shader: 6552 }[project.kind as 'mod' | 'resourcepack' | 'shader']
      if (data.id !== Number(id) || data.gameId !== 432 || typeof data.name !== 'string') throw failed('incompatible')
      if (data.classId !== classId) {
        const kind = data.classId === 6 ? 'mod' : data.classId === 12 ? 'resourcepack' : data.classId === 6552 ? 'shader' : undefined
        if (kind) throw new CatalogRequirementError({ provider, id, kind, name: data.name.slice(0, 256) })
        throw failed('incompatible')
      }
      info = { provider, id, kind: project.kind, name: data.name.slice(0, 256) }
    }
    const present = existing(provider, id)
    if (present.length > 1) throw failed('conflict')
    let candidate: CatalogVersion | undefined
    const selectedId = version || (present[0] && currentId(present[0], provider))
    if (selectedId) {
      if (provider === 'modrinth') candidate = { provider, version: await cached(`mr-version:${selectedId}`, () => clients.modrinth.getProjectVersion(selectedId, signal)) }
      else {
        const files = await cached(`cf-file:${selectedId}`, () => clients.curseforge.getFiles([Number(selectedId)], signal))
        if (files.length === 1) candidate = { provider, file: files[0] }
      }
      if (version && (!candidate || identifier(candidate) !== version || !compatible(candidate))) throw failed('incompatible')
    }
    if (!candidate || !compatible(candidate)) {
      if (provider === 'modrinth') {
        const versions = await cached(`mr-versions:${id}`, () => clients.modrinth.getProjectVersions(id, { gameVersions: [minecraft], ...(project.kind === 'mod' ? { loaders: allowedLoaders } : {}) }, signal))
        if (!Array.isArray(versions) || versions.length > 10000) throw failed('unavailable')
        const candidates = versions.filter(version => compatible({ provider, version }))
        const version = candidates.find(version => version.version_type === 'release') || candidates[0]
        if (version) candidate = { provider, version }
      } else {
        const result = await cached(`cf-files:${id}`, () => clients.curseforge.getModFiles({ modId: Number(id), gameVersion: minecraft, modLoaderType: project.kind === 'mod' && loader !== 'quilt' ? loaderIds[loader as keyof typeof loaderIds] : undefined, pageSize: 50 }, signal))
        if (!Array.isArray(result.data) || result.data.length > 50) throw failed('unavailable')
        const files = result.data.filter(file => compatible({ provider, file })), file = files.find(file => file.releaseType === 1) || files[0]
        if (file) candidate = { provider, file }
      }
    }
    if (!candidate) throw failed('unavailable')
    const owner = candidate.provider === 'modrinth' ? candidate.version.project_id : String(candidate.file.modId)
    if (owner !== id || candidate.provider === 'curseforge' && candidate.file.gameId !== 432) throw failed('unavailable')
    return { candidate, info }
  }
  async function visit(candidate: CatalogVersion, info: DependencyNode['project'], required: boolean) {
    signal.throwIfAborted()
    if (!compatible(candidate)) throw failed('incompatible')
    const key = projectKey(candidate.provider, info.id), previous = chosen.get(key)
    if (previous) { if (identifier(previous) !== identifier(candidate)) throw failed('conflict'); previous.required ||= required; return }
    offered.delete(key)
    if (chosen.size + offered.size + unavailableOptional.size >= 128) throw failed('tooMany')
    const present = existing(candidate.provider, info.id)
    if (present.length > 1) throw failed('conflict')
    if (candidate.provider !== info.provider || (candidate.provider === 'modrinth' ? candidate.version.project_id !== info.id || !/^[A-Za-z0-9]{8}$/.test(candidate.version.id) : String(candidate.file.modId) !== info.id || candidate.file.gameId !== 432 || !Number.isSafeInteger(candidate.file.id) || candidate.file.id <= 0)) throw failed('unavailable')
    const node: DependencyNode = { ...candidate, project: info, key, required, current: present[0], activate: required && /\.disabled$/i.test(present[0]?.fileName || '') }
    chosen.set(key, node)
    const dependencies = candidate.provider === 'modrinth' ? candidate.version.dependencies : candidate.file.dependencies
    if (!Array.isArray(dependencies) || dependencies.length > 256) throw failed('unavailable')
    for (const raw of dependencies) {
      signal.throwIfAborted()
      const dependency = candidate.provider === 'modrinth' ? raw as ProjectVersion['dependencies'][number] : undefined
      const cf = candidate.provider === 'curseforge' ? raw as File['dependencies'][number] : undefined
      const relation = dependency?.dependency_type || (cf?.relationType === 3 ? 'required' : cf?.relationType === 2 ? 'optional' : cf?.relationType === 5 ? 'incompatible' : 'embedded')
      if (relation !== 'required' && relation !== 'optional' && relation !== 'incompatible') continue
      let id = dependency?.project_id || (cf ? String(cf.modId) : '')
      const exact = dependency?.version_id || undefined
      if (!id && exact) id = (await cached(`mr-version:${exact}`, () => clients.modrinth.getProjectVersion(exact, signal))).project_id
      if (!id) throw failed('unavailable')
      const childKey = projectKey(candidate.provider, id)
      if (relation === 'incompatible') { incompatible.push({ key: childKey, version: exact }); continue }
      const selected = chosen.get(childKey)
      if (selected) {
        if (exact && identifier(selected) !== exact) throw failed('conflict')
        selected.required ||= relation === 'required'
        selected.activate ||= relation === 'required' && /\.disabled$/i.test(selected.current?.fileName || '')
        continue
      }
      if (relation === 'optional' && !optional.has(childKey)) {
        if (offered.has(childKey) || unavailableOptional.has(childKey)) continue
        if (offered.size + chosen.size + unavailableOptional.size >= 128) throw failed('tooMany')
        try {
          const child = await lookup(candidate.provider, id, exact)
          offered.set(childKey, { ...child.candidate, project: child.info, key: childKey, required: false, current: existing(candidate.provider, id)[0], activate: false })
        } catch (error) {
          signal.throwIfAborted()
          if (error && typeof error === 'object' && 'status' in error && (error.status === 429 || error.status === 401 || error.status === 403)) throw error
          unavailableOptional.set(childKey, { key: childKey, id })
        }
        continue
      }
      let child: Awaited<ReturnType<typeof lookup>>
      try {
        child = await lookup(candidate.provider, id, exact)
      } catch (error) {
        if (!(error instanceof CatalogRequirementError)) throw error
        const present = await clients.installedRequirement?.(error.requirement, exact)
        signal.throwIfAborted()
        if (!present) throw error
        if (!satisfied.some(requirement => requirement.provider === error.requirement.provider && requirement.id === error.requirement.id && requirement.version === present)) satisfied.push({ ...error.requirement, version: present })
        continue
      }
      await visit(child.candidate, child.info, relation === 'required')
    }
  }
  if (!minecraft || !['mod', 'resourcepack', 'shader'].includes(project.kind) || project.kind === 'mod' && !Object.hasOwn(loaderIds, loader) || project.kind === 'shader' && loader !== 'iris' && loader !== 'optifine') throw failed('incompatible')
  await visit(root, project, true)
  for (const conflict of incompatible) {
    const node = chosen.get(conflict.key)
    if (node && (!/\.disabled$/i.test(node.current?.fileName || '') || node.activate) && (!conflict.version || identifier(node) === conflict.version)) throw failed('conflict')
    const [provider, id] = conflict.key.split(':')
    if (existing(provider, id).some(file => !/\.disabled$/i.test(file.fileName) && (!conflict.version || currentId(file, provider) === conflict.version))) throw failed('conflict')
    if (await clients.installedConflict?.(provider as 'modrinth' | 'curseforge', id, conflict.version)) throw failed('conflict')
  }
  signal.throwIfAborted()
  return { selected: [...chosen.values()], optional: [...offered.values()].filter(node => !chosen.has(node.key)), unavailableOptional: [...unavailableOptional.values()].filter(node => !chosen.has(node.key)), satisfied }
}
