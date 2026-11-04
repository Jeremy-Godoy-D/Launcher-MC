import type { InstallMarketOptions } from '@xmcl/runtime-api'

/** Copy only download selectors across the renderer boundary; directory/domain never come from it. */
export function modpackRequest(value: InstallMarketOptions): InstallMarketOptions {
  if (!value || typeof value !== 'object' || value.market !== 0 && value.market !== 1) throw new Error('Invalid modpack source')
  const text = (value: unknown, limit: number) => {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid modpack download selector')
    return value
  }
  const map = <T, R>(value: T | T[], transform: (value: T) => R): R | R[] => {
    if (Array.isArray(value)) { if (!value.length || value.length > 128) throw new Error('Invalid modpack batch'); return value.map(transform) }
    return transform(value)
  }
  if (value.market === 0) return { market: 0, version: map(value.version, version => {
    if (!version || typeof version.versionId !== 'string' || !/^[A-Za-z0-9]{8}$/.test(version.versionId)) throw new Error('Invalid modpack version')
    if (version.projectId !== undefined && (typeof version.projectId !== 'string' || !/^[A-Za-z0-9]{8}$/.test(version.projectId))) throw new Error('Invalid modpack project')
    const filename = text(version.filename, 255), icon = text(version.icon, 4096)
    if (filename !== undefined && (!filename || /[/\\\p{Cc}]/u.test(filename))) throw new Error('Invalid modpack filename')
    return { versionId: version.versionId, ...(version.projectId !== undefined ? { projectId: version.projectId } : {}), ...(filename !== undefined ? { filename } : {}), ...(icon !== undefined ? { icon } : {}) }
  }) }
  return { market: 1, file: map(value.file, file => {
    if (!file || !Number.isSafeInteger(file.fileId) || file.fileId <= 0) throw new Error('Invalid modpack file')
    if (file.projectId !== undefined && (!Number.isSafeInteger(file.projectId) || file.projectId <= 0)) throw new Error('Invalid modpack project')
    const icon = text(file.icon, 4096)
    return { fileId: file.fileId, ...(file.projectId !== undefined ? { projectId: file.projectId } : {}), ...(icon !== undefined ? { icon } : {}) }
  }) }
}
