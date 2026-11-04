import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { fetchPrismMinecraftBase } from './prismMinecraftBase'

const data = Buffer.from('{"id":"1.21.1"}')
const hash = createHash('sha1').update(data).digest('hex')
const metadata = (url = `https://piston-meta.mojang.com/v1/packages/${hash}/1.21.1.json`) => ({ latest: { release: '1.21.1', snapshot: '' }, versions: [{ id: '1.21.1', url, time: '', releaseTime: '', type: 'release' }] })
test('fetches only the listed immutable official metadata and verifies its bytes', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(data))
  expect(await fetchPrismMinecraftBase('1.21.1', metadata(), fetcher)).toEqual(data)
  expect(fetcher).toHaveBeenCalledWith(metadata().versions[0].url, expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }))
})
test.each(['http://piston-meta.mojang.com/v1/packages/HASH/1.json', 'https://evil.example/v1/packages/HASH/1.json', 'https://piston-meta.mojang.com/unknown.json', 'https://user:pass@piston-meta.mojang.com/v1/packages/HASH/1.json', 'https://piston-meta.mojang.com/v1/packages/HASH/1.json?token=value'])('blocks untrusted metadata URL %s before networking', async url => {
  const fetcher = vi.fn()
  await expect(fetchPrismMinecraftBase('1.21.1', metadata(url.replace('HASH', hash)), fetcher)).rejects.toThrow('Unsafe')
  expect(fetcher).not.toHaveBeenCalled()
})
test('rejects missing versions, HTTP errors, changed bytes and oversized streams', async () => {
  const fetcher = vi.fn()
  await expect(fetchPrismMinecraftBase('unknown', metadata(), fetcher)).rejects.toThrow('Unknown')
  expect(fetcher).not.toHaveBeenCalled()
  for (const response of [new Response('', { status: 503 }), new Response('changed'), new Response(Buffer.alloc(1024 * 1024 + 1))]) {
    fetcher.mockResolvedValueOnce(response)
    await expect(fetchPrismMinecraftBase('1.21.1', metadata(), fetcher)).rejects.toThrow()
  }
})
