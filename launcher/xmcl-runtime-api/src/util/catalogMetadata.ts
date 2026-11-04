/** Only public metadata reads may obtain the protocol's cancellation capability. */
export function isCatalogMetadataRead(url: URL, method: string) {
  if (url.username || url.password || !['https://api.modrinth.com', 'https://api.curseforge.com'].includes(url.origin)) return false
  if (method.toUpperCase() === 'GET') return true
  return method.toUpperCase() === 'POST' && (url.hostname === 'api.modrinth.com'
    ? ['/v2/version_files', '/v2/version_files/update'].includes(url.pathname)
    : url.pathname === '/v1/mods/files')
}
