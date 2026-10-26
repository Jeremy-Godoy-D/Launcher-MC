import type { MinecraftVersions } from '@xmcl/runtime-api'
import { createHash } from 'node:crypto'

/** Read official immutable metadata only; folder imports never supply a fetch URL. */
export async function fetchPrismMinecraftBase(id: string, versions: MinecraftVersions, fetcher: typeof fetch): Promise<Buffer> {
  const metadata = versions.versions.find(version => version.id === id)
  if (!metadata) throw new Error('Unknown Prism Minecraft base')
  const url = new URL(metadata.url)
  const hash = url.pathname.match(/\/([a-f0-9]{40})\//)?.[1]
  if (url.protocol !== 'https:' || !['piston-meta.mojang.com', 'launchermeta.mojang.com', 'launcher.mojang.com'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('.json') || !hash) throw new Error('Unsafe Prism Minecraft metadata URL')
  const response = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(20000) })
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('Prism Minecraft metadata unavailable') }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if ((size += value.length) > 1024 * 1024) throw new Error('Prism Minecraft metadata is too large')
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel() }
  const data = Buffer.concat(chunks)
  if (createHash('sha1').update(data).digest('hex') !== hash) throw new Error('Prism Minecraft metadata checksum mismatch')
  return data
}
