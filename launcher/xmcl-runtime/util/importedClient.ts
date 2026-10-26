import type { Version } from '@xmcl/core'
import { createHash } from 'node:crypto'

export function isolateImportedClient(download: Partial<Version.Download> | undefined, data?: Buffer) {
  const sha1 = data ? createHash('sha1').update(data).digest('hex') : download?.sha1?.toLowerCase()
  if (!sha1 || !/^[a-f0-9]{40}$/.test(sha1)) throw new Error('Imported client needs bytes or a valid SHA-1')
  if (data && download?.sha1 && sha1 !== download.sha1.toLowerCase()) throw new Error('Imported client checksum mismatch')
  if (data && download?.size !== undefined && download.size >= 0 && download.size !== data.length) throw new Error('Imported client size mismatch')
  const url = download?.url || ''
  if (url) {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Unsafe imported client URL')
  }
  if (!data && !url) throw new Error('Imported client is unavailable')
  const identity = data ? createHash('sha256').update(data).digest('hex').slice(0, 24) : sha1
  return { id: `.client-${identity}`, data, download: { url, sha1, size: data?.length ?? download?.size ?? -1 } }
}
