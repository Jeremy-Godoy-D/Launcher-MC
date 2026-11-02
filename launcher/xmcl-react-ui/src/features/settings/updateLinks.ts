import type { ReleaseFile } from '@xmcl/runtime-api/src/entities/update'

export const releasesPage = 'https://github.com/Jeremy-Godoy-D/Launcher-MC/releases'
export function releasePage(name: string) {
  return /^v?\d+\.\d+\.\d+(?:-[\da-z.-]+)?$/i.test(name) ? `${releasesPage}/tag/${name.startsWith('v') ? name : `v${name}`}` : releasesPage
}
export function publicUpdateFiles(info: { name: string; files: readonly ReleaseFile[] }) {
  const page = releasePage(info.name)
  if (page === releasesPage) return []
  const prefix = page.replace('/tag/', '/download/')
  return info.files.filter(file => {
    if (!/^[\w.+-]+\.(exe|zip|sha256)$/i.test(file.name)) return false
    try {
      const url = new URL(file.url)
      return !url.username && !url.password && !url.search && !url.hash && url.href === `${prefix}/${encodeURIComponent(file.name)}`
    } catch { return false }
  })
}
