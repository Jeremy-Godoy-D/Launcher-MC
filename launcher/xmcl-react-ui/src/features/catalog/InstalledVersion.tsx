import { useSharedState } from '../../runtime'
import { useI18n } from '../../i18n'
import { ResourceState } from '@xmcl/runtime-api/src/entities/resource'
import { Saves } from '@xmcl/runtime-api/src/entities/save'
import { InstanceSavesServiceKey } from '@xmcl/runtime-api/src/services/InstanceSavesService'
import { InstanceModsServiceKey } from '@xmcl/runtime-api/src/services/InstanceModsService'
import { InstanceResourcePacksServiceKey } from '@xmcl/runtime-api/src/services/InstanceResourcePacksService'
import { InstanceShaderPacksServiceKey } from '@xmcl/runtime-api/src/services/InstanceShaderPacksService'
import type { SavedInstance } from '../library/model'
import type { CatalogProject } from './api'

type Props = { project: CatalogProject; target: SavedInstance; version: string }
function Status({ versions, version, world = false }: { versions: string[]; version: string; world?: boolean }) {
  const { t } = useI18n()
  if (!versions.length) return null
  return <span role="status" data-testid="catalog-installed-version">{t(versions.includes(version) ? world ? 'react.catalog.worldImported' : 'react.catalogInstall.installed' : 'react.catalog.otherInstalled')}</span>
}
function ContentStatus({ project, target, version }: Props) {
  const domain = project.kind === 'mod' ? 'mods' : project.kind === 'shader' ? 'shaderpacks' : 'resourcepacks'
  const key = domain === 'mods' ? InstanceModsServiceKey : domain === 'shaderpacks' ? InstanceShaderPacksServiceKey : InstanceResourcePacksServiceKey
  // Rows share one store and native subscription for this inventory identity.
  const snapshot = useSharedState({ key: `instance-${domain}://${target.path}`, Type: ResourceState, load: client => client.service(key).watch(target.path) })
  const versions = (snapshot.data?.files || []).flatMap(file => {
    if (project.provider === 'modrinth') return file.metadata.modrinth?.projectId === project.id ? [file.metadata.modrinth.versionId] : []
    return String(file.metadata.curseforge?.projectId) === project.id ? [String(file.metadata.curseforge!.fileId)] : []
  })
  return <Status versions={versions} version={version} />
}
function WorldStatus({ project, target, version }: Props) {
  const snapshot = useSharedState({ key: `saves://${target.path}`, Type: Saves, load: client => client.service(InstanceSavesServiceKey).watch(target.path) })
  const versions = (snapshot.data?.saves || []).flatMap(save => String(save.curseforge?.projectId) === project.id ? [String(save.curseforge!.fileId)] : [])
  return <Status versions={versions} version={version} world />
}
export function InstalledVersion(props: Props) {
  const { project, target, version } = props
  if (project.kind === 'modpack') {
    const source = target.upstream
    const installed = project.provider === 'modrinth' && source?.type === 'modrinth-modpack' && source.projectId === project.id ? source.versionId
      : project.provider === 'curseforge' && source?.type === 'curseforge-modpack' && String(source.modId) === project.id ? String(source.fileId) : undefined
    return <Status versions={installed ? [installed] : []} version={version} />
  }
  if (project.kind === 'world') return <WorldStatus {...props} />
  return <ContentStatus {...props} />
}
