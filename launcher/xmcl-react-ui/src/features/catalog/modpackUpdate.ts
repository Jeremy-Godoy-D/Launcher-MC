import type { StateData } from '@launcher/renderer-client'
import { InstanceFile } from '../../../../packages/instance/files'
import type { InstanceUpstream } from '../../../../packages/instance/instance'
import type { ModpackState } from '@xmcl/runtime-api/src/services/ModpackService'
import type { InstanceFileUpdate, InstallInstanceOptions } from '@xmcl/runtime-api/src/services/InstanceInstallService'
import type { SavedInstance } from '../library/model'
import { importedOptions, validateImportFiles } from '../library/creation'
import type { CatalogProject } from './api'

export type PackUpstream = Extract<InstanceUpstream, { type: 'modrinth-modpack' | 'curseforge-modpack' }>
export function isPackTarget(target: Pick<SavedInstance, 'upstream'>, project: Pick<CatalogProject, 'provider' | 'id'>) {
  return project.provider === 'modrinth' ? target.upstream?.type === 'modrinth-modpack' && target.upstream.projectId === project.id
    : target.upstream?.type === 'curseforge-modpack' && String(target.upstream.modId) === project.id
}

export function preparePackUpdate(profile: StateData<ModpackState>, target: SavedInstance, upstream: PackUpstream) {
  if (!profile.ready || profile.error || !profile.files.length || !isPackTarget(target, upstream.type === 'modrinth-modpack' ? { provider: 'modrinth', id: upstream.projectId } : { provider: 'curseforge', id: String(upstream.modId) })) throw new Error('Invalid modpack update')
  const config = importedOptions(profile.config, target.name), files = InstanceFile.array().max(100000).parse(profile.files)
  validateImportFiles(files)
  const options: Extract<InstallInstanceOptions, { upstream: InstanceUpstream }> = { path: target.path, files, upstream }
  // Keep identity, Java, memory, arguments and local preferences; import only the validated game runtime.
  const edit = { instancePath: target.path, runtime: config.runtime, version: config.version || '', upstream }
  return { options, edit }
}

export function assertPackUpdateChanges(changes: readonly InstanceFileUpdate[]) {
  // Updating a pack must never replace a player's worlds or launcher bookkeeping.
  if (changes.some(change => /^(saves|screenshots|logs|crash-reports|backups)(\/|$)/i.test(change.file.path.replaceAll('\\', '/')))) throw Object.assign(new Error('The pack includes user data changes'), { code: 'userData' })
}
