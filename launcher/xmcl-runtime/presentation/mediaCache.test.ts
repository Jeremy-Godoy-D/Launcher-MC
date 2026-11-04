import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm, writeFile, open, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test, vi } from 'vitest'
import { MEDIA_CACHE_LIMIT, MediaCache, publicImageUrl, readPublicBody } from './mediaCache'

const directories: string[] = []
const source = 'https://cdn.modrinth.com/data/abcdefgh/images/cover.png'
const png = await readFile(join(process.cwd(), 'xmcl-keystone-ui/src/assets/steve_skin.png'))
const response = () => new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } })
async function fixture(fetch = vi.fn(async (_input: unknown, _init?: RequestInit) => response())) {
  const directory = await mkdtemp(join(tmpdir(), 'grimo-media-')); directories.push(directory)
  return { directory, fetch, cache: new MediaCache(directory, fetch as typeof globalThis.fetch) }
}
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

test.each([
  'http://cdn.modrinth.com/a.png', 'https://cdn.modrinth.com.evil.test/a.png',
  'https://127.0.0.1/a.png', 'file:///C:/private.png', 'data:image/png;base64,x',
  'https://u:p@cdn.modrinth.com/a.png', 'https://media.forgecdn.net:8443/a.png',
  'https://cdn.modrinth.com/a.png?token=secret', 'https://cdn.modrinth.com/a.png#private',
])('rejects an unsafe image URL: %s', url => { expect(publicImageUrl(url)).toBeUndefined() })

test('stores verified own bytes, deduplicates concurrent requests and survives an offline restart', async () => {
  const { directory, fetch, cache } = await fixture()
  const candidates = vi.fn(async () => [source])
  const [first, second] = await Promise.all([cache.resolve('modrinth:abcdefgh', candidates), cache.resolve('modrinth:abcdefgh', candidates)])
  expect(first).toEqual(second); expect(first?.sourceUrl).toBe(source)
  expect(fetch).toHaveBeenCalledTimes(1); expect(candidates).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0]).toEqual([source, expect.objectContaining({ credentials: 'omit', redirect: 'manual', headers: { accept: 'image/png,image/jpeg,image/webp' } })])
  const url = new URL(first!.image)
  expect(await readFile(url.searchParams.get('path')!)).toEqual(png)
  expect(url.searchParams.get('v')).toBe(createHash('sha256').update(png).digest('hex'))
  const offline = vi.fn(async () => { throw new Error('offline') })
  expect(await new MediaCache(directory, offline).resolve('modrinth:abcdefgh', offline)).toEqual(first)
  expect(offline).not.toHaveBeenCalled()
})

test('expired cached covers remain available when metadata fails', async () => {
  const { directory, cache } = await fixture()
  const first = await cache.resolve('modrinth:abcdefgh', async () => [source])
  const name = (await readdir(directory)).find(name => name.endsWith('.json'))!
  const path = join(directory, name), record = JSON.parse(await readFile(path, 'utf8'))
  record.fetchedAt = 1; await writeFile(path, JSON.stringify(record))
  const unavailable = vi.fn(async () => { throw new Error('quota') })
  expect(await cache.resolve('modrinth:abcdefgh', unavailable)).toEqual({ ...first, fetchedAt: 1 })
  expect(unavailable).toHaveBeenCalledTimes(1)
})

test('falls through invalid MIME, spoofed bytes and blocked hosts to the next own gallery image', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response('<html>', { headers: { 'content-type': 'text/html' } }))
    .mockResolvedValueOnce(new Response('<html>', { headers: { 'content-type': 'image/png' } })).mockResolvedValueOnce(response())
  const { cache } = await fixture(fetch)
  const result = await cache.resolve('pack', async () => ['https://evil.test/a.png', source, `${source}/bad`, `${source}/good`])
  expect(result?.sourceUrl).toBe(`${source}/good`); expect(fetch).toHaveBeenCalledTimes(3)
})

test('does not follow a redirect into the local network or forward request credentials', async () => {
  const fetch = vi.fn(async (_input: unknown, _init?: RequestInit) => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:8080/private' } }))
  const { cache } = await fixture(fetch)
  expect(await cache.resolve('pack', async () => [source])).toBeUndefined()
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][1]).not.toHaveProperty('headers.authorization')
})

test('bounds a chunked response even without Content-Length and cancels the reader', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9)); controller.enqueue(new Uint8Array(9)) }, cancel })
  await expect(readPublicBody(new Response(body), 16)).rejects.toThrow('media_too_large')
  expect(cancel).toHaveBeenCalledTimes(1)
})

test('animated provider posters are not decoded outside the controllable video lifecycle', async () => {
  const webp = Buffer.from(await readFile(join(process.cwd(), 'xmcl-react-ui/src/assets/ambient/vanilla-ocean.webp')))
  // A VP8X animation flag is sufficient to reject the container before rendering it.
  const animated = Buffer.concat([webp.subarray(0, 12), Buffer.from('VP8X'), Buffer.from([10, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]), webp.subarray(12)])
  animated.writeUInt32LE(animated.length - 8, 4)
  const fetch = vi.fn().mockResolvedValueOnce(new Response(animated, { headers: { 'content-type': 'image/webp' } }))
    .mockResolvedValueOnce(new Response('GIF89a', { headers: { 'content-type': 'image/gif' } }))
  const { cache } = await fixture(fetch)
  expect(await cache.resolve('pack', async () => [source, `${source}/gif`])).toBeUndefined()
})

test('redirects remain on public provider CDNs and stop after four requests', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: 'https://media.forgecdn.net/attachments/cover.png' } })).mockResolvedValueOnce(response())
  const { cache } = await fixture(fetch)
  expect(await cache.resolve('pack', async () => [source])).toBeDefined()
  expect(fetch.mock.calls.map(call => call[0])).toEqual([source, 'https://media.forgecdn.net/attachments/cover.png'])
  fetch.mockReset().mockImplementation(async () => new Response(null, { status: 302, headers: { location: '/loop.png' } }))
  expect(await cache.resolve('other-pack', async () => [source])).toBeUndefined()
  expect(fetch).toHaveBeenCalledTimes(4)
})

test('rejects declared oversized responses before reading and detects a corrupted cached image', async () => {
  const { directory, cache, fetch } = await fixture()
  const first = await cache.resolve('pack', async () => [source])
  await writeFile(new URL(first!.image).searchParams.get('path')!, 'not a png')
  fetch.mockResolvedValueOnce(new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png', 'content-length': String(9 * 1024 * 1024) } }))
  expect(await cache.resolve('pack', async () => [source])).toBeUndefined()
})

test('evicts least recently used own files below 50MiB and clearing preserves other data', async () => {
  const { directory, cache } = await fixture()
  const oldName = `${'a'.repeat(64)}.img`, newerName = `${'b'.repeat(64)}.img`
  for (const name of [oldName, newerName]) { const file = await open(join(directory, name), 'w'); await file.truncate(27 * 1024 * 1024); await file.close() }
  await utimes(join(directory, oldName), new Date(1), new Date(1))
  await writeFile(join(directory, `${'c'.repeat(64)}.img.tmp-0000000000abcdef`), 'interrupted own atomic write')
  await writeFile(join(directory, 'world.dat'), 'KEEP')
  const result = await cache.resolve('pack', async () => [source])
  expect(result).toBeDefined()
  expect(await readdir(directory)).not.toContain(oldName)
  expect(await readdir(directory)).toContain(newerName)
  const sizes = await Promise.all((await readdir(directory)).filter(name => name !== 'world.dat').map(async name => (await (await import('node:fs/promises')).stat(join(directory, name))).size))
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(MEDIA_CACHE_LIMIT)
  await cache.clear()
  expect(await readdir(directory)).toEqual(['world.dat'])
  expect(await readFile(join(directory, 'world.dat'), 'utf8')).toBe('KEEP')
})

test('filesystem failure does not prevent a presentation fallback', async () => {
  const { directory, fetch } = await fixture()
  const file = join(directory, 'not-a-directory'); await writeFile(file, 'KEEP')
  expect(await new MediaCache(file, fetch as typeof globalThis.fetch).resolve('pack', async () => [source])).toBeUndefined()
  expect(fetch).not.toHaveBeenCalled()
  expect(await readFile(file, 'utf8')).toBe('KEEP')
})
