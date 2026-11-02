import type { InstallMarketOptions } from '@xmcl/runtime-api/src/entities/market'
import type { CatalogProject, getCatalogVersions } from './api'

export function modpackDownload(project: CatalogProject, result: Awaited<ReturnType<typeof getCatalogVersions>>, id: string): InstallMarketOptions {
  if (project.kind !== 'modpack' || result.provider !== project.provider) throw new Error('Invalid modpack selection')
  if (result.provider === 'modrinth') {
    const version = result.versions.find(version => version.id === id && version.project_id === project.id)
    if (!Array.isArray(version?.files) || version.files.length > 128) throw new Error('Invalid modpack files')
    const files = version?.files?.filter(file => typeof file.filename === 'string' && /\.mrpack$/i.test(file.filename) && !/[/\\\p{Cc}]/u.test(file.filename)) || []
    const primary = files.filter(file => file.primary)
    const file = primary.length === 1 ? primary[0] : files.length === 1 ? files[0] : undefined
    if (!version || !file) throw new Error('No modpack archive available')
    return { market: 0, version: { versionId: version.id, projectId: project.id, filename: file.filename, ...(project.icon ? { icon: project.icon } : {}) } }
  }
  const file = result.versions.find(file => String(file.id) === id && String(file.modId) === project.id)
  if (!file || file.isAvailable === false || !file.downloadUrl || !/\.zip$/i.test(file.fileName) || /[/\\\p{Cc}]/u.test(file.fileName)) throw new Error('No modpack archive available')
  return { market: 1, file: { fileId: file.id, projectId: Number(project.id), ...(project.icon ? { icon: project.icon } : {}) } }
}
