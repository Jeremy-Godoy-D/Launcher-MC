import { Mutex } from 'async-mutex'
import { writeFile as writeAtomically } from 'atomically'
import { fileTypeFromBuffer } from 'file-type'
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, rm, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { toMediaIconUrl } from '../instance/instanceIcon'
import { readBoundedLocalFile } from '../util/readBoundedLocalFile'

export const MEDIA_CACHE_LIMIT = 50 * 1024 * 1024
const IMAGE_LIMIT = 8 * 1024 * 1024
const MAX_AGE = 24 * 60 * 60 * 1000
const OWN_FILE = /^[a-f0-9]{64}\.(?:img|json)(?:\.tmp-[a-f0-9]{16})?$/
const IMAGE_HOSTS = new Set(['cdn.modrinth.com', 'media.forgecdn.net', 'mediafilez.forgecdn.net'])
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

async function validPoster(bytes: Buffer, mime?: string) {
  const type = await fileTypeFromBuffer(bytes)
  // Animated provider images cannot obey the launcher's motion/power pauses.
  return !!type && IMAGE_TYPES.has(type.mime) && (!mime || type.mime === mime) &&
    !(type.mime === 'image/webp' && bytes.toString('ascii', 12, 16) === 'VP8X' && (bytes[20] & 2))
}

export function publicImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash && IMAGE_HOSTS.has(url.hostname)) return url.href
  } catch { /* Invalid provider images do not prevent launching. */ }
}

export async function readPublicBody(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('empty_media')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    if (Number(response.headers.get('content-length')) > limit) throw new Error('media_too_large')
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('media_too_large')
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks, size)
}

type CachedImage = { image: string; sourceUrl: string; fetchedAt: number }

/** Private, disposable cache; neither instance files nor general image storage are eviction targets. */
export class MediaCache {
  private readonly queue = new Mutex()
  constructor(private readonly directory: string, private readonly fetch: typeof globalThis.fetch) {}

  private async prepare() {
    await mkdir(this.directory, { recursive: true })
    const info = await lstat(this.directory)
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('invalid_media_cache')
  }

  private async files() {
    const entries = await readdir(this.directory, { withFileTypes: true })
    return Promise.all(entries.filter(entry => entry.isFile() && OWN_FILE.test(entry.name)).map(async entry => {
      const path = join(this.directory, entry.name)
      const info = await lstat(path)
      return { path, name: entry.name, size: info.size, used: info.mtimeMs }
    }))
  }

  private async prune(reserve = 0, keep?: string) {
    const files = await this.files()
    let total = files.reduce((sum, file) => sum + file.size, reserve)
    for (const file of files.sort((a, b) => a.used - b.used)) {
      if (total <= MEDIA_CACHE_LIMIT) break
      if (keep && (file.name === `${keep}.img` || file.name === `${keep}.json`)) continue
      await rm(file.path)
      total -= file.size
    }
    if (total > MEDIA_CACHE_LIMIT) throw new Error('media_cache_full')
  }

  private async cached(key: string): Promise<CachedImage | undefined> {
    try {
      const imagePath = join(this.directory, `${key}.img`)
      const recordPath = join(this.directory, `${key}.json`)
      const [imageInfo, recordInfo] = await Promise.all([lstat(imagePath), lstat(recordPath)])
      if (!imageInfo.isFile() || !recordInfo.isFile() || imageInfo.size > IMAGE_LIMIT || recordInfo.size > 4096) return
      const record = JSON.parse((await readBoundedLocalFile(recordPath, 4096)).toString('utf8'))
      if (!publicImageUrl(record.sourceUrl) || !Number.isFinite(record.fetchedAt)) return
      const bytes = await readBoundedLocalFile(imagePath, IMAGE_LIMIT)
      if (!await validPoster(bytes) || createHash('sha256').update(bytes).digest('hex') !== record.sha256) return
      const now = new Date()
      await Promise.all([utimes(imagePath, now, now), utimes(recordPath, now, now)])
      return { image: `${toMediaIconUrl(imagePath)}&v=${record.sha256}`, sourceUrl: record.sourceUrl, fetchedAt: record.fetchedAt }
    } catch { return }
  }

  async resolve(project: string, candidates: (signal: AbortSignal) => Promise<string[]>): Promise<CachedImage | undefined> {
    return this.queue.runExclusive(async () => {
      let previous: CachedImage | undefined
      try {
        await this.prepare()
        await this.prune()
        const key = createHash('sha256').update(project).digest('hex')
        previous = await this.cached(key)
        if (previous && Date.now() - previous.fetchedAt < MAX_AGE) return previous
        const signal = AbortSignal.timeout(15_000)
        const urls = [...new Set((await candidates(signal)).map(publicImageUrl).filter((url): url is string => !!url))].slice(0, 3)
        for (const sourceUrl of urls) {
          try {
            let url = sourceUrl
            let response: Response | undefined
            for (let hop = 0; hop < 4; hop++) {
              response = await this.fetch(url, { signal, redirect: 'manual', credentials: 'omit', headers: { accept: 'image/png,image/jpeg,image/webp' } })
              if (response.status < 300 || response.status >= 400) break
              const location = response.headers.get('location')
              await response.body?.cancel()
              const next = location && publicImageUrl(new URL(location, url).href)
              if (!next) throw new Error('unsafe_media_redirect')
              url = next
            }
            if (!response?.ok) { await response?.body?.cancel(); continue }
            const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
            if (!mime || !IMAGE_TYPES.has(mime)) { await response.body?.cancel(); continue }
            const bytes = await readPublicBody(response, IMAGE_LIMIT)
            if (!await validPoster(bytes, mime)) continue
            const fetchedAt = Date.now()
            const record = JSON.stringify({ sourceUrl, fetchedAt, sha256: createHash('sha256').update(bytes).digest('hex') })
            await this.prune(bytes.length + Buffer.byteLength(record), key)
            const imagePath = join(this.directory, `${key}.img`)
            await writeAtomically(imagePath, bytes)
            await writeAtomically(join(this.directory, `${key}.json`), record)
            await this.prune(0, key)
            return { image: `${toMediaIconUrl(imagePath)}&v=${createHash('sha256').update(bytes).digest('hex')}`, sourceUrl, fetchedAt }
          } catch { /* Try another provider image, then the last usable offline cover. */ }
        }
      } catch { /* Offline, quota, metadata and filesystem failures leave the bundled fallback usable. */ }
      return previous
    })
  }

  async clear() {
    await this.queue.runExclusive(async () => {
      await this.prepare()
      for (const file of await this.files()) await rm(file.path)
    })
  }
}
